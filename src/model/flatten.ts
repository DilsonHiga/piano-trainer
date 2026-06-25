/**
 * Flatten a {@link Score} into absolute-tick notes + a measure/tempo timeline
 * for the piano-roll display and the practice engine. Every note gets a stable
 * id so the renderer can mark targets/hits. (Mirrors the editor's flatten, with
 * ids always assigned.)
 */
import type { Score, TimeSignature } from "music-json";
import { pitchToMidi } from "music-json";

export interface PlacedNote {
  id: string;
  startTick: number;
  durTick: number;
  midi: number;
  pitch: string;
  voiceKey: string;
}

export interface MeasureMark {
  index: number;
  startTick: number;
  endTick: number;
  time: TimeSignature;
  bpm: number;
}

export interface FlatScore {
  divisions: number;
  notes: PlacedNote[];
  measures: MeasureMark[];
  totalTicks: number;
  minMidi: number;
  maxMidi: number;
  voiceKeys: string[];
}

const DEFAULT_TIME: TimeSignature = { beats: 4, beatType: 4 };
const DEFAULT_BPM = 120;

export function measureTicks(time: TimeSignature, divisions: number): number {
  return time.beats * (4 / time.beatType) * divisions;
}

export function flattenScore(score: Score): FlatScore {
  const divisions = score.divisions ?? 480;
  const globals = score.measures ?? [];

  const measures: MeasureMark[] = [];
  let tick = 0;
  let time = DEFAULT_TIME;
  let bpm = DEFAULT_BPM;
  for (let i = 0; i < globals.length; i++) {
    const gm = globals[i];
    if (gm.time) time = gm.time;
    if (gm.tempo?.bpm) bpm = gm.tempo.bpm;
    const dur = measureTicks(time, divisions);
    measures.push({ index: i, startTick: tick, endTick: tick + dur, time, bpm });
    tick += dur;
  }
  const totalTicks = tick;

  const notes: PlacedNote[] = [];
  const voiceKeys: string[] = [];
  const seen = new Set<string>();
  let minMidi = Infinity;
  let maxMidi = -Infinity;
  let counter = 0;

  for (const part of score.parts ?? []) {
    for (const staff of part.staves) {
      staff.measures.forEach((measure, mIdx) => {
        const base = measures[mIdx]?.startTick ?? 0;
        for (const voice of measure.voices) {
          const voiceKey = `${part.id}.${staff.id}.${voice.id}`;
          if (!seen.has(voiceKey)) {
            seen.add(voiceKey);
            voiceKeys.push(voiceKey);
          }
          let t = base;
          for (const ev of voice.events) {
            for (const pitch of ev.pitches) {
              const midi = pitchToMidi(pitch);
              minMidi = Math.min(minMidi, midi);
              maxMidi = Math.max(maxMidi, midi);
              notes.push({
                id: `n${counter++}`,
                startTick: t,
                durTick: ev.duration,
                midi,
                pitch,
                voiceKey,
              });
            }
            t += ev.duration;
          }
        }
      });
    }
  }

  if (!Number.isFinite(minMidi)) {
    minMidi = 60;
    maxMidi = 72;
  }

  return { divisions, notes, measures, totalTicks, minMidi, maxMidi, voiceKeys };
}
