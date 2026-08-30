import { useCallback, useEffect, useState } from "react";

export const TUTORIAL_STEPS = [
  "intro",
  "duel-first-card",
  "duel-advantage",
  "duel-free-play",
  "duel-result",
  "campaign",
  "complete",
] as const;

export type TutorialStep = (typeof TUTORIAL_STEPS)[number];
export type TutorialStatus = TutorialStep | "paused" | null;

const TUTORIAL_STORAGE_PREFIX = "cardastika:interactive-tutorial:v5:";
const PREVIOUS_TUTORIAL_STORAGE_PREFIX = "cardastika:interactive-tutorial:v4:";

interface StoredTutorialState {
  paused: boolean;
  step: TutorialStep;
}

function isTutorialStep(value: unknown): value is TutorialStep {
  return typeof value === "string" && (TUTORIAL_STEPS as readonly string[]).includes(value);
}

function normalizeStoredState(parsed: Partial<StoredTutorialState>): StoredTutorialState {
  const step = parsed.step === "campaign"
    ? "complete"
    : isTutorialStep(parsed.step)
      ? parsed.step
      : "intro";
  return {
    paused: step === "complete" ? false : parsed.paused === true,
    step,
  };
}

function storageKey(playerId: string) {
  return `${TUTORIAL_STORAGE_PREFIX}${playerId}`;
}

function readState(playerId: string): StoredTutorialState {
  try {
    const currentKey = storageKey(playerId);
    const currentRaw = window.localStorage.getItem(currentKey);
    const previousRaw = window.localStorage.getItem(`${PREVIOUS_TUTORIAL_STORAGE_PREFIX}${playerId}`);
    const raw = currentRaw ?? previousRaw;
    if (!raw) return { paused: false, step: "intro" };
    const parsed = JSON.parse(raw) as Partial<StoredTutorialState>;
    if (!currentRaw) {
      return parsed.step === "campaign" || parsed.step === "complete"
        ? normalizeStoredState(parsed)
        : { paused: false, step: "intro" };
    }
    return normalizeStoredState(parsed);
  } catch {
    return { paused: false, step: "intro" };
  }
}

function writeState(playerId: string, state: StoredTutorialState) {
  try {
    window.localStorage.setItem(storageKey(playerId), JSON.stringify(state));
  } catch {
    // Telegram webviews can deny local storage; the in-memory state still works.
  }
}

export function useTutorial(playerId: string | null, eligible: boolean) {
  const [storedPlayerId, setStoredPlayerId] = useState<string | null>(null);
  const [state, setState] = useState<StoredTutorialState | null>(null);

  useEffect(() => {
    if (!playerId || !eligible) {
      setStoredPlayerId(null);
      setState(null);
      return;
    }
    setStoredPlayerId(playerId);
    setState(readState(playerId));
  }, [eligible, playerId]);

  const update = useCallback((next: StoredTutorialState) => {
    if (!storedPlayerId) return;
    setState(next);
    writeState(storedPlayerId, next);
  }, [storedPlayerId]);

  const goTo = useCallback((step: TutorialStep) => {
    if (!storedPlayerId) return;
    update({ paused: false, step });
  }, [storedPlayerId, update]);

  const pause = useCallback(() => {
    if (!storedPlayerId || !state) return;
    update({ ...state, paused: true });
  }, [state, storedPlayerId, update]);

  const resume = useCallback(() => {
    if (!storedPlayerId || !state) return;
    update({ ...state, paused: false });
  }, [state, storedPlayerId, update]);

  const replay = useCallback(() => {
    if (!storedPlayerId) return;
    update({ paused: false, step: "intro" });
  }, [storedPlayerId, update]);

  const complete = useCallback(() => {
    goTo("complete");
  }, [goTo]);

  const isReady = eligible && storedPlayerId === playerId && state !== null;
  const status: TutorialStatus = !isReady || !state
    ? null
    : state.paused
      ? "paused"
      : state.step;

  return {
    complete,
    goTo,
    isActive: status !== null && status !== "paused" && status !== "complete",
    isPaused: status === "paused",
    pause,
    replay,
    resumeStep: isReady && state?.step !== "complete" ? state.step : null,
    resume,
    status,
    step: status !== "paused" && status !== "complete" ? status : null,
    eligible,
  };
}
