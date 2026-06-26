/**
 * Trainer toolbar: file open/sample, input source (MIDI device or computer
 * keyboard), practice mode (play-along / wait-for-correct), tempo, reference
 * sound, and transport.
 */
import { useRef } from "react";
import type { Issue } from "music-json";
import type { MidiInputInfo } from "../midi/midi";

export type Mode = "play" | "wait";
export type InputSource = "midi" | "keyboard";
export type View = "roll" | "falling";

interface Props {
  fileName: string | null;
  errors: Issue[];
  warnings: Issue[];
  canPlay: boolean;
  running: boolean;
  onOpenText: (name: string, text: string) => void;
  onLoadSample: () => void;
  onTogglePlay: () => void;

  inputSource: InputSource;
  onInputSource: (s: InputSource) => void;
  midiSupported: boolean;
  midiStatus: string;
  devices: MidiInputInfo[];
  deviceId: string | null;
  onConnect: () => void;
  onSelectDevice: (id: string) => void;

  view: View;
  onView: (v: View) => void;
  mode: Mode;
  onMode: (m: Mode) => void;
  tempoPct: number;
  onTempo: (pct: number) => void;
  referenceOn: boolean;
  onReference: (on: boolean) => void;

  progress: { current: number; total: number } | null;
}

export function Toolbar(p: Props) {
  const fileInput = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    p.onOpenText(file.name, await file.text());
    e.target.value = "";
  };

  return (
    <header className="toolbar">
      <div className="toolbar-row">
        <strong className="brand">piano trainer</strong>
        <button onClick={() => fileInput.current?.click()}>Open…</button>
        <button onClick={p.onLoadSample}>Load sample</button>
        <input ref={fileInput} type="file" accept=".json,.music.json,application/json" onChange={handleFile} hidden />
        {p.fileName && <span className="filename">{p.fileName}</span>}
        {p.errors.length > 0 && (
          <span className="badge error" title={p.errors.map((e) => `${e.path}: ${e.message}`).join("\n")}>
            {p.errors.length} error{p.errors.length > 1 ? "s" : ""}
          </span>
        )}

        <span className="spacer" />

        <button className="play" onClick={p.onTogglePlay} disabled={!p.canPlay}>
          {p.running ? "■ Stop" : "▶ Start"}
        </button>
        {p.mode === "wait" && p.progress && (
          <span className="progress">
            {p.progress.current}/{p.progress.total}
          </span>
        )}
      </div>

      <div className="toolbar-row secondary">
        {/* Input source */}
        <div className="seg">
          <button className={p.inputSource === "midi" ? "on" : ""} onClick={() => p.onInputSource("midi")}>
            MIDI
          </button>
          <button className={p.inputSource === "keyboard" ? "on" : ""} onClick={() => p.onInputSource("keyboard")}>
            Computer keys
          </button>
        </div>

        {p.inputSource === "midi" ? (
          p.midiSupported ? (
            <>
              <button onClick={p.onConnect}>Connect</button>
              <select
                value={p.deviceId ?? ""}
                onChange={(e) => p.onSelectDevice(e.target.value)}
                disabled={p.devices.length === 0}
              >
                {p.devices.length === 0 && <option value="">no devices</option>}
                {p.devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <span className="status">{p.midiStatus}</span>
            </>
          ) : (
            <span className="status warn">Web MIDI unsupported — use Computer keys</span>
          )
        ) : (
          <span className="status">Keys A–K play C4–D5 · Z/X shift octave</span>
        )}

        <span className="spacer" />

        {/* View */}
        <div className="seg">
          <button className={p.view === "roll" ? "on" : ""} onClick={() => p.onView("roll")}>
            Roll
          </button>
          <button className={p.view === "falling" ? "on" : ""} onClick={() => p.onView("falling")}>
            Falling
          </button>
        </div>

        {/* Mode */}
        <div className="seg">
          <button className={p.mode === "play" ? "on" : ""} onClick={() => p.onMode("play")}>
            Play-along
          </button>
          <button className={p.mode === "wait" ? "on" : ""} onClick={() => p.onMode("wait")}>
            Wait-for-correct
          </button>
        </div>

        {p.mode === "play" && (
          <>
            <label className="tempo">
              Tempo {p.tempoPct}%
              <input
                type="range"
                min={25}
                max={125}
                step={5}
                value={p.tempoPct}
                onChange={(e) => p.onTempo(Number(e.target.value))}
              />
            </label>
            <label className="ref">
              <input type="checkbox" checked={p.referenceOn} onChange={(e) => p.onReference(e.target.checked)} />
              Reference sound
            </label>
          </>
        )}
      </div>
    </header>
  );
}
