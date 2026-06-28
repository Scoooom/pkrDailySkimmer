import { defineConfig, type Plugin } from "vite";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const stub = (p: string) => resolve(__dirname, "src/stubs", p);
const pkr = (p: string) => resolve(__dirname, "pokerogue/src", p);

// ── Exact stubs (checked first) ───────────────────────────────────────────────
const STUBS: Record<string, string> = {
  "#app/global-scene":                 stub("global-scene.ts"),
  "#app/global-event-manager":         stub("global-event-manager.ts"),
  "#app/global-species-data-registry": stub("global-species-data-registry.ts"),
  "#app/overrides":                    stub("overrides.ts"),
  "#app/messages":                     stub("messages.ts"),
  "#field/pokemon":                    stub("pokemon.ts"),
  "#field/trainer":                    stub("trainer.ts"),
  "#utils/color-utils":                stub("color-utils.ts"),
  "#data/pokemon-species":             stub("pokemon-species.ts"),
  "#data/pokemon-forms":               stub("pokemon-forms.ts"),
  "#data/data-lists":                  stub("data-lists.ts"),
};

// ── Wildcard stubs (prefix-matched, checked before game aliases) ───────────────
const WILDCARD_STUBS: Array<[string, string]> = [
  ["phaser3-rex-plugins/", stub("rex-plugins.ts")],
  ["@material/material-color-utilities", stub("material-color.ts")],
  ["#ui/",                 stub("ui.ts")],
];

// ── Game path aliases (mirrors pokerogue tsconfig paths exactly) ───────────────
// Each entry: [pattern, [...candidate paths relative to pokerogue/src]]
// First candidate that exists on disk wins.
const PKR_ALIASES: Array<[RegExp, string[]]> = [
  [/^#abilities\/(.+)$/,          ["data/abilities/$1.ts"]],
  [/^#api\/(.+)$/,                ["api/$1.ts"]],
  [/^#audio\/(.+)$/,              ["audio/$1.ts"]],
  [/^#biomes\/(.+)$/,             ["data/balance/biomes/$1.ts"]],
  [/^#balance\/(.+)$/,            ["data/balance/species/$1.ts", "data/balance/$1.ts"]],
  [/^#constants\/(.+)$/,          ["constants/$1.ts"]],
  [/^#enums\/(.+)$/,              ["enums/$1.ts"]],
  [/^#events\/(.+)$/,             ["events/$1.ts"]],
  [/^#field\/(.+)$/,              ["field/$1.ts"]],
  [/^#init\/(.+)$/,               ["init/$1.ts"]],
  [/^#inputs\/(.+)$/,             ["configs/inputs/$1.ts"]],
  [/^#modifiers\/(.+)$/,          ["modifier/$1.ts"]],
  [/^#moves\/(.+)$/,              ["data/moves/$1.ts"]],
  [/^#mystery-encounters\/(.+)$/, [
    "data/mystery-encounters/utils/$1.ts",
    "data/mystery-encounters/encounters/$1.ts",
    "data/mystery-encounters/$1.ts",
  ]],
  [/^#phases\/(.+)$/,             ["phases/$1.ts"]],
  [/^#plugins\/(.+)$/,            ["../plugins/phaser/$1.ts"]],
  [/^#sprites\/(.+)$/,            ["sprites/$1.ts"]],
  [/^#system\/(.+)$/,             [
    "system/settings/$1.ts",
    "system/version-migration/versions/$1.ts",
    "system/$1.ts",
  ]],
  [/^#trainers\/(.+)$/,           ["data/trainers/$1.ts"]],
  [/^#types\/(.+)$/,              ["@types/$1.ts"]],
  [/^#utils\/(.+)$/,              ["utils/$1.ts"]],
  [/^#data\/(.+)$/,               [
    "data/pokemon-forms/$1.ts",
    "data/pokemon/$1.ts",
    "data/$1.ts",
  ]],
  [/^#app\/(.+)$/,                ["$1.ts"]],
];

function pkrAliasPlugin(): Plugin {
  return {
    name: "pkr-alias",
    resolveId(id: string) {
      // 1. Exact stubs
      if (STUBS[id]) return STUBS[id];

      // 2. Wildcard stubs (prefix match)
      for (const [prefix, stubPath] of WILDCARD_STUBS) {
        if (id.startsWith(prefix)) return stubPath;
      }

      // 3. Game path aliases — try each candidate, return first that exists on disk
      for (const [pattern, templates] of PKR_ALIASES) {
        const m = id.match(pattern);
        if (!m) continue;
        const capture = m[1] ?? "";
        for (const template of templates) {
          const resolved = pkr(template.replace("$1", capture));
          if (existsSync(resolved)) return resolved;
        }
        // No candidate found on disk — return first anyway so vite gives a clear error
        return pkr(templates[0].replace("$1", capture));
      }
    },
  };
}

export default defineConfig({
  plugins: [pkrAliasPlugin()],
  optimizeDeps: {
    exclude: ["phaser", "phaser3-rex-plugins"],
  },
  resolve: {
    alias: {
      // Hard alias ensures phaser is always stubbed, even when resolved
      // via node_modules package.json rather than a bare import
      "phaser": stub("phaser.ts"),
    },
  },
});