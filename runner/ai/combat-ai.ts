/**
 * Combat AI — decides what move to use each turn.
 *
 * Strategy:
 * 1. On catchable wild waves, attempt to throw a Pokéball on turn 1 (always).
 *    If catch fails, fight normally.
 * 2. Otherwise, use the highest effective damage move available.
 *    Tie-break by PP remaining.
 *
 * This is intentionally simple — "a winning strategy" not "optimal play".
 * We avoid moves that would KO the target on a catchable wave if we still have balls.
 */
import type { PlayerPokemon, EnemyPokemon } from "#field/pokemon";
import { MoveCategory } from "#enums/move-category";
import { allMoves } from "#data/data-lists";
import { PokemonType } from "#enums/pokemon-type";
import { BattlerIndex } from "#enums/battler-index";

export interface MoveDecision {
  type: "move";
  moveIndex: number; // index in moveset (0-3)
  targetIndex: BattlerIndex;
  moveName: string;
  reasoning: string;
}

export interface BallDecision {
  type: "ball";
  ballType: 0; // always standard Pokéball (type 0)
}

export type CombatDecision = MoveDecision | BallDecision;

/**
 * Decide what to do on this turn.
 *
 * @param runner - The solo runner Pokemon
 * @param enemies - Array of enemy Pokemon on the field
 * @param isWildCatchable - Whether the wave allows catching
 * @param hasPokeballs - Whether we have any Pokéballs
 * @param ballsThrown - How many balls have been thrown this wave (0 = first turn)
 * @param isFirstTurn - Whether this is turn 1 of the wave
 */
export function decideCombatAction(
  runner: PlayerPokemon,
  enemies: EnemyPokemon[],
  isWildCatchable: boolean,
  hasPokeballs: boolean,
  ballsThrown: number,
  isFirstTurn: boolean,
): CombatDecision {
  // Always try to catch on turn 1 of a catchable wild wave if we have balls
  if (isWildCatchable && hasPokeballs && isFirstTurn && ballsThrown === 0) {
    return { type: "ball", ballType: 0 };
  }

  // Pick the best move against the primary target
  const primaryTarget = enemies[0];
  const targetIndex = BattlerIndex.ENEMY;

  const moveset = runner.getMoveset();
  let bestMoveIndex = 0;
  let bestScore = -Infinity;
  let bestReasoning = "";

  for (let i = 0; i < moveset.length; i++) {
    const moveEntry = moveset[i];
    if (!moveEntry || moveEntry.ppUsed >= moveEntry.getMovePp()) continue; // No PP

    const move = moveEntry.getMove();
    if (!move) continue;

    // Skip status moves — prefer attacking
    if (move.category === MoveCategory.STATUS) {
      const score = -100 + (moveEntry.getMovePp() - moveEntry.ppUsed); // prefer high-PP status as last resort
      if (score > bestScore) {
        bestScore = score;
        bestMoveIndex = i;
        bestReasoning = `${move.name} (status — last resort)`;
      }
      continue;
    }

    // Calculate effective power with type effectiveness
    const basePower = move.power ?? 0;
    if (basePower <= 0) continue; // Variable power moves get estimated below

    const effectiveness = getTypeEffectiveness(move.type, primaryTarget);
    const stabMultiplier = isStab(runner, move.type) ? 1.5 : 1.0;
    const score = basePower * effectiveness * stabMultiplier;

    // Bias toward moves with more PP remaining (tiebreak)
    const ppScore = (moveEntry.getMovePp() - moveEntry.ppUsed) * 0.01;

    if (score + ppScore > bestScore) {
      bestScore = score + ppScore;
      bestMoveIndex = i;
      const effStr = effectiveness > 1 ? " (super effective!)" : effectiveness < 1 ? " (not very effective)" : "";
      const stabStr = stabMultiplier > 1 ? " + STAB" : "";
      bestReasoning = `${move.name} (${basePower} power${effStr}${stabStr})`;
    }
  }

  // Fallback: first move with PP
  if (bestScore === -Infinity) {
    for (let i = 0; i < moveset.length; i++) {
      const moveEntry = moveset[i];
      if (moveEntry && moveEntry.ppUsed < moveEntry.getMovePp()) {
        bestMoveIndex = i;
        bestReasoning = `${moveEntry.getMove()?.name ?? "move"} (only option with PP)`;
        break;
      }
    }
  }

  return {
    type: "move",
    moveIndex: bestMoveIndex,
    targetIndex,
    moveName: moveset[bestMoveIndex]?.getMove()?.name ?? "Unknown",
    reasoning: bestReasoning,
  };
}

function isStab(pokemon: PlayerPokemon, moveType: PokemonType): boolean {
  const types = pokemon.getTypes();
  return types.includes(moveType);
}

/**
 * Simplified type effectiveness — covers all type matchups.
 * Returns 0, 0.25, 0.5, 1, 2, or 4.
 */
function getTypeEffectiveness(moveType: PokemonType, target: EnemyPokemon): number {
  const targetTypes = target.getTypes();
  let effectiveness = 1.0;
  for (const defType of targetTypes) {
    effectiveness *= singleTypeEffectiveness(moveType, defType);
  }
  return effectiveness;
}

