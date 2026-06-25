/**
 * Trainer piano-roll canvas. Runs a continuous rAF loop that pulls the current
 * scene state (playhead, held keys, target notes) from the parent each frame —
 * so live MIDI input and the moving playhead stay smooth without React renders.
 * Auto-scrolls horizontally to keep the playhead in view.
 */
import { useEffect, useMemo, useRef } from "react";
import type { FlatScore } from "../model/flatten";
import { makeLayout } from "../grid/layout";
import { buildVoiceColorMap, drawScene, drawKeyboard, KEYBOARD_WIDTH, type SceneState } from "../grid/render";

interface Props {
  flat: FlatScore;
  getState: () => SceneState;
}

export function PianoRoll({ flat, getState }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const kbRef = useRef<HTMLCanvasElement>(null);

  const layout = useMemo(() => makeLayout(flat), [flat]);
  const colors = useMemo(() => buildVoiceColorMap(flat.voiceKeys), [flat.voiceKeys]);

  // Size both canvases for the device pixel ratio.
  useEffect(() => {
    const dpr = window.devicePixelRatio || 1;
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = Math.ceil(layout.contentWidth * dpr);
      canvas.height = Math.ceil(layout.contentHeight * dpr);
      canvas.style.width = `${layout.contentWidth}px`;
      canvas.style.height = `${layout.contentHeight}px`;
    }
    const kb = kbRef.current;
    if (kb) {
      kb.width = Math.ceil(KEYBOARD_WIDTH * dpr);
      kb.height = Math.ceil(layout.contentHeight * dpr);
      kb.style.width = `${KEYBOARD_WIDTH}px`;
      kb.style.height = `${layout.contentHeight}px`;
    }
  }, [layout]);

  // Continuous render loop.
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const dpr = window.devicePixelRatio || 1;
      const ctx = canvasRef.current?.getContext("2d");
      const state = getState();
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawScene(ctx, layout, flat, colors, state);

        // Keep the playhead about a third from the left edge.
        const scroller = scrollRef.current;
        if (scroller && state.playheadTick != null) {
          const target = layout.tickToX(state.playheadTick) - scroller.clientWidth / 3;
          scroller.scrollLeft = Math.max(0, target);
        }
      }

      // The pinned keyboard: light up held keys, stay vertically aligned.
      const kctx = kbRef.current?.getContext("2d");
      if (kctx) {
        kctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawKeyboard(kctx, layout, state.heldMidi);
      }
      if (kbRef.current && scrollRef.current) {
        kbRef.current.style.transform = `translateY(${-scrollRef.current.scrollTop}px)`;
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [layout, flat, colors, getState]);

  return (
    <div className="pianoroll">
      <div className="pianoroll-scroll" ref={scrollRef}>
        <canvas ref={canvasRef} className="pianoroll-canvas" />
      </div>
      <div className="keyboard-pane" style={{ width: KEYBOARD_WIDTH }}>
        <canvas ref={kbRef} className="keyboard-canvas" />
      </div>
    </div>
  );
}
