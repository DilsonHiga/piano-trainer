/**
 * Canvas 2D renderer for the trainer's piano roll. Draws the score plus live
 * practice state: held keys (green bands + lit gutter keys), the current
 * wait-mode target notes (yellow glow), and the playhead.
 */
import { midiToPitch } from "music-json";
import type { FlatScore, PlacedNote } from "../model/flatten";
import type { GridLayout } from "./layout";

const BLACK_PCS = new Set([1, 3, 6, 8, 10]);

export const VOICE_COLORS = [
  "#4f8cff",
  "#ff6b6b",
  "#34c759",
  "#ff9f0a",
  "#bf5af2",
  "#5ac8fa",
  "#ffd60a",
];

const COLORS = {
  bg: "#11151c",
  rowWhite: "#1a2029",
  rowBlack: "#141923",
  line16th: "#222a36",
  lineBeat: "#33414f",
  lineMeasure: "#5b6b7d",
  octaveLine: "#2b3645",
  gutterWhite: "#e9edf2",
  gutterBlack: "#2a2f38",
  gutterText: "#5a6675",
  gutterBorder: "#0c0f14",
  gutterHeld: "#34c759",
  heldBand: "rgba(52, 199, 89, 0.16)",
  noteStroke: "rgba(0,0,0,0.45)",
  target: "#ffd60a",
  playhead: "#ff4d4d",
};

const isBlack = (midi: number) => BLACK_PCS.has(((midi % 12) + 12) % 12);

export function buildVoiceColorMap(voiceKeys: string[]): Map<string, string> {
  const map = new Map<string, string>();
  voiceKeys.forEach((k, i) => map.set(k, VOICE_COLORS[i % VOICE_COLORS.length]));
  return map;
}

export interface SceneState {
  playheadTick: number | null;
  heldMidi: Set<number>;
  targetIds: Set<string>;
  /** Voices disabled in wait mode — drawn dimmed and never marked as targets. */
  mutedVoices?: Set<string>;
}

function drawRows(ctx: CanvasRenderingContext2D, layout: GridLayout): void {
  const { minMidi, maxMidi, leftGutter, contentWidth, rowH } = layout;
  for (let midi = minMidi; midi <= maxMidi; midi++) {
    const y = layout.midiToY(midi);
    ctx.fillStyle = isBlack(midi) ? COLORS.rowBlack : COLORS.rowWhite;
    ctx.fillRect(leftGutter, y, contentWidth - leftGutter, rowH);
    if (((midi % 12) + 12) % 12 === 0) {
      ctx.fillStyle = COLORS.octaveLine;
      ctx.fillRect(leftGutter, y + rowH - 1, contentWidth - leftGutter, 1);
    }
  }
}

function drawHeldBands(ctx: CanvasRenderingContext2D, layout: GridLayout, held: Set<number>): void {
  ctx.fillStyle = COLORS.heldBand;
  for (const midi of held) {
    if (midi < layout.minMidi || midi > layout.maxMidi) continue;
    ctx.fillRect(layout.leftGutter, layout.midiToY(midi), layout.contentWidth - layout.leftGutter, layout.rowH);
  }
}

function drawGridLines(ctx: CanvasRenderingContext2D, layout: GridLayout, flat: FlatScore): void {
  const { slotTicks, contentHeight } = layout;
  const measureStarts = new Set(flat.measures.map((m) => m.startTick));
  const beatStarts = new Set<number>();
  for (const m of flat.measures) {
    const beatLen = (flat.divisions * 4) / m.time.beatType;
    for (let t = m.startTick; t < m.endTick; t += beatLen) beatStarts.add(t);
  }

  const line = (tick: number, color: string) => {
    const x = Math.round(layout.tickToX(tick)) + 0.5;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, contentHeight);
    ctx.stroke();
  };

  for (let tick = 0; tick <= flat.totalTicks; tick += slotTicks) {
    if (measureStarts.has(tick) || beatStarts.has(tick)) continue;
    line(tick, COLORS.line16th);
  }
  for (const tick of beatStarts) if (!measureStarts.has(tick)) line(tick, COLORS.lineBeat);
  for (const tick of measureStarts) line(tick, COLORS.lineMeasure);
  line(flat.totalTicks, COLORS.lineMeasure);
}

