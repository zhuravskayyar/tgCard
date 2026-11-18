import { useEffect, useState } from "react";
import type { StoryTrialNavigationTarget, StoryTrialsView } from "@cardastika/shared";
import type { TutorialStatus } from "../hooks/useTutorial";
import { getTelegramInitData } from "../telegram";
import { loadStoryTrials } from "../telegram/storyTrials";
import { formatFullUiNumber, getUiLocale, translateUi } from "../i18n";
import { MenuRow } from "./MenuRow";

const tx = (value: string) => translateUi(value, getUiLocale());

/**
 * The single post-tutorial prompt on Home: shown only while the campaign is still locked behind unclaimed trials.
 * It names the next trial (the same "Далі" rule as the trials screen) and goes straight to where it is done.
 */
export function TrialsNextStep({ onOpen, onOpenTarget, tutorialResolved, tutorialStatus }: {
  onOpen: () => void;
  onOpenTarget?: (target: StoryTrialNavigationTarget, trialId: string) => void;
  tutorialResolved: boolean;
  tutorialStatus: TutorialStatus;
}) {
  const [view, setView] = useState<StoryTrialsView | null>(null);
  // Null status means "not eligible" only once the player summary and tutorial state have actually loaded.
  const tutorialDone = tutorialResolved && (!tutorialStatus || tutorialStatus === "complete");
  useEffect(() => {
    const initData = getTelegramInitData();
    if (!tutorialDone) {
      setView(null);
      return undefined;
    }
    if (!initData) return undefined;
    const controller = new AbortController();
    void loadStoryTrials(initData, controller.signal).then(setView).catch(() => undefined);
    return () => controller.abort();
  }, [tutorialDone]);
  if (!tutorialDone || !view || view.campaignUnlocked || view.totalCount <= 0) return null;
  const trials = view.trials.filter((trial) => trial.kind === "campaign");
  const rewardReady = trials.some((trial) => trial.state === "completed");
  const next = trials.find((trial) => trial.state !== "claimed");
  const target = !rewardReady && next?.state === "active" ? next.navigation : null;
  const title = rewardReady ? tx("Забери нагороду за випробування") : next ? `${tx("Далі")}: ${tx(next.title)}` : tx("Випробування");
  return (
    // A direct child of the Home menu, so it gets exactly the sizing of the rows above it.
    <MenuRow
      attention
      chevron
      detail={`${formatFullUiNumber(view.completedCount)}/${formatFullUiNumber(view.totalCount)}`}
      icon="campaign"
      illustrationSrc="/assets/ui/home/sprites/row-campaign.webp"
      metalTexture
      onClick={target && onOpenTarget ? () => onOpenTarget(target, next!.id) : onOpen}
      title={title}
    />
  );
}
