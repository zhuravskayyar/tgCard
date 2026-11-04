import { useSyncExternalStore } from "react";
import { isSoundEnabled, subscribeSoundSetting } from "./soundEngine";

export * from "./cues";
export { installSoundEffects, playSound, preloadSounds, setSoundEnabled } from "./soundEngine";

export function useSoundEnabled() {
  return useSyncExternalStore(subscribeSoundSetting, isSoundEnabled, () => false);
}
