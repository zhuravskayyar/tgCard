import type { CardWorkshopCard } from "@cardastika/shared";
import { getBrightCutMaterialId, isLayeredBrightCutMaterial, renderBrightCutArtLayer, renderBrightCutCard } from "../cards/brightCutModel";
import { renderCardBackSvg } from "../cards/cardBackModel";

export type BoosterPreviewCard = Pick<CardWorkshopCard, "artKey" | "cardId" | "displayName" | "element" | "rarity"> & { finalPower?: number };
export interface BoosterCardTextures { plate: HTMLCanvasElement; art?: HTMLCanvasElement; materialId: string }

export function loadBoosterImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Не вдалося завантажити текстуру."));
    image.src = source;
  });
}

async function rasterizeSvg(markup: string, signal: AbortSignal, size = 720) {
  const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = await loadBoosterImage(url);
    signal.throwIfAborted();
    const canvas = document.createElement("canvas");
    canvas.width = size; canvas.height = Math.round(size * 312 / 240);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Браузер не може підготувати карту.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally { URL.revokeObjectURL(url); }
}

/** The booster reverse face uses the same vector model as the shader-rendered card backs. */
export function createBoosterCardBackTexture(signal: AbortSignal) {
  return rasterizeSvg(renderCardBackSvg("booster-card-back"), signal);
}

/** Keep the game's existing frame and real card values on the 3D card. */
export async function createBoosterCardTexture(card: BoosterPreviewCard, source: string | null, signal: AbortSignal): Promise<BoosterCardTextures> {
  let artworkSource: string | null = null;
  if (source) {
    const response = await fetch(source, { signal });
    if (!response.ok) throw new Error("Арт карти тимчасово недоступний.");
    const blob = await response.blob();
    artworkSource = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Не вдалося підготувати арт карти."));
      reader.readAsDataURL(blob);
    });
  }
  signal.throwIfAborted();
  const materialId = getBrightCutMaterialId(card.rarity);
  const layered = isLayeredBrightCutMaterial(materialId) && Boolean(artworkSource);
  const [plate, art] = await Promise.all([
    rasterizeSvg(renderBrightCutCard({ artworkSource: layered ? null : artworkSource, character: !layered && Boolean(artworkSource), element: card.element, rarity: card.rarity, power: card.finalPower, id: "booster-preview-card" }), signal),
    layered && artworkSource ? rasterizeSvg(renderBrightCutArtLayer({ artworkSource, element: card.element, rarity: card.rarity, id: "booster-preview-art" }), signal) : Promise.resolve(undefined),
  ]);
  return { plate, art, materialId };
}
