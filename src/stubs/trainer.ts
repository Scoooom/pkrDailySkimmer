/**
 * Trainer stub for #field/trainer
 * Satisfies imports without pulling in Phaser.GameObjects.Container
 */
export class Trainer {
  config: any = { moneyMultiplier: 1.25 };
  constructor(_scene?: any, _trainerType?: any, _variant?: any) {}
  getPartyMemberModifiers(_strength: any, _party: any[]): any[] { return []; }
}

export default Trainer;
