import type { StoryTrialNavigationTarget } from "@cardastika/shared";

/** One hint: the `data-tutorial-target` marker it points at and Lariska's line about it. */
export interface TrialGuideStep {
  target: string;
  text: string;
  /** Show only while this trial is still unfinished (first adventure ids). */
  whenTrialActive?: string;
  /** Speak about the screen without a spotlight on the marker. */
  noPointer?: boolean;
  /** A button in the bubble that heads off to another trial with its own guide. */
  action?: { label: string; trialId: string; target: StoryTrialNavigationTarget };
  /** Only point at the target when it is enabled and marked `data-ready` (an affordable buy button). */
  requireReady?: boolean;
}

export interface TrialGuide {
  /** App screens the hint lives on; leaving them ends the guide. */
  screens: readonly string[];
  /** Ordered steps; the last one present on screen wins, so a deeper screen overrides its parent. */
  steps: readonly TrialGuideStep[];
}

const DUEL_GUIDE: TrialGuide = {
  screens: ["duel"],
  steps: [
    { target: "duel-attack", text: "Натисни «Напасти» — бій почнеться одразу." },
    { target: "duel-again", text: "Тисни «Ще дуель» — грай далі, щоб виконати завдання." },
    // A lost duel turns into a reason to visit the shop while that trial is still open.
    {
      target: "duel-lost",
      text: "Суперник виявився трохи сильнішим. Купи нові карти — і твоя колода стане міцнішою!",
      whenTrialActive: "buy-cards",
      noPointer: true,
      action: { label: "До магазину", trialId: "buy-cards", target: "shop" },
    },
  ],
};

/** Step-by-step hints for the first adventure's trials only, keyed by trial id; later adventures reuse targets with other goals. */
export const TRIAL_GUIDES: Readonly<Record<string, TrialGuide>> = {
  "first-duel-win": { screens: ["duel"], steps: [DUEL_GUIDE.steps[0]!] },
  "play-duels": DUEL_GUIDE,
  "buy-cards": {
    screens: ["shop"],
    steps: [
      { target: "shop-cards-category", text: "Відкрий «Магічні карти»." },
      { target: "shop-basic-offer", text: "Натисни «Купити» — карта одразу потрапить у колекцію.", requireReady: true },
      { target: "shop-continue", text: "Чудово! Купуй далі, доки не збереш 4 карти." },
    ],
  },
  "upgrade-cards": {
    screens: ["deck", "card"],
    steps: [
      { target: "deck-card", text: "Торкнися карти, щоб відкрити її." },
      { target: "deck-card-free", text: "Зелена стрілка — безкоштовна прокачка. Торкнися цієї карти." },
      // On the card: burning weak cards comes first, then the free level-up, gold only when nothing is left to burn.
      { target: "card-level-up", text: "Слабких карт більше немає — підніми рівень за золото." },
      { target: "card-absorb-one", text: "Торкнися слабкої карти — вона згорить і посилить цю." },
      { target: "card-absorb", text: "Спали слабкі карти — прокачка стане дешевшою, аж до безкоштовної." },
      { target: "card-level-up-free", text: "Тепер прокачка безкоштовна — тисни!" },
      { target: "confirm-absorb", text: "Підтверди — слабкі карти згорять і посилять цю." },
      { target: "confirm-level-up", text: "Підтверди прокачку." },
    ],
  },
  "save-profile": {
    screens: ["save-profile"],
    steps: [
      { target: "save-profile-actions", text: "Прив’яжи Google або Telegram — і забирай 500 золота." },
    ],
  },
};

export function getTrialGuide(trialId: string | null | undefined) {
  return trialId ? TRIAL_GUIDES[trialId] ?? null : null;
}
