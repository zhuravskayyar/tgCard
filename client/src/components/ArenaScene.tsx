import { useEffect, useState, type CSSProperties } from "react";
import "../styles/arena-scene.css";

/** How a layer moves; every motion is switched off under reduced-motion preferences. */
export type ArenaSceneMotion = "drift" | "sway" | "flicker" | "pulse" | "rise";

export interface ArenaSceneLayer {
  /** File name inside /assets/ui/arena/scene/. */
  file: string;
  /** Left edge, top edge and width as percentages of the scene box; height follows the artwork. */
  left: number;
  top: number;
  width: number;
  motion?: ArenaSceneMotion;
  /** Offsets the animation so repeated elements do not move in step. */
  delayMs?: number;
  mirrored?: boolean;
}

/**
 * Layers from back to front in a square box: night sky, drifting clouds, the arena,
 * banners, the rune circle, two duelling mages, rising sparks and torches.
 * Positions follow the arena artwork, measured on a 390-px static mockup.
 */
export const ARENA_SCENE_LAYERS: readonly ArenaSceneLayer[] = [
  { file: "2-sky.webp", left: 0, top: 0, width: 100 },
  { file: "8-sheet-2.webp", left: 55, top: 4, width: 36, motion: "drift" },
  { file: "8-sheet-1.webp", left: 5, top: 14, width: 28, motion: "drift", delayMs: -15000 },
  { file: "3-arena.webp", left: 10, top: 29, width: 80 },
  { file: "5-banner.webp", left: 11.6, top: 31.4, width: 9.6, motion: "sway" },
  { file: "5-banner.webp", left: 78.9, top: 31.4, width: 9.6, motion: "sway", delayMs: -2100, mirrored: true },
  { file: "4-runes.webp", left: 29.1, top: 73.1, width: 41.7, motion: "pulse" },
  { file: "9-mages-1.webp", left: 23, top: 59.4, width: 14.8 },
  { file: "9-mages-2.webp", left: 63, top: 59.4, width: 13.9 },
  { file: "8-sheet-4.webp", left: 42, top: 74.7, width: 3.2, motion: "rise" },
  { file: "8-sheet-6.webp", left: 54.8, top: 77, width: 2.4, motion: "rise", delayMs: -2000 },
  { file: "8-sheet-5.webp", left: 48.4, top: 72.3, width: 3.2, motion: "rise", delayMs: -3800 },
  { file: "6-torch.webp", left: 24.4, top: 81.9, width: 5.6 },
  { file: "7-flame.webp", left: 24.8, top: 74.9, width: 4.8, motion: "flicker" },
  { file: "6-torch.webp", left: 70, top: 81.9, width: 5.6 },
  { file: "7-flame.webp", left: 70.3, top: 74.9, width: 4.8, motion: "flicker", delayMs: -500 },
];

const sceneAsset = (file: string) => `/assets/ui/arena/scene/${file}`;
/** A stalled request must not leave an empty hole above the lobby buttons. */
const REVEAL_FALLBACK_MS = 3_000;

export function ArenaScene({ layers = ARENA_SCENE_LAYERS }: { layers?: readonly ArenaSceneLayer[] }) {
  // Reveal the scene once every layer has loaded, so it never assembles piece by piece.
  const [loaded, setLoaded] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setTimedOut(true), REVEAL_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, []);
  const ready = timedOut || loaded >= layers.length;
  if (!layers.length) return null;
  const countLoaded = () => setLoaded((count) => count + 1);
  return (
    <div aria-hidden="true" className={`arena-scene${ready ? " arena-scene--ready" : ""}`}>
      {layers.map((layer, index) => (
        <img
          alt=""
          className={`arena-scene__layer${layer.motion ? ` arena-scene__layer--${layer.motion}` : ""}${layer.mirrored ? " arena-scene__layer--mirrored" : ""}`}
          decoding="async"
          draggable={false}
          onError={countLoaded}
          onLoad={countLoaded}
          key={`${layer.file}-${index}`}
          src={sceneAsset(layer.file)}
          style={{
            "--arena-scene-delay": `${layer.delayMs ?? 0}ms`,
            left: `${layer.left}%`,
            top: `${layer.top}%`,
            width: `${layer.width}%`,
          } as CSSProperties}
        />
      ))}
    </div>
  );
}
