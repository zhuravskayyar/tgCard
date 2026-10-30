import type { CSSProperties } from "react";

interface DungeonGlyphProps {
  assetKey: string;
  size?: number;
}

const dungeonGlyphSources: Record<string, string> = {
  dungeon_chest: "/assets/ui/icons/icon-locked-chest-v1.webp",
  rune_fire: "/assets/ui/world-tree/game-icons/element-fire.svg",
  rune_water: "/assets/ui/world-tree/game-icons/element-water.svg",
  rune_earth: "/assets/ui/world-tree/game-icons/element-earth.svg",
  rune_air: "/assets/ui/world-tree/game-icons/element-air.svg",
  ancient_key: "/assets/ui/icons/icon-key-v1.webp",
  crystal: "/assets/ui/icons/icon-crystals-v1.webp",
  card_fragment: "/assets/ui/shop/icon_card_shard_v2.webp",
};

export function DungeonGlyph({ assetKey, size = 34 }: DungeonGlyphProps) {
  const source = dungeonGlyphSources[assetKey] ?? dungeonGlyphSources.dungeon_chest;
  if (source.endsWith(".webp")) {
    return <img alt="" aria-hidden="true" className="dungeon-glyph dungeon-glyph--image" height={size} src={source} width={size} />;
  }
  return (
    <span
      aria-hidden="true"
      className="app-icon app-icon--game dungeon-glyph"
      style={{ "--app-icon-source": `url("${source}")`, height: size, width: size } as CSSProperties}
    />
  );
}
