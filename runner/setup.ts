/**
 * Additional setup that runs after the game's own vitest.setup.ts.
 * Silences game debug logging that would pollute our output.
 *
 * Deliberately NOT using vi.spyOn here: vitest's restoreMocks/mockReset
 * settings automatically undo vi.fn()-based mocks in an internal
 * beforeEach, which would silently re-enable all this noise before the
 * actual run starts. Plain property reassignment isn't tracked as a
 * "mock" by vitest, so it survives regardless of that config.
 */
console.log = () => {};
console.table = () => {};
console.debug = () => {};
// Keep warn/error visible so real problems are still spotted
