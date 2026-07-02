import { describe, expect, it } from "vitest";
import type { FlatScore, PlacedNote } from "music-roll";
import { buildSteps, chordMatched, stepSatisfied } from "./steps";

function note(id: string, startTick: number, midi: number, voiceKey = "p.s.v"): PlacedNote {
  return { id, startTick, durTick: 480, midi, pitch: "C4", voiceKey };
}

function flatWith(notes: PlacedNote[]): FlatScore {
  return {
    divisions: 480,
    notes,
    measures: [],
    totalTicks: 1920,
    minMidi: 48,
    maxMidi: 84,
    voiceKeys: ["p.s.v", "p.s2.v"],
    voices: [],
  };
}

describe("buildSteps", () => {
  it("groups notes by onset tick across voices, sorted by tick", () => {
    const flat = flatWith([
      note("a", 480, 60),
      note("b", 0, 64),
      note("c", 0, 48, "p.s2.v"),
    ]);
    const steps = buildSteps(flat);
    expect(steps.map((s) => s.tick)).toEqual([0, 480]);
    expect([...steps[0].midis].sort((x, y) => x - y)).toEqual([48, 64]);
    expect(steps[0].noteIds.sort()).toEqual(["b", "c"]);
  });

  it("deduplicates the same pitch played by two voices", () => {
    const flat = flatWith([note("a", 0, 60), note("b", 0, 60, "p.s2.v")]);
    const steps = buildSteps(flat);
    expect(steps[0].midis).toEqual([60]);
    expect(steps[0].noteIds).toHaveLength(2);
  });

  it("omits disabled voices entirely (no empty steps)", () => {
    const flat = flatWith([note("a", 0, 60), note("b", 480, 48, "p.s2.v")]);
    const steps = buildSteps(flat, new Set(["p.s2.v"]));
    expect(steps.map((s) => s.tick)).toEqual([0]);
  });
});

describe("chordMatched", () => {
  const step = { tick: 0, midis: [60, 64], noteIds: ["a", "b"] };

  it("requires every pitch to be held simultaneously", () => {
    expect(chordMatched(step, new Set([60, 64]), new Set([60, 64]))).toBe(true);
    expect(chordMatched(step, new Set([60, 64]), new Set([60]))).toBe(false);
  });

  it("requires each pitch to have been (re)pressed during the step", () => {
    // 60 is carried over from the previous step (held but never re-pressed).
    expect(chordMatched(step, new Set([64]), new Set([60, 64]))).toBe(false);
  });

  it("stepSatisfied ignores extra pitches", () => {
    expect(stepSatisfied(step, new Set([48, 60, 64, 72]))).toBe(true);
  });
});
