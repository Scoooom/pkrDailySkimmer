/** Stub for #ui/text — returns dummy objects, never called during simulation */
export function addTextObject(_scene: any, _x: number, _y: number, _text: string, _style?: any, _extraStyle?: any): any {
  return { setText: () => {}, setVisible: () => {}, destroy: () => {} };
}
export function addBBCodeTextObject(_scene: any, _x: number, _y: number, _text: string, _style?: any, _extraStyle?: any): any {
  return { setText: () => {}, setVisible: () => {}, destroy: () => {} };
}
export function getTextColor(_style: any, _shadow?: boolean, _scene?: any): string { return "#ffffff"; }
export function setTextStyle(_obj: any, _style: any): void {}
export const TextStyle = {};
