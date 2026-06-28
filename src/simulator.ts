/**
 * simulator.ts
 *
 * Wires up stubs, initialises the game's own code, then
 * drives biome path → spawn → catch → item-screen simulation
 * to produce the raw data the manifest builder needs.
 */

import { RND, initRNG, shiftCharCodes, resetSeedForWave, executeWithSeedOffset } from "./rng.ts";
import { globalScene } from "./stubs/global-scene.ts";
import { speciesDataRegistry } from "./stubs/global-species-data-registry.ts";

// ── Game imports (via vite-node aliases → pokerogue/src) ──────────────────────
import { GameModes } from "#enums/game-modes";
import { getGameMode } from "#app/game-mode";
import { BiomeId } from "#enums/biome-id";
import { ModifierTier } from "#enums/modifier-tier";
import { initModifierPools } from "#modifiers/init-modifier-pools";
import { initModifierTypes, getPlayerModifierTypeOptions, regenerateModifierPoolThresholds } from "#modifiers/modifier-type";
import { ModifierPoolType } from "#enums/modifier-pool-type";
import { dailyBiomeWeights } from "#balance/daily-biome-weights";
import { getDailyStartingBiome } from "#data/daily-seed/daily-run";
import { randSeedInt, randSeedItem, randSeedGauss } from "#utils/common";
import { PartyMemberStrength } from "#enums/party-member-strength";
import { EvoLevelThresholdKind } from "#enums/evo-level-threshold-kind";

// ── Our data layer ─────────────────────────────────────────────────────────────
import biomeDataRaw from "./data/biome-data.json" with { type: "json" };
import speciesDataRaw from "./data/species-data.json" with { type: "json" };

const biomeData: any = biomeDataRaw;
const speciesData: any = speciesDataRaw;

// ── Types ──────────────────────────────────────────────────────────────────────
export interface EncounterInfo {
  speciesId: number;
  species: string;
  level: number;
  catchRate: number | null;
  tier: string;
  isBoss: boolean;
}

export interface ItemOption {
  tier: string;
  item: string;
  isTm: boolean;
  moveName?: string;
}

export interface ItemScreen {
  rerollIndex: number;
  rerollCost: number;
  affordable: boolean;
  options: ItemOption[];
}

export interface WaveInfo {
  wave: number;
  biome: string;
  battleType: "wild" | "trainer" | "boss" | "gym_leader" | "final_boss";
  catchable: boolean;
  isDouble: boolean;
  encounters: EncounterInfo[];
  moneyBefore: number;
  moneyGained: number;
  moneyAfter: number;
  itemScreens?: ItemScreen[];
  fixedRewards?: string[];
}

export interface RunnerManifest {
  speciesId: number;
  species: string;
  source: "starter" | "wave1_catch";
  catchable: boolean;
  ballsNeeded?: number;
  startingLevel: number;
  waves: WaveInfo[];
}

export interface Manifest {
  seed: string;
  generatedAt: string;
  pkrCommit: string;
  starters: { speciesId: number; species: string; level: number }[];
  runners: RunnerManifest[];
}

// ── Init ───────────────────────────────────────────────────────────────────────
let _gameInitialised = false;

function ensureGameInit(seed: string, waveIndex: number): void {
  initRNG();

  const gameMode = getGameMode(GameModes.DAILY);
  globalScene.init({
    seed,
    waveIndex,
    gameMode,
    money: 1000,
    executeWithSeedOffset: (cb, offset, seedOverride) =>
      executeWithSeedOffset(cb, offset, seedOverride, seed),
  });

  if (!_gameInitialised) {
    initModifierTypes();
    initModifierPools();
    _gameInitialised = true;
  }
}

// ── Wave type helpers ──────────────────────────────────────────────────────────
type WaveType = "wild" | "trainer" | "boss" | "gym_leader" | "final_boss";

function getWaveType(wave: number): WaveType {
  if (wave === 50) return "final_boss";
  if (wave === 10) return "boss";
  if (wave % 10 === 0) return "gym_leader";
  if (wave % 5 === 0) return "trainer";
  return "wild";
}

function isWaveCatchable(wave: number): boolean {
  return getWaveType(wave) === "wild";
}