function drawNotes(
  ctx: CanvasRenderingContext2D,
  layout: GridLayout,
  notes: PlacedNote[],
  colors: Map<string, string>,
  targetIds: Set<string>,
  mutedVoices?: Set<string>,
): void {
  const { rowH, colW, slotTicks } = layout;
  for (const note of notes) {
    const muted = mutedVoices?.has(note.voiceKey) ?? false;
    const x = layout.tickToX(note.startTick);
    const w = Math.max(2, (note.durTick / slotTicks) * colW - 1);
    const y = layout.midiToY(note.midi);
    roundRect(ctx, x + 0.5, y + 0.5, w, rowH - 1, 3);
    ctx.globalAlpha = muted ? 0.25 : 1;
    ctx.fillStyle = colors.get(note.voiceKey) ?? VOICE_COLORS[0];
    ctx.fill();
    if (!muted && targetIds.has(note.id)) {
      ctx.strokeStyle = COLORS.target;
      ctx.lineWidth = 2.5;
    } else {
      ctx.strokeStyle = COLORS.noteStroke;
      ctx.lineWidth = 1;
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function drawGutter(ctx: CanvasRenderingContext2D, layout: GridLayout, held: Set<number>): void {
  const { minMidi, maxMidi, leftGutter, rowH } = layout;
  ctx.fillStyle = COLORS.gutterBorder;
  ctx.fillRect(0, 0, leftGutter, layout.contentHeight);
  ctx.font = "10px ui-monospace, monospace";
  ctx.textBaseline = "middle";
  for (let midi = minMidi; midi <= maxMidi; midi++) {
    const y = layout.midiToY(midi);
    if (held.has(midi)) {
      ctx.fillStyle = COLORS.gutterHeld;
    } else {
      ctx.fillStyle = isBlack(midi) ? COLORS.gutterBlack : COLORS.gutterWhite;
    }
    ctx.fillRect(0, y, leftGutter - 1, rowH - 1);
    if (((midi % 12) + 12) % 12 === 0) {
      ctx.fillStyle = COLORS.gutterText;
      ctx.fillText(midiToPitch(midi), 6, y + rowH / 2);
    }
  }
}

function drawPlayhead(ctx: CanvasRenderingContext2D, layout: GridLayout, tick: number): void {
  const x = Math.round(layout.tickToX(tick)) + 0.5;
  ctx.strokeStyle = COLORS.playhead;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, layout.contentHeight);
  ctx.stroke();
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  layout: GridLayout,
  flat: FlatScore,
  colors: Map<string, string>,
  state: SceneState,
): void {
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, layout.contentWidth, layout.contentHeight);
  drawRows(ctx, layout);
  drawHeldBands(ctx, layout, state.heldMidi);
  drawGridLines(ctx, layout, flat);
  drawNotes(ctx, layout, flat.notes, colors, state.targetIds, state.mutedVoices);
  drawGutter(ctx, layout, state.heldMidi);
  if (state.playheadTick != null) drawPlayhead(ctx, layout, state.playheadTick);
}

export const KEYBOARD_WIDTH = 72;

const KB = {
  bg: "#0c0f14",
  white: "#e9edf2",
  whiteEdge: "#b9c1cc",
  black: "#1b2027",
  label: "#5a6675",
};

/**
 * Draw a vertical piano keyboard (one key per pitch row, aligned with the grid)
 * into a `KEYBOARD_WIDTH`-wide canvas, lighting up `highlight` keys. Pinned
 * beside the scrollable roll so it stays visible.
 */
export function drawKeyboard(
  ctx: CanvasRenderingContext2D,
  layout: GridLayout,
  highlight: Set<number>,
  hiliteColor = COLORS.gutterHeld,
): void {
  const { minMidi, maxMidi, rowH } = layout;
  const w = KEYBOARD_WIDTH;

  ctx.fillStyle = KB.bg;
  ctx.fillRect(0, 0, w, layout.contentHeight);

  for (let midi = minMidi; midi <= maxMidi; midi++) {
    if (isBlack(midi)) continue;
    const y = layout.midiToY(midi);
    ctx.fillStyle = highlight.has(midi) ? hiliteColor : KB.white;
    ctx.fillRect(0, y, w, rowH);
    ctx.strokeStyle = KB.whiteEdge;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y + rowH - 0.5);
    ctx.lineTo(w, y + rowH - 0.5);
    ctx.stroke();
  }

  const blackW = Math.round(w * 0.62);
  for (let midi = minMidi; midi <= maxMidi; midi++) {
    if (!isBlack(midi)) continue;
    const y = layout.midiToY(midi);
    ctx.fillStyle = highlight.has(midi) ? hiliteColor : KB.black;
    ctx.fillRect(0, y + 1, blackW, rowH - 2);
  }

  ctx.font = "10px ui-monospace, monospace";
  ctx.textBaseline = "middle";
  ctx.textAlign = "right";
  ctx.fillStyle = KB.label;
  for (let midi = minMidi; midi <= maxMidi; midi++) {
    if (((midi % 12) + 12) % 12 === 0) ctx.fillText(midiToPitch(midi), w - 5, layout.midiToY(midi) + rowH / 2);
  }
  ctx.textAlign = "left";
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
