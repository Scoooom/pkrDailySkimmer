/**
 * DailyRunner — drives the actual PokeRogue game engine headlessly through
 * an entire daily run for a single solo candidate.
 *
 * This intercepts phases exactly like the game's own test framework, but
 * instead of asserting expectations, we record decisions and outcomes into
 * a WaveGuide for human consumption.
 */
import Phaser from "phaser";
import { vi } from "vitest";
import { GameManager } from "#test/framework/game-manager";
import { UiMode } from "#enums/ui-mode";
import { Button } from "#enums/buttons";
import { BattlerIndex } from "#enums/battler-index";
import { PokeballType } from "#enums/pokeball";
import { GameModes } from "#enums/game-modes";
import { getGameMode } from "#app/game-mode";
import { pokerogueApi } from "#api/api";
import { SpeciesId } from "#enums/species-id";
import type { CommandPhase } from "#phases/command-phase";
import type { SelectModifierPhase } from "#phases/select-modifier-phase";
import type { SelectBiomePhase } from "#phases/select-biome-phase";
import type { CommandUiHandler } from "#app/ui/handlers/command-ui-handler";
import type { BallUiHandler } from "#app/ui/handlers/ball-ui-handler";
import type { ModifierSelectUiHandler } from "#app/ui/handlers/modifier-select-ui-handler";
import { decideCombatAction } from "./ai/combat-ai.ts";
import { chooseItem, shouldReroll } from "./ai/item-selector.ts";
import type { WaveGuide, RunnerResult, TurnAction } from "./types.ts";
import { BiomeId } from "#enums/biome-id";

const MAX_WAVE = 50;
const MAX_TURNS_PER_WAVE = 50; // safety valve against infinite loops

export class DailyRunner {
  private game: GameManager;
  private phaserGame: Phaser.Game;
  private waves: WaveGuide[] = [];
  private ballsThrownThisWave = 0;
  private caughtThisWave = false;

  constructor(phaserGame: Phaser.Game) {
    this.phaserGame = phaserGame;
    this.game = new GameManager(phaserGame);
  }

  /**
   * Boot the game to the title screen and start a daily run with the given seed.
   * Reuses the game's own DailyModeHelper (game.dailyMode), which is exactly
   * what the game's test suite uses — runs through TitlePhase -> SAVE_SLOT ->
   * generateDaily() -> EncounterPhase -> CommandPhase.
   *
   * The seed is injected by mocking pokerogueApi.daily.getSeed(), which is
   * exactly how generateDaily() sources its seed in the real game flow.
   */
  async startDaily(seed: string): Promise<void> {
    vi.spyOn(pokerogueApi.daily, "getSeed").mockResolvedValue(seed);
    await this.game.dailyMode.startBattle();
  }

  /**
   * Run the full 50-wave daily, making combat/item/biome decisions
   * via our AI heuristics. Returns the complete wave-by-wave guide.
   *
   * @param resolveSolo - called once wave 1 has resolved, with the wave 1
   *   guide entry available for inspection (e.g. to check `caught`).
   *   Must return the speciesId to keep as the solo runner, or `null` to
   *   abort the run entirely (e.g. a wave1_catch attempt that failed and
   *   the caller has no fallback for this candidate).
   */
  async runFullDaily(
    resolveSolo: (wave1: WaveGuide) => number | null,
  ): Promise<{ waves: WaveGuide[]; won: boolean; failReason?: string; aborted?: boolean }> {
    let trimmedParty = false;

    try {
      while (true) {
        const battle = this.game.scene.currentBattle;
        if (!battle) break;

        const wave = battle.waveIndex;
        if (wave > MAX_WAVE) break;

        const waveGuide = await this.runWave(wave);
        this.waves.push(waveGuide);

        if (wave === 1 && !trimmedParty) {
          const keepSpeciesId = resolveSolo(waveGuide);
          if (keepSpeciesId === null) {
            return { waves: this.waves, won: false, aborted: true };
          }
          this.trimPartyToSolo(keepSpeciesId);
          trimmedParty = true;
        }

        if (wave === MAX_WAVE) {
          await this.game.phaseInterceptor.to("GameOverPhase", false).catch(() => {});
          return { waves: this.waves, won: true };
        }

        const party = this.game.scene.getPlayerParty();
        if (party.length === 0 || party.every(p => p.isFainted())) {
          return { waves: this.waves, won: false, failReason: `Runner fainted on wave ${wave}` };
        }
      }

      return { waves: this.waves, won: true };
    } catch (err: any) {
      return { waves: this.waves, won: false, failReason: err?.message ?? String(err) };
    }
  }

