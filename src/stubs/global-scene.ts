/**
 * globalScene stub.
 *
 * The real globalScene is a full Phaser.Scene subclass. We only need
 * the small surface area that modifier-type.ts and init-modifier-pools.ts
 * actually call during item pool generation and biome selection.
 *
 * Set sceneState before calling any game functions.
 */

import type { GameMode } from "#app/game-mode";

export interface SceneState {
  seed: string;
  waveIndex: number;
  gameMode: GameMode;
  money: number;
  // executeWithSeedOffset is injected from our rng module at init time
  executeWithSeedOffset: (callback: () => void, offset: number, seedOverride?: string) => void;
}

class GlobalSceneStub {
  private _state: SceneState | null = null;

  init(state: SceneState): void {
    this._state = state;
  }

  private get state(): SceneState {
    if (!this._state) throw new Error("globalScene not initialized — call globalScene.init(state) first");
    return this._state;
  }

  get seed(): string { return this.state.seed; }
  get gameMode() { return this.state.gameMode; }
  get currentBattle() { return { waveIndex: this.state.waveIndex }; }
  get money(): number { return this.state.money; }
  get pokeballCounts(): Record<number, number> { return {}; }
  get modifiers(): any[] { return []; }
  get lockModifierTiers(): boolean { return false; }
  get moneyFormat(): string { return "abbreviated"; }
  get enableMoveInfo(): boolean { return false; }

  executeWithSeedOffset(callback: () => void, offset: number, seedOverride?: string): void {
    this.state.executeWithSeedOffset(callback, offset, seedOverride);
  }

  findModifier(_func: (m: any) => boolean): any { return null; }
  findModifiers(_func: (m: any) => boolean): any[] { return []; }
  getModifiers(_cls: any): any[] { return []; }
  applyModifiers(_cls: any, _isPlayer: boolean, ..._args: any[]): void {}
  getWaveMoneyAmount(_mult: number): number { return 0; }
  getPlayerParty(): any[] { return []; }
  getPlayerField(): any[] { return []; }
  randomSpecies(_waveIndex: number, _level: number): any { return null; }
  addMoney(_amount: number): void {}
}

export const globalScene = new GlobalSceneStub();
