import type { BoosterPhase } from "./boosterRenderer";

const ease = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };

/** The wrapper first clears the card; its opaque pieces then fall out of view. */
export function getBoosterMotion(elapsed: number) {
  return {
    tear: ease(elapsed / 850),
    spread: ease((elapsed - 180) / 1100),
    retreat: ease((elapsed - 650) / 500),
    drop: ease((elapsed - 1200) / 1450),
    rise: ease((elapsed - 1150) / 1150),
    flip: ease((elapsed - 1600) / 1050),
    settle: ease((elapsed - 2400) / 950),
    phase: (elapsed < 850 ? "tearing" : elapsed < 1300 ? "opening" : elapsed < 3500 ? "revealing" : "revealed") as BoosterPhase,
  };
}
