/**
 * pokemon-species stub.
 * getPokemonSpecies is called by getDailyRunStarters to get a species
 * object, then call getTrainerSpeciesForLevel on it.
 * Since hasEvolutions() returns false in our registry stub, evolution
 * lookups are skipped and getTrainerSpeciesForLevel just returns the
 * base species ID — correct for level-20 daily starters.
 */

export class PokemonSpecies {
  speciesId: number;
  catchRate: number;

  constructor(speciesId = 0, catchRate = 45) {
    this.speciesId = speciesId;
    this.catchRate = catchRate;
  }

  getTrainerSpeciesForLevel(
    _level: number,
    _allowEvolving = false,
    _strength?: any,
    _encounterKind?: any,
  ): number {
    // With hasEvolutions = false, the species stays as-is
    return this.speciesId;
  }

  getFormKey(): string { return ""; }
  getRootSpeciesId(): number { return this.speciesId; }
}

export function getPokemonSpecies(speciesId: number): PokemonSpecies {
  return new PokemonSpecies(speciesId);
}

export function getPokemonSpeciesForm(speciesId: number, _form: number): PokemonSpecies {
  return new PokemonSpecies(speciesId);
}

export default PokemonSpecies;
