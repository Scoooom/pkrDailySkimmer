/**
 * Well512 RNG — exact port of Phaser 3's RandomDataGenerator.
 *
 * Also injects itself into the Phaser stub so game code that calls
 * Phaser.Math.RND.integerInRange() etc. uses our implementation.
 */
import { Phaser } from "./stubs/phaser.ts";

export class PhaserRNG {
  private c = 1;
  private s0 = 0;
  private s1 = 0;
  private s2 = 0;
  private n = 0;

  constructor(seeds?: string[]) {
    if (seeds) this.sow(seeds);
  }

  private rnd(): number {
    const t = 2091639 * this.s0 + this.c * 2.3283064365386963e-10;
    this.c = Math.floor(t);
    this.s0 = this.s1;
    this.s1 = this.s2;
    this.s2 = t - this.c;
    return this.s2;
  }

  private hash(data: string): number {
    let h: number;
    let n = this.n;
    for (let i = 0; i < data.length; i++) {
      n += data.charCodeAt(i);
      h = 0.02519603282416938 * n;
      n = h >>> 0;
      h -= n;
      h *= n;
      n = h >>> 0;
      h -= n;
      n += h * 0x100000000;
    }
    this.n = n;
    return (n >>> 0) * 2.3283064365386963e-10;
  }

  sow(seeds: string[]): void {
    this.n = 0xefc8249d;
    this.s0 = this.hash(" ");
    this.s1 = this.hash(" ");
    this.s2 = this.hash(" ");
    this.c = 1;
    if (!seeds) return;
    for (let i = 0; i < seeds.length && seeds[i] != null; i++) {
      const seed = seeds[i];
      this.s0 -= this.hash(seed);
      this.s0 += ~~(this.s0 < 0 ? 1 : 0);
      this.s1 -= this.hash(seed);
      this.s1 += ~~(this.s1 < 0 ? 1 : 0);
      this.s2 -= this.hash(seed);
      this.s2 += ~~(this.s2 < 0 ? 1 : 0);
    }
  }

  frac(): number {
    return this.rnd() + ((this.rnd() * 0x200000) | 0) * 1.1102230246251565e-16;
  }

  realInRange(min: number, max: number): number {
    return this.frac() * (max - min) + min;
  }

  integerInRange(min: number, max: number): number {
    return Math.floor(this.realInRange(0, max - min + 1) + min);
  }

  pick<T>(array: T[]): T {
    return array[this.integerInRange(0, array.length - 1)];
  }

  state(): string;
  state(s: string): void;
  state(s?: string): string | void {
    if (typeof s === "string" && s.match(/^!rnd/)) {
      const parts = s.split(",");
      this.c = parseFloat(parts[1]);
      this.s0 = parseFloat(parts[2]);
      this.s1 = parseFloat(parts[3]);
      this.s2 = parseFloat(parts[4]);
      return;
    }
    return ["!rnd", this.c, this.s0, this.s1, this.s2].join(",");
  }
}

// Set Phaser as a global so game files that use `Phaser.GameObjects.Container` etc
// don't crash when the module loads. This must happen before any game source is imported.
(globalThis as any).Phaser = {
  GameObjects: {
    Container: class Container { constructor(..._args: any[]) {} },
    Sprite: class Sprite { constructor(..._args: any[]) {} },
    Image: class Image { constructor(..._args: any[]) {} },
    Text: class Text { constructor(..._args: any[]) {} },
    Graphics: class Graphics { constructor(..._args: any[]) {} },
  },
  Math: {
    RND: {} as any, // will be replaced by initRNG()
    Clamp: (v: number, min: number, max: number) => Math.max(min, Math.min(max, v)),
    Between: (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min,
    Vector2: class Vector2 { x = 0; y = 0; constructor(x?: number, y?: number) { this.x = x ?? 0; this.y = y ?? 0; } },
  },
  Utils: {
    Array: { Shuffle: <T>(a: T[]) => a, Remove: () => null },
    Objects: { DeepCopy: (o: any) => JSON.parse(JSON.stringify(o)) },
  },
  Display: {
    Color: {
      HSVToRGB: () => ({ color: 0 }),
      ColorToRGBA: () => ({ r: 0, g: 0, b: 0, a: 255 }),
      RGBToHSV: () => ({ h: 0, s: 0, v: 0 }),
      IntegerToColor: () => ({ r: 0, g: 0, b: 0 }),
      GetColor: () => 0,
    },
  },
  Input: { Keyboard: { KeyCodes: {} } },
  Scene: class Scene { constructor(..._args: any[]) {} sys: any = {}; },
  Scale: { CENTER_BOTH: 0 },
  AUTO: 0,
  HEADLESS: 4,
  BlendModes: { NORMAL: 0, ADD: 1, MULTIPLY: 2, SCREEN: 3 },
  Renderer: { WebGL: { Utils: { getTintAppendFloatAlpha: () => 0 } } },
};

/** Global RNG instance — shared with Phaser stub */
export const RND = new PhaserRNG();

/** Inject our RND into the Phaser stub so game code uses it */
/** Wire our RND into globalThis.Phaser.Math.RND so game code finds it */
function wireRND(): void {
  const rnd = RND;
  const rndProxy = {
    sow: (seeds: string[]) => rnd.sow(seeds),
    frac: () => rnd.frac(),
    integerInRange: (min: number, max: number) => rnd.integerInRange(min, max),
    pick: <T>(arr: T[]) => rnd.pick(arr),
    state: (s?: string) => s !== undefined ? rnd.state(s as string) : rnd.state(),
  };
  (globalThis as any).Phaser.Math.RND = rndProxy;
}

// Wire immediately at module load so game code that runs on import finds it
wireRND();

export function initRNG(): void {
  wireRND(); // re-wire in case globalThis.Phaser was reset
}

/** Mirror of game's shiftCharCodes */
export function shiftCharCodes(str: string, shiftCount: number): string {
  if (!shiftCount) shiftCount = 0;
  let out = "";
  for (let i = 0; i < str.length; i++) {
    out += String.fromCharCode(str.charCodeAt(i) + shiftCount);
  }
  return out;
}

/** Reset RNG to the wave seed (mirrors globalScene.resetSeed(waveIndex)) */
export function resetSeedForWave(seed: string, waveIndex: number): void {
  RND.sow([shiftCharCodes(seed, waveIndex)]);
}

/**
 * executeWithSeedOffset — mirrors globalScene.executeWithSeedOffset.
 * Saves state, runs func with offset seed, restores state.
 * This is what the game uses to isolate item screen RNG.
 */
export function executeWithSeedOffset(
  callback: () => void,
  offset: number,
  seedOverride?: string,
  baseSeed?: string
): void {
  const saved = RND.state() as string;
  RND.sow([shiftCharCodes(seedOverride ?? baseSeed ?? "", offset)]);
  callback();
  RND.state(saved);
}
