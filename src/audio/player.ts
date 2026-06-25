/**
 * Web Audio reference playback + transport clock for play-along mode.
 *
 * `load` builds a per-measure tempo map scaled by a tempo factor (0.25–1.25).
 * `play` starts the AudioContext clock and, if `withSound`, schedules a simple
 * triangle voice per note. `currentTick()` drives the playhead whether or not
 * sound is on.
 */
import type { FlatScore } from "../model/flatten";

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

interface ScheduledNote {
  startSec: number;
  durSec: number;
  freq: number;
}

interface MeasureTiming {
  startTick: number;
  endTick: number;
  startSec: number;
  secPerTick: number;
}

export class Player {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private active: OscillatorNode[] = [];
  private scheduled: ScheduledNote[] = [];
  private timings: MeasureTiming[] = [];
  private totalSec = 0;
  private startTime = 0;
  private endTimer: number | null = null;

  playing = false;
  onEnded: (() => void) | null = null;

  /** Build the tempo map + schedule. `tempoScale` < 1 plays slower. */
  load(flat: FlatScore, tempoScale = 1): void {
    this.stop();
    const scale = Math.max(0.05, tempoScale);

    this.timings = [];
    let sec = 0;
    for (const m of flat.measures) {
      const secPerTick = 60 / m.bpm / flat.divisions / scale;
      this.timings.push({ startTick: m.startTick, endTick: m.endTick, startSec: sec, secPerTick });
      sec += (m.endTick - m.startTick) * secPerTick;
    }
    this.totalSec = sec;

    this.scheduled = flat.notes.map((n) => {
      const startSec = this.tickToSec(n.startTick);
      const endSec = this.tickToSec(n.startTick + n.durTick);
      return { startSec, durSec: Math.max(0.03, endSec - startSec), freq: midiToFreq(n.midi) };
    });
  }

  private tickToSec(tick: number): number {
    if (this.timings.length === 0) return 0;
    for (const t of this.timings) {
      if (tick < t.endTick) return t.startSec + (Math.max(tick, t.startTick) - t.startTick) * t.secPerTick;
    }
    const last = this.timings[this.timings.length - 1];
    return last.startSec + (tick - last.startTick) * last.secPerTick;
  }

  private secToTick(sec: number): number {
    if (this.timings.length === 0) return 0;
    for (const t of this.timings) {
      const measureSec = (t.endTick - t.startTick) * t.secPerTick;
      if (sec < t.startSec + measureSec) return t.startTick + (sec - t.startSec) / t.secPerTick;
    }
    return this.timings[this.timings.length - 1].endTick;
  }

  get durationSec(): number {
    return this.totalSec;
  }

  play(withSound = true): void {
    if (this.playing) return;
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.6;
    this.master.connect(ctx.destination);

    const t0 = ctx.currentTime + 0.05;
    this.startTime = t0;

    if (withSound) {
      for (const note of this.scheduled) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.value = note.freq;
        const start = t0 + note.startSec;
        const end = start + note.durSec;
        const peak = 0.22;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(peak, start + 0.008);
        gain.gain.setValueAtTime(peak, Math.max(start + 0.008, end - 0.05));
        gain.gain.linearRampToValueAtTime(0, end);
        osc.connect(gain).connect(this.master);
        osc.start(start);
        osc.stop(end + 0.02);
        this.active.push(osc);
      }
    }

    this.playing = true;
    this.endTimer = window.setTimeout(() => {
      this.stop();
      this.onEnded?.();
    }, (this.totalSec + 0.2) * 1000);
  }

  stop(): void {
    if (this.endTimer != null) {
      clearTimeout(this.endTimer);
      this.endTimer = null;
    }
    for (const osc of this.active) {
      try {
        osc.stop();
      } catch {
        /* already stopped */
      }
    }
    this.active = [];
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
      this.master = null;
    }
    this.playing = false;
  }

  currentTick(): number | null {
    if (!this.playing || !this.ctx) return null;
    const elapsed = this.ctx.currentTime - this.startTime;
    return elapsed < 0 ? 0 : this.secToTick(elapsed);
  }
}
