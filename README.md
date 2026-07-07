# pkr-daily-skimmer

Headless PokeRogue daily-run solo guide generator.

Given a daily seed, this drives the **actual game engine** (headlessly, no
renderer/GPU) through all 50 waves for each of up to 4 solo-run candidates
(the 3 daily starters, plus the wave 1 wild encounter if catchable), and
produces a step-by-step human-readable guide for the first candidate found
to be able to solo the entire run.

Because we run the real game engine rather than reimplementing damage
calculation, type interactions, and RNG by hand, the move-by-move guide is
exactly as accurate as the game itself.

## How it works

We reuse PokeRogue's own test framework (`GameManager`, `PhaseInterceptor`,
`MoveHelper`, etc.) as a headless driver instead of a test runner — there are
no assertions, just programmatic UI input injection at each decision point:

- **Combat**: on catchable wild waves, always throws a Poké Ball turn 1.
  Otherwise picks the highest-scoring damage move (type effectiveness + STAB).
- **Items**: scores each of the 3 offered items/TMs by usefulness to the solo
  runner, rerolling once if all 3 options score below a "good enough"
  threshold and the reroll is affordable.
- **Biomes**: when a Town Map-enabled choice appears, currently picks the
  first listed option (heuristic refinement planned).

This is "a winning strategy", not necessarily an optimal one — see the
project history for the original design discussion.

## Setup

```bash
git clone <your-repo>
cd pkr-daily-skimmer
bash scripts/install.sh
```

`install.sh` deletes any existing `pokerogue/` directory, clones a fresh
copy of pokerogue's live `main` branch, applies every patch in
`patches/pokerogue/`, and installs npm dependencies for both projects.
`pokerogue/` is a plain directory here, not a git submodule — re-run
`install.sh` any time to pick up upstream changes; it always starts from a
clean slate.

If a patch fails to apply, the script hard-fails with a clear error —
this almost always means pokerogue's source has changed in a way that
conflicts with the patch, which then needs manual review against the
current source before install.sh can proceed.

## Usage

```bash
PKR_SEED="<daily seed>" npm run run
```

Or directly with vitest:

```bash
PKR_SEED="<daily seed>" npx vitest run runner/run.test.ts
```

Output is written to `./output/`:
- `guide-<seed>.json` — full structured data (all candidates, all waves)
- `guide-<seed>.txt` — human-readable step-by-step guide for the winning runner

Optional: `PKR_OUT_DIR=/custom/path` to change the output directory.

**Expect this to take a while** — each candidate plays through up to 50 real
waves of combat via the actual game engine. Budget up to an hour for a full
run across all 4 candidates; the orchestrator stops early once a winning
candidate is found, so most days will be faster.

## Project structure

```
runner/
├── run.test.ts               — vitest entry point (driven by PKR_SEED env var)
├── candidate-orchestrator.ts — runs all 4 candidates, picks the winner
├── daily-runner.ts           — drives a single daily run through the real game engine
├── guide-builder.ts          — formats the result into a readable text guide
├── types.ts                  — output data shapes
├── setup.ts                  — additional vitest setup (console suppression)
└── ai/
    ├── combat-ai.ts          — move selection heuristic
    └── item-selector.ts      — item screen choice heuristic
```

## Known gaps (expect bugs — this is a first pass)

- Biome choice heuristic is a placeholder (always picks the first option)
- Fixed reward names (wave 10/20/30/40) aren't captured yet — only the
  fact that the screen was passed
- Double battle target selection always targets the first enemy
- No handling yet for status moves beyond "use as last resort"
- `wave1_catch` candidate re-runs the daily from scratch rather than
  branching off the starter probe run (costs one extra ~50-wave run when
  all 3 starters fail)
