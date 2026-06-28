/**
 * data-lists stub — populates allMoves from our extracted JSON
 * so TM compatibility filtering works correctly.
 *
 * The game's init normally populates these arrays. We pre-populate
 * allMoves with name/type data extracted from the source.
 */
import speciesDataRaw from "../data/species-data.json" with { type: "json" };
import type { Move } from "../../pokerogue/src/data/moves/move.ts";

const moveNames: Record<number, string> = (speciesDataRaw as any).moveNames;

// Build a sparse array indexed by MoveId
// We only need .name (for "(N)" filter) and .type (for TM icon, we use NORMAL=0)
const _allMoves: any[] = [];
for (const [id, name] of Object.entries(moveNames)) {
  const idx = Number(id);
  _allMoves[idx] = {
    id: idx,
    name: name as string,
    type: 0, // PokemonType.UNKNOWN — cosmetic only, doesn't affect availability
    category: 0,
    power: 0,
    accuracy: 100,
    pp: 5,
    priority: 0,
    moveTarget: 0,
    isChargingMove: false,
    isMultiHit: false,
    hasFlag: () => false,
    getMove: () => null,
  };
}

export const allMoves: readonly Move[] = _allMoves as any;
export const allAbilities: readonly any[] = [];
export const modifierTypes: any = {};
export const catchableSpecies: any = {};
export const biomeDepths: any = {};
export const allBiomes: any = new Map();
