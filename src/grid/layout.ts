/**
 * Grid geometry for the piano roll: maps between (tick, MIDI) and pixels.
 * Higher pitches at top; each row a semitone, each column a 16th-note slot.
 */
import type { FlatScore } from "../model/flatten";

export interface GridLayout {
  rowH: number;
  colW: number;
  slotTicks: number;
  leftGutter: number;
  minMidi: number;
  maxMidi: number;
  rows: number;
  totalTicks: number;
  contentWidth: number;
  contentHeight: number;
  tickToX(tick: number): number;
  xToTick(x: number): number;
  midiToY(midi: number): number;
  yToMidi(y: number): number;
}

export interface LayoutOpts {
  rowH?: number;
  colW?: number;
  leftGutter?: number;
  padSemis?: number;
}

export function makeLayout(flat: FlatScore, opts: LayoutOpts = {}): GridLayout {
  const rowH = opts.rowH ?? 15;
  const colW = opts.colW ?? 24;
  const leftGutter = opts.leftGutter ?? 56;
  const padSemis = opts.padSemis ?? 2;

  const minMidi = flat.minMidi - padSemis;
  const maxMidi = flat.maxMidi + padSemis;
  const rows = maxMidi - minMidi + 1;

  const slotTicks = flat.divisions / 4;
  const cols = Math.max(1, Math.ceil(flat.totalTicks / slotTicks));

  const contentWidth = leftGutter + cols * colW;
  const contentHeight = rows * rowH;

  return {
    rowH,
    colW,
    slotTicks,
    leftGutter,
    minMidi,
    maxMidi,
    rows,
    totalTicks: flat.totalTicks,
    contentWidth,
    contentHeight,
    tickToX: (tick) => leftGutter + (tick / slotTicks) * colW,
    xToTick: (x) => ((x - leftGutter) / colW) * slotTicks,
    midiToY: (midi) => (maxMidi - midi) * rowH,
    yToMidi: (y) => maxMidi - Math.floor(y / rowH),
  };
}
