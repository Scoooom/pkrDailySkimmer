/**
 * Pokemon stub for #field/pokemon
 *
 * Only exposes the runtime surface that modifier pool weight functions
 * actually call. Type-only imports from the game code are erased at
 * runtime, but vite-node still resolves the module, so we need this.
 */
import speciesDataRaw from "../data/species-data.json" with { type: "json" };
const speciesData: any = speciesDataRaw;

export class Pokemon {
  speciesId: number;
  level: number;
  hp = 100;
  status: any = null;

  species: any;
  fusionSpecies: any = null;

  constructor(speciesId: number, level: number) {
    this.speciesId = speciesId;
    this.level = level;
    this.species = {
      speciesId,
      getTms: () => speciesData.species[speciesId]?.compatibleTms ?? [],
    };
  }

  isAllowedInBattle(): boolean { return true; }
  isFainted(): boolean { return false; }
  isFullHp(): boolean { return true; }
  isFusion(): boolean { return false; }
  getLuck(): number { return 0; }
  getNature(): number { return 0; }
  getFormKey(): string { return ""; }
  getFusionFormKey(): string { return ""; }
  getTag(_type: any): any { return null; }
  getMoveset(): any[] { return []; }

  getLearnableLevelMoves(): number[] {
    const sp = speciesData.species[this.speciesId];
    if (!sp) return [];
    return sp.levelUpMoves
      .filter(([lv]: [number, number]) => lv > this.level)
      .map(([, id]: [number, number]) => id);
  }

  isTmCompatible(moveId: number, _checkForm = false): boolean {
    const sp = speciesData.species[this.speciesId];
    return sp?.compatibleTms?.includes(moveId) ?? false;
  }

  getCompatibleTms(): Array<{ moveId: number }> {
    const sp = speciesData.species[this.speciesId];
    return (sp?.compatibleTms ?? []).map((id: number) => ({ moveId: id }));
  }

  getHeldItems(): any[] { return []; }
  isPlayer(): boolean { return true; }
  id = Math.floor(Math.random() * 100000);
}

export class PlayerPokemon extends Pokemon {
  constructor(speciesId: number, level: number) {
    super(speciesId, level);
  }
}

export class EnemyPokemon extends Pokemon {}

// Re-export types the modifier code references
export type { Pokemon as default };
