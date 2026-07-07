/**
 * Individual candidate runners — each of these is called from WITHIN a
 * single vitest process (run.test.ts), which provides the jsdom + mocked
 * environment these functions need (global.fetch mock, Phaser stub globals,
 * etc).
 *
 * Each candidate is deliberately run in its OWN separate `vitest run`
 * process (spawned by cli.ts), not sequentially within one process.
 * PokeRogue relies on several module-level singletons (globalScene, audio
 * manager, various caches) that never get fully torn down after a full game
 * boot; running a second candidate in the same process left the game stuck
 * oscillating between UI modes. Process-level isolation sidesteps this
 * entirely — the same isolation boundary the game's own test suite relies
 * on via vitest's per-file worker isolation, just applied per candidate.
 */
import Phaser from "phaser";
import { DailyRunner } from "./daily-runner.ts";
import { SpeciesId } from "#enums/species-id";
import { PromptHandler } from "#test/helpers/prompt-handler";
import type { RunnerResult, WaveGuide } from "./types.ts";

function newHeadlessGame(): Phaser.Game {
  return new Phaser.Game({ type: Phaser.HEADLESS });
}

/**
 * PromptHandler.runInterval is a module-level static timer, normally
 * cleared by the game's own vitest `afterEach` hook between test cases.
 * Even though we now run one candidate per process (so this matters less
 * than it used to), we still call this defensively after each run in case
 * a process is ever reused for more than one DailyRunner in the future.
 */
export function cleanupPromptHandler(): void {
  clearInterval(PromptHandler.runInterval);
  PromptHandler.runInterval = undefined;
}

export interface ProbeResult {
  starters: Array<{ speciesId: number; species: string; level: number }>;
}

/**
 * Discover the 3 daily starters for this seed without playing any waves.
 */
export async function runProbe(seed: string): Promise<ProbeResult> {
  const phaserGame = newHeadlessGame();
  const runner = new DailyRunner(phaserGame);
  try {
    await runner.startDaily(seed);
    const starters = runner.scene.getPlayerParty().map((p: any) => ({
      speciesId: p.species.speciesId,
      species: SpeciesId[p.species.speciesId] ?? String(p.species.speciesId),
      level: p.level,
    }));
    return { starters };
  } finally {
    phaserGame.destroy(true);
    cleanupPromptHandler();
  }
}

/**
 * Run one of the three starters as the solo candidate.
 */
export async function runStarterCandidate(seed: string, starterIndex: number): Promise<RunnerResult> {
  const phaserGame = newHeadlessGame();
  const runner = new DailyRunner(phaserGame);

  try {
    await runner.startDaily(seed);
    const starterSpeciesId = runner.scene.getPlayerParty()[starterIndex].species.speciesId;

    const result = await runner.runFullDaily(() => starterSpeciesId);

    return {
      speciesId: starterSpeciesId,
      species: SpeciesId[starterSpeciesId] ?? String(starterSpeciesId),
      source: "starter",
      viable: result.won,
      failedAtWave: result.won ? undefined : result.waves.length,
      failReason: result.failReason,
      waves: result.waves,
    };
  } finally {
    phaserGame.destroy(true);
    cleanupPromptHandler();
  }
}

/**
 * Run the wave-1-catch candidate. Returns null if the catch attempt failed
 * (not catchable within the available balls) — the caller should treat
 * this as "no 4th candidate exists for this seed", not an error.
 */
export async function runWave1CatchCandidate(seed: string): Promise<RunnerResult | null> {
  const phaserGame = newHeadlessGame();
  const runner = new DailyRunner(phaserGame);

  try {
    await runner.startDaily(seed);

    let targetSpeciesId: number | null = null;

    const result = await runner.runFullDaily((wave1: WaveGuide) => {
      if (!wave1.caught) return null; // catch failed — abort this candidate
      targetSpeciesId = wave1.caught.speciesId;
      return wave1.caught.speciesId;
    });

    if (result.aborted || targetSpeciesId === null) {
      return null;
    }

    return {
      speciesId: targetSpeciesId,
      species: SpeciesId[targetSpeciesId] ?? String(targetSpeciesId),
      source: "wave1_catch",
      catchBalls: result.waves[0]?.caught?.ballsUsed,
      viable: result.won,
      failedAtWave: result.won ? undefined : result.waves.length,
      failReason: result.failReason,
      waves: result.waves,
    };
  } finally {
    phaserGame.destroy(true);
    cleanupPromptHandler();
  }
}
