import type { CSSProperties } from "react";
import { CARD_ELEMENTS, type CardElement } from "@cardastika/shared";
import { getElementMultiplier } from "@cardastika/game-core";
import { ElementMedallion } from "./ElementMedallion";

const ELEMENT_NAMES: Readonly<Record<CardElement, string>> = { fire: "вогонь", water: "вода", earth: "земля", air: "повітря" };
/** Accusative, for "вогонь б'є повітря, повітря б'є землю…". */
const ELEMENT_TARGETS: Readonly<Record<CardElement, string>> = { fire: "вогонь", water: "воду", earth: "землю", air: "повітря" };

/** The element each one hits for ×1.5, walked from fire, so the wheel always follows the game rules. */
function strongCycle(): CardElement[] {
  const cycle: CardElement[] = ["fire"];
  while (cycle.length < CARD_ELEMENTS.length) {
    const last = cycle[cycle.length - 1]!;
    const next = CARD_ELEMENTS.find((defender) => getElementMultiplier(last, defender) === 1.5);
    if (!next || cycle.includes(next)) break;
    cycle.push(next);
  }
  return cycle;
}

// Medallions sit at the top, right, bottom and left; clockwise arrows point from attacker to the element it beats.
const POSITIONS = [{ x: 50, y: 13 }, { x: 87, y: 50 }, { x: 50, y: 87 }, { x: 13, y: 50 }] as const;
const ARCS = [
  "M64 17 Q82 18 83 36",
  "M83 64 Q82 82 64 83",
  "M36 83 Q18 82 17 64",
  "M17 36 Q18 18 36 17",
] as const;

/** A compact wheel of the four elements: each arrow shows which element hits the next one ×1.5. */
export function ElementCycle({ size = 96 }: { size?: number }) {
  const cycle = strongCycle();
  const label = cycle.map((element, index) => `${ELEMENT_NAMES[element]} б'є ${ELEMENT_TARGETS[cycle[(index + 1) % cycle.length]!]}`).join(", ");
  return (
    <figure aria-label={`Коло стихій: ${label} — удар ×1,5; у зворотний бік ×0,5`} className="element-cycle" role="img" style={{ "--element-cycle-size": `${size}px` } as CSSProperties}>
      <svg aria-hidden="true" className="element-cycle__arrows" viewBox="0 0 100 100">
        <defs>
          <marker id="element-cycle-head" markerHeight="5" markerWidth="5" orient="auto" refX="3.5" refY="2.5" viewBox="0 0 5 5">
            <path d="M0 0 5 2.5 0 5Z" />
          </marker>
        </defs>
        {ARCS.map((arc) => <path d={arc} key={arc} markerEnd="url(#element-cycle-head)" />)}
      </svg>
      {cycle.map((element, index) => (
        <span className="element-cycle__node" key={element} style={{ left: `${POSITIONS[index]!.x}%`, top: `${POSITIONS[index]!.y}%` }}>
          <ElementMedallion element={element} size={Math.round(size * 0.27)} />
        </span>
      ))}
      <span aria-hidden="true" className="element-cycle__center">×1,5</span>
    </figure>
  );
}
