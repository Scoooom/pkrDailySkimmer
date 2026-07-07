export type WaveType = "wild" | "trainer" | "boss" | "gym_leader" | "final_boss";

export interface TurnAction {
  turn: number;
  action: "move" | "ball" | "flee";
  moveId?: number | undefined;
  moveName?: string | undefined;
  ballType?: number | undefined;
  targetIndex?: number | undefined;
  reasoning?: string | undefined;
}

export interface WaveGuide {
  wave: number;
  biome: string;
  waveType: WaveType;
  isDouble: boolean;

  // Encounters (enemy side)
  encounters: Array<{
    speciesId: number;
    species: string;
    level: number;
    isBoss: boolean;
  }>;

  // What happened this wave
  caught?: {
    speciesId: number;
    species: string;
    ballsUsed: number;
  } | undefined;

  // Combat turns (only for non-caught waves)
  turns: TurnAction[];

  // Item screen (if applicable)
  itemScreen?: {
    rerolled: boolean;
    rerollCount: number;
    moneyBefore: number;
    moneyAfter: number;
    chosen: {
      tier: string;
      item: string;
      isTm: boolean;
      moveName?: string | undefined;
    };
  } | undefined;

  // Fixed rewards (wave 10/20/30/40)
  fixedRewards?: string[] | undefined;

  // Biome choice (at end of 10th waves)
  biomeChoice?: {
    options: string[];
    chosen: string;
    reasoning: string;
  } | undefined;

  // Runner state at end of wave
  runnerHpPercent: number;
  runnerLevel: number;
  money: number;
}

export interface RunnerResult {
  speciesId: number;
  species: string;
  source: "starter" | "wave1_catch";
  catchBalls?: number | undefined;
  viable: boolean;
  failedAtWave?: number | undefined;
  failReason?: string | undefined;
  waves: WaveGuide[];
}

export interface DailyGuide {
  seed: string;
  date: string;
  pkrCommit: string;
  generatedAt: string;

  starters: Array<{
    speciesId: number;
    species: string;
    level: number;
  }>;

  // One result per candidate (3 starters + optional wave1 catch)
  candidates: RunnerResult[];

  // The recommended runner (first viable one, or null if none)
  recommendation: {
    speciesId: number;
    species: string;
    source: "starter" | "wave1_catch";
    summary: string;
  } | null;
}
