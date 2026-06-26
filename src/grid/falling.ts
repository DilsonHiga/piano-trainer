/**
 * "Falling notes" (Synthesia-style) renderer. Pitch maps across the x-axis onto
 * a horizontal keyboard at the bottom; notes fall from the top toward a "now"
 * line just above the keys. Driven by the same {@link SceneState} as the piano
 * roll, so both practice modes work unchanged:
 *   - play-along: the playhead advances continuously → notes fall smoothly;
 *   - wait-for-correct: the playhead parks on a step → that chord rests on the
 *     line (highlighted as the target) until the right keys are held.
 */
import { midiToPitch } from "music-json";
import type { FlatScore } from "../model/flatten";
import { VOICE_COLORS, type SceneState } from "./render";

export { buildVoiceColorMap } from "./render";

const BLACK_PCS = new Set([1, 3, 6, 8, 10]);
const isBlack = (m: number) => BLACK_PCS.has(((m % 12) + 12) % 12);

const COLORS = {
  bg: "#0c0f14",
  laneBlack: "#11151c",
  hitLine: "#ff4d4d",
  noteStroke: "rgba(0,0,0,0.45)",
  target: "#ffd60a",
  keyWhite: "#e9edf2",
  keyWhiteEdge: "#b9c1cc",
  keyBlack: "#1b2027",
  held: "#34c759",
  label: "#7a8696",
};

export interface FallingLayout {
  width: number;
  height: number;
  hitLineY: number;
  keyboardH: number;
  minMidi: number;
  maxMidi: number;
  whiteW: number;
  pxPerTick: number;
  keyGeom(midi: number): { x: number; w: number; black: boolean };
}

export function makeFallingLayout(flat: FlatScore, width: number, height: number): FallingLayout {
  // Pad to white-key boundaries so neighbors of edge black keys exist.
  let minMidi = flat.minMidi - 2;
  let maxMidi = flat.maxMidi + 2;
  while (isBlack(minMidi)) minMidi--;
  while (isBlack(maxMidi)) maxMidi++;

  const whiteIndex = new Map<number, number>();
  let n = 0;
  for (let m = minMidi; m <= maxMidi; m++) if (!isBlack(m)) whiteIndex.set(m, n++);
  const whiteCount = Math.max(1, n);

  const whiteW = width / whiteCount;
  const blackW = whiteW * 0.62;
  const keyboardH = Math.min(130, Math.max(64, height * 0.18));
  const hitLineY = height - keyboardH;
  const lookaheadTicks = flat.divisions * 8; // ~2 bars of 4/4
  const pxPerTick = hitLineY / lookaheadTicks;

  const keyGeom = (midi: number) => {
    if (!isBlack(midi)) {
      const i = whiteIndex.get(midi) ?? 0;
      return { x: i * whiteW, w: whiteW, black: false };
    }
    const li = whiteIndex.get(midi - 1) ?? 0; // white key just below
    return { x: (li + 1) * whiteW - blackW / 2, w: blackW, black: true };
  };

  return { width, height, hitLineY, keyboardH, minMidi, maxMidi, whiteW, pxPerTick, keyGeom };
}

export function drawFalling(
  ctx: CanvasRenderingContext2D,
  layout: FallingLayout,
  flat: FlatScore,
  colors: Map<string, string>,
  state: SceneState,
): void {
  const { width, height, hitLineY } = layout;
  const ph = state.playheadTick ?? 0;

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, width, height);

  // Faint lanes behind black keys, to read alignment.
  ctx.fillStyle = COLORS.laneBlack;
  for (let m = layout.minMidi; m <= layout.maxMidi; m++) {
    if (!isBlack(m)) continue;
    const g = layout.keyGeom(m);
    ctx.fillRect(g.x, 0, g.w, hitLineY);
  }

  // Target pitches (wait mode) for keyboard highlighting.
  const targetMidi = new Set<number>();
  if (state.targetIds.size) {
    for (const note of flat.notes) if (state.targetIds.has(note.id)) targetMidi.add(note.midi);
  }

  // Falling notes.
  for (const note of flat.notes) {
    const bottom = hitLineY - (note.startTick - ph) * layout.pxPerTick;
    const top = bottom - note.durTick * layout.pxPerTick;
    if (top >= hitLineY || bottom <= 0) continue; // passed below, or far above
    const drawBottom = Math.min(bottom, hitLineY);
    const drawTop = Math.max(top, 0);
    if (drawBottom - drawTop < 1) continue;

    const g = layout.keyGeom(note.midi);
    roundRect(ctx, g.x + 1, drawTop, Math.max(2, g.w - 2), drawBottom - drawTop, 3);
    ctx.fillStyle = colors.get(note.voiceKey) ?? VOICE_COLORS[0];
    ctx.fill();
    if (state.targetIds.has(note.id)) {
      ctx.strokeStyle = COLORS.target;
      ctx.lineWidth = 2.5;
    } else {
      ctx.strokeStyle = COLORS.noteStroke;
      ctx.lineWidth = 1;
    }
    ctx.stroke();
  }

  // "Now" line.
  ctx.strokeStyle = COLORS.hitLine;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, hitLineY + 0.5);
  ctx.lineTo(width, hitLineY + 0.5);
  ctx.stroke();

  drawKeyboard(ctx, layout, state.heldMidi, targetMidi);
}

function keyFill(held: boolean, target: boolean, base: string): string {
  if (held) return COLORS.held;
  if (target) return COLORS.target;
  return base;
}

function drawKeyboard(
  ctx: CanvasRenderingContext2D,
  layout: FallingLayout,
  held: Set<number>,
  target: Set<number>,
): void {
  const yTop = layout.hitLineY;
  const h = layout.keyboardH;

  // White keys.
  for (let m = layout.minMidi; m <= layout.maxMidi; m++) {
    if (isBlack(m)) continue;
    const g = layout.keyGeom(m);
    ctx.fillStyle = keyFill(held.has(m), target.has(m), COLORS.keyWhite);
    ctx.fillRect(g.x, yTop, g.w, h);
    ctx.strokeStyle = COLORS.keyWhiteEdge;
    ctx.lineWidth = 1;
    ctx.strokeRect(g.x + 0.5, yTop + 0.5, g.w, h);
    if (((m % 12) + 12) % 12 === 0) {
      ctx.fillStyle = COLORS.label;
      ctx.font = "10px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(midiToPitch(m), g.x + g.w / 2, yTop + h - 4);
    }
  }

  // Black keys (shorter, on top).
  const blackH = h * 0.62;
  for (let m = layout.minMidi; m <= layout.maxMidi; m++) {
    if (!isBlack(m)) continue;
    const g = layout.keyGeom(m);
    ctx.fillStyle = keyFill(held.has(m), target.has(m), COLORS.keyBlack);
    ctx.fillRect(g.x, yTop, g.w, blackH);
  }
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