// ── Biome simulation ───────────────────────────────────────────────────────────
function simulateBiomePath(seed: string): string[] {
  ensureGameInit(seed, 1);
  resetSeedForWave(seed, 1);

  // getDailyStartingBiome uses randSeedInt internally (seeded by wave 1 seed)
  const startBiomeId = getDailyStartingBiome();
  const path: string[] = [biomeIdToName(startBiomeId)];

  let currentBiomeId = startBiomeId;

  for (const transitionWave of [10, 20, 30, 40]) {
    if (transitionWave >= 49) { path.push("END"); break; }

    let nextBiomeId = BiomeId.END;
    executeWithSeedOffset(() => {
      const biomeEntry = biomeData.biomes[biomeIdToName(currentBiomeId)];
      if (!biomeEntry || !biomeEntry.links?.length) return;

      const pool: number[] = [];
      for (const link of biomeEntry.links) {
        const linkBiomeId = biomeData.biomeIds[link.biome] ?? 0;
        for (let w = 0; w < link.weight; w++) pool.push(linkBiomeId);
      }
      nextBiomeId = pool[randSeedInt(pool.length)];
    }, transitionWave * 100, undefined, seed);

    path.push(biomeIdToName(nextBiomeId));
    currentBiomeId = nextBiomeId;
  }

  // Zone 5 (waves 41-50) is always END biome in daily mode
  if (path.length < 5) path.push("END");
  else path[4] = "END";
  return path;
}

function biomeIdToName(id: number): string {
  return Object.entries(biomeData.biomeIds).find(([, v]) => v === id)?.[0] ?? `BIOME_${id}`;
}

function getBiomeForWave(path: string[], wave: number): string {
  return path[Math.min(Math.floor((wave - 1) / 10), path.length - 1)];
}

// ── Level calculation ──────────────────────────────────────────────────────────
function getDifficultyWave(wave: number): number {
  return wave + 30 + Math.floor(wave / 5);
}

function getLevelForWave(wave: number, isBoss: boolean): number {
  if (wave === 50) return 75;
  const diff = getDifficultyWave(wave);
  const base = 1 + diff / 2 + Math.pow(diff / 25, 2);
  return Math.max(Math.round(isBoss ? base * 1.2 : base), 1);
}

// ── Spawn simulation ───────────────────────────────────────────────────────────
function getTierName(roll: number, isBoss: boolean): string {
  if (isBoss) {
    if (roll >= 20) return "BOSS";
    if (roll >= 6) return "BOSS_RARE";
    if (roll >= 1) return "BOSS_SUPER_RARE";
    return "BOSS_ULTRA_RARE";
  }
  if (roll >= 156) return "COMMON";
  if (roll >= 32) return "UNCOMMON";
  if (roll >= 6) return "RARE";
  if (roll >= 1) return "SUPER_RARE";
  return "ULTRA_RARE";
}

function getPoolForTier(biomeName: string, tier: string): number[] {
  const biome = biomeData.biomes[biomeName];
  if (!biome?.pokemonPool?.[tier]) return [];
  const tierData = biome.pokemonPool[tier];
  return [...(tierData["ALL"] ?? []), ...(tierData["DAY"] ?? [])];
}

function simulateEncounter(seed: string, wave: number, biome: string, isBoss: boolean, slot = 0): EncounterInfo {
  resetSeedForWave(seed, wave + slot);

  const rollMax = isBoss ? 64 : 512;
  const roll = randSeedInt(rollMax);
  const tier = getTierName(roll, isBoss);

  const tierOrder = isBoss
    ? ["BOSS", "BOSS_RARE", "BOSS_SUPER_RARE", "BOSS_ULTRA_RARE"]
    : ["COMMON", "UNCOMMON", "RARE", "SUPER_RARE", "ULTRA_RARE"];

  let pool: number[] = [];
  let finalTier = tier;
  for (let i = tierOrder.indexOf(tier); i >= 0; i--) {
    pool = getPoolForTier(biome, tierOrder[i]);
    if (pool.length > 0) { finalTier = tierOrder[i]; break; }
  }

  const speciesId = pool.length ? randSeedItem(pool) : 0;
  const sp = speciesData.species[speciesId];

  return {
    speciesId,
    species: speciesData.speciesNames[speciesId] ?? `SPECIES_${speciesId}`,
    level: getLevelForWave(wave, isBoss),
    catchRate: sp?.catchRate ?? null,
    tier: finalTier,
    isBoss,
  };
}

