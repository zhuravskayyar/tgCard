import { useCallback, useEffect, useState } from "react";
import type { CampaignDialogue, PlayerSummary, StoryTrialNavigationTarget, StoryTrialView, StoryTrialsView } from "@cardastika/shared";
import { AccountProtectionTask } from "../components/AccountProtectionTask";
import { AppIcon, type AppIconName } from "../components/AppIcon";
import { CurrencyIcon } from "../components/CurrencyDisplay";
import { MenuRow } from "../components/MenuRow";
import { ScreenHeading } from "../components/ScreenHeading";
import { getTelegramInitData } from "../telegram";
import { claimStoryTrial, loadStoryTrials, SAVE_PROFILE_TRIAL_ID } from "../telegram/storyTrials";
import { CampaignDialogueView } from "./CampaignScreens";

const trialActions: Record<StoryTrialNavigationTarget, { icon: AppIconName; label: string }> = {
  deck: { icon: "card-strength", label: "Бойова колода" },
  duel: { icon: "duel", label: "Дуелі" },
  "save-profile": { icon: "tasks", label: "Зберегти" },
  shop: { icon: "shop", label: "Магазин" },
};

function toDialogue(view: StoryTrialsView): CampaignDialogue {
  return {
    emotion: "sad",
    id: "story_trials_intro",
    mascotId: "lariska",
    mascotName: "Лариска",
    text: view.story.text,
    trigger: "campaign_start",
  };
}

function StoryTrialRow({ onClaim, onOpen, pending, trial }: {
  onClaim: () => void;
  onOpen: () => void;
  pending: boolean;
  trial: StoryTrialView;
}) {
  const action = trialActions[trial.navigation];
  const completed = trial.state === "completed";
  return (
    <article className={`quest-paper story-notice${trial.navigation === "save-profile" ? " story-notice--official" : ""}${completed ? " quest-paper--completed" : ""}`}>
      <span aria-hidden="true" className="story-notice__nail" />
      <div className="quest-paper__content">
        <header className="quest-paper__header">
          <span className="quest-paper__icon"><AppIcon name={completed ? "card-reward" : action.icon} size={22} /></span>
          <div className="quest-paper__title"><strong>{trial.title}</strong></div>
          <span className="quest-paper__reward story-trials__reward">
            {trial.reward.gold ? <span data-reward-source={completed ? "gold" : undefined}>+{trial.reward.gold}<CurrencyIcon kind="gold" size={15} /></span> : null}
            {trial.reward.silver ? <span data-reward-source={completed ? "silver" : undefined}>+{trial.reward.silver}<CurrencyIcon kind="silver" size={15} /></span> : null}
          </span>
        </header>
        <div className="quest-paper__progress">
          <div className="quest-paper__progress-head"><span>Прогрес</span><strong>{trial.progress} / {trial.target}</strong></div>
          <span aria-label={`Прогрес: ${trial.progress} з ${trial.target}`} aria-valuemax={trial.target} aria-valuemin={0} aria-valuenow={trial.progress} className="quest-paper__track" role="progressbar">
            <span style={{ width: `${Math.min(100, trial.progress / trial.target * 100)}%` }} />
          </span>
        </div>
        <footer className="quest-paper__footer">
          {completed
            ? <img alt="Випробування пройдено!" className="story-notice__seal" src="/assets/ui/trials/board/seal-v1.webp" />
            : <span className="quest-paper__status">Виконай випробування</span>}
          {completed ? (
            <button className="quest-paper__button quest-paper__button--claim" disabled={pending} onClick={onClaim} type="button">
              {pending ? "Забираємо…" : "Забрати нагороду"}
            </button>
          ) : (
            <button className="quest-paper__button quest-paper__button--action" onClick={onOpen} type="button">
              <AppIcon name={action.icon} size={15} />
              {action.label}
            </button>
          )}
        </footer>
      </div>
    </article>
  );
}

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; view: StoryTrialsView };

export function StoryTrialsScreen({ onBack, onBalanceChange, onNavigate, onOpenCampaign, onUnlockedChange }: {
  onBack: () => void;
  onBalanceChange: (player: Pick<PlayerSummary, "gold" | "silver">) => void;
  onNavigate: (target: StoryTrialNavigationTarget) => void;
  onOpenCampaign: () => void;
  onUnlockedChange: (unlocked: boolean) => void;
}) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);

  const load = useCallback((signal?: AbortSignal) => {
    const initData = getTelegramInitData();
    if (!initData) {
      setState({ status: "error" });
      return;
    }
    setState({ status: "loading" });
    void loadStoryTrials(initData, signal)
      .then((view) => {
        setState({ status: "ready", view });
        onUnlockedChange(view.campaignUnlocked);
      })
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setState({ status: "error" });
      });
  }, [onUnlockedChange]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function claim(trialId: string) {
    const initData = getTelegramInitData();
    if (!initData || pendingId) return;
    setPendingId(trialId);
    setClaimError(null);
    try {
      const response = await claimStoryTrial(initData, trialId);
      onBalanceChange(response.player);
      // The notice stays on the board while its reward flies out.
      await new Promise((resolve) => window.setTimeout(resolve, 1_100));
      setState({ status: "ready", view: response.trials });
      onUnlockedChange(response.trials.campaignUnlocked);
    } catch {
      setClaimError("Не вдалося забрати нагороду. Спробуй ще раз.");
    } finally {
      setPendingId(null);
    }
  }

  const view = state.status === "ready" ? state.view : null;
  return (
    <div className="story-trials-screen notice-board-screen tasks-screen">
      <ScreenHeading onBack={onBack} title={view?.story.title ?? "Випробування"} titleFirst />
      {state.status === "loading" ? <div className="battle-pass-state">Відновлюємо випробування…</div> : null}
      {state.status === "error" ? (
        <div className="battle-pass-state">
          <span>Не вдалося завантажити випробування</span>
          <button onClick={() => load()} type="button">Спробувати ще раз</button>
        </div>
      ) : null}
      {view ? (
        <>
          <CampaignDialogueView dialogue={toDialogue(view)} />
          {claimError ? <p className="campaign-claim-error" role="alert">{claimError}</p> : null}
          <section className="story-trials__list notice-board" aria-label="Випробування">
            <p className="story-trials__progress notice-board__plaque">Прогрес випробувань: {view.completedCount} з {view.totalCount}</p>
            {view.trials.filter(({ state: trialState }) => trialState !== "claimed").map((trial) => (
              <StoryTrialRow
                key={trial.id}
                onClaim={() => void claim(trial.id)}
                onOpen={() => onNavigate(trial.navigation)}
                pending={pendingId === trial.id}
                trial={trial}
              />
            ))}
          </section>
          <MenuRow compact icon="campaign" metalTexture onClick={onOpenCampaign} title="Кампанія" />
        </>
      ) : null}
    </div>
  );
}

export function SaveProfileScreen({ onBack, onBalanceChange }: {
  onBack: () => void;
  onBalanceChange: (player: Pick<PlayerSummary, "gold" | "silver">) => void;
}) {
  const syncReward = useCallback(() => {
    const initData = getTelegramInitData();
    if (!initData) return;
    void claimStoryTrial(initData, SAVE_PROFILE_TRIAL_ID)
      .then((response) => onBalanceChange(response.player))
      .catch(() => undefined);
  }, [onBalanceChange]);

  return (
    <div className="story-trials-screen notice-board-screen tasks-screen">
      <ScreenHeading onBack={onBack} title="Збереження профілю" titleFirst />
      <AccountProtectionTask onRewardGranted={syncReward} />
    </div>
  );
}
