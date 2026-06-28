/**
 * speciesDataRegistry stub.
 * Backed by our extracted species JSON.
 */
import speciesDataRaw from "../data/species-data.json" with { type: "json" };

interface SpeciesEntry {
  compatibleTms: number[];
  levelUpMoves: [number, number][];
  catchRate: number;
  starterCost: number | null;
}

const speciesData: Record<number, SpeciesEntry> = (speciesDataRaw as any).species;

// Build starterCost lookup: cost -> speciesId[]
const startersByCost: Record<number, number[]> = {};
for (const [idStr, entry] of Object.entries(speciesData)) {
  const cost = entry.starterCost;
  if (cost != null) {
    if (!startersByCost[cost]) startersByCost[cost] = [];
    startersByCost[cost].push(Number(idStr));
  }
}

class SpeciesDataRegistryStub {
  // ── TM / move data ────────────────────────────────────────────────────────
  getTms(speciesId: number): number[] {
    return speciesData[speciesId]?.compatibleTms ?? [];
  }
  getLevelMoves(speciesId: number): [number, number][] {
    return speciesData[speciesId]?.levelUpMoves ?? [];
  }
  getFormLevelMoves(_speciesId: number, _formKey: string): [number, number][] { return []; }
  hasFormLevelMoves(_speciesId: number): boolean { return false; }

  // ── Species lookup ────────────────────────────────────────────────────────
  getSpecies(speciesId: number): any {
    const entry = speciesData[speciesId];
    if (!entry) return null;
    return {
      speciesId,
      catchRate: entry.catchRate,
      getRootSpeciesId: () => speciesId,
      getFormKey: () => "",
      // Used by getDailyRunStarters to find the appropriate evolution for level 20
      // Since hasEvolutions returns false, this just returns the base species
      getTrainerSpeciesForLevel: (_level: number, _allowEvo?: boolean, _strength?: any, _kind?: any) => speciesId,
      getSpeciesForLevel: (_level: number, _allowEvo?: boolean, _forTrainer?: boolean) => speciesId,
    };
  }
  getAllSpecies(): any[] {
    return Object.entries(speciesData).map(([id, entry]) => ({
      speciesId: Number(id),
      catchRate: entry.catchRate,
    }));
  }

  // ── Starter data ──────────────────────────────────────────────────────────
  getStartersForCost(cost: number): number[] {
    return startersByCost[cost] ?? [];
  }
  getStarterCost(speciesId: number): number {
    return speciesData[speciesId]?.starterCost ?? 3;
  }
  getStarter(speciesId: number): number {
    // Return the base/root form — we don't track evolution chains, so return as-is
    return speciesId;
  }
  getAllStarters(): number[] {
    return Object.entries(speciesData)
      .filter(([, e]) => e.starterCost != null)
      .map(([id]) => Number(id));
  }

  // ── Evolution (no-op) ────────────────────────────────────────────────────
  hasEvolutions(_speciesId: number): boolean { return false; }
  getEvolutions(_speciesId: number): any[] { return []; }
  hasPrevolution(_speciesId: number): boolean { return false; }
  getPrevolution(_speciesId: number): number | null { return null; }

  // ── Form changes (no-op) ─────────────────────────────────────────────────
  hasFormChanges(_speciesId: number): boolean { return false; }
  getFormChanges(_speciesId: number): any[] { return []; }
  getFormIndex(_speciesId: number, _formKey: string): number { return 0; }
  hasVariants(_speciesId: number): boolean { return false; }

  // ── Misc ─────────────────────────────────────────────────────────────────
  getEggTier(_speciesId: number): number { return 0; }
}

export const speciesDataRegistry = new SpeciesDataRegistryStub();
export function setSpeciesDataRegistry(_r: any): void {}