// Type effectiveness chart
const TYPE_CHART: Partial<Record<PokemonType, Partial<Record<PokemonType, number>>>> = {
  [PokemonType.FIRE]:     { [PokemonType.GRASS]: 2, [PokemonType.ICE]: 2, [PokemonType.BUG]: 2, [PokemonType.STEEL]: 2, [PokemonType.WATER]: 0.5, [PokemonType.FIRE]: 0.5, [PokemonType.ROCK]: 0.5, [PokemonType.DRAGON]: 0.5 },
  [PokemonType.WATER]:    { [PokemonType.FIRE]: 2, [PokemonType.GROUND]: 2, [PokemonType.ROCK]: 2, [PokemonType.WATER]: 0.5, [PokemonType.GRASS]: 0.5, [PokemonType.DRAGON]: 0.5 },
  [PokemonType.GRASS]:    { [PokemonType.WATER]: 2, [PokemonType.GROUND]: 2, [PokemonType.ROCK]: 2, [PokemonType.FIRE]: 0.5, [PokemonType.GRASS]: 0.5, [PokemonType.POISON]: 0.5, [PokemonType.FLYING]: 0.5, [PokemonType.BUG]: 0.5, [PokemonType.DRAGON]: 0.5, [PokemonType.STEEL]: 0.5 },
  [PokemonType.ELECTRIC]: { [PokemonType.WATER]: 2, [PokemonType.FLYING]: 2, [PokemonType.GRASS]: 0.5, [PokemonType.ELECTRIC]: 0.5, [PokemonType.DRAGON]: 0.5, [PokemonType.GROUND]: 0 },
  [PokemonType.ICE]:      { [PokemonType.GRASS]: 2, [PokemonType.GROUND]: 2, [PokemonType.FLYING]: 2, [PokemonType.DRAGON]: 2, [PokemonType.FIRE]: 0.5, [PokemonType.WATER]: 0.5, [PokemonType.ICE]: 0.5, [PokemonType.STEEL]: 0.5 },
  [PokemonType.FIGHTING]: { [PokemonType.NORMAL]: 2, [PokemonType.ICE]: 2, [PokemonType.ROCK]: 2, [PokemonType.DARK]: 2, [PokemonType.STEEL]: 2, [PokemonType.POISON]: 0.5, [PokemonType.FLYING]: 0.5, [PokemonType.PSYCHIC]: 0.5, [PokemonType.BUG]: 0.5, [PokemonType.FAIRY]: 0.5, [PokemonType.GHOST]: 0 },
  [PokemonType.POISON]:   { [PokemonType.GRASS]: 2, [PokemonType.FAIRY]: 2, [PokemonType.POISON]: 0.5, [PokemonType.GROUND]: 0.5, [PokemonType.ROCK]: 0.5, [PokemonType.GHOST]: 0.5, [PokemonType.STEEL]: 0 },
  [PokemonType.GROUND]:   { [PokemonType.FIRE]: 2, [PokemonType.ELECTRIC]: 2, [PokemonType.POISON]: 2, [PokemonType.ROCK]: 2, [PokemonType.STEEL]: 2, [PokemonType.GRASS]: 0.5, [PokemonType.BUG]: 0.5, [PokemonType.FLYING]: 0 },
  [PokemonType.FLYING]:   { [PokemonType.GRASS]: 2, [PokemonType.FIGHTING]: 2, [PokemonType.BUG]: 2, [PokemonType.ELECTRIC]: 0.5, [PokemonType.ROCK]: 0.5, [PokemonType.STEEL]: 0.5 },
  [PokemonType.PSYCHIC]:  { [PokemonType.FIGHTING]: 2, [PokemonType.POISON]: 2, [PokemonType.PSYCHIC]: 0.5, [PokemonType.STEEL]: 0.5, [PokemonType.DARK]: 0 },
  [PokemonType.BUG]:      { [PokemonType.GRASS]: 2, [PokemonType.PSYCHIC]: 2, [PokemonType.DARK]: 2, [PokemonType.FIRE]: 0.5, [PokemonType.FIGHTING]: 0.5, [PokemonType.FLYING]: 0.5, [PokemonType.GHOST]: 0.5, [PokemonType.STEEL]: 0.5, [PokemonType.FAIRY]: 0.5 },
  [PokemonType.ROCK]:     { [PokemonType.FIRE]: 2, [PokemonType.ICE]: 2, [PokemonType.FLYING]: 2, [PokemonType.BUG]: 2, [PokemonType.FIGHTING]: 0.5, [PokemonType.GROUND]: 0.5, [PokemonType.STEEL]: 0.5 },
  [PokemonType.GHOST]:    { [PokemonType.PSYCHIC]: 2, [PokemonType.GHOST]: 2, [PokemonType.DARK]: 0.5, [PokemonType.NORMAL]: 0 },
  [PokemonType.DRAGON]:   { [PokemonType.DRAGON]: 2, [PokemonType.STEEL]: 0.5, [PokemonType.FAIRY]: 0 },
  [PokemonType.DARK]:     { [PokemonType.PSYCHIC]: 2, [PokemonType.GHOST]: 2, [PokemonType.FIGHTING]: 0.5, [PokemonType.DARK]: 0.5, [PokemonType.FAIRY]: 0.5 },
  [PokemonType.STEEL]:    { [PokemonType.ICE]: 2, [PokemonType.ROCK]: 2, [PokemonType.FAIRY]: 2, [PokemonType.FIRE]: 0.5, [PokemonType.WATER]: 0.5, [PokemonType.ELECTRIC]: 0.5, [PokemonType.STEEL]: 0.5 },
  [PokemonType.FAIRY]:    { [PokemonType.FIGHTING]: 2, [PokemonType.DRAGON]: 2, [PokemonType.DARK]: 2, [PokemonType.FIRE]: 0.5, [PokemonType.POISON]: 0.5, [PokemonType.STEEL]: 0.5 },
};

function singleTypeEffectiveness(atkType: PokemonType, defType: PokemonType): number {
  return TYPE_CHART[atkType]?.[defType] ?? 1.0;
}
