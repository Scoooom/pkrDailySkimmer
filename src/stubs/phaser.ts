/**
 * Phaser stub — provides only the Phaser APIs called by the game
 * code we import (modifier pools, arena, biome selection).
 *
 * Phaser.Math.RND is backed by our Well512 port in rng.ts.
 * The real RND instance is injected at startup.
 */

class RandomDataGeneratorStub {
  sow(_seeds: string[]): void { throw new Error("Phaser.Math.RND not initialized — call initRNG() first"); }
  integerInRange(_min: number, _max: number): number { throw new Error("Phaser.Math.RND not initialized"); }
  frac(): number { throw new Error("Phaser.Math.RND not initialized"); }
  pick<T>(_arr: T[]): T { throw new Error("Phaser.Math.RND not initialized"); }
  state(_s?: string): string { throw new Error("Phaser.Math.RND not initialized"); }
}

export const Phaser = {
  Math: {
    RND: new RandomDataGeneratorStub() as any,
    Clamp: (value: number, min: number, max: number): number =>
      Math.max(min, Math.min(max, value)),
  },
  Display: {
    Color: {
      HSVToRGB: () => ({ color: 0 }),
      ColorToRGBA: () => ({ r: 0, g: 0, b: 0, a: 255 }),
    },
  },
  Utils: {
    Array: {
      Shuffle: <T>(arr: T[]): T[] => arr,
    },
  },
};

// Allow game code that does `import Phaser from 'phaser'` (default import)
export default Phaser;
