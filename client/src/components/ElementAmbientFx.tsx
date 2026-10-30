import type { CSSProperties } from "react";

type ElementFx = "fire" | "water" | "air" | "earth";

const PARTICLE_COUNTS: Record<ElementFx, number> = { fire: 16, water: 12, air: 9, earth: 7 };
const ELEMENTS = Object.keys(PARTICLE_COUNTS) as ElementFx[];

// Fixed golden-ratio spread keeps particles even without random values on render.
function spread(index: number) {
  return (index * 0.618034) % 1;
}

function particleStyle(index: number): CSSProperties {
  const position = spread(index + 1);
  return {
    "--fx-x": `${Math.round(position * 100)}%`,
    "--fx-y": `${Math.round(spread(index + 7) * 100)}%`,
    "--fx-size": `${(0.7 + spread(index + 3) * 0.7).toFixed(2)}`,
    "--fx-delay": `${(-spread(index + 5) * 7).toFixed(2)}s`,
    "--fx-duration": `${(3.5 + spread(index + 11) * 4).toFixed(2)}s`,
    "--fx-drift": `${Math.round((spread(index + 13) - 0.5) * 60)}px`,
  } as CSSProperties;
}

export function ElementAmbientFx({ desktopOnly = false }: { desktopOnly?: boolean }) {
  return (
    <div aria-hidden="true" className={`element-fx${desktopOnly ? " element-fx--desktop-only" : ""}`}>
      {ELEMENTS.map((element) => (
        <div className={`element-fx__zone element-fx__zone--${element}`} key={element}>
          <span className="element-fx__glow" />
          {Array.from({ length: PARTICLE_COUNTS[element] }, (_, index) => (
            <span className="element-fx__particle" key={index} style={particleStyle(index)} />
          ))}
        </div>
      ))}
    </div>
  );
}