  /**
   * Release every party member except the one matching keepSpeciesId.
   * Mirrors the game's own release flow:
   *   globalScene.removePartyMemberModifiers(slotIndex)
   *   globalScene.getPlayerParty().splice(slotIndex, 1)
   *
   * If keepSpeciesId is not present in the party (e.g. a wave1_catch
   * attempt that failed), this throws — callers must check
   * wave1.caught before invoking runFullDaily with a wave1_catch target.
   */
  private trimPartyToSolo(keepSpeciesId: number): void {
    const scene = this.game.scene as any;
    const party = scene.getPlayerParty();

    if (!party.some((p: any) => p.species.speciesId === keepSpeciesId)) {
      throw new Error(
        `trimPartyToSolo: species ${keepSpeciesId} not found in party — was the catch attempt confirmed before calling runFullDaily?`,
      );
    }

    // Remove from the back forward so earlier indices stay valid.
    // If there are multiple party members of the same species (shouldn't
    // happen for our use case, but guard anyway), keep only the first match.
    let kept = false;
    for (let i = party.length - 1; i >= 0; i--) {
      if (party[i].species.speciesId === keepSpeciesId && !kept) {
        kept = true;
        continue;
      }
      scene.removePartyMemberModifiers(i);
      party.splice(i, 1);
    }

    if (party.length !== 1) {
      throw new Error(
        `trimPartyToSolo: expected exactly 1 Pokemon to remain (species ${keepSpeciesId}), got ${party.length}`,
      );
    }
  }

  /**
   * Run a single wave: handle the battle (catch attempt or combat),
   * then the post-battle screen (item choice or fixed reward or biome pick).
   */
  private async runWave(wave: number): Promise<WaveGuide> {
    this.ballsThrownThisWave = 0;
    this.caughtThisWave = false;

    const biome = BiomeId[this.game.scene.arena.biomeId] ?? String(this.game.scene.arena.biomeId);
    const isDouble = this.game.scene.currentBattle.double;
    const waveType = this.classifyWave(wave);

    const encounters = this.game.scene.getEnemyParty().map(p => ({
      speciesId: p.species.speciesId,
      species: SpeciesId[p.species.speciesId] ?? String(p.species.speciesId),
      level: p.level,
      isBoss: p.isBoss(),
    }));

    const turns: TurnAction[] = [];
    let turnCount = 0;
    let caughtInfo: WaveGuide["caught"] | undefined;

    // Combat loop — keep issuing commands until the wave resolves
    while (this.game.isCurrentPhase("CommandPhase") && turnCount < MAX_TURNS_PER_WAVE) {
      turnCount++;
      const isFirstTurn = turnCount === 1;
      const result = await this.takeTurn(wave, waveType, isFirstTurn);
      turns.push(result.action);
      if (result.caught) {
        caughtInfo = result.caught;
        break;
      }
    }

    // If we caught the target, the battle ends immediately (VictoryPhase fires)
    // Wait for the battle to fully resolve to the next decision point
    await this.game.phaseInterceptor.to("CommandPhase", false).catch(() => {});

    const runner = this.game.scene.getPlayerParty()[0];
    const runnerHpPercent = runner ? runner.hp / runner.getMaxHp() : 0;
    const runnerLevel = runner?.level ?? 0;

    const waveGuide: WaveGuide = {
      wave,
      biome,
      waveType,
      isDouble,
      encounters,
      caught: caughtInfo,
      turns,
      runnerHpPercent,
      runnerLevel,
      money: this.game.scene.money,
    };

    // Handle post-battle screen
    if (wave % 10 === 0) {
      waveGuide.fixedRewards = await this.handleFixedRewardScreen(wave);
      if (wave < MAX_WAVE) {
        waveGuide.biomeChoice = await this.handleBiomeChoice();
      }
    } else if (wave < MAX_WAVE) {
      waveGuide.itemScreen = await this.handleItemScreen(wave);
    }

    return waveGuide;
  }