function simulateIsDouble(seed: string, wave: number): boolean {
  resetSeedForWave(seed, wave);
  return randSeedInt(8) === 0;
}

function simulateWaveEncounters(seed: string, wave: number, biome: string): EncounterInfo[] {
  const wt = getWaveType(wave);
  if (wt === "trainer" || wt === "gym_leader" || wt === "final_boss") {
    return [{ speciesId: 0, species: wt.toUpperCase(), level: getLevelForWave(wave, true), catchRate: null, tier: "N/A", isBoss: true }];
  }
  const isBoss = wave % 10 === 0;
  const isDouble = !isBoss && simulateIsDouble(seed, wave);
  const enc = [simulateEncounter(seed, wave, biome, isBoss, 0)];
  if (isDouble) enc.push(simulateEncounter(seed, wave, biome, false, 1));
  return enc;
}

// ── Catch simulation ───────────────────────────────────────────────────────────
function simulateCatch(seed: string, speciesId: number, maxBalls = 5): { caught: boolean; balls: number } {
  const sp = speciesData.species[speciesId];
  if (!sp) return { caught: false, balls: maxBalls };

  const shakeProbability = Math.floor((sp.catchRate / 3) * 1.0);

  for (let attempt = 1; attempt <= maxBalls; attempt++) {
    RND.sow([shiftCharCodes(shiftCharCodes(seed, 1), attempt << 6)]);
    let caught = true;
    for (let shake = 0; shake < 3; shake++) {
      if (RND.integerInRange(0, 65535) >= shakeProbability) { caught = false; break; }
    }
    if (caught) return { caught: true, balls: attempt };
  }
  return { caught: false, balls: maxBalls };
}

// ── Money helpers ──────────────────────────────────────────────────────────────
function getWaveMoneyAmount(wave: number, multiplier: number): number {
  const waveSetIndex = Math.ceil(wave / 10) - 1;
  const value = Math.pow(
    (waveSetIndex + 1 + (0.75 + (((wave - 1) % 10) + 1) / 10)) * 100,
    1 + 0.005 * waveSetIndex
  ) * multiplier;
  return Math.floor(value / 10) * 10;
}

function getTrainerMultiplier(wave: number): number {
  if (wave === 50) return 3.25;
  if (wave % 10 === 0) return 2.5;
  if (wave % 5 === 0) return 1.25;
  return 0;
}

function getRerollCost(wave: number, rerollCount: number): number {
  return Math.ceil(wave / 10) * 250 * Math.pow(2, rerollCount);
}

function getFixedRewards(wave: number): string[] {
  if (wave === 10) return ["EXP_CHARM"];
  if (wave === 20 || wave === 30 || wave === 40) return ["EXP_CHARM", "GOLDEN_POKEBALL"];
  return [];
}

// ── Item screen simulation (uses real game pool via getPlayerModifierTypeOptions) ─
function makePartyStub(speciesId: number, wave: number): any[] {
  const sp = speciesData.species[speciesId];
  const level = getLevelForWave(wave, false);
  const tms: number[] = sp?.compatibleTms ?? [];
  const learnableMoves = sp?.levelUpMoves?.filter(([lv]: [number, number]) => lv > level).map(([, id]: [number, number]) => id) ?? [];

  return [{
    speciesId,
    id: speciesId,
    species: {
      speciesId,
      catchRate: sp?.catchRate ?? 45,
    },
    fusionSpecies: null,
    name: speciesData.speciesNames[speciesId] ?? "Unknown",
    level,
    hp: 100,
    status: null,
    teraType: 0,
    pauseEvolutions: false,

    // HP methods
    getInverseHp: () => 0,
    getHpRatio: () => 1.0,

    // Ability / species queries
    hasAbility: (_ability: number, _checkPassive?: boolean) => false,
    hasSpecies: (_speciesId: number) => false,
    canSetStatus: (_status: any, _quiet?: boolean) => false,
    isMax: () => false,
    isFusion: () => false,
    isFainted: () => false,
    isAllowedInBattle: () => true,
    isAllowedInChallenge: () => true,
    isPlayer: () => true,

    // Form methods
    getFormKey: () => "",
    getFusionFormKey: () => "",
    getSpeciesForm: () => ({ speciesId }),
    getFusionSpeciesForm: () => null,

    // Move methods
    getMoveset: () => [],
    getLearnableLevelMoves: () => learnableMoves,
    getCompatibleTms: (_excludeKnown?: boolean, _excludeLevelUp?: boolean) => [...tms] as number[],
    getHeldItems: () => [],

    // Misc
    getLuck: () => 0,
    findTag: () => null,
    getTag: () => null,
  }];
}

