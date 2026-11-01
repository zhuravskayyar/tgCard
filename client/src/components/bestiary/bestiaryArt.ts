const ICONS = "/assets/ui/world-tree/game-icons";

// Painted art per collection. Collections without an entry use the default emblem and the plate below.
const EMBLEMS: Readonly<Record<string, string>> = {
  borderlands: "tattered-banner",
  black_forest: "element-earth",
  marsh: "equipment-voodoo",
  ash: "element-fire",
  abyss: "element-water",
  storm: "element-air",
  ice: "crystal-cluster",
  stone_halls: "dungeon-gate",
  night: "equipment-polar-star",
  ruins: "coliseum",
  dragons: "templar-shield",
  three_realms: "crenel-crown",
  alchemy: "crystal-bars",
  lost_world: "key",
  wastes: "equipment-star-circle",
};

export function collectionEmblem(code: string) {
  return `${ICONS}/${EMBLEMS[code] ?? "fleur-de-lis"}.svg`;
}

export function collectionEngraving(code: string) {
  return `/assets/ui/bestiary/engravings/${code}.webp`;
}

export const ENGRAVING_FALLBACK = "/assets/ui/trials/campaign-map-v1.webp";

// Spreads the shared fallback plate over its landscape so neighbouring entries differ until their art arrives.
export function engravingFallbackPosition(code: string) {
  let hash = 0;
  for (const character of code) hash = (hash * 31 + character.charCodeAt(0)) % 997;
  return `${8 + (hash % 85)}% 78%`;
}
