import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CardElement, CardRarity } from "@cardastika/shared";
import { getBrightCutMaterialId, renderBrightCutCard } from "../cards/brightCutModel";
import { mountCardMaterialShader, updateCardMaterialShaderPower } from "../cards/cardMaterialShader";
import { cardTextureKey, hasCardTexture } from "../cards/cardTextureCache";

interface CardPlateFrameProps {
  artworkSource?: string | null;
  element: CardElement;
  onArtworkError?: () => void;
  power?: number;
  rarity: CardRarity;
  /** Skip the WebGL material pass; used for short-lived copies such as the flying attack card. */
  staticMaterial?: boolean;
}

// Last shaded frame of cards that just left the board, so their short-lived static copies look identical.
const MAX_SHADER_SNAPSHOTS = 12;
const shaderSnapshots = new Map<string, HTMLCanvasElement>();

function rememberShaderSnapshot(key: string, source: HTMLCanvasElement) {
  if (!source.width || !source.height) return;
  const copy = document.createElement("canvas");
  copy.width = source.width;
  copy.height = source.height;
  copy.getContext("2d")?.drawImage(source, 0, 0);
  shaderSnapshots.delete(key);
  shaderSnapshots.set(key, copy);
  if (shaderSnapshots.size > MAX_SHADER_SNAPSHOTS) shaderSnapshots.delete(shaderSnapshots.keys().next().value!);
}

// Generate the original SVG once per combination of real card values.
export function CardPlateFrame({ artworkSource, element, onArtworkError, power, rarity, staticMaterial = false }: CardPlateFrameProps) {
  const id = `card-model-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const shaderCanvasRef = useRef<HTMLCanvasElement>(null);
  const markupRef = useRef("");
  const paintedPowerRef = useRef(power);
  const [shaderReady, setShaderReady] = useState(false);
  const shaderReadyRef = useRef(false);
  shaderReadyRef.current = shaderReady;
  const snapshotKey = `${artworkSource ?? ""}|${element}|${rarity}|${power ?? ""}`;
  const [snapshot] = useState(() => staticMaterial ? shaderSnapshots.get(snapshotKey) ?? null : null);
  const materialId = getBrightCutMaterialId(rarity);
  const markup = useMemo(() => renderBrightCutCard({
    artworkSource,
    character: Boolean(artworkSource),
    element,
    power,
    rarity,
    id,
  }), [artworkSource, element, power, rarity, id]);
  markupRef.current = markup;
  // Only artwork makes a texture slow; plates without it, including while the art manifest loads, rasterize quickly.
  const textureKey = useMemo(() => artworkSource ? cardTextureKey(markup, id) : undefined, [artworkSource, markup, id]);
  const textureKeyRef = useRef(textureKey);
  textureKeyRef.current = textureKey;
  // With a texture on the device the flat SVG is never shown: the shaded canvas appears without a fade.
  const [missedTextureKey, setMissedTextureKey] = useState<string | undefined>(undefined);
  const expectsCachedTexture = !staticMaterial && textureKey !== undefined && missedTextureKey !== textureKey && hasCardTexture(textureKey);
  const [paintsInstantly] = useState(expectsCachedTexture);

  // Live cards leave their last shaded frame behind; static copies paint it before the first frame.
  useLayoutEffect(() => {
    const canvas = shaderCanvasRef.current;
    if (!canvas) return;
    if (snapshot) {
      canvas.width = snapshot.width;
      canvas.height = snapshot.height;
      canvas.getContext("2d")?.drawImage(snapshot, 0, 0);
      return;
    }
    return () => { if (shaderReadyRef.current) rememberShaderSnapshot(snapshotKey, canvas); };
  }, [snapshot, snapshotKey]);

  useEffect(() => {
    setShaderReady(false);
    const canvas = shaderCanvasRef.current;
    if (!canvas || staticMaterial) return;
    let mounted = true;
    const key = textureKeyRef.current;
    const unmountShader = mountCardMaterialShader({
      artworkSource,
      canvas,
      materialId,
      onCacheMiss: () => { if (mounted) setMissedTextureKey(key); },
      onReady: (ready) => {
        if (!mounted) return;
        setShaderReady(ready);
        if (!ready) setMissedTextureKey(key);
      },
      svgMarkup: markupRef.current,
      textureKey: key,
    });
    return () => {
      mounted = false;
      unmountShader();
    };
  }, [artworkSource, element, materialId, rarity, id, staticMaterial]);

  useEffect(() => {
    if (!shaderReady || Object.is(paintedPowerRef.current, power) || !Number.isFinite(power)) return;
    const canvas = shaderCanvasRef.current;
    if (!canvas) return;
    let current = true;
    void updateCardMaterialShaderPower(canvas, markupRef.current, artworkSource, textureKeyRef.current).then((updated) => {
      if (current && updated) paintedPowerRef.current = power;
    }).catch(() => undefined);
    return () => { current = false; };
  }, [artworkSource, markup, power, shaderReady]);

  return (
    <>
      <span aria-hidden="true" className={`card-model${shaderReady || snapshot || expectsCachedTexture ? " card-model--shader-ready" : ""}`} data-element={element} data-rarity={rarity} dangerouslySetInnerHTML={{ __html: markup }} />
      {staticMaterial && !snapshot ? null : <canvas aria-hidden="true" className={`card-material-shader${shaderReady ? " card-material-shader--ready" : ""}${snapshot || (paintsInstantly && expectsCachedTexture) ? " card-material-shader--snapshot" : ""}`} ref={shaderCanvasRef} />}
      {artworkSource ? <img alt="" aria-hidden="true" onError={onArtworkError} src={artworkSource} style={{ display: "none" }} /> : null}
    </>
  );
}
