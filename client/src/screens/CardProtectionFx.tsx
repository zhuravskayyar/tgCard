import { useEffect, useRef, type RefObject } from "react";
import { playCardProtectionFx, syncCardProtectionFx } from "./cardProgressionFx";

interface CardProtectionFxProps {
  active: boolean;
  targetRef: RefObject<HTMLDivElement | null>;
}

export function CardProtectionFx({ active, targetRef }: CardProtectionFxProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const previousActiveRef = useRef<boolean | null>(null);

  useEffect(() => {
    const target = targetRef.current;
    const layer = layerRef.current;
    if (!target || !layer) return;

    const previousActive = previousActiveRef.current;
    previousActiveRef.current = active;
    if (previousActive === null) {
      syncCardProtectionFx(layer, active);
    } else if (previousActive !== active) {
      playCardProtectionFx(target, layer, active);
    }
  }, [active, targetRef]);

  return <div aria-hidden="true" className="fx-layer" ref={layerRef}>
    <svg className="fx-outline" viewBox="0 0 240 312" focusable="false">
      <defs><linearGradient id="fxGold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff2b0" /><stop offset=".5" stopColor="#ffc94a" /><stop offset="1" stopColor="#fff0a0" /></linearGradient></defs>
      <path d="M17 2 H223 L238 17 V295 L223 310 H17 L2 295 V17 Z" fill="none" stroke="url(#fxGold)" strokeWidth="3" strokeLinejoin="round" />
    </svg>
    <div className="fx-sweep" />
    <div className="fx-lock">
      <svg viewBox="0 0 44 84" focusable="false">
        <defs><linearGradient id="fxLockG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff0a0" /><stop offset=".45" stopColor="#e8b43e" /><stop offset="1" stopColor="#9c6a14" /></linearGradient></defs>
        <g fill="none" stroke="#e2bd62" strokeWidth="2.2"><circle cx="22" cy="6" r="4.6" /><ellipse cx="22" cy="17" rx="3.2" ry="5.2" /><ellipse cx="22" cy="28" rx="1.6" ry="5.2" strokeWidth="3" /><ellipse cx="22" cy="38" rx="3.2" ry="5.2" /></g>
        <g className="shackle"><path d="M12 50V42A10 10 0 0 1 32 42V50" fill="none" stroke="#3a2a0b" strokeWidth="6.4" strokeLinecap="round" /><path d="M12 50V42A10 10 0 0 1 32 42V50" fill="none" stroke="#e9eef1" strokeWidth="3.6" strokeLinecap="round" /></g>
        <rect x="6" y="49" width="32" height="31" rx="5.5" fill="url(#fxLockG)" stroke="#4d3308" strokeWidth="2" /><path d="M10 54H33" stroke="#fff" strokeOpacity=".45" strokeWidth="2" strokeLinecap="round" /><circle cx="22" cy="63" r="3.8" fill="#3b2506" /><path d="M20.3 64L19.2 73H24.8L23.7 64Z" fill="#3b2506" />
      </svg>
    </div>
  </div>;
}
