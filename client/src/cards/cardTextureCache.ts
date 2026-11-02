// Finished card textures kept on the device, so a reload skips artwork fetching and SVG rasterizing.
// Bump the version when artwork is replaced under the same URLs, so devices drop the old textures at once.
const CACHE_NAME = "cardastika-card-textures-v2";
const INDEX_STORAGE_KEY = "cardastika.cardTextures.v2";
const RETIRED_CACHE_NAMES = ["cardastika-card-textures-v1"];
const RETIRED_INDEX_KEYS = ["cardastika.cardTextures.v1"];
const REQUEST_PREFIX = "/__card-texture/";
const MAX_ENTRIES = 150;
// Artwork can be replaced under the same URL, so a stale texture must age out on its own.
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const SAVE_DELAY_MS = 1200;

const available = typeof window !== "undefined" && window.isSecureContext && Boolean(window.caches);
const pendingSaves = new WeakMap<HTMLCanvasElement, number>();

const index = readIndex();

if (available) {
  for (const name of RETIRED_CACHE_NAMES) void caches.delete(name).catch(() => undefined);
  try {
    for (const key of RETIRED_INDEX_KEYS) localStorage.removeItem(key);
  } catch {
    // Storage may be blocked; the retired entries then simply stay unused.
  }
}

function readIndex() {
  const entries = new Map<string, number>();
  if (!available) return entries;
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(INDEX_STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return entries;
    for (const entry of parsed) {
      if (Array.isArray(entry) && typeof entry[0] === "string" && typeof entry[1] === "number" && Date.now() - entry[1] < MAX_AGE_MS) entries.set(entry[0], entry[1]);
    }
  } catch {
    entries.clear();
  }
  return entries;
}

function writeIndex() {
  try {
    localStorage.setItem(INDEX_STORAGE_KEY, JSON.stringify([...index]));
  } catch {
    // Without the index the cache is simply not consulted.
  }
}

function requestFor(key: string) {
  return new Request(`${REQUEST_PREFIX}${key}`);
}

function forget(key: string) {
  if (index.delete(key)) writeIndex();
  void caches.open(CACHE_NAME).then((cache) => cache.delete(requestFor(key))).catch(() => undefined);
}

/** The element id differs per mount, so it is removed; anything else that changes the card changes the key. */
export function cardTextureKey(markup: string, id: string) {
  const source = markup.replaceAll(id, "");
  let first = 0xdeadbeef;
  let second = 0x41c6ce57;
  for (let position = 0; position < source.length; position += 1) {
    const code = source.charCodeAt(position);
    first = Math.imul(first ^ code, 2654435761);
    second = Math.imul(second ^ code, 1597334677);
  }
  first = Math.imul(first ^ (first >>> 16), 2246822507) ^ Math.imul(second ^ (second >>> 13), 3266489909);
  second = Math.imul(second ^ (second >>> 16), 2246822507) ^ Math.imul(first ^ (first >>> 13), 3266489909);
  return `${(second >>> 0).toString(36)}${(first >>> 0).toString(36)}-${source.length.toString(36)}`;
}

export async function loadCardTexture(key: string) {
  if (!index.has(key)) return null;
  try {
    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match(requestFor(key));
    if (!response) throw new Error("Card texture is missing");
    return await createImageBitmap(await response.blob());
  } catch {
    forget(key);
    return null;
  }
}

/** Waits for the card to settle: a power change replaces the pending save of the same canvas. */
export function saveCardTexture(key: string, canvas: HTMLCanvasElement) {
  if (!available) return;
  const pending = pendingSaves.get(canvas);
  if (pending !== undefined) window.clearTimeout(pending);
  pendingSaves.set(canvas, window.setTimeout(() => {
    pendingSaves.delete(canvas);
    // Quality 1 is lossless WebP; the shader reads this image as a height map, so artifacts would show as bumps.
    canvas.toBlob((blob) => {
      if (!blob) return;
      void caches.open(CACHE_NAME).then(async (cache) => {
        await cache.put(requestFor(key), new Response(blob, { headers: { "content-type": blob.type } }));
        index.delete(key);
        index.set(key, Date.now());
        const expired = [...index.keys()].slice(0, Math.max(0, index.size - MAX_ENTRIES));
        for (const oldKey of expired) {
          index.delete(oldKey);
          await cache.delete(requestFor(oldKey));
        }
        writeIndex();
      }).catch(() => undefined);
    }, "image/webp", 1);
  }, SAVE_DELAY_MS));
}
