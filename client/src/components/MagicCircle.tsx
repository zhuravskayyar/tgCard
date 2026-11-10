import { forwardRef, type CSSProperties } from "react";
import type { CardElement } from "@cardastika/shared";
import { ELEMENT_FINISH } from "../cards/brightCutModel";

// Our own rune strokes, drawn in a 6x8 cell; every glyph combines two of them.
const STROKES = [
  "M0 -4V4", "M-3 -4L3 4", "M-3 4L3 -4", "M-3 -1H3", "M-3 -4L0 0L3 -4",
  "M-2 4L0 1L2 4", "M0 -3.5a1.5 1.5 0 1 0 .01 0", "M-3 3H3", "M-3 -4V0H3",
];
const GLYPHS = 18;
const SEEDS: Record<CardElement, number> = { fire: 7, water: 19, earth: 31, air: 43 };

function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

const point = (radius: number, degrees: number) => {
  const angle = (degrees - 90) * Math.PI / 180;
  return `${(radius * Math.cos(angle)).toFixed(2)} ${(radius * Math.sin(angle)).toFixed(2)}`;
};
/** Regular polygon, or a star when `step` skips vertices. */
const polygon = (sides: number, radius: number, rotation = 0, step = 1) =>
  "M" + Array.from({ length: sides }, (_, index) => point(radius, rotation + (index * step * 360) / sides)).join("L") + "Z";

const glyphCache = new Map<CardElement, string[]>();
function glyphsFor(element: CardElement) {
  let glyphs = glyphCache.get(element);
  if (!glyphs) {
    const random = seeded(SEEDS[element]);
    glyphs = Array.from({ length: GLYPHS }, () => {
      const first = Math.floor(random() * STROKES.length);
      const second = (first + 1 + Math.floor(random() * (STROKES.length - 1))) % STROKES.length;
      return STROKES[first] + STROKES[second];
    });
    glyphCache.set(element, glyphs);
  }
  return glyphs;
}

const wave = (radius: number, depth: number, waves: number) =>
  "M" + Array.from({ length: 121 }, (_, index) => point(radius + depth * Math.sin((index / 120) * waves * Math.PI * 2), index * 3)).join("L") + "Z";

/** The geometry inside the rune band: each element has its own figure. */
function ElementFigure({ element }: { element: CardElement }) {
  switch (element) {
    case "fire":
      return <path d={`${polygon(3, 70)}${polygon(3, 70, 180)}${polygon(3, 26, 180)}M0 -40a40 40 0 1 0 .01 0`} />;
    case "water":
      return <path d={`${wave(58, 3.5, 12)}${[0, 120, 240].map((angle) => { const [x, y] = point(24, angle).split(" "); return `M${x} ${Number(y) - 30}a30 30 0 1 0 .01 0`; }).join("")}M0 -12a12 12 0 1 0 .01 0`} />;
    case "earth":
      return <path d={`${polygon(4, 70)}${polygon(4, 70, 45)}${polygon(4, 34, 45)}M0 -34a34 34 0 1 0 .01 0`} />;
    case "air":
      return <path d={`${polygon(5, 70, 0, 2)}${polygon(5, 27, 36)}${[0, 120, 240].map((angle) => { const [x, y] = point(50, angle).split(" "); return `M${x} ${Number(y) - 7}a7 7 0 1 0 .01 0`; }).join("")}`} />;
  }
}

interface MagicCircleProps {
  className?: string;
  element: CardElement;
  style?: CSSProperties;
}

/** A spell seal in the card's element: two counter-rotating rings of runes around the element figure. */
export const MagicCircle = forwardRef<HTMLDivElement, MagicCircleProps>(function MagicCircle({ className = "", element, style }, ref) {
  const finish = ELEMENT_FINISH[element];
  const glyphs = glyphsFor(element);
  return (
    <div ref={ref} className={`magic-circle ${className}`} style={{ "--mc-rim": finish.rim, "--mc-core": finish.core, ...style } as CSSProperties}>
      <svg viewBox="-100 -100 200 200" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <circle className="magic-circle__disc" r="96" />
        <g className="magic-circle__outer">
          <circle r="97" strokeWidth="2.4" />
          <circle r="91" strokeWidth="1" />
          <circle r="75" strokeWidth="2" />
          <g className="magic-circle__runes" strokeWidth="1.4">
            {glyphs.map((glyph, index) => (
              <path d={glyph} key={index} transform={`rotate(${(index * 360) / GLYPHS}) translate(0 -83)`} />
            ))}
          </g>
        </g>
        <g className="magic-circle__inner" strokeWidth="1.8">
          {/* Keeps the group's box centred so it spins around the seal's middle. */}
          <circle r="70" stroke="none" />
          <ElementFigure element={element} />
          <circle className="magic-circle__core" r="6" strokeWidth="1.4" />
        </g>
      </svg>
    </div>
  );
});