  /**
   * Take a single turn: either throw a ball or use a move.
   */
  private async takeTurn(
    wave: number,
    waveType: WaveGuide["waveType"],
    isFirstTurn: boolean,
  ): Promise<{ action: TurnAction; caught?: WaveGuide["caught"] }> {
    const runner = this.game.scene.getPlayerParty()[0];
    const enemies = this.game.scene.getEnemyParty();
    const hasPokeballs = this.game.scene.pokeballCounts[PokeballType.POKEBALL] > 0;
    const isCatchable = waveType === "wild";

    const decision = decideCombatAction(
      runner, enemies as any, isCatchable, hasPokeballs, this.ballsThrownThisWave, isFirstTurn,
    );

    const partyLengthBefore = this.game.scene.getPlayerParty().length;

    if (decision.type === "ball") {
      this.ballsThrownThisWave++;
      this.game.doThrowPokeball(decision.ballType as PokeballType);
      await this.game.phaseInterceptor.to("CommandPhase", false).catch(() => {});

      const partyLengthAfter = this.game.scene.getPlayerParty().length;
      const caught = partyLengthAfter > partyLengthBefore;

      const action: TurnAction = {
        turn: this.ballsThrownThisWave,
        action: "ball",
        ballType: decision.ballType,
        reasoning: caught ? "Caught!" : "Catch attempt failed",
      };

      if (caught) {
        const newPokemon = this.game.scene.getPlayerParty()[partyLengthAfter - 1];
        return {
          action,
          caught: {
            speciesId: newPokemon.species.speciesId,
            species: SpeciesId[newPokemon.species.speciesId] ?? String(newPokemon.species.speciesId),
            ballsUsed: this.ballsThrownThisWave,
          },
        };
      }
      return { action };
    }

    // Move decision
    const moveset = runner.getMoveset();
    const moveEntry = moveset[decision.moveIndex];
    const moveId = moveEntry?.moveId;

    this.game.move.select(moveId as any, BattlerIndex.PLAYER, decision.targetIndex);
    await this.game.toEndOfTurn();

    return {
      action: {
        turn: this.ballsThrownThisWave + 1,
        action: "move",
        moveId,
        moveName: decision.moveName,
        targetIndex: decision.targetIndex,
        reasoning: decision.reasoning,
      },
    };
  }

  private classifyWave(wave: number): WaveGuide["waveType"] {
    if (wave === MAX_WAVE) return "final_boss";
    if (wave === 10) return "boss";
    if (wave % 10 === 0) return "gym_leader";
    if (wave % 5 === 0) return "trainer";
    return "wild";
  }

  private async handleFixedRewardScreen(wave: number): Promise<string[]> {
    // Fixed rewards auto-apply; just advance past them
    await this.game.phaseInterceptor.to("CommandPhase", false).catch(() => {});
    return []; // TODO: capture actual reward names from modifier list delta
  }