function resolveItemOption(option: any): ItemOption {
  const typeName: string = option?.type?.id ?? option?.type?.constructor?.name ?? "UNKNOWN";
  const tier: string = option?.type?.tier !== undefined
    ? (Object.keys(ModifierTier).find(k => (ModifierTier as any)[k] === option.type.tier) ?? "COMMON")
    : "COMMON";
  const isTm = typeName.startsWith("TM_") || typeName === "TmModifierType";
  return {
    tier,
    item: typeName,
    isTm,
    moveName: isTm ? (option?.type?.moveId !== undefined
      ? (speciesData.moveNames[option.type.moveId] ?? `MOVE_${option.type.moveId}`)
      : undefined) : undefined,
  };
}

function simulateItemScreen(
  seed: string,
  wave: number,
  soloSpeciesId: number,
  money: number,
  maxRerolls = 2
): { screens: ItemScreen[]; spent: number } {
  const screens: ItemScreen[] = [];
  let spent = 0;
  // Update scene state for this wave
  const gameMode = getGameMode(GameModes.DAILY);
  globalScene.init({
    seed,
    waveIndex: wave,
    gameMode,
    money,
    executeWithSeedOffset: (cb, offset, seedOverride) =>
      executeWithSeedOffset(cb, offset, seedOverride, seed),
  });

  const party = makePartyStub(soloSpeciesId, wave);

  // Initial roll
  const initialOptions: ItemOption[] = [];
  executeWithSeedOffset(() => {
    regenerateModifierPoolThresholds(party as any, ModifierPoolType.PLAYER, 0);
    const opts = getPlayerModifierTypeOptions(3, party as any);
    for (const opt of opts) initialOptions.push(resolveItemOption(opt));
  }, wave * 1000, undefined, seed);

  screens.push({ rerollIndex: 0, rerollCost: 0, affordable: true, options: initialOptions });

  // Rerolls
  for (let r = 1; r <= maxRerolls; r++) {
    const cost = getRerollCost(wave, r - 1);
    if (money - spent < cost) {
      screens.push({ rerollIndex: r, rerollCost: cost, affordable: false, options: [] });
      break;
    }
    spent += cost;
    const rerollOptions: ItemOption[] = [];
    executeWithSeedOffset(() => {
      regenerateModifierPoolThresholds(party as any, ModifierPoolType.PLAYER, r);
      const opts2 = getPlayerModifierTypeOptions(3, party as any);
      for (const opt of opts2) rerollOptions.push(resolveItemOption(opt));
    }, wave * 1000 + r * 100, undefined, seed);
    screens.push({ rerollIndex: r, rerollCost: cost, affordable: true, options: rerollOptions });
  }

  return { screens, spent };
}

