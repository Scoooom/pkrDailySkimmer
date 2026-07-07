/**
 * Single-candidate worker process, invoked by runner/cli.ts.
 *
 * Each invocation of this file (via `npx vitest run runner/run.test.ts`)
 * runs exactly ONE candidate in its own fresh process, then writes its
 * result as JSON to PKR_RESULT_FILE and exits. This guarantees full
 * isolation between candidates — PokeRogue's module-level singletons
 * (globalScene, audio manager, etc.) never survive across process
 * boundaries, avoiding the state-leakage issues that occurred when
 * multiple candidates ran sequentially within one process.
 *
 * Modes (set via PKR_MODE):
 *   probe        — discover the 3 starters, no wave played. Writes ProbeResult.
 *   starter      — run one starter (PKR_STARTER_INDEX = 0/1/2) through all 50 waves.
 *   wave1_catch  — attempt the wave 1 catch and, if successful, run all 50 waves.
 *
 * This file is not making test assertions — it's a harness. A candidate
 * being non-viable (fainted partway through) is a normal, successful
 * result and must NOT fail the vitest test; only genuine unexpected
 * errors (crashes, resolution failures) should fail it.
 */
import { it } from "vitest";
import { writeFileSync } from "fs";
import { runProbe, runStarterCandidate, runWave1CatchCandidate } from "./candidate-orchestrator.ts";

const seed = process.env.PKR_SEED;
const mode = process.env.PKR_MODE;
const resultFile = process.env.PKR_RESULT_FILE;
const starterIndex = process.env.PKR_STARTER_INDEX ? Number(process.env.PKR_STARTER_INDEX) : undefined;

if (!seed) throw new Error("PKR_SEED environment variable is required");
if (!mode) throw new Error("PKR_MODE environment variable is required (probe | starter | wave1_catch)");
if (!resultFile) throw new Error("PKR_RESULT_FILE environment variable is required");

it(
  `pkr-daily-skimmer worker: mode=${mode} seed=${seed}`,
  async () => {
    console.error(`\n[worker] mode=${mode} seed=${seed}${starterIndex !== undefined ? ` starterIndex=${starterIndex}` : ""}\n`);

    let result: unknown;

    switch (mode) {
      case "probe":
        result = await runProbe(seed);
        break;
      case "starter":
        if (starterIndex === undefined) throw new Error("PKR_STARTER_INDEX is required for mode=starter");
        result = await runStarterCandidate(seed, starterIndex);
        break;
      case "wave1_catch":
        result = await runWave1CatchCandidate(seed);
        break;
      default:
        throw new Error(`Unknown PKR_MODE: ${mode}`);
    }

    writeFileSync(resultFile, JSON.stringify(result), "utf8");
    console.error(`[worker] wrote result to ${resultFile}`);
  },
  60 * 60 * 1000, // 1 hour — a single candidate can take a while
);
