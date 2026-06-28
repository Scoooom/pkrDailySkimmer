#!/usr/bin/env node
/**
 * pkr-manifest — PokeRogue daily seed manifest generator CLI
 */

// Suppress ALL console.log/table/debug from game source code.
// Our own output goes through process.stdout.write directly.
console.log = () => {};
console.table = () => {};
console.debug = () => {};
console.warn = () => {};

import { writeFileSync } from "fs";
import { execSync } from "child_process";
import { generateManifest } from "./simulator.ts";
import speciesDataRaw from "./data/species-data.json" with { type: "json" };

const speciesData: any = speciesDataRaw;

const out = (s: string) => process.stdout.write(s);
const err = (s: string) => { process.stderr.write(s + "\n"); process.exit(1); };

function printUsage(): void {
  out(`
pkr-manifest — PokeRogue Daily Seed Manifest Generator

Starters are automatically derived from the seed — no need to specify them.

Usage:
  npx vite-node src/index.ts -- --seed <SEED> [options]

Arguments:
  --seed        Daily seed string (required)

Options:
  --out <file>  Output JSON file (default: manifest-<seed>.json)
  --pretty      Pretty-print JSON (default: compact)
  --help        Show this help

Examples:
  npx vite-node src/index.ts -- --seed abc123xyz --pretty
  npx vite-node src/index.ts -- --seed abc123xyz --out run.json
`);
}

function getPkrCommit(): string {
  try {
    return execSync("git -C pokerogue rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function main(): void {
  const rawArgs = process.argv.slice(2);
  const args = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;

  if (args.includes("--help") || args.length === 0) {
    printUsage();
    process.exit(0);
  }

  let seed: string | null = null;
  let outFile: string | null = null;
  let pretty = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--seed":   seed = args[++i]; break;
      case "--out":    outFile = args[++i]; break;
      case "--pretty": pretty = true; break;
      default: err(`Unknown argument: ${args[i]}`);
    }
  }

  if (!seed) err("--seed is required");

  const pkrCommit = getPkrCommit();

  out(`\npkr-manifest\n`);
  out(`  seed     : ${seed}\n`);
  out(`  pkr      : ${pkrCommit}\n`);
  out(`\nSimulating...\n`);

  const manifest = generateManifest(seed!, pkrCommit);

  const biomePath = manifest.runners[0]?.waves
    .filter(w => [1, 11, 21, 31, 41].includes(w.wave))
    .map(w => w.biome)
    .join(" → ") ?? "unknown";
  out(`  starters : ${manifest.starters.map(s => `${s.species} (#${s.speciesId})`).join(", ")}\n`);
  out(`\n  Biomes   : ${biomePath}\n`);
  out(`\n  Runners  :\n`);

  for (const r of manifest.runners) {
    if (r.source === "wave1_catch") {
      const note = r.catchable
        ? ` ✓ caught in ${r.ballsNeeded} ball(s)`
        : ` ✗ not catchable in 5 balls`;
      out(`    • ${r.species} (#${r.speciesId}) [wave1_catch]${note}\n`);
    } else {
      out(`    • ${r.species} (#${r.speciesId}) [starter]\n`);
    }
  }

  if (!outFile) outFile = `manifest-${seed}.json`;
  const json = pretty ? JSON.stringify(manifest, null, 2) : JSON.stringify(manifest);
  writeFileSync(outFile, json, "utf8");
  out(`\n  Output   : ${outFile} (${(json.length / 1024).toFixed(1)} KB)\n\n`);
}

main();
