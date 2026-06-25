# piano-trainer

A web **piano practice** tool for [`.music.json`](../music-json-spec) scores.
Built with **Vite + React + TypeScript**; connects to a **USB MIDI** piano via
the **Web MIDI API** and visualizes practice on a horizontal piano roll.

> v0.1: **connect → load → visualize**, with both practice modes:
> - **Play-along** — the score scrolls at its tempo × an adjustable **25–125%**
>   speed, optional reference sound; your keys light up live.
> - **Wait-for-correct** — the playhead parks on each note/chord and advances
>   only when you press the right **key combination**.

## Run

Build the sibling `music-json` library first (local `file:` dependency):

```bash
npm --prefix ../music-json-spec install
npm --prefix ../music-json-spec run build

npm install
npm run dev      # http://localhost:5173
```

Then: **Load sample** → choose **MIDI** + **Connect** (or **Computer keys**) →
pick a **mode** → **▶ Start**.

- **Web MIDI** needs Chrome or Edge (Firefox/Safari don't support it). If
  unavailable, use **Computer keys**: `A`–`K` play C4–D5, `Z`/`X` shift octave.

```bash
npm run build      # type-check + production build
npm run typecheck
```

## How it works

| Module | Responsibility |
|--------|----------------|
| `src/model/flatten.ts` | `Score` → absolute-tick notes (with ids) + measure/tempo timeline |
| `src/model/steps.ts` | Group notes by onset into practice steps (chords = one key combo) |
| `src/midi/midi.ts` | Web MIDI input manager + computer-keyboard fallback |
| `src/audio/player.ts` | Reference playback + transport clock, tempo-scaled |
| `src/grid/{layout,render}.ts` | Piano-roll geometry + canvas drawing (held keys, targets, playhead) |
| `src/components/PianoRoll.tsx` | Canvas with a continuous render loop + auto-scroll |
| `src/components/Toolbar.tsx` | File, input source, mode, tempo, transport |
| `src/App.tsx` | Practice engine: input → held/pressed sets → mode logic |

Parsing/validation and pitch math come from the `music-json` library — the
trainer never re-implements the format.

## Next steps

- Scoring/feedback in play-along (hit/miss, timing), highlight upcoming notes.
- Loop a section; count-in; metronome click.
- Per-hand (staff) selection; left/right-hand practice.
- On-screen keyboard beneath the roll.
