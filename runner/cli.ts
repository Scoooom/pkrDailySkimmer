#!/usr/bin/env node
/**
 * pkr-daily-skimmer entry point.
 *
 * Runs as plain Node (via tsx), NOT under vitest. Its only job is to spawn
 * one `npx vitest run runner/run.test.ts` child process per candidate,
 * collect each candidate's JSON result, and assemble + write the final
 * guide. Each child process gets a fully independent Node runtime and
 * module registry — this is what actually gives us candidate isolation
 * (see candidate-orchestrator.ts for why that's necessary).
 *
 * Usage:
 *   PKR_SEED="<daily seed>" npx tsx runner/cli.ts
 */
import { spawnSync, execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { buildTextGuide } from "./guide-builder.ts";
import type { DailyGuide, RunnerResult } from "./types.ts";

const ROOT = resolve(import.meta.dirname, "..");
const seed = process.env.PKR_SEED;
const outDir = resolve(ROOT, process.env.PKR_OUT_DIR ?? "./output");
const workDir = resolve(outDir, ".work");

if (!seed) {
  console.error(
    'PKR_SEED environment variable is required.\nUsage: PKR_SEED="<your-seed>" npm run run',
  );
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
mkdirSync(workDir, { recursive: true });

function runWorker(mode: string, extraEnv: Record<string, string> = {}): unknown {
  const resultFile = resolve(workDir, `result-${mode}-${extraEnv.PKR_STARTER_INDEX ?? "x"}-${Date.now()}.json`);

  console.log(`\n--- Running worker: mode=${mode} ${Object.entries(extraEnv).map(([k, v]) => `${k}=${v}`).join(" ")} ---`);

  const result = spawnSync(
    "npx",
    ["vitest", "run", "runner/run.test.ts"],
    {
      cwd: ROOT,
      stdio: "inherit", // stream child's output live so progress is visible
      env: {
        ...process.env,
        PKR_SEED: seed,
        PKR_MODE: mode,
        PKR_RESULT_FILE: resultFile,
        ...extraEnv,
      },
    },
  );

  if (result.status !== 0) {
    throw new Error(`Worker process (mode=${mode}) exited with code ${result.status}`);
  }

  if (!existsSync(resultFile)) {
    throw new Error(`Worker process (mode=${mode}) did not produce a result file`);
  }

  const parsed = JSON.parse(readFileSync(resultFile, "utf8"));
  rmSync(resultFile, { force: true });
  return parsed;
}

function getPkrCommit(): string {
  try {
    return execSync("git -C pokerogue rev-parse --short HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function main(): void {
  console.log(`\npkr-daily-skimmer`);
  console.log(`  seed: ${seed}`);
  console.log(`  out : ${outDir}\n`);

  // 1. Discover the 3 starters
  const probe = runWorker("probe") as { starters: DailyGuide["starters"] };
  console.log(`\nStarters: ${probe.starters.map(s => `${s.species} (#${s.speciesId})`).join(", ")}`);

  const candidates: RunnerResult[] = [];

  // 2. Run each starter, stopping early on the first winner
  for (let i = 0; i < 3; i++) {
    const result = runWorker("starter", { PKR_STARTER_INDEX: String(i) }) as RunnerResult;
    candidates.push(result);
    console.log(`\n${result.species}: ${result.viable ? "VIABLE" : `failed at wave ${result.failedAtWave} (${result.failReason})`}`);
    if (result.viable) break;
  }

  // 3. Only try the wave1_catch candidate if no starter won
  const haveWinner = candidates.some(c => c.viable);
  if (!haveWinner) {
    const wave1Result = runWorker("wave1_catch") as RunnerResult | null;
    if (wave1Result) {
      candidates.push(wave1Result);
      console.log(`\n${wave1Result.species} (wave1_catch): ${wave1Result.viable ? "VIABLE" : `failed at wave ${wave1Result.failedAtWave} (${wave1Result.failReason})`}`);
    } else {
      console.log(`\nWave 1 encounter was not catchable within 5 balls — no 4th candidate.`);
    }
  }

  const winner = candidates.find(c => c.viable);

  const guide: DailyGuide = {
    seed,
    date: new Date().toISOString().slice(0, 10),
    pkrCommit: getPkrCommit(),
    generatedAt: new Date().toISOString(),
    starters: probe.starters,
    candidates,
    recommendation: winner
      ? {
          speciesId: winner.speciesId,
          species: winner.species,
          source: winner.source,
          summary: `${winner.species} can solo this seed.${
            winner.source === "wave1_catch" ? ` (caught in ${winner.catchBalls} ball(s) on wave 1)` : ""
          }`,
        }
      : null,
  };

  const safeSeed = seed.replace(/[/\\:*?"<>|]/g, "_");
  const jsonPath = resolve(outDir, `guide-${safeSeed}.json`);
  const textPath = resolve(outDir, `guide-${safeSeed}.txt`);

  writeFileSync(jsonPath, JSON.stringify(guide, null, 2), "utf8");
  writeFileSync(textPath, buildTextGuide(guide), "utf8");

  rmSync(workDir, { recursive: true, force: true });

  console.log(`\nDone.`);
  console.log(`  JSON: ${jsonPath}`);
  console.log(`  Text: ${textPath}`);
  console.log(`\n  ${guide.recommendation?.summary ?? "Unable to find viable runner - error"}\n`);
}

main();
