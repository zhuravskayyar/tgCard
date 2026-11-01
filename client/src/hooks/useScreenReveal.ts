import { useLayoutEffect, useState, type RefObject } from "react";

const POLL_MS = 16;
// React needs a moment after a response to mount what it brings, so readiness must hold this long.
const SETTLE_MS = 32;
// A slow network must not trap the player on a blank page.
const MAX_WAIT_MS = 1800;
const CSS_URL_PATTERN = /url\(["']?([^"')]+)["']?\)/g;

let apiRequestsInFlight = 0;

// Every screen fetches through window.fetch, so its in-flight /api requests say whether its data has arrived.
if (typeof window !== "undefined") {
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!new URL(url, window.location.href).pathname.startsWith("/api/")) return originalFetch(input, init);
    apiRequestsInFlight += 1;
    return originalFetch(input, init).finally(() => { apiRequestsInFlight -= 1; });
  };
}

const spriteLoads = new Map<string, Promise<void>>();
const finishedSprites = new Set<string>();

function loadSprite(source: string) {
  let load = spriteLoads.get(source);
  if (!load) {
    const image = new Image();
    image.src = source;
    load = image.decode().catch(() => undefined).then(() => { finishedSprites.add(source); });
    spriteLoads.set(source, load);
  }
  return load;
}

function collectBackgrounds(element: Element, target: Set<string>) {
  for (const pseudo of [undefined, "::before", "::after"]) {
    const background = getComputedStyle(element, pseudo).backgroundImage;
    if (background === "none") continue;
    for (const match of background.matchAll(CSS_URL_PATTERN)) {
      if (!match[1]!.startsWith("data:")) target.add(match[1]!);
    }
  }
}

function isOnScreen(element: Element, viewport: DOMRect) {
  const bounds = element.getBoundingClientRect();
  return bounds.bottom > viewport.top && bounds.top < viewport.bottom && bounds.right > viewport.left && bounds.left < viewport.right;
}

function areCardsAndImagesReady(content: HTMLElement) {
  const viewport = content.getBoundingClientRect();
  for (const card of content.querySelectorAll(".card-model--awaiting")) {
    if (isOnScreen(card, viewport)) return false;
  }
  for (const image of content.querySelectorAll("img")) {
    if (!image.complete && image.loading !== "lazy" && isOnScreen(image, viewport)) return false;
  }
  return true;
}

function areSpritesReady(content: HTMLElement) {
  const viewport = content.getBoundingClientRect();
  const backgrounds = new Set<string>();
  for (const element of content.querySelectorAll("*")) {
    if (isOnScreen(element, viewport)) collectBackgrounds(element, backgrounds);
  }
  let painted = true;
  for (const source of backgrounds) {
    if (finishedSprites.has(source)) continue;
    void loadSprite(source);
    painted = false;
  }
  return painted;
}

/** Keeps a newly opened screen hidden until its data, sprites and on-screen cards are all ready. */
export function useScreenReveal(screenKey: string | undefined, contentRef: RefObject<HTMLElement | null>) {
  const [revealedKey, setRevealedKey] = useState<string | null | undefined>(null);

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const startedAt = performance.now();
    let settledAt: number | null = null;
    const poll = window.setInterval(() => {
      const now = performance.now();
      if (apiRequestsInFlight === 0 && areCardsAndImagesReady(content)) settledAt ??= now;
      else settledAt = null;
      // Sprites are scanned last: reading every computed style is the expensive check.
      const settled = settledAt !== null && now - settledAt >= SETTLE_MS && areSpritesReady(content);
      if (settled || now - startedAt >= MAX_WAIT_MS) {
        window.clearInterval(poll);
        setRevealedKey(screenKey);
      }
    }, POLL_MS);
    return () => window.clearInterval(poll);
  }, [contentRef, screenKey]);

  return revealedKey === screenKey;
}
