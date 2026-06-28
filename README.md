# pkr-manifest

PokeRogue daily seed manifest generator. Given a daily seed and its three starters, produces a machine-readable JSON run plan for each of up to four solo-run candidates.

## What it outputs

For each candidate solo runner (3 starters + wave 1 catch if viable):
- **All 50 waves** — biome, battle type, encounters with species/level/catch rate
- **Every item screen** (waves 1–9, 11–19, 21–29, 31–39, 41–49) — all 3 options, plus up to 2 rerolls if affordable, with TMs resolved to actual move names filtered to that runner's compatibility
- **Fixed rewards** — EXP Charm (wave 10), EXP Charm + Golden Pokéball (waves 20/30/40)
- **Money tracking** — running balance across all waves including reroll costs
- **Double battles** flagged

## Setup

```bash
# Clone with submodule
git clone --recurse-submodules <your-repo>
cd pkr-manifest

# Install our dependencies
npm install

# Install pokerogue dependencies (needed for vite-node to resolve imports)
cd pokerogue && npm install && cd ..
```

The `pokerogue/` directory is a git submodule pinned to the `main` branch.

## Usage

```bash
npm run manifest -- --seed <SEED> [--out file.json] [--pretty]
```

Species can be internal game names (`GARCHOMP`) or Pokédex IDs (`445`).

### Examples

```bash
# Pretty-printed output
npm run manifest -- --seed abc123xyz --pretty

# Compact JSON to a named file
npm run manifest -- --seed abc123xyz --out run.json
```

## Output format

```json
{
  "seed": "abc123xyz",
  "generatedAt": "2026-06-27T00:00:00.000Z",
  "pkrCommit": "833ac0c5b2",
  "starters": [
    { "speciesId": 1, "species": "BULBASAUR", "level": 20 }
  ],
  "runners": [
    {
      "speciesId": 1,
      "species": "BULBASAUR",
      "source": "starter",
      "catchable": true,
      "startingLevel": 20,
      "waves": [
        {
          "wave": 1,
          "biome": "TALL_GRASS",
          "battleType": "wild",
          "catchable": true,
          "isDouble": true,
          "encounters": [
            { "speciesId": 290, "species": "NINCADA", "level": 18, "catchRate": 255, "tier": "UNCOMMON", "isBoss": false },
            { "speciesId": 672, "species": "SKIDDO",  "level": 18, "catchRate": 120, "tier": "COMMON",   "isBoss": false }
          ],
          "moneyBefore": 1000,
          "moneyGained": 0,
          "moneyAfter": 750,
          "itemScreens": [
            {
              "rerollIndex": 0,
              "rerollCost": 0,
              "affordable": true,
              "options": [
                { "tier": "COMMON", "item": "POKEBALL", "isTm": false },
                { "tier": "ULTRA",  "item": "TM_GIGA_DRAIN", "isTm": true, "moveName": "GIGA_DRAIN" },
                { "tier": "GREAT",  "item": "DIRE_HIT", "isTm": false }
              ]
            },
            {
              "rerollIndex": 1,
              "rerollCost": 250,
              "affordable": true,
              "options": [ "..." ]
            }
          ]
        }
      ]
    }
  ]
}
```

### Runner sources

| `source` | Meaning |
|---|---|
| `"starter"` | One of the three daily starters |
| `"wave1_catch"` | Wave 1 wild encounter, if catchable within 5 Poké Balls |

Runners with `catchable: false` have an empty `waves` array.

### Wave battle types

| `battleType` | Waves | Reward |
|---|---|---|
| `"wild"` | All non-5th, non-10th waves | Item screen |
| `"trainer"` | 5, 15, 25, 35, 45 | Money + item screen |
| `"boss"` | 10 | Fixed: EXP Charm |
| `"gym_leader"` | 20, 30, 40 | Money + fixed: EXP Charm + Golden Pokéball |
| `"final_boss"` | 50 | None (END biome) |

## Architecture

```
pkr-manifest/
├── src/
│   ├── index.ts          — CLI entry point
│   ├── simulator.ts      — Core simulation engine (biomes, spawns, items, money)
│   ├── rng.ts            — Well512 RNG port; wires into globalThis.Phaser.Math.RND
│   ├── stubs/            — Minimal stubs replacing Phaser/scene dependencies
│   │   ├── phaser.ts
│   │   ├── global-scene.ts
│   │   ├── global-event-manager.ts
│   │   ├── global-species-data-registry.ts
│   │   ├── data-lists.ts      — Populates allMoves[] from extracted JSON
│   │   ├── pokemon.ts
│   │   ├── trainer.ts
│   │   ├── ui.ts
│   │   ├── overrides.ts
│   │   ├── messages.ts
│   │   ├── color-utils.ts
│   │   ├── material-color.ts
│   │   ├── rex-plugins.ts
│   │   ├── pokemon-species.ts
│   │   └── pokemon-forms.ts
│   └── data/             — Extracted static data (regenerate with scripts/extract-data.*)
│       ├── biome-data.json
│       ├── species-data.json
│       └── modifier-data.json
├── scripts/
│   ├── extract-data.mts     — Extracts biome/modifier data (run via vite-node in pokerogue/)
│   └── extract-species.py   — Extracts species/move data (Python)
├── pokerogue/            — Git submodule (main branch)
└── vite.config.ts        — Alias plugin routing game imports to stubs + real source
```

## Updating after a game patch

```bash
# Pull latest game source
git submodule update --remote

# Re-extract static data
cd pokerogue && npx vite-node ../scripts/extract-data.mts && cd ..
python3 scripts/extract-species.py
```

## Known approximations

- **Catch RNG**: assumes only Poké Balls thrown on wave 1 with no prior damage or moves. The battle seed (one layer of indirection) is approximated via the wave seed.
- **Evolution items**: `speciesDataRegistry.hasEvolutions()` returns `false` for all species in the stub, so Evolution Stones etc. won't appear in item pools. This is conservative but correct for a solo-run planner where you won't be evolving mid-run via stone.
- **Biome transition RNG**: uses `executeWithSeedOffset(wave * 100)` as the offset. The exact offset the game uses may differ slightly.
