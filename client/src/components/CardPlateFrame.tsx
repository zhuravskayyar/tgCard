import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CardElement, CardRarity } from "@cardastika/shared";
import { getBrightCutMaterialId, renderBrightCutArtLayer, renderBrightCutCard } from "../cards/brightCutModel";
import { getCardMaterialTilt, mountCardMaterialShader, updateCardMaterialShaderPower } from "../cards/cardMaterialShader";
import { cardTextureKey } from "../cards/cardTextureCache";

interface CardPlateFrameProps {
  artworkLoading?: boolean;
  artworkSource?: string | null;
  element: CardElement;
  onArtworkError?: () => void;
  power?: number;
  rarity: CardRarity;
  /** Skip the WebGL material pass; used for short-lived copies such as the flying attack card. */
  staticMaterial?: boolean;
}

interface ShaderSnapshot {
  canvas: HTMLCanvasElement;
  tilt: { x: number; y: number } | null;
}

// Last shaded frame of cards that left the screen: a return visit and short-lived static copies paint it before the first frame.
const MAX_SHADER_SNAPSHOTS = 40;
const shaderSnapshots = new Map<string, ShaderSnapshot>();
// A slow device still gets the flat card rather than an empty slot.
const FLAT_FALLBACK_MS = 2500;
const FLAT_AFTER_FAILURE_MS = 150;

function rememberShaderSnapshot(key: string, source: HTMLCanvasElement) {
  if (!source.width || !source.height) return;
  const copy = document.createElement("canvas");
  copy.width = source.width;
  copy.height = source.height;
  copy.getContext("2d")?.drawImage(source, 0, 0);
  shaderSnapshots.delete(key);
  shaderSnapshots.set(key, { canvas: copy, tilt: getCardMaterialTilt(source) });
  if (shaderSnapshots.size > MAX_SHADER_SNAPSHOTS) shaderSnapshots.delete(shaderSnapshots.keys().next().value!);
}

// Generate the original SVG once per combination of real card values.
export function CardPlateFrame({ artworkLoading = false, artworkSource, element, onArtworkError, power, rarity, staticMaterial = false }: CardPlateFrameProps) {
  const id = `card-model-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const shaderCanvasRef = useRef<HTMLCanvasElement>(null);
  const markupRef = useRef("");
  const paintedPowerRef = useRef(power);
  const [shaderReady, setShaderReady] = useState(false);
  const shaderReadyRef = useRef(false);
  shaderReadyRef.current = shaderReady;
  const [flatFallback, setFlatFallback] = useState(false);
  const snapshotKey = `${artworkSource ?? ""}|${element}|${rarity}|${power ?? ""}`;
  const [snapshot] = useState(() => shaderSnapshots.get(snapshotKey) ?? null);
  const materialId = getBrightCutMaterialId(rarity);
  const markup = useMemo(() => renderBrightCutCard({
    artworkSource,
    character: Boolean(artworkSource),
    element,
    power,
    rarity,
    id,
  }), [artworkSource, element, power, rarity, id]);
  // Astronite shades its plate and art separately so the art can float inside the frame; the flat SVG keeps them together.
  const layeredSource = materialId === "astronite" && !staticMaterial ? artworkSource ?? null : null;
  const plateMarkup = useMemo(() => layeredSource ? renderBrightCutCard({ character: false, element, power, rarity, id }) : markup, [layeredSource, element, power, rarity, id, markup]);
  const artLayer = useMemo(() => {
    if (!layeredSource) return null;
    const layerMarkup = renderBrightCutArtLayer({ artworkSource: layeredSource, element, rarity, id });
    return { artworkSource: layeredSource, markup: layerMarkup, textureKey: cardTextureKey(layerMarkup, id) };
  }, [layeredSource, element, rarity, id]);
  const artLayerRef = useRef(artLayer);
  artLayerRef.current = artLayer;
  const plateSource = layeredSource ? null : artworkSource;
  markupRef.current = plateMarkup;
  // Only artwork makes a texture slow; plates without it rasterize quickly and need no device cache.
  const textureKey = useMemo(() => artworkSource ? cardTextureKey(plateMarkup, id) : undefined, [artworkSource, plateMarkup, id]);
  const textureKeyRef = useRef(textureKey);
  textureKeyRef.current = textureKey;
  const snapshotTiltRef = useRef(snapshot?.tilt ?? undefined);
  // The card appears once, finished: never as an empty plate, a flat SVG or a half-shaded frame.
  const awaiting = !staticMaterial && !snapshot && !shaderReady && !flatFallback;

  // Live cards leave their last shaded frame behind; the next copy paints it before the first frame.
  useLayoutEffect(() => {
    const canvas = shaderCanvasRef.current;
    if (!canvas) return;
    if (snapshot) {
      canvas.width = snapshot.canvas.width;
      canvas.height = snapshot.canvas.height;
      canvas.getContext("2d")?.drawImage(snapshot.canvas, 0, 0);
    }
    if (staticMaterial) return;
    return () => { if (shaderReadyRef.current) rememberShaderSnapshot(snapshotKey, canvas); };
  }, [snapshot, snapshotKey, staticMaterial]);

  useEffect(() => {
    if (!awaiting || artworkLoading) return;
    const timer = window.setTimeout(() => setFlatFallback(true), FLAT_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [artworkLoading, awaiting]);

  useEffect(() => {
    setShaderReady(false);
    const canvas = shaderCanvasRef.current;
    // Rendering before the art manifest arrives would only produce an empty plate to throw away.
    if (!canvas || staticMaterial || artworkLoading) return;
    let mounted = true;
    let flatTimer: number | undefined;
    const unmountShader = mountCardMaterialShader({
      artLayer: artLayerRef.current,
      artworkSource: plateSource,
      canvas,
      initialTilt: snapshotTiltRef.current,
      materialId,
      onReady: (ready) => {
        if (!mounted) return;
        setShaderReady(ready);
        // Missing artwork also fails here, but it moves on to the next source, which cancels this timer.
        if (!ready) flatTimer = window.setTimeout(() => setFlatFallback(true), FLAT_AFTER_FAILURE_MS);
      },
      svgMarkup: markupRef.current,
      textureKey: textureKeyRef.current,
    });
    return () => {
      mounted = false;
      window.clearTimeout(flatTimer);
      unmountShader();
    };
  }, [artworkLoading, artworkSource, element, materialId, plateSource, rarity, id, staticMaterial]);

  useEffect(() => {
    if (!shaderReady || Object.is(paintedPowerRef.current, power) || !Number.isFinite(power)) return;
    const canvas = shaderCanvasRef.current;
    if (!canvas) return;
    let current = true;
    void updateCardMaterialShaderPower(canvas, markupRef.current, plateSource, textureKeyRef.current).then((updated) => {
      if (current && updated) paintedPowerRef.current = power;
    }).catch(() => undefined);
    return () => { current = false; };
  }, [plateSource, markup, power, shaderReady]);

  return (
    <>
      <span aria-hidden="true" className={`card-model${awaiting ? " card-model--awaiting" : ""}${shaderReady || snapshot ? " card-model--shader-ready" : ""}`} data-element={element} data-rarity={rarity} dangerouslySetInnerHTML={{ __html: markup }} />
      {staticMaterial && !snapshot ? null : <canvas aria-hidden="true" className={`card-material-shader${shaderReady || snapshot ? " card-material-shader--ready" : ""}`} ref={shaderCanvasRef} />}
      {artworkSource ? <img alt="" aria-hidden="true" onError={onArtworkError} src={artworkSource} style={{ display: "none" }} /> : null}
    </>
  );
}
