/**
 * timedEventManager stub.
 * Returns neutral/no-event values for all calls made during modifier pool generation.
 */
export const timedEventManager = {
  getEventLuckBoostedSpecies: (): number[] => [],
  getEventLuckBoost: (): number => 0,
  areFusionsBoosted: (): boolean => false,
  isEventActive: (): boolean => false,
  getActiveEvent: (): null => null,
};
