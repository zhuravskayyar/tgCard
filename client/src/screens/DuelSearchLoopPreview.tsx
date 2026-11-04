import { useEffect, useState } from "react";
import type { DuelSearchResponse } from "@cardastika/shared";
import { DuelSearchExperience, type DuelSearchExperiencePhase } from "./DuelSearchExperience";

const SEARCH_MS = 3_500;
const PREVIEW_MS = 3_200;

// Dev-only sample, shown on /duel?searchLoop=1 to review the animation without any requests.
const SAMPLE_SEARCH = {
  searchId: "preview",
  opponent: { effectiveDeckPower: 118, level: 2, name: "Суперник", photoUrl: null, powerDifferencePct: 4 },
} as unknown as DuelSearchResponse;

export function isDuelSearchLoopPreview() {
  return import.meta.env.DEV && new URLSearchParams(window.location.search).has("searchLoop");
}

export function DuelSearchLoopPreview() {
  const [phase, setPhase] = useState<DuelSearchExperiencePhase>("searching");

  useEffect(() => {
    const timer = window.setTimeout(
      () => setPhase((current) => current === "searching" ? "preview" : "searching"),
      phase === "searching" ? SEARCH_MS : PREVIEW_MS,
    );
    return () => window.clearTimeout(timer);
  }, [phase]);

  return (
    <div className="duel-page duel-search-screen">
      <DuelSearchExperience onAttack={() => undefined} onCancel={() => undefined} onSearchAgain={() => undefined} phase={phase} search={SAMPLE_SEARCH} />
    </div>
  );
}
