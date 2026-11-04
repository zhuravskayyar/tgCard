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
