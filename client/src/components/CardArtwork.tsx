import { memo, useEffect, useState } from "react";
import type { CardElement } from "@cardastika/shared";
import { ElementSymbol } from "./ElementSymbol";

interface CardArtworkProps {
  artKey: string | null;
  cardId?: string | null;
  element: CardElement;
}

interface CardArtManifest {
  files: Map<string, string>;
  version: string;
}

const CARD_ART_EXTENSIONS = ["webp", "png", "jpg", "jpeg"] as const;
const CARD_ART_MANIFEST_URL = "/card-art/card-art-map.txt";
let cardArtManifestPromise: Promise<CardArtManifest> | null = null;
const cardArtPreloadCache = new Set<string>();

function parseCardArtManifest(source: string): Map<string, string> {
  const files = new Map<string, string>();

  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const columns = trimmed.split("|").map((column) => column.trim());
    const cardId = columns[0] ?? "";
    const fileName = columns.length >= 3
      ? columns[2] ?? ""
      : (trimmed.slice(trimmed.indexOf("=") + 1).trim());
    if (!cardId || !fileName || fileName.includes("..") || fileName.startsWith("/")) continue;
    if (!/^[a-zA-Z0-9_./-]+$/.test(fileName)) continue;

    files.set(cardId, fileName);
  }

  return files;
}

function loadCardArtManifest(): Promise<CardArtManifest> {
  if (!cardArtManifestPromise) {
    cardArtManifestPromise = fetch(CARD_ART_MANIFEST_URL)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Card art manifest request failed with ${response.status}`);
        return { files: parseCardArtManifest(await response.text()), version: "stable" };
      })
      .catch(() => ({ files: new Map<string, string>(), version: "stable" }));
  }

  return cardArtManifestPromise;
}

function resolveCardArtworkSources(artKey: string | null, cardId: string | null | undefined, manifest: CardArtManifest | null) {
  if (!manifest) return [];

  const lookupKey = artKey?.trim() || cardId?.trim() || null;
  if (!lookupKey) return [];

  const configuredFile = manifest.files.get(lookupKey) ?? lookupKey;
  const hasExtension = /\.[a-zA-Z0-9]+$/.test(configuredFile);
  const candidates = hasExtension
    ? [configuredFile]
    : CARD_ART_EXTENSIONS.map((extension) => `${configuredFile}.${extension}`);

  return candidates.map((fileName) => {
    const path = fileName.split("/").filter(Boolean).map(encodeURIComponent).join("/");
    return `/card-art/${path}`;
  });
}

export function preloadCardArtwork(artKey: string | null, cardId?: string | null) {
  if (typeof Image === "undefined") return;
  void loadCardArtManifest().then((manifest) => {
    const source = resolveCardArtworkSources(artKey, cardId, manifest)[0];
    if (!source || cardArtPreloadCache.has(source)) return;
    cardArtPreloadCache.add(source);
    const image = new Image();
    image.decoding = "async";
    image.onerror = () => cardArtPreloadCache.delete(source);
    image.src = source;
  });
}

export const CardArtwork = memo(function CardArtwork({ artKey, cardId, element }: CardArtworkProps) {
  const [manifest, setManifest] = useState<CardArtManifest | null>(null);
  const [failedSourceIndex, setFailedSourceIndex] = useState(0);

  useEffect(() => {
    let active = true;
    void loadCardArtManifest().then((loadedManifest) => {
      if (active) setManifest(loadedManifest);
    });
    return () => { active = false; };
  }, []);

  const artworkSources = resolveCardArtworkSources(artKey, cardId, manifest);
  const sourceKey = `${artKey ?? ""}:${cardId ?? ""}:${manifest?.version ?? "loading"}`;
  useEffect(() => setFailedSourceIndex(0), [sourceKey]);

  const artworkSource = artworkSources[failedSourceIndex] ?? null;

  return (
    <span className="card-artwork" aria-hidden="true">
      {artworkSource ? (
        <img
          alt=""
          className="card-artwork__image"
          decoding="async"
          onError={() => setFailedSourceIndex((current) => current + 1)}
          src={artworkSource}
        />
      ) : (
        <span className="card-artwork__placeholder">
          <ElementSymbol element={element} />
        </span>
      )}
    </span>
  );
});