// ── Main manifest generator ────────────────────────────────────────────────────
export function getStartersForSeed(seed: string): [number, number, number] {
  ensureGameInit(seed, 1);

  const starterIds: number[] = [];

  // Mirrors getDailyRunStarters() cost + species selection logic exactly,
  // but stops before getDailyRunStarter() which needs addPlayerPokemon.
  executeWithSeedOffset(() => {
    const startingLevel = 20; // daily mode starting level

    const starterCosts: number[] = [];
    starterCosts.push(Math.min(Math.round(3.5 + Math.abs(randSeedGauss(1))), 8));
    starterCosts.push(randSeedInt(9 - starterCosts[0], 1));
    starterCosts.push(10 - (starterCosts[0] + starterCosts[1]));

    for (const cost of starterCosts) {
      const costSpecies = speciesDataRegistry.getStartersForCost(cost).filter(
        (s: number) => !starterIds.some(existing => s === existing || speciesDataRegistry.getStarter(s) === existing)
      );
      const randPkmSpecies = randSeedItem(costSpecies as any[]) as number;
      const starterSpeciesId = speciesDataRegistry.getSpecies(randPkmSpecies)
        ?.getTrainerSpeciesForLevel(startingLevel, true, PartyMemberStrength.STRONGER, EvoLevelThresholdKind.STRONG)
        ?? randPkmSpecies;
      starterIds.push(starterSpeciesId);
    }
  }, 0, seed);

  return starterIds as [number, number, number];
}

export function generateManifest(
  seed: string,
  pkrCommit: string
): Manifest {
  ensureGameInit(seed, 1);

  // Derive starters from seed (same RNG call the game makes)
  const starterIds = getStartersForSeed(seed);

  const biomePath = simulateBiomePath(seed);
  const wave1Biome = biomePath[0];
  const wave1Encs = simulateWaveEncounters(seed, 1, wave1Biome);
  const wave1Species = wave1Encs[0];

  // Check wave 1 catch viability
  let wave1Catchable = false;
  let wave1Balls: number | undefined;
  if (wave1Species?.speciesId) {
    const result = simulateCatch(seed, wave1Species.speciesId, 5);
    wave1Catchable = result.caught;
    if (result.caught) wave1Balls = result.balls;
  }

  const buildRunner = (speciesId: number, source: "starter" | "wave1_catch", catchable: boolean, balls?: number): RunnerManifest => {
    if (!catchable && source === "wave1_catch") {
      return { speciesId, species: speciesData.speciesNames[speciesId] ?? `#${speciesId}`, source, catchable: false, startingLevel: 20, waves: [] };
    }

    const waves: WaveInfo[] = [];
    let money = 1000;

    for (let wave = 1; wave <= 50; wave++) {
      const biome = getBiomeForWave(biomePath, wave);
      const wt = getWaveType(wave);
      const encounters = simulateWaveEncounters(seed, wave, biome);
      const catchable = isWaveCatchable(wave);
      const isDouble = encounters.length > 1;
      const moneyBefore = money;
      let moneyGained = 0;

      if (wt === "trainer" || wt === "gym_leader" || wt === "final_boss") {
        moneyGained = getWaveMoneyAmount(wave, getTrainerMultiplier(wave));
        money += moneyGained;
      }

      const waveInfo: WaveInfo = {
        wave, biome, battleType: wt, catchable, isDouble,
        encounters, moneyBefore, moneyGained, moneyAfter: money,
      };

      if (wave % 10 !== 0) {
        const { screens, spent } = simulateItemScreen(seed, wave, speciesId, money);
        money -= spent;
        waveInfo.itemScreens = screens;
        waveInfo.moneyAfter = money;
      } else {
        const fixed = getFixedRewards(wave);
        if (fixed.length > 0) waveInfo.fixedRewards = fixed;
      }

      waves.push(waveInfo);
    }

    return {
      speciesId,
      species: speciesData.speciesNames[speciesId] ?? `#${speciesId}`,
      source,
      catchable: true,
      ballsNeeded: balls,
      startingLevel: 20,
      waves,
    };
  };

  const runners: RunnerManifest[] = [
    buildRunner(starterIds[0], "starter", true),
    buildRunner(starterIds[1], "starter", true),
    buildRunner(starterIds[2], "starter", true),
  ];

  // Wave 1 catch candidate
  if (wave1Species?.speciesId) {
    runners.push(buildRunner(wave1Species.speciesId, "wave1_catch", wave1Catchable, wave1Balls));
  }

  return {
    seed,
    generatedAt: new Date().toISOString(),
    pkrCommit,
    starters: starterIds.map(id => ({
      speciesId: id,
      species: speciesData.speciesNames[id] ?? `#${id}`,
      level: 20,
    })),
    runners,
  };
}
