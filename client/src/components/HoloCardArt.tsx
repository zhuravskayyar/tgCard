import { useEffect, useRef, useState } from "react";
import type { CardElement, CardHoloConfig } from "@cardastika/shared";
import { ElementSymbol } from "./ElementSymbol";
import { useCardArtworkSource } from "./cardArtSource";

interface PreparedHoloArt {
  baseCanvas: HTMLCanvasElement;
  height: number;
  maskCanvas: HTMLCanvasElement;
  width: number;
}

interface HoloCardArtProps {
  artKey: string | null;
  cardId?: string | null;
  config: CardHoloConfig;
  element: CardElement;
}

const MAX_HOLO_RENDER_EDGE = 1280;
const preparedHoloArtCache = new Map<string, Promise<PreparedHoloArt>>();
const HOLO_PALETTES: Record<CardHoloConfig["palette"], readonly (readonly [number, string])[]> = {
  cool: [
    [0.00, "#d7f7ff"],
    [0.16, "#6ed8f2"],
    [0.32, "#4d8ee5"],
    [0.48, "#6d68cf"],
    [0.64, "#b08ce8"],
    [0.80, "#6ccfc9"],
    [1.00, "#e2faff"],
  ],
  magic: [
    [0.00, "#ffe6a3"],
    [0.16, "#ff8b72"],
    [0.32, "#cf6dff"],
    [0.48, "#63dcff"],
    [0.64, "#fff6d6"],
    [0.80, "#ff67ba"],
    [1.00, "#ffd27e"],
  ],
  warm: [
    [0.00, "#b93562"],
    [0.16, "#d8753c"],
    [0.32, "#d4c05d"],
    [0.48, "#4daa94"],
    [0.64, "#438dbb"],
    [0.80, "#675ca5"],
    [1.00, "#ae4f8d"],
  ],
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(min: number, max: number, value: number) {
  const normalized = clamp((value - min) / (max - min), 0, 1);
  return normalized * normalized * (3 - 2 * normalized);
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Holo art request failed for ${source}`));
    image.src = source;
  });
}

async function buildPreparedHoloArt(source: string, greenThreshold: number): Promise<PreparedHoloArt> {
  const image = await loadImage(source);
  const scale = Math.min(1, MAX_HOLO_RENDER_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = width;
  sourceCanvas.height = height;
  const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
  if (!sourceContext) throw new Error("Holo art source context is unavailable");
  sourceContext.drawImage(image, 0, 0, width, height);

  const original = sourceContext.getImageData(0, 0, width, height);
  const baseData = sourceContext.createImageData(width, height);
  const maskData = sourceContext.createImageData(width, height);

  for (let index = 0; index < original.data.length; index += 4) {
    const red = original.data[index];
    const green = original.data[index + 1];
    const blue = original.data[index + 2];
    const alpha = original.data[index + 3];
    const greenDominance = green - Math.max(red, blue);
    const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
    const brightnessFactor = smoothstep(84, 170, green);
    const saturationFactor = smoothstep(28, 92, chroma);
    const dominanceFactor = smoothstep(greenThreshold, greenThreshold + 68, greenDominance);
    const maskStrength = brightnessFactor * saturationFactor * dominanceFactor;
    const neutral = Math.round(red * 0.299 + green * 0.587 + blue * 0.114);

    // Remove chroma-green from the base layer as well as masking it. This
    // prevents a bright green fringe from leaking through anti-aliased edges.
    baseData.data[index] = Math.round(red * (1 - maskStrength) + neutral * maskStrength);
    baseData.data[index + 1] = Math.round(green * (1 - maskStrength) + neutral * maskStrength);
    baseData.data[index + 2] = Math.round(blue * (1 - maskStrength) + neutral * maskStrength);
    baseData.data[index + 3] = Math.round(alpha * (1 - maskStrength));

    maskData.data[index] = 255;
    maskData.data[index + 1] = 255;
    maskData.data[index + 2] = 255;
    maskData.data[index + 3] = Math.round(alpha * maskStrength);
  }

  const baseCanvas = document.createElement("canvas");
  baseCanvas.width = width;
  baseCanvas.height = height;
  baseCanvas.getContext("2d")?.putImageData(baseData, 0, 0);

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = width;
  maskCanvas.height = height;
  maskCanvas.getContext("2d")?.putImageData(maskData, 0, 0);

  return { baseCanvas, height, maskCanvas, width };
}

function getPreparedHoloArt(source: string, greenThreshold: number) {
  const cacheKey = `${source}|${greenThreshold}`;
  const cached = preparedHoloArtCache.get(cacheKey);
  if (cached) return cached;

  const prepared = buildPreparedHoloArt(source, greenThreshold);
  preparedHoloArtCache.set(cacheKey, prepared);
  void prepared.catch(() => {
    if (preparedHoloArtCache.get(cacheKey) === prepared) preparedHoloArtCache.delete(cacheKey);
  });
  return prepared;
}

function addHoloGradientStops(
  gradient: CanvasGradient,
  shift: number,
  palette: readonly (readonly [number, string])[],
) {
  const shifted = palette
    .map(([position, color]) => [((position + shift) % 1 + 1) % 1, color] as const)
    .sort(([left], [right]) => left - right);
  const firstColor = shifted[0]?.[1] ?? "#b93562";
  const lastColor = shifted[shifted.length - 1]?.[1] ?? firstColor;
  gradient.addColorStop(0, firstColor);
  shifted.forEach(([position, color]) => {
    if (position > 0 && position < 1) gradient.addColorStop(position, color);
  });
  gradient.addColorStop(1, lastColor);
}

function isDebugHoloEnabled() {
  return import.meta.env.DEV
    && typeof window !== "undefined"
    && new URLSearchParams(window.location.search).get("debugHolo") === "1";
}

export function HoloCardArt({ artKey, cardId, config, element }: HoloCardArtProps) {
  const { loading, onSourceError, source } = useCardArtworkSource(artKey, cardId);
  const rootRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [prepared, setPrepared] = useState<PreparedHoloArt | null>(null);
  const debug = isDebugHoloEnabled();

  useEffect(() => {
    setPrepared(null);
    if (!source) return;
    let active = true;
    void getPreparedHoloArt(source, config.threshold)
      .then((value) => {
        if (active) setPrepared(value);
      })
      .catch(() => {
        if (active) onSourceError();
      });
    return () => { active = false; };
  }, [config.threshold, onSourceError, source]);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas || !prepared) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    canvas.width = prepared.width;
    canvas.height = prepared.height;
    context.imageSmoothingEnabled = true;
    const holoCanvas = document.createElement("canvas");
    holoCanvas.width = prepared.width;
    holoCanvas.height = prepared.height;
    const holoContext = holoCanvas.getContext("2d");
    if (!holoContext) return;

    const debugCanvas = document.createElement("canvas");
    debugCanvas.width = prepared.width;
    debugCanvas.height = prepared.height;
    const debugContext = debugCanvas.getContext("2d");
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = reducedMotionQuery.matches;
    let visible = true;
    let frame: number | null = null;
    let pointerX = 0.5;
    let pointerY = 0.5;
    let targetX = 0.5;
    let targetY = 0.5;
    const startedAt = performance.now();

    const cancelFrame = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    };

    const renderArtwork = (x: number, y: number, elapsed: number) => {
      context.clearRect(0, 0, prepared.width, prepared.height);
      context.drawImage(prepared.baseCanvas, 0, 0);

      if (debug && debugContext) {
        debugContext.clearRect(0, 0, prepared.width, prepared.height);
        debugContext.globalCompositeOperation = "source-over";
        debugContext.fillStyle = "#00ff55";
        debugContext.fillRect(0, 0, prepared.width, prepared.height);
        debugContext.globalCompositeOperation = "destination-in";
        debugContext.drawImage(prepared.maskCanvas, 0, 0);
        debugContext.globalCompositeOperation = "source-over";
        context.drawImage(debugCanvas, 0, 0);
        return;
      }

      const movement = elapsed * config.speed;
      const isMagic = config.preset === "magic";
      const presetMovement = movement * (isMagic ? 1.35 : 1);
      const diagonal = Math.hypot(prepared.width, prepared.height);
      const angle = -0.62 + y * 0.24;
      const centerX = ((((x * 0.82 + presetMovement * 0.38 + 0.08) % 1) + 1) % 1) * prepared.width;
      const centerY = ((((y * 0.76 + presetMovement * 0.14 + 0.12) % 1) + 1) % 1) * prepared.height;
      const gradient = holoContext.createLinearGradient(
        centerX - Math.cos(angle) * diagonal,
        centerY - Math.sin(angle) * diagonal,
        centerX + Math.cos(angle) * diagonal,
        centerY + Math.sin(angle) * diagonal,
      );
      addHoloGradientStops(
        gradient,
        (presetMovement * 0.8 + x * 0.12 + y * 0.06) % 1,
        HOLO_PALETTES[config.palette],
      );
      const interaction = clamp(Math.hypot(x - 0.5, y - 0.5) * 1.6, 0, 1);
      const pulse = isMagic ? 0.93 + Math.sin(presetMovement * 4.2) * 0.07 : 1;
      const holoOpacity = clamp(config.intensity * (0.67 + interaction * 0.25) * pulse, 0.42, 1);

      holoContext.clearRect(0, 0, prepared.width, prepared.height);
      holoContext.globalCompositeOperation = "source-over";
      holoContext.globalAlpha = holoOpacity;
      holoContext.fillStyle = gradient;
      holoContext.fillRect(0, 0, prepared.width, prepared.height);

      holoContext.globalCompositeOperation = "overlay";
      holoContext.globalAlpha = clamp(config.intensity * 0.24, 0.08, 0.3);
      const bandCount = isMagic ? 5 : 3;
      for (let index = 0; index < bandCount; index += 1) {
        const bandY = ((((index / bandCount) + presetMovement * 0.12 + y * 0.05) % 1) + 1) % 1 * prepared.height;
        const band = holoContext.createLinearGradient(0, bandY - prepared.height * 0.08, 0, bandY + prepared.height * 0.08);
        band.addColorStop(0, "rgb(255 255 255 / 0)");
        band.addColorStop(0.5, "rgb(255 255 255 / 70%)");
        band.addColorStop(1, "rgb(255 255 255 / 0)");
        holoContext.fillStyle = band;
        holoContext.fillRect(0, bandY - prepared.height * 0.08, prepared.width, prepared.height * 0.16);
      }

      if (isMagic) {
        holoContext.globalCompositeOperation = "screen";
        holoContext.globalAlpha = clamp(config.intensity * 0.18, 0.08, 0.26);
        for (let index = 0; index < 4; index += 1) {
          const orbX = ((((index * 0.29 + presetMovement * 0.22 + x * 0.14) % 1) + 1) % 1) * prepared.width;
          const orbY = ((((index * 0.41 + presetMovement * 0.11 + y * 0.1) % 1) + 1) % 1) * prepared.height;
          const radius = prepared.width * (0.08 + index * 0.012);
          const orb = holoContext.createRadialGradient(orbX, orbY, 0, orbX, orbY, radius);
          orb.addColorStop(0, index % 2 === 0 ? "rgb(255 232 160 / 72%)" : "rgb(104 220 255 / 72%)");
          orb.addColorStop(1, "rgb(104 220 255 / 0%)");
          holoContext.fillStyle = orb;
          holoContext.fillRect(orbX - radius, orbY - radius, radius * 2, radius * 2);
        }
      }

      holoContext.globalCompositeOperation = "screen";
      holoContext.globalAlpha = clamp(config.intensity * (0.18 + interaction * 0.18), 0.06, 0.38);
      const shineX = x * prepared.width + Math.sin(presetMovement * 1.3) * prepared.width * 0.06;
      const shine = holoContext.createLinearGradient(shineX - prepared.width * 0.22, 0, shineX + prepared.width * 0.22, 0);
      shine.addColorStop(0, "rgb(255 255 255 / 0)");
      shine.addColorStop(0.5, "rgb(255 255 255 / 82%)");
      shine.addColorStop(1, "rgb(255 255 255 / 0)");
      holoContext.fillStyle = shine;
      holoContext.fillRect(0, 0, prepared.width, prepared.height);

      holoContext.globalAlpha = 1;
      holoContext.globalCompositeOperation = "destination-in";
      holoContext.drawImage(prepared.maskCanvas, 0, 0);
      holoContext.globalCompositeOperation = "source-over";
      context.drawImage(holoCanvas, 0, 0);
    };

    const renderStatic = () => renderArtwork(0.5, 0.5, 0);
    const scheduleFrame = () => {
      if (debug || reducedMotion || !visible || document.hidden || frame !== null) return;
      frame = requestAnimationFrame(tick);
    };
    const tick = (time: number) => {
      frame = null;
      if (reducedMotion || !visible || document.hidden) {
        renderStatic();
        return;
      }
      pointerX += (targetX - pointerX) * 0.12;
      pointerY += (targetY - pointerY) * 0.12;
      renderArtwork(pointerX, pointerY, (time - startedAt) / 1000);
      scheduleFrame();
    };
    const handlePointerMove = (event: PointerEvent) => {
      const bounds = root.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      targetX = clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
      targetY = clamp((event.clientY - bounds.top) / bounds.height, 0, 1);
    };
    const resetPointer = () => {
      targetX = 0.5;
      targetY = 0.5;
    };
    const handleVisibilityChange = () => {
      if (document.hidden) {
        cancelFrame();
      } else {
        scheduleFrame();
      }
    };
    const handleMotionPreference = () => {
      reducedMotion = reducedMotionQuery.matches;
      cancelFrame();
      renderStatic();
      scheduleFrame();
    };

    if (config.interactive) {
      root.addEventListener("pointermove", handlePointerMove);
      root.addEventListener("pointerleave", resetPointer);
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    reducedMotionQuery.addEventListener("change", handleMotionPreference);
    const observer = "IntersectionObserver" in window
      ? new IntersectionObserver(([entry]) => {
        visible = Boolean(entry?.isIntersecting);
        if (visible) scheduleFrame();
        else cancelFrame();
      }, { threshold: 0.01 })
      : null;
    observer?.observe(root);

    renderStatic();
    scheduleFrame();

    return () => {
      cancelFrame();
      observer?.disconnect();
      if (config.interactive) {
        root.removeEventListener("pointermove", handlePointerMove);
        root.removeEventListener("pointerleave", resetPointer);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      reducedMotionQuery.removeEventListener("change", handleMotionPreference);
    };
  }, [config, debug, prepared]);

  if (!source) {
    return <span aria-hidden="true" className="card-artwork card-artwork--holo">
      <span className="card-artwork__placeholder"><ElementSymbol element={element} /></span>
    </span>;
  }

  return <span aria-hidden="true" className={`card-artwork card-artwork--holo${loading ? " card-artwork--loading" : ""}`} ref={rootRef}>
    <canvas className="card-artwork__image card-artwork__holo-canvas" ref={canvasRef} />
    <img
      alt=""
      className="card-artwork__image card-artwork__holo-fallback"
      decoding="async"
      onError={onSourceError}
      src={source}
      style={{ opacity: prepared ? 0 : 1 }}
    />
  </span>;
}
