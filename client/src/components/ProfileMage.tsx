import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { CardElement } from "@cardastika/shared";
import "../styles/profile-mage.css";

const IDLE_SRC = "/assets/profile/mage-idle-v1.webp";
const CAST_SRC = "/assets/profile/mage-cast-v1.webp";
const CAST_MS = 1100;
const PARTICLES = 14;

/**
 * The profile mage: an element scene behind, the ink-and-cream mage tinted by the element,
 * a pulsing orb, glowing eyes and element particles. A tap casts a short spell.
 * Positions of the orb and eyes are measured on the 1024×1536 sprites.
 */
export function ProfileMage({ element }: { element: CardElement }) {
  const [casting, setCasting] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  function cast() {
    if (casting) return;
    setCasting(true);
    timer.current = window.setTimeout(() => setCasting(false), CAST_MS);
  }

  return (
    <button
      aria-label="Маг: торкнися, щоб створити закляття"
      className={`profile-mage profile-mage--${element}${casting ? " profile-mage--casting" : ""}`}
      onClick={cast}
      type="button"
    >
      <span aria-hidden="true" className="profile-mage__scene" style={{ backgroundImage: `url("/assets/profile/bg-${element}.webp")` }} />
      <span aria-hidden="true" className="profile-mage__particles">
        {Array.from({ length: PARTICLES }, (_, index) => <i key={index} style={{ "--p": index } as CSSProperties} />)}
      </span>
      <span aria-hidden="true" className="profile-mage__figure">
        <span className="profile-mage__pose profile-mage__pose--idle" style={{ "--pose": `url("${IDLE_SRC}")` } as CSSProperties}>
          <img alt="" draggable={false} src={IDLE_SRC} />
          <i className="profile-mage__orb" />
          <i className="profile-mage__eye profile-mage__eye--left" />
          <i className="profile-mage__eye profile-mage__eye--right" />
        </span>
        <span className="profile-mage__pose profile-mage__pose--cast" style={{ "--pose": `url("${CAST_SRC}")` } as CSSProperties}>
          <img alt="" draggable={false} src={CAST_SRC} />
          <i className="profile-mage__orb" />
          <i className="profile-mage__burst" />
          <i className="profile-mage__eye profile-mage__eye--left" />
          <i className="profile-mage__eye profile-mage__eye--right" />
        </span>
      </span>
    </button>
  );
}
