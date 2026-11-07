/** Fired when the player's diamond balance grows, so the HUD can show and count up the gain. */
export const DIAMOND_GAIN_EVENT = "cardastika:diamond-gain";

export interface DiamondGainDetail {
  from: number;
  to: number;
}

let knownBalance: number | null = null;

/** Records the latest server balance; the first value is only a baseline, a later rise announces a gain. */
export function reportDiamondBalance(balance: number) {
  const previous = knownBalance;
  knownBalance = balance;
  if (previous === null || balance <= previous || typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<DiamondGainDetail>(DIAMOND_GAIN_EVENT, { detail: { from: previous, to: balance } }));
}
