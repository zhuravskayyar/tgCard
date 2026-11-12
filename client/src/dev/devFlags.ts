// Development-only switches for testing on a phone. `?allMythic=1` / `?fps=1` turn one on and it is
// remembered in this browser; `=0` turns it off. Production builds never read them (import.meta.env.DEV).

function readFlag(name: string) {
  if (!import.meta.env.DEV || typeof window === "undefined") return false;
  try {
    const key = `cardastika.dev.${name}`;
    const value = new URLSearchParams(window.location.search).get(name);
    if (value !== null) localStorage.setItem(key, value === "0" ? "0" : "1");
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

/** Every card plate is drawn in one rarity's material (`?allLegendary=1` wins over `?allMythic=1`); game data stays untouched. */
export const DEV_FORCED_RARITY: "legendary" | "mythic" | null = readFlag("allLegendary") ? "legendary" : readFlag("allMythic") ? "mythic" : null;
const DEV_MIX_RARITY = readFlag("mixRarity");
const mixedRarityByArt = new Map<string, "legendary" | "mythic">();
/** `?mixRarity=1`: the first 3 distinct card arts on screen are legendary, every other one mythic, for side-by-side comparison. */
export function devForcedRarity(artKey: string | null | undefined): "legendary" | "mythic" | null {
  if (!DEV_MIX_RARITY) return DEV_FORCED_RARITY;
  const key = artKey ?? "";
  let rarity = mixedRarityByArt.get(key);
  if (!rarity) {
    rarity = mixedRarityByArt.size < 3 ? "legendary" : "mythic";
    mixedRarityByArt.set(key, rarity);
  }
  return rarity;
}
/** A small corner readout of frames per second and card shader repaints per second. */
export const DEV_FPS = readFlag("fps");
