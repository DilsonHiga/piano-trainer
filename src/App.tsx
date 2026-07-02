/**
 * Trainer shell + practice engine.
 *
 * Input (MIDI device or computer keyboard) feeds note-on/off into `handleNote`,
 * which maintains the set of held/pressed keys. Two modes:
 *   - play-along: the Player scrolls the playhead at the score tempo × a 25–125%
 *     factor, with optional reference sound; your keys light up live.
 *   - wait-for-correct: the playhead parks on each step (a chord / key combo) and
 *     advances only once you've pressed all of its notes.
 *
 * The canvas pulls live state each frame via `getState` (refs, no re-renders).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseScore, type Issue } from "music-json";
import { flattenScore, buildVoiceColorMap, Player, type FlatScore, type SceneState } from "music-roll";
import { buildSteps, chordMatched, type Step } from "./model/steps";
import { MidiManager, KeyboardInput, midiSupported, type MidiInputInfo } from "./midi/midi";
import { Toolbar, type Mode, type InputSource, type View } from "./components/Toolbar";
import { PianoRoll } from "./components/PianoRoll";
import { FallingNotes } from "./components/FallingNotes";
import twinkleSample from "music-roll/samples/twinkle.music.json";

export default function App() {
  const playerRef = useRef<Player | null>(null);
  if (!playerRef.current) playerRef.current = new Player({ basePeak: 0.22 });
  const player = playerRef.current;

  const midiRef = useRef<MidiManager | null>(null);
  if (!midiRef.current) midiRef.current = new MidiManager();
  const midi = midiRef.current;

  const supported = useMemo(() => midiSupported(), []);

  const [fileName, setFileName] = useState<string | null>(null);
  const [flat, setFlat] = useState<FlatScore | null>(null);
  const [errors, setErrors] = useState<Issue[]>([]);
  const [warnings, setWarnings] = useState<Issue[]>([]);

  const [mode, setMode] = useState<Mode>("play");
  const [view, setView] = useState<View>("roll");
  const [inputSource, setInputSource] = useState<InputSource>(supported ? "midi" : "keyboard");
  const [tempoPct, setTempoPct] = useState(100);
  const [referenceOn, setReferenceOn] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [disabledVoices, setDisabledVoices] = useState<Set<string>>(new Set());

  const [devices, setDevices] = useState<MidiInputInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [midiStatus, setMidiStatus] = useState("not connected");

  // Live engine state in refs (read by the render loop and input handler).
  const heldRef = useRef(new Set<number>());
  const pressedRef = useRef(new Set<number>());
  const stepRef = useRef(0);
  const stepsRef = useRef<Step[]>([]);
  const modeRef = useRef(mode);
  const runningRef = useRef(running);
  const disabledRef = useRef(disabledVoices);
  modeRef.current = mode;
  runningRef.current = running;
  disabledRef.current = disabledVoices;

  const steps = useMemo(
    () => (flat ? buildSteps(flat, disabledVoices) : []),
    [flat, disabledVoices],
  );
  useEffect(() => {
    stepsRef.current = steps;
    stepRef.current = 0;
    // Re-sync progress when the step list changes mid-practice (e.g. a voice was
    // toggled), since wait-mode practice restarts from the first step.
    if (runningRef.current && modeRef.current === "wait") {
      setProgress({ current: 0, total: steps.length });
    }
  }, [steps]);

  // Voice color map for the toolbar's per-voice toggles (matches the canvas).
  const voiceColors = useMemo(
    () => (flat ? buildVoiceColorMap(flat.voiceKeys) : new Map<string, string>()),
    [flat],
  );

  // ── Input ────────────────────────────────────────────────────────────────
  const handleNote = useCallback((midiNote: number, _vel: number, on: boolean) => {
    if (on) {
      heldRef.current.add(midiNote);
      pressedRef.current.add(midiNote);
      if (runningRef.current && modeRef.current === "wait") {
        const list = stepsRef.current;
        const step = list[stepRef.current];
        if (step && chordMatched(step, pressedRef.current, heldRef.current)) {
          const next = stepRef.current + 1;
          stepRef.current = next;
          pressedRef.current = new Set();
          setProgress({ current: Math.min(next, list.length), total: list.length });
          if (next >= list.length) setRunning(false); // finished
        }
      }
    } else {
      heldRef.current.delete(midiNote);
    }
  }, []);

  useEffect(() => {
    midi.onNote = handleNote;
  }, [midi, handleNote]);

  useEffect(() => {
    if (inputSource !== "keyboard") return;
    const kb = new KeyboardInput(handleNote);
    kb.attach();
    return () => kb.detach();
  }, [inputSource, handleNote]);

  // ── MIDI connection ────────────────────────────────────────────────────────
  const selectDevice = useCallback(
    (id: string) => {
      midi.select(id);
      setDeviceId(id);
      const name = devices.find((d) => d.id === id)?.name ?? id;
      setMidiStatus(`connected: ${name}`);
    },
    [midi, devices],
  );

  const connect = useCallback(async () => {
    try {
      const list = await midi.init();
      setDevices(list);
      midi.onStateChange = () => setDevices(midi.inputs());
      if (list.length) {
        selectDevice(list[0].id);
      } else {
        setMidiStatus("no devices found");
      }
    } catch (e) {
      setMidiStatus((e as Error).message);
    }
  }, [midi, selectDevice]);

  // ── Scene state for the canvas ───────────────────────────────────────────
  const getState = useCallback((): SceneState => {
    const held = heldRef.current;
    if (modeRef.current === "wait") {
      const list = stepsRef.current;
      const step = list[stepRef.current];
      const tick = step ? step.tick : list.length ? list[list.length - 1].tick : 0;
      return {
        playheadTick: tick,
        heldMidi: held,
        targetIds: new Set(step ? step.noteIds : []),
        mutedVoices: disabledRef.current,
      };
    }
    return { playheadTick: player.currentTick(), heldMidi: held, targetIds: new Set() };
  }, [player]);

  // ── Transport ──────────────────────────────────────────────────────────────
  const stop = useCallback(() => {
    player.stop();
    setRunning(false);
  }, [player]);

  const start = useCallback(() => {
    if (!flat) return;
    heldRef.current.clear();
    pressedRef.current.clear();
    if (mode === "wait") {
      stepRef.current = 0;
      setProgress({ current: 0, total: stepsRef.current.length });
      setRunning(true);
    } else {
      player.load(flat, tempoPct / 100);
      player.onEnded = () => setRunning(false);
      player.play(referenceOn);
      setRunning(true);
    }
  }, [flat, mode, tempoPct, referenceOn, player]);

  const togglePlay = useCallback(() => {
    if (running) stop();
    else start();
  }, [running, stop, start]);

  const toggleVoice = useCallback((key: string) => {
    setDisabledVoices((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const changeMode = useCallback(
    (m: Mode) => {
      if (running) stop();
      setMode(m);
      setProgress(null);
    },
    [running, stop],
  );

  const openText = useCallback(
    (name: string, text: string) => {
      stop();
      setFileName(name);
      heldRef.current.clear();
      pressedRef.current.clear();
      stepRef.current = 0;
      setProgress(null);
      setDisabledVoices(new Set());
      const result = parseScore(text);
      setErrors(result.errors);
      setWarnings(result.warnings);
      setFlat(result.ok && result.score ? flattenScore(result.score) : null);
    },
    [stop],
  );

  const loadSample = useCallback(() => {
    openText("twinkle.music.json", JSON.stringify(twinkleSample));
  }, [openText]);

  return (
    <div className="app">
      <Toolbar
        fileName={fileName}
        errors={errors}
        warnings={warnings}
        canPlay={!!flat}
        running={running}
        onOpenText={openText}
        onLoadSample={loadSample}
        onTogglePlay={togglePlay}
        inputSource={inputSource}
        onInputSource={setInputSource}
        midiSupported={supported}
        midiStatus={midiStatus}
        devices={devices}
        deviceId={deviceId}
        onConnect={connect}
        onSelectDevice={selectDevice}
        view={view}
        onView={setView}
        mode={mode}
        onMode={changeMode}
        tempoPct={tempoPct}
        onTempo={setTempoPct}
        referenceOn={referenceOn}
        onReference={setReferenceOn}
        voices={flat?.voices ?? []}
        voiceColors={voiceColors}
        disabledVoices={disabledVoices}
        onToggleVoice={toggleVoice}
        progress={progress}
      />

      {errors.length > 0 && (
        <ul className="error-panel">
          {errors.map((e, i) => (
            <li key={i}>
              <code>{e.path}</code> {e.message}
            </li>
          ))}
        </ul>
      )}

      <main className="stage">
        {flat ? (
          view === "falling" ? (
            <FallingNotes flat={flat} getState={getState} />
          ) : (
            <PianoRoll flat={flat} getState={getState} />
          )
        ) : (
          <div className="empty">
            <p>
              Open a <code>.music.json</code> file or load the sample, then connect your piano (or use
              the computer keys) and press Start.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
