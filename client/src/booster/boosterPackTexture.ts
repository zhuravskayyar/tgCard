import type { CardRarity } from "@cardastika/shared";
import { loadBoosterImage } from "./boosterCardTexture";

/** Reuse the shop's source sprites and its actual rarity CSS, with no generated assets or copied palette. */
export async function createShopPackTexture(rarity: CardRarity, signal: AbortSignal) {
  const [pack, seal] = await Promise.all([
    loadBoosterImage("/assets/ui/shop/stall/pack-noseal-v3.webp"),
    loadBoosterImage("/assets/ui/shop/stall/pack-seal-v2.webp"),
  ]);
  signal.throwIfAborted();
  const probe = document.createElement("span");
  probe.className = `shop-pack-foil shop-pack-foil--${rarity}`;
  probe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;";
  const sealProbe = document.createElement("span");
  sealProbe.className = `shop-pack-seal shop-pack-seal--${rarity}`;
  probe.append(sealProbe);
  document.body.append(probe);
  const tint = getComputedStyle(probe).getPropertyValue("--vellum").trim();
  const sealFilter = getComputedStyle(sealProbe).filter;
  probe.remove();
  const canvas = document.createElement("canvas");
  canvas.width = pack.naturalWidth;
  canvas.height = pack.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Не вдалося підготувати пакунок.");
  context.drawImage(pack, 0, 0);
  if (tint) {
    context.globalCompositeOperation = "multiply";
    context.fillStyle = `rgb(${tint})`;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.globalCompositeOperation = "destination-in";
    context.drawImage(pack, 0, 0);
    context.globalCompositeOperation = "source-over";
  }
  context.filter = sealFilter === "none" ? "none" : sealFilter;
  context.drawImage(seal, 0, 0, canvas.width, canvas.height);
  context.filter = "none";
  return canvas;
}
