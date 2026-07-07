/**
 * Item selection heuristic for solo runs.
 *
 * Priority order:
 * 1. Master Ball / healing items if HP is low and a Reviver Seed/Sitrus-type isn't held
 * 2. Attack-boosting items matching the runner's STAB type (Attack Type Booster)
 * 3. TMs the runner can learn that improve coverage (prefer higher tier)
 * 4. Stat boosters (Base Stat Booster) for the runner
 * 5. Generic damage/utility items (Wide Lens, Scope Lens, Multi Lens, Focus Band)
 * 6. Money-preserving fallback (skip reroll, take whatever's left)
 *
 * Reroll policy: reroll once if none of the 3 options are "good" (tier COMMON
 * with no synergy) AND money allows; never reroll twice (preserve money for
 * emergencies / later upgrades).
 */
import type { ModifierTypeOption } from "#modifiers/modifier-type";
import type { PlayerPokemon } from "#field/pokemon";

export interface ItemChoice {
  optionIndex: number;
  reasoning: string;
}

const HIGH_VALUE_ITEM_IDS = new Set([
  "REVIVER_SEED", "SHELL_BELL", "LEFTOVERS", "SOUL_DEW",
  "FOCUS_BAND", "KINGS_ROCK", "MULTI_LENS", "WIDE_LENS",
  "EVIOLITE", "HEALING_CHARM",
]);

const STAT_BOOSTER_IDS = new Set(["BASE_STAT_BOOSTER", "ATTACK_TYPE_BOOSTER"]);

export function scoreItemOption(
  option: ModifierTypeOption,
  runner: PlayerPokemon,
  currentHpPercent: number,
): { score: number; reasoning: string } {
  const type = option.type as any;
  const id: string = type?.id ?? "UNKNOWN";
  const tier: number = type?.tier ?? 0;

  // TM handling
  if (id.startsWith("TM_") || type?.constructor?.name === "TmModifierType") {
    const moveName = type?.moveId !== undefined ? getMoveNameSafe(type.moveId) : "TM";
    // Higher tier TMs are generally better moves
    return { score: 50 + tier * 15, reasoning: `TM: ${moveName} (tier ${tier})` };
  }

  // Healing when low HP
  if (currentHpPercent < 0.5 && (id.includes("POTION") || id === "FULL_RESTORE" || id === "REVIVE" || id === "MAX_REVIVE")) {
    return { score: 90, reasoning: `${id} (HP is low: ${Math.round(currentHpPercent * 100)}%)` };
  }

  // High-value held items
  if (HIGH_VALUE_ITEM_IDS.has(id)) {
    return { score: 80 + tier * 5, reasoning: `${id} (high-value held item)` };
  }

  // Stat boosters
  if (STAT_BOOSTER_IDS.has(id)) {
    return { score: 60, reasoning: `${id} (permanent stat boost)` };
  }

  // Master ball / rogue ball — useful for catching strong wild Pokemon later, but
  // we're solo-running so balls aren't a priority
  if (id.includes("BALL") && !id.includes("REPEL")) {
    return { score: 10, reasoning: `${id} (low priority — solo run)` };
  }

  // EXP-related — minor value
  if (id.includes("EXP") || id === "LUCKY_EGG" || id === "GOLDEN_EGG") {
    return { score: 30, reasoning: `${id} (EXP boost)` };
  }

  // Generic common items
  return { score: 20 + tier * 10, reasoning: `${id} (tier ${tier})` };
}

function getMoveNameSafe(moveId: number): string {
  try {
    // Lazy import to avoid circular deps at module load
    const { allMoves } = require("#data/data-lists");
    return allMoves[moveId]?.name ?? `Move #${moveId}`;
  } catch {
    return `Move #${moveId}`;
  }
}

/**
 * Choose the best item from the 3 options presented.
 */
export function chooseItem(
  options: ModifierTypeOption[],
  runner: PlayerPokemon,
  currentHpPercent: number,
): ItemChoice {
  let bestIndex = 0;
  let bestScore = -Infinity;
  let bestReasoning = "";

  for (let i = 0; i < options.length; i++) {
    const { score, reasoning } = scoreItemOption(options[i], runner, currentHpPercent);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
      bestReasoning = reasoning;
    }
  }

  return { optionIndex: bestIndex, reasoning: bestReasoning };
}

/**
 * Decide whether to reroll given the current options and available money.
 * Rerolls once if the best available option scores below a "good enough" threshold.
 */
export function shouldReroll(
  options: ModifierTypeOption[],
  runner: PlayerPokemon,
  currentHpPercent: number,
  money: number,
  rerollCost: number,
  rerollsSoFar: number,
): boolean {
  if (rerollsSoFar >= 1) return false; // only ever reroll once
  if (money < rerollCost) return false;

  const best = Math.max(
    ...options.map(o => scoreItemOption(o, runner, currentHpPercent).score)
  );

  return best < 50; // threshold for "good enough"
}