  private async handleItemScreen(wave: number): Promise<WaveGuide["itemScreen"]> {
    const runner = this.game.scene.getPlayerParty()[0];
    const hpPercent = runner ? runner.hp / runner.getMaxHp() : 1;
    const moneyBefore = this.game.scene.money;

    let rerolled = false;
    let rerollCount = 0;
    let chosenOption: any = null;

    this.game.onNextPrompt("SelectModifierPhase", UiMode.MODIFIER_SELECT, () => {
      const phase = this.game.scene.phaseManager.getCurrentPhase() as SelectModifierPhase;
      const options = (phase as any).typeOptions;
      const handler = this.game.scene.ui.getHandler() as ModifierSelectUiHandler;

      const rerollCost = (phase as any).getRerollCost(this.game.scene.lockModifierTiers ?? false);
      const wantsReroll = rerollCost > 0 && shouldReroll(
        options, runner, hpPercent, this.game.scene.money, rerollCost, rerollCount,
      );

      if (wantsReroll) {
        rerolled = true;
        rerollCount++;
        // Row 0, cursor 0 = reroll button (see SelectModifierPhase.modifierSelectCallback)
        (handler as any).setRowCursor?.(0);
        handler.setCursor(0);
        handler.processInput(Button.ACTION);
        // rerollModifiers() re-enters the same prompt; the next onNextPrompt
        // registration below will fire again for the new option set.
        this.game.onNextPrompt("SelectModifierPhase", UiMode.MODIFIER_SELECT, () => {
          const newOptions = (phase as any).typeOptions;
          const choice = chooseItem(newOptions, runner, hpPercent);
          chosenOption = newOptions[choice.optionIndex];
          // Row 1 = reward row, cursor = option index
          (handler as any).setRowCursor?.(1);
          handler.setCursor(choice.optionIndex);
          handler.processInput(Button.ACTION);
        }, undefined, true);
        return;
      }

      const choice = chooseItem(options, runner, hpPercent);
      chosenOption = options[choice.optionIndex];
      (handler as any).setRowCursor?.(1);
      handler.setCursor(choice.optionIndex);
      handler.processInput(Button.ACTION);
    }, undefined, true);

    await this.game.phaseInterceptor.to("CommandPhase", false).catch(() => {});

    const type = chosenOption?.type as any;
    return {
      rerolled,
      rerollCount,
      moneyBefore,
      moneyAfter: this.game.scene.money,
      chosen: {
        tier: type?.tier !== undefined ? String(type.tier) : "UNKNOWN",
        item: type?.id ?? "UNKNOWN",
        isTm: (type?.id ?? "").startsWith("TM_"),
        moveName: type?.moveId !== undefined ? String(type.moveId) : undefined,
      },
    };
  }

  private async handleBiomeChoice(): Promise<WaveGuide["biomeChoice"]> {
    let options: string[] = [];
    let chosen = "";

    // SelectBiomePhase only shows OPTION_SELECT when the player holds a Map
    // modifier AND the current biome has 2+ weighted links. Otherwise the
    // biome is chosen automatically with no prompt — in that case this
    // onNextPrompt registration simply never fires, which is fine.
    this.game.onNextPrompt("SelectBiomePhase", UiMode.OPTION_SELECT, () => {
      const handler = this.game.scene.ui.getHandler() as any; // BaseOptionSelectUiHandler
      const config = handler.config;
      options = (config?.options ?? []).map((o: any) => o.label);

      // Heuristic: pick the first option for now (refined later with
      // a biome-difficulty heuristic once combat AI is validated)
      const pickIndex = 0;
      chosen = options[pickIndex] ?? "";
      handler.setCursor(pickIndex);
      handler.processInput(Button.ACTION);
    }, undefined, true);

    await this.game.phaseInterceptor.to("CommandPhase", false).catch(() => {});

    if (!chosen) {
      // No prompt fired — biome was auto-selected (single link or no Map)
      chosen = BiomeId[this.game.scene.arena.biomeId] ?? String(this.game.scene.arena.biomeId);
    }

    return { options, chosen, reasoning: options.length > 0 ? "first available option" : "auto-selected (single path)" };
  }

  get scene() {
    return this.game.scene;
  }

  get currentWaves(): WaveGuide[] {
    return this.waves;
  }
}
