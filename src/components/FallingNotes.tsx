/**
 * Falling-notes view. Fills the stage (no scrolling), measuring its container
 * each frame so it stays responsive, and pulls live scene state from the parent
 * via `getState` — identical to the piano-roll view, so both practice modes work.
 */
import { useEffect, useMemo, useRef } from "react";
import type { FlatScore, SceneState } from "music-roll";
import { buildVoiceColorMap, makeFallingLayout, drawFalling } from "../grid/falling";

interface Props {
  flat: FlatScore;
  getState: () => SceneState;
}

export function FallingNotes({ flat, getState }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colors = useMemo(() => buildVoiceColorMap(flat.voiceKeys), [flat.voiceKeys]);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const wrap = wrapRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (wrap && canvas && ctx) {
        const w = wrap.clientWidth;
        const h = wrap.clientHeight;
        const dpr = window.devicePixelRatio || 1;
        if (canvas.width !== Math.ceil(w * dpr) || canvas.height !== Math.ceil(h * dpr)) {
          canvas.width = Math.ceil(w * dpr);
          canvas.height = Math.ceil(h * dpr);
          canvas.style.width = `${w}px`;
          canvas.style.height = `${h}px`;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const layout = makeFallingLayout(flat, w, h);
        drawFalling(ctx, layout, flat, colors, getState());
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [flat, colors, getState]);

  return (
    <div className="falling-wrap" ref={wrapRef}>
      <canvas ref={canvasRef} className="falling-canvas" />
    </div>
  );
}
