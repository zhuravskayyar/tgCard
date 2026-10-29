import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { CardElement, CardRarity } from "@cardastika/shared";
import { getBrightCutMaterialId, renderBrightCutCard } from "../cards/brightCutModel";
import { mountCardMaterialShader, updateCardMaterialShaderPower } from "../cards/cardMaterialShader";

interface CardPlateFrameProps {
  artworkSource?: string | null;
  element: CardElement;
  onArtworkError?: () => void;
  power?: number;
  rarity: CardRarity;
  /** Skip the WebGL material pass; used for short-lived copies such as the flying attack card. */
  staticMaterial?: boolean;
}

// Generate the original SVG once per combination of real card values.
export function CardPlateFrame({ artworkSource, element, onArtworkError, power, rarity, staticMaterial = false }: CardPlateFrameProps) {
  const id = `card-model-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const shaderCanvasRef = useRef<HTMLCanvasElement>(null);
  const markupRef = useRef("");
  const paintedPowerRef = useRef(power);
  const [shaderReady, setShaderReady] = useState(false);
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

  useEffect(() => {
    setShaderReady(false);
    const canvas = shaderCanvasRef.current;
    if (!canvas || staticMaterial) return;
    let mounted = true;
    const unmountShader = mountCardMaterialShader({
      artworkSource,
      canvas,
      materialId,
      onReady: (ready) => { if (mounted) setShaderReady(ready); },
      svgMarkup: markupRef.current,
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
    void updateCardMaterialShaderPower(canvas, markupRef.current, artworkSource).then((updated) => {
      if (current && updated) paintedPowerRef.current = power;
    }).catch(() => undefined);
    return () => { current = false; };
  }, [artworkSource, markup, power, shaderReady]);

  return (
    <>
      <span aria-hidden="true" className={`card-model${shaderReady ? " card-model--shader-ready" : ""}`} data-element={element} data-rarity={rarity} dangerouslySetInnerHTML={{ __html: markup }} />
      {staticMaterial ? null : <canvas aria-hidden="true" className={`card-material-shader${shaderReady ? " card-material-shader--ready" : ""}`} ref={shaderCanvasRef} />}
      {artworkSource ? <img alt="" aria-hidden="true" onError={onArtworkError} src={artworkSource} style={{ display: "none" }} /> : null}
    </>
  );
}
