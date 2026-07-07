/**
 * Formats a DailyGuide into a human-readable step-by-step text guide,
 * as requested: a list (not prose) covering catch decisions, combat moves,
 * item choices, and biome picks.
 */
import type { DailyGuide, RunnerResult, WaveGuide } from "./types.ts";

export function buildTextGuide(guide: DailyGuide): string {
  const lines: string[] = [];

  lines.push(`PokeRogue Daily Run Guide`);
  lines.push(`Seed: ${guide.seed}`);
  lines.push(`Date: ${guide.date}`);
  lines.push(`Generated: ${guide.generatedAt}`);
  lines.push(`Game version: ${guide.pkrCommit}`);
  lines.push("");
  lines.push(`Starters: ${guide.starters.map(s => `${s.species} (#${s.speciesId})`).join(", ")}`);
  lines.push("");

  if (!guide.recommendation) {
    lines.push("Unable to find viable runner - error");
    lines.push("");
    lines.push("Attempted candidates:");
    for (const c of guide.candidates) {
      lines.push(`  - ${c.species} (${c.source}): failed at wave ${c.failedAtWave ?? "?"} — ${c.failReason ?? "unknown"}`);
    }
    return lines.join("\n");
  }

  lines.push(`>>> RECOMMENDED: ${guide.recommendation.summary} <<<`);
  lines.push("");

  const winner = guide.candidates.find(
    c => c.speciesId === guide.recommendation!.speciesId && c.source === guide.recommendation!.source,
  )!;

  lines.push(`Pick: ${winner.species}${winner.source === "wave1_catch" ? " (catch on wave 1)" : ""}`);
  lines.push("");
  lines.push("--- Wave-by-wave guide ---");
  lines.push("");

  for (const wave of winner.waves) {
    lines.push(...formatWave(wave));
    lines.push("");
  }

  if (guide.candidates.length > 1) {
    lines.push("--- Other candidates attempted ---");
    for (const c of guide.candidates) {
      if (c === winner) continue;
      const status = c.viable ? "viable" : `failed at wave ${c.failedAtWave} (${c.failReason})`;
      lines.push(`  - ${c.species} (${c.source}): ${status}`);
    }
  }

  return lines.join("\n");
}

function formatWave(wave: WaveGuide): string[] {
  const lines: string[] = [];
  const header = `Wave ${wave.wave} — ${wave.biome} (${wave.waveType}${wave.isDouble ? ", double battle" : ""})`;
  lines.push(header);

  if (wave.encounters.length > 0) {
    const enc = wave.encounters.map(e => `${e.species} Lv${e.level}${e.isBoss ? " [BOSS]" : ""}`).join(" + ");
    lines.push(`  Encounter: ${enc}`);
  }

  if (wave.caught) {
    lines.push(`  >> Catch ${wave.caught.species} (ball ${wave.caught.ballsUsed}/5) <<`);
  } else if (wave.turns.length > 0) {
    for (const turn of wave.turns) {
      if (turn.action === "ball") {
        lines.push(`  Turn ${turn.turn}: Throw Poké Ball — ${turn.reasoning}`);
      } else if (turn.action === "move") {
        lines.push(`  Turn ${turn.turn}: Use ${turn.moveName} — ${turn.reasoning}`);
      }
    }
  }

  if (wave.itemScreen) {
    const s = wave.itemScreen;
    if (s.rerolled) {
      lines.push(`  Item screen: reroll x${s.rerollCount} (₽${s.moneyBefore} → ₽${s.moneyAfter})`);
    }
    const item = s.chosen;
    lines.push(`  Take: ${item.isTm ? `TM (${item.moveName})` : item.item} [${item.tier}]`);
  }

  if (wave.fixedRewards && wave.fixedRewards.length > 0) {
    lines.push(`  Fixed reward: ${wave.fixedRewards.join(", ")}`);
  }

  if (wave.biomeChoice) {
    const bc = wave.biomeChoice;
    if (bc.options.length > 0) {
      lines.push(`  Biome choice: pick ${bc.chosen} (options: ${bc.options.join(", ")}) — ${bc.reasoning}`);
    }
  }

  lines.push(`  [HP: ${Math.round(wave.runnerHpPercent * 100)}%, Lv${wave.runnerLevel}, ₽${wave.money}]`);

  return lines;
}
