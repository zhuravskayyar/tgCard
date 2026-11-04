import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CARD_BACK_MATERIAL_ID, CARD_BACK_TEXTURE_KEY, renderCardBackSvg } from "../cards/cardBackModel";
import { mountCardMaterialShader } from "../cards/cardMaterialShader";

interface CardBackProps {
  className?: string;
  label?: string;
}

/** A single shared shader-rendered back for battle slots, previews and booster cards. */
export function CardBack({ className = "", label }: CardBackProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [shaderReady, setShaderReady] = useState(false);
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "-");
  const markup = useMemo(() => renderCardBackSvg(`card-back-${id}`), [id]);
  const classNames = ["card-back", shaderReady ? "card-back--shader-ready" : "", className].filter(Boolean).join(" ");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setShaderReady(false);
    return mountCardMaterialShader({
      canvas,
      materialId: CARD_BACK_MATERIAL_ID,
      onReady: setShaderReady,
      svgMarkup: markup,
      textureKey: CARD_BACK_TEXTURE_KEY,
    });
  }, [markup]);

  return (
    <span aria-hidden={label ? undefined : true} aria-label={label} className={classNames} role={label ? "img" : undefined}>
      <span aria-hidden="true" className="card-back__model" dangerouslySetInnerHTML={{ __html: markup }} />
      <canvas aria-hidden="true" className="card-back__shader" ref={canvasRef} />
    </span>
  );
}
