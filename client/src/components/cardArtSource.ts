import { useCallback, useEffect, useState, type SyntheticEvent } from "react";

interface CardArtManifest {
  files: Map<string, string>;
  version: string;
}

const CARD_ART_EXTENSIONS = ["webp", "png", "jpg", "jpeg"] as const;
const CARD_ART_MANIFEST_URL = "/card-art/card-art-map.txt";
const CARD_ART_MANIFEST_STORAGE_KEY = "cardastika.cardArtManifest.v1";
let cardArtManifestPromise: Promise<CardArtManifest> | null = null;
const cardArtPreloadCache = new Set<string>();
const storedCardArtManifestText = readStoredCardArtManifest();
// Kept once loaded so cards mounted later (e.g. the flying attack copy) get their artwork on the first frame.
// The last copy seen on this device gives a reload its artwork on the first frame too.
let loadedCardArtManifest: CardArtManifest | null = storedCardArtManifestText
  ? { files: parseCardArtManifest(storedCardArtManifestText), version: "stable" }
  : null;

function readStoredCardArtManifest() {
  try {
    return localStorage.getItem(CARD_ART_MANIFEST_STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeCardArtManifest(source: string) {
  try {
    localStorage.setItem(CARD_ART_MANIFEST_STORAGE_KEY, source);
  } catch {
    // The manifest is simply fetched before the first artwork next time.
  }
}

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

export function loadCardArtManifest(): Promise<CardArtManifest> {
  if (!cardArtManifestPromise) {
    cardArtManifestPromise = fetch(CARD_ART_MANIFEST_URL)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Card art manifest request failed with ${response.status}`);
        const source = await response.text();
        // An unchanged manifest keeps its object, so mounted cards do not re-render.
        if (source === storedCardArtManifestText && loadedCardArtManifest) return loadedCardArtManifest;
        storeCardArtManifest(source);
        return { files: parseCardArtManifest(source), version: "stable" };
      })
      .catch(() => loadedCardArtManifest ?? { files: new Map<string, string>(), version: "stable" })
      .then((manifest) => { loadedCardArtManifest = manifest; return manifest; });
  }

  return cardArtManifestPromise;
}

export function resolveCardArtworkSources(artKey: string | null, cardId: string | null | undefined, manifest: CardArtManifest | null) {
  if (!manifest) return [];

  const lookupKey = artKey?.trim() || cardId?.trim() || null;
  if (!lookupKey) return [];

  // Only cards listed in the manifest have artwork, so the rest make no requests at all.
  // Catalog keys may carry a folder the artwork has since moved out of; the manifest knows the bare name.
  const bareKey = lookupKey.slice(lookupKey.lastIndexOf("/") + 1);
  const configuredFile = manifest.files.get(lookupKey) ?? manifest.files.get(bareKey);
  if (!configuredFile) return [];
  const hasExtension = /\.[a-zA-Z0-9]+$/.test(configuredFile);
  const candidates = hasExtension
    ? [configuredFile]
    : CARD_ART_EXTENSIONS.map((extension) => `${configuredFile}.${extension}`);

  return candidates.map((fileName) => {
    const path = fileName.split("/").filter(Boolean).map(encodeURIComponent).join("/");
    return `/card-art/${path}`;
  });
}

/** Art that is not painted yet leaves an empty slot rather than a broken-image icon. */
export function hideMissingCardArt(event: SyntheticEvent<HTMLImageElement>) {
  event.currentTarget.style.visibility = "hidden";
}

// A later mount of the same card skips the files already missing instead of requesting each extension again.
const FAILED_SOURCE_RETRY_MS = 60_000;
const failedCardArtSources = new Map<string, number>();

function hasCardArtSourceFailed(source: string) {
  const failedAt = failedCardArtSources.get(source);
  return failedAt !== undefined && Date.now() - failedAt < FAILED_SOURCE_RETRY_MS;
}

export function useCardArtworkSource(artKey: string | null, cardId: string | null | undefined) {
  const [manifest, setManifest] = useState<CardArtManifest | null>(loadedCardArtManifest);
  const [, setFailureRevision] = useState(0);

  useEffect(() => {
    let active = true;
    void loadCardArtManifest().then((loadedManifest) => {
      if (active) setManifest(loadedManifest);
    });
    return () => { active = false; };
  }, []);

  const source = resolveCardArtworkSources(artKey, cardId, manifest).find((candidate) => !hasCardArtSourceFailed(candidate)) ?? null;
  const onSourceError = useCallback(() => {
    if (source) failedCardArtSources.set(source, Date.now());
    setFailureRevision((current) => current + 1);
  }, [source]);

  return {
    loading: manifest === null,
    onSourceError,
    source,
  };
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
