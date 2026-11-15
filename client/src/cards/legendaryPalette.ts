// The one gold palette of the legendary card material: antique gold over dark bronze with warm white-gold highlights.
// The shader reads the RGB triplets (injected as GLSL constants); CSS layers read the hex values via legendaryCssVariables.
export const LEGENDARY_PALETTE = {
  bronzeDark: "#2b1a0a",
  bronze: "#6e4721",
  antiqueGold: "#c9a24a",
  warmGold: "#e9c978",
  highlight: "#fff1c8",
} as const;

export type LegendaryPaletteKey = keyof typeof LEGENDARY_PALETTE;

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

function toGlslVec3(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  return `vec3(${r.toFixed(3)}, ${g.toFixed(3)}, ${b.toFixed(3)})`;
}

/** GLSL constant block shared by the legendary branch of the card shader. */
export const LEGENDARY_GLSL_CONSTANTS = (Object.keys(LEGENDARY_PALETTE) as LegendaryPaletteKey[])
  .map((key) => `const vec3 LEG_${key.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()} = ${toGlslVec3(LEGENDARY_PALETTE[key])};`)
  .join("\n");

/** CSS custom properties for any non-shader legendary layer (aureole, profile glow). */
export const LEGENDARY_CSS_VARIABLES: Readonly<Record<string, string>> = {
  "--legendary-bronze-dark": LEGENDARY_PALETTE.bronzeDark,
  "--legendary-bronze": LEGENDARY_PALETTE.bronze,
  "--legendary-gold": LEGENDARY_PALETTE.antiqueGold,
  "--legendary-gold-warm": LEGENDARY_PALETTE.warmGold,
  "--legendary-highlight": LEGENDARY_PALETTE.highlight,
};

export function installLegendaryCssVariables(root: HTMLElement = document.documentElement) {
  for (const [name, value] of Object.entries(LEGENDARY_CSS_VARIABLES)) root.style.setProperty(name, value);
}
