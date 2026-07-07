/**
 * Additional setup that runs after the game's own vitest.setup.ts.
 * Silences game debug logging that would pollute our output.
 */
import { vi } from "vitest";

// Silence all game-internal console output during simulation.
// We capture what we need via phase interception, not console logs.
vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "table").mockImplementation(() => {});
vi.spyOn(console, "debug").mockImplementation(() => {});
// Keep warn/error visible so we can spot real problems
