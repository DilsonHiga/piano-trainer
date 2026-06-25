/**
 * Practice steps for wait-for-correct mode. A step is everything that must be
 * pressed at one moment: all notes (across instruments/voices) that start at the
 * same tick — so chords and simultaneous parts become a single key-combination
 * to play before advancing.
 */
import type { FlatScore } from "./flatten";

export interface Step {
  tick: number;
  /** Distinct MIDI pitches that must be pressed together. */
  midis: number[];
  /** Note ids at this step (for highlighting on the grid). */
  noteIds: string[];
}

export function buildSteps(flat: FlatScore): Step[] {
  const byTick = new Map<number, { midis: Set<number>; ids: string[] }>();
  for (const n of flat.notes) {
    const g = byTick.get(n.startTick) ?? { midis: new Set<number>(), ids: [] };
    g.midis.add(n.midi);
    g.ids.push(n.id);
    byTick.set(n.startTick, g);
  }
  return [...byTick.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([tick, g]) => ({ tick, midis: [...g.midis], noteIds: g.ids }));
}

/** True when `set` contains every required pitch of the step. */
export function stepSatisfied(step: Step, set: Set<number>): boolean {
  return step.midis.every((m) => set.has(m));
}

/**
 * Wait-mode match: the step is cleared only when all required keys are held at
 * the *same time* (`held`), and each was (re)pressed during this step (`pressed`)
 * — so a note carried over from the previous step, or an arpeggiated chord whose
 * keys are never down together, does not advance.
 */
export function chordMatched(step: Step, pressed: Set<number>, held: Set<number>): boolean {
  return stepSatisfied(step, pressed) && stepSatisfied(step, held);
}
