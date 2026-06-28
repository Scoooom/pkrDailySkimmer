/** Blanket stub for all #ui/* imports */
export class PartyUiHandler {
  static readonly CallbackMode = { MOVE: 0, POKEMON: 1, MODIFIER: 2 };
}
export type PokemonSelectFilter = (pokemon: any) => string | null;
export type PokemonMoveSelectFilter = (pokemon: any, move: any) => string | null;
export function addWindow(_scene: any, _x: number, _y: number, _w: number, _h: number): any { return {}; }
export function addTextObject(..._args: any[]): any { return { setText: () => {}, setVisible: () => {}, destroy: () => {} }; }
export function addBBCodeTextObject(..._args: any[]): any { return { setText: () => {}, setVisible: () => {}, destroy: () => {} }; }
export function getTextColor(_style: any): string { return "#ffffff"; }
export function getModifierTierTextTint(_tier: any): number { return 0xffffff; }
export class MessageUiHandler {}
export class MoveInfoOverlay {}
export class PokemonIconAnimHelper {}
export const PokemonIconAnimMode = { NONE: 0 };
export const TextStyle = {};
export const WindowVariant = {};
