import type { CardElement, CardRarity } from "@cardastika/shared";

/** CC0 Freesound recordings, round 4 of docs/audio-review (tools/audio-pick/round4.mjs levels them per group). */
export const SOUND_CUES = {
  "ui-tap": { gain: 0.8, vary: 0.05 },
  "ui-back": { gain: 0.7, vary: 0.03 },
  "nav-page": { gain: 0.5, vary: 0.04 },
  "card-flip": { gain: 0.7, vary: 0.04 },
  "pack-shake": { gain: 0.8, vary: 0 },
  "pack-tear": { gain: 1, vary: 0.03 },
  "reveal-common": { gain: 0.7, vary: 0 },
  "reveal-epic": { gain: 1, vary: 0 },
  "coins-reward": { gain: 1, vary: 0.03 },
  "battle-fly": { gain: 0.8, vary: 0.05 },
  // Duel: the attacking card's element is the voice of the strike (flight + impact);
  // the strength tier stays underneath as a quieter body layer.
  "fly-fire": { gain: 0.9, vary: 0.05 },
  "fly-water": { gain: 0.9, vary: 0.05 },
  "fly-air": { gain: 0.9, vary: 0.05 },
  "fly-earth": { gain: 0.9, vary: 0.05 },
  "hit-weak": { gain: 0.5, vary: 0.05 },
  "hit-normal": { gain: 0.5, vary: 0.04 },
  "hit-strong": { gain: 0.55, vary: 0.03 },
  "element-fire": { gain: 1, vary: 0.04 },
  "element-water": { gain: 1, vary: 0.04 },
  "element-air": { gain: 1, vary: 0.04 },
  "element-earth": { gain: 1, vary: 0.04 },
  "battle-victory": { gain: 1, vary: 0 },
  "battle-defeat": { gain: 1, vary: 0 },
  "forge-strike": { gain: 1, vary: 0.02 },
  "card-absorb": { gain: 0.9, vary: 0.03 },
  "power-tick": { gain: 0.6, vary: 0.08 },
  "card-level-up": { gain: 1, vary: 0 },
  "reward-claim": { gain: 0.9, vary: 0 },
} as const satisfies Record<string, { gain: number; vary: number }>;

export type SoundCue = keyof typeof SOUND_CUES;

export const soundCueUrl = (cue: SoundCue) => `/assets/audio/${cue}.mp3`;

/** Loaded on the first tap so ordinary buttons answer without a fetch. */
export const UI_SOUND_CUES: readonly SoundCue[] = ["ui-tap", "ui-back", "nav-page", "reward-claim"];
export const BATTLE_SOUND_CUES: readonly SoundCue[] = ["fly-fire", "fly-water", "fly-air", "fly-earth", "hit-weak", "hit-normal", "hit-strong", "element-fire", "element-water", "element-air", "element-earth", "card-flip", "battle-victory", "battle-defeat"];

export const PROGRESSION_SOUND_CUES: readonly SoundCue[] = ["card-absorb", "power-tick", "card-level-up", "reveal-epic"];

export const REWARD_SOUND_CUES: readonly SoundCue[] =["pack-shake", "pack-tear", "reveal-common", "reveal-epic", "forge-strike", "coins-reward"];

export const elementSoundCue = (element: CardElement): SoundCue => `element-${element}`;
export const flySoundCue = (element: CardElement): SoundCue => `fly-${element}`;

const RARE_REVEAL: ReadonlySet<CardRarity> = new Set(["epic", "legendary", "mythic"]);
export const revealSoundCue = (rarity: CardRarity): SoundCue => RARE_REVEAL.has(rarity) ? "reveal-epic" : "reveal-common";
