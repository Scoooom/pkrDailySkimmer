/**
 * We deliberately do NOT rely on pokerogue's own resolve.tsconfigPaths
 * (native Vite tsconfig-paths support) or the vite-tsconfig-paths plugin.
 * Both proved unreliable when vitest is invoked from our repo root instead
 * of from inside pokerogue/ directly — imports from files under
 * pokerogue/plugins/ (e.g. #plugins/cache-busted-loader-plugin, pulled in
 * transitively via battle-scene.ts -> loading-scene.ts) failed to resolve
 * despite multiple configuration attempts, seemingly due to how tsconfig
 * include/exclude scoping interacts with nested project roots.
 *
 * Instead we hand-roll the alias list as explicit resolve.alias entries,
 * mirroring pokerogue/tsconfig.json's "paths" section exactly. This has
 * no dependency on tsconfig discovery, include/exclude semantics, or
 * process.cwd() — it's simple deterministic path substitution.
 *
 * If pokerogue/tsconfig.json's paths section changes, update ALIASES below
 * to match.
 */
import { defineConfig, type Plugin } from "vitest/config";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { sharedConfig } from "./pokerogue/vite.config";

process.env.MERGE_REPORTS = process.env.MERGE_REPORTS ?? "1";

const ROOT = __dirname;
const PKR = resolve(ROOT, "pokerogue");
const pkr = (p: string) => resolve(PKR, p);

// Mirrors pokerogue/tsconfig.json "paths" — each entry lists candidate
// target templates in priority order; first one that exists on disk wins.
const ALIASES: Array<[RegExp, string[]]> = [
  [/^#abilities\/(.+)$/,          ["src/data/abilities/$1.ts"]],
  [/^#api\/(.+)$/,                ["src/api/$1.ts"]],
  [/^#audio\/(.+)$/,              ["src/audio/$1.ts"]],
  [/^#biomes\/(.+)$/,             ["src/data/balance/biomes/$1.ts"]],
  [/^#balance\/(.+)$/,            ["src/data/balance/species/$1.ts", "src/data/balance/$1.ts"]],
  [/^#constants\/(.+)$/,          ["src/constants/$1.ts"]],
  [/^#enums\/(.+)$/,              ["src/enums/$1.ts"]],
  [/^#events\/(.+)$/,             ["src/events/$1.ts"]],
  [/^#field\/(.+)$/,              ["src/field/$1.ts"]],
  [/^#init\/(.+)$/,               ["src/init/$1.ts"]],
  [/^#inputs\/(.+)$/,             ["src/configs/inputs/$1.ts"]],
  [/^#modifiers\/(.+)$/,          ["src/modifier/$1.ts"]],
  [/^#moves\/(.+)$/,              ["src/data/moves/$1.ts"]],
  [/^#mystery-encounters\/(.+)$/, [
    "src/data/mystery-encounters/utils/$1.ts",
    "src/data/mystery-encounters/encounters/$1.ts",
    "src/data/mystery-encounters/requirements/$1.ts",
    "src/data/mystery-encounters/$1.ts",
  ]],
  [/^#phases\/(.+)$/,             ["src/phases/$1.ts"]],
  [/^#plugins\/(.+)$/,            ["plugins/phaser/$1.ts"]],
  [/^#sprites\/(.+)$/,            ["src/sprites/$1.ts"]],
  [/^#system\/(.+)$/,             [
    "src/system/settings/$1.ts",
    "src/system/version-migration/versions/$1.ts",
    "src/system/version-migration/$1.ts",
    "src/system/$1.ts",
  ]],
  [/^#trainers\/(.+)$/,           ["src/data/trainers/$1.ts"]],
  [/^#types\/(.+)$/,              ["src/@types/$1.ts"]],
  [/^#ui\/(.+)$/,                 [
    "src/ui/battle-info/$1.ts",
    "src/ui/containers/$1.ts",
    "src/ui/handlers/$1.ts",
    "src/ui/settings/$1.ts",
    "src/ui/utils/$1.ts",
    "src/ui/$1.ts",
  ]],
  [/^#utils\/(.+)$/,              ["src/utils/$1.ts"]],
  // #data must come after more specific prefixes but before #app/#test
  [/^#data\/(.+)$/,               [
    "src/data/pokemon-forms/$1.ts",
    "src/data/pokemon/$1.ts",
    "src/data/$1.ts",
  ]],
  // #test and #app must always be last (broadest match)
  [/^#test\/(.+)$/,               ["test/$1.ts"]],
  [/^#app\/(.+)$/,                ["src/$1.ts"]],
];

function pkrAliasPlugin(): Plugin {
  return {
    name: "pkr-explicit-alias",
    enforce: "pre",
    resolveId(id: string) {
      if (id === "#package.json") return pkr("package.json");

      for (const [pattern, templates] of ALIASES) {
        const m = id.match(pattern);
        if (!m) continue;
        const capture = m[1] ?? "";
        for (const template of templates) {
          const candidate = pkr(template.replace("$1", capture));
          if (existsSync(candidate)) return candidate;
        }
        // No candidate exists — return first anyway for a clearer error
        return pkr(templates[0].replace("$1", capture));
      }
      return null;
    },
  };
}

export default defineConfig(async config => {
  const base = await sharedConfig(config);
  return {
    ...base,
    resolve: {
      ...base.resolve,
      tsconfigPaths: false, // superseded by pkrAliasPlugin above
      alias: {
        ...(base.resolve as any)?.alias,
        // "phaser" (and its ecosystem — msw, i18next, jsdom deps, etc.)
        // live only in pokerogue/node_modules, not our own package.json.
        // Rather than duplicating the whole dependency tree, point bare
        // imports at the copy pokerogue's own package.json installs.
        phaser: pkr("node_modules/phaser"),
      },
    },
    plugins: [
      pkrAliasPlugin(),
      ...(base.plugins ?? []),
    ],
    test: {
      environment: "jsdom",
      environmentOptions: {
        jsdom: { resources: "usable" },
      },
      setupFiles: [
        "./pokerogue/test/setup/font-face.setup.ts",
        "./pokerogue/test/setup/vitest.setup.ts",
        "./pokerogue/test/setup/matchers.setup.ts",
        "./runner/setup.ts",
      ],
      include: ["runner/**/*.test.ts"],
      isolate: false,
      restoreMocks: true,
      watch: false,
      testTimeout: 60 * 60 * 1000, // 1 hour — full 50-wave run across up to 4 candidates
      env: {
        TZ: "UTC",
      },
      server: {
        deps: {
          // @material/material-color-utilities ships compiled JS with
          // extensionless relative imports (e.g. `from './dynamic_color'`),
          // which Node's native ESM loader rejects but Vite's resolver
          // tolerates. Forcing it through Vite's transform pipeline fixes
          // "Cannot find module './dynamic_color'" errors.
          inline: [/@material\/material-color-utilities/],
        },
      },
    },
  };
});
