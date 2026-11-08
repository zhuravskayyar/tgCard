import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";

interface ExperienceFlaskProps {
  /** Shown progress 0..1; `useExperienceFly` already animates it and wraps it on a level-up. */
  progress: number;
  /** Zero-width anchor at the liquid's leading edge, where gained experience flies to. */
  tipRef?: RefObject<HTMLSpanElement | null>;
}

/** Share of a level that fills the glass bulb before the liquid runs on into the tube. */
const BULB_SHARE = 0.15;
// Flask canvas 1730x144: bulb centre x 70; tube channel x 170-1570.
const BULB_TIP_X = 70 / 1730;
const TUBE_LEFT = 170 / 1730;
const TUBE_WIDTH = 1400 / 1730;

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

/** HUD experience bar: an alchemical flask; amber liquid fills the bulb first, then the tube. */
export function ExperienceFlask({ progress, tipRef }: ExperienceFlaskProps) {
  const value = clamp01(progress);
  const bulbFill = Math.min(1, value / BULB_SHARE);
  const tubeFill = value <= BULB_SHARE ? 0 : (value - BULB_SHARE) / (1 - BULB_SHARE);
  const tipX = tubeFill > 0 ? TUBE_LEFT + TUBE_WIDTH * tubeFill : BULB_TIP_X;

  // A level-up shows as the hook wrapping progress from the top back to the start.
  const previous = useRef(value);
  const [flash, setFlash] = useState(0);
  useEffect(() => {
    if (value < previous.current - 0.5) setFlash((count) => count + 1);
    previous.current = value;
  }, [value]);

  const style = { "--bulb-fill": bulbFill, "--tube-fill": tubeFill } as CSSProperties;
  return (
    <span aria-hidden="true" className="experience-flask" style={style}>
      <span className={`experience-flask__bulb${bulbFill <= 0 ? " experience-flask__bulb--empty" : ""}`}>
        <span className="experience-flask__flow experience-flask__flow--bulb" />
      </span>
      <span className="experience-flask__channel">
        <span className={`experience-flask__liquid${tubeFill <= 0 ? " experience-flask__liquid--empty" : ""}`} />
        {tubeFill > 0 ? <span className="experience-flask__flow experience-flask__flow--tube" /> : null}
      </span>
      <span className="experience-flask__brass" />
      <span className="experience-flask__tip" ref={tipRef} style={{ left: `${tipX * 100}%` }} />
      {flash > 0 ? <span className="experience-flask__flash" key={flash} /> : null}
    </span>
  );
}
