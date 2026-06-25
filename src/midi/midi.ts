/**
 * Web MIDI input manager. Lists USB MIDI inputs, lets you select one, and
 * forwards note-on/off as simple callbacks. Plus a computer-keyboard fallback
 * so the trainer is usable without a piano connected.
 */
export interface MidiInputInfo {
  id: string;
  name: string;
}

export type NoteCallback = (midi: number, velocity: number, on: boolean) => void;

export function midiSupported(): boolean {
  return typeof navigator !== "undefined" && "requestMIDIAccess" in navigator;
}

export class MidiManager {
  private access: MIDIAccess | null = null;
  private current: MIDIInput | null = null;

  onNote: NoteCallback | null = null;
  onStateChange: (() => void) | null = null;

  async init(): Promise<MidiInputInfo[]> {
    if (!midiSupported()) throw new Error("Web MIDI is not supported in this browser (try Chrome or Edge).");
    this.access = await navigator.requestMIDIAccess({ sysex: false });
    this.access.onstatechange = () => this.onStateChange?.();
    return this.inputs();
  }

  inputs(): MidiInputInfo[] {
    if (!this.access) return [];
    return [...this.access.inputs.values()].map((i) => ({ id: i.id, name: i.name ?? i.id }));
  }

  select(id: string | null): void {
    if (this.current) this.current.onmidimessage = null;
    this.current = null;
    if (!this.access || !id) return;
    const input = [...this.access.inputs.values()].find((i) => i.id === id) ?? null;
    this.current = input;
    if (input) input.onmidimessage = (e) => this.handle(e);
  }

  private handle(e: MIDIMessageEvent): void {
    const data = e.data;
    if (!data || data.length < 3) return;
    const cmd = data[0] & 0xf0;
    const note = data[1];
    const vel = data[2];
    if (cmd === 0x90 && vel > 0) this.onNote?.(note, vel, true);
    else if (cmd === 0x80 || (cmd === 0x90 && vel === 0)) this.onNote?.(note, 0, false);
  }

  dispose(): void {
    this.select(null);
    if (this.access) this.access.onstatechange = null;
  }
}

/**
 * Maps the computer keyboard to one piano octave (so you can practice without a
 * MIDI device). Bottom row is the natural keys; the row above adds sharps.
 */
const KEY_TO_SEMITONE: Record<string, number> = {
  a: 0, // C
  w: 1, // C#
  s: 2, // D
  e: 3, // D#
  d: 4, // E
  f: 5, // F
  t: 6, // F#
  g: 7, // G
  y: 8, // G#
  h: 9, // A
  u: 10, // A#
  j: 11, // B
  k: 12, // C
  o: 13, // C#
  l: 14, // D
};

export class KeyboardInput {
  private baseMidi = 60; // C4
  private down = new Set<string>();
  private onNote: NoteCallback;

  constructor(onNote: NoteCallback) {
    this.onNote = onNote;
  }

  private handleDown = (e: KeyboardEvent): void => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === "z") {
      this.baseMidi = Math.max(24, this.baseMidi - 12);
      return;
    }
    if (key === "x") {
      this.baseMidi = Math.min(96, this.baseMidi + 12);
      return;
    }
    const semi = KEY_TO_SEMITONE[key];
    if (semi === undefined || this.down.has(key)) return;
    this.down.add(key);
    this.onNote(this.baseMidi + semi, 100, true);
  };

  private handleUp = (e: KeyboardEvent): void => {
    const key = e.key.toLowerCase();
    const semi = KEY_TO_SEMITONE[key];
    if (semi === undefined || !this.down.has(key)) return;
    this.down.delete(key);
    this.onNote(this.baseMidi + semi, 0, false);
  };

  attach(): void {
    window.addEventListener("keydown", this.handleDown);
    window.addEventListener("keyup", this.handleUp);
  }

  detach(): void {
    window.removeEventListener("keydown", this.handleDown);
    window.removeEventListener("keyup", this.handleUp);
    this.down.clear();
  }
}
