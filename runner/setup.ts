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

// console.warn stays on, but we drop one specific, always-expected
// message: pokerogue tries to fetch battle-anims/*.json for every move,
// which always 404s in headless mode (no dev server to serve them —
// see patches/pokerogue/001-animconfig-defensive-frames.patch for the
// crash fix). It fires once per move per candidate — dozens of lines of
// pure noise — and carries no information we don't already know.
// Every other warning (e.g. pokerogue's own AI move-scoring gaps) stays
// visible.
const originalWarn = console.warn;
console.warn = (...args: unknown[]) => {
  if (typeof args[0] === "string" && args[0].startsWith("Could not load animation file for move")) {
    return;
  }
  originalWarn(...args);
};
