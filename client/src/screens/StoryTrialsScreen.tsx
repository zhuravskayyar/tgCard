import { useCallback, useEffect, useState } from "react";
import type { PlayerSummary, StoryTrialNavigationTarget, StoryTrialView, StoryTrialsView } from "@cardastika/shared";
import { AccountProtectionTask } from "../components/AccountProtectionTask";
import { AppIcon, type AppIconName } from "../components/AppIcon";
import { CurrencyIcon } from "../components/CurrencyDisplay";
import { MenuRow } from "../components/MenuRow";
import { ScreenHeading } from "../components/ScreenHeading";
import { formatFullUiNumber, getUiLocale, translateUi } from "../i18n";
import { getTelegramInitData } from "../telegram";
import { claimStoryTrial, loadStoryTrials, SAVE_PROFILE_TRIAL_ID } from "../telegram/storyTrials";
import { CampaignGiver } from "./CampaignScreens";

const tx = (value: string) => translateUi(value, getUiLocale());

const trialActions: Record<StoryTrialNavigationTarget, { icon: AppIconName; label: string }> = {
  collections: { icon: "collection", label: "Колекції" },
  tasks: { icon: "tasks", label: "Завдання" },
  arena: { icon: "arena", label: "Арена" },
  weak: { icon: "weak-cards", label: "Слабкі карти" },
  guild: { icon: "guild", label: "Гільдія" },
  "battle-pass": { icon: "battle-pass", label: "Бойовий пропуск" },
  deck: { icon: "card-strength", label: "Бойова колода" },
  duel: { icon: "duel", label: "Дуелі" },
  "save-profile": { icon: "tasks", label: "Зберегти" },
  shop: { icon: "shop", label: "Магазин" },
};

function StoryTrialRow({ onClaim, onOpen, pending, trial }: {
  onClaim: () => void;
  onOpen: () => void;
  pending: boolean;
  trial: StoryTrialView;
}) {
  const action = trial.navigation ? trialActions[trial.navigation] : null;
  const completed = trial.state === "completed";
  const claimed = trial.state === "claimed";
  const done = completed || claimed;
  return (
    <article className={`quest-paper story-notice${trial.navigation === "save-profile" ? " story-notice--official" : ""}${claimed ? " quest-paper--claimed" : completed ? " quest-paper--completed" : ""}`}>
      <span aria-hidden="true" className="story-notice__nail" />
      <div className="quest-paper__content">
        <header className="quest-paper__header">
          <span className="quest-paper__icon"><AppIcon name={done ? "card-reward" : action?.icon ?? "tasks"} size={22} /></span>
          <div className="quest-paper__title"><strong>{tx(trial.title)}</strong></div>
          <span className="quest-paper__reward story-trials__reward">
            {trial.reward.gold ? <span data-reward-source={completed ? "gold" : undefined}>+{formatFullUiNumber(trial.reward.gold)}<CurrencyIcon kind="gold" size={15} /></span> : null}
            {trial.reward.silver ? <span data-reward-source={completed ? "silver" : undefined}>+{formatFullUiNumber(trial.reward.silver)}<CurrencyIcon kind="silver" size={15} /></span> : null}
          </span>
        </header>
        <div className="quest-paper__progress">
          <div className="quest-paper__progress-head"><span>{tx("Прогрес")}</span><strong>{formatFullUiNumber(trial.progress)} / {formatFullUiNumber(trial.target)}</strong></div>
          <span aria-label={tx(`Прогрес: ${formatFullUiNumber(trial.progress)} з ${formatFullUiNumber(trial.target)}`)} aria-valuemax={trial.target} aria-valuemin={0} aria-valuenow={trial.progress} className="quest-paper__track" role="progressbar">
            <span style={{ width: `${Math.min(100, trial.progress / trial.target * 100)}%` }} />
          </span>
        </div>
        <footer className="quest-paper__footer">
          {done
            ? <img alt={tx(claimed ? "Нагороду забрано" : "Випробування пройдено!")} className="story-notice__seal" src="/assets/ui/trials/board/seal-v1.webp" />
            : <span className="quest-paper__status">{tx(trial.available ? "Виконай випробування" : "Скоро")}</span>}
          {claimed ? (
            <span className="quest-paper__status quest-paper__status--done">{tx("Нагороду забрано")}</span>
          ) : completed ? (
            <button className="quest-paper__button quest-paper__button--claim" disabled={pending} onClick={onClaim} type="button">
              {tx(pending ? "Забираємо…" : "Забрати нагороду")}
            </button>
          ) : trial.available && action ? (
            <button className="quest-paper__button quest-paper__button--action" onClick={onOpen} type="button">
              <AppIcon name={action.icon} size={15} />
              {tx(action.label)}
            </button>
          ) : null}
        </footer>
      </div>
    </article>
  );
}

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; view: StoryTrialsView };

/** Loads the current location's one-off trials and claims their rewards; shared by the story screen and the tasks board. */
function useStoryTrials(onBalanceChange: (player: Pick<PlayerSummary, "gold" | "silver">) => void) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimNotice, setClaimNotice] = useState<string | null>(null);

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
      })
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setState({ status: "error" });
      });
  }, []);

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
      setClaimNotice(`Пройдено випробування з пригоди «${response.trials.story.caveName}»`);
    } catch {
      setClaimError("Не вдалося забрати нагороду. Спробуй ще раз.");
    } finally {
      setPendingId(null);
    }
  }

  return { claim, claimError, claimNotice, load, pendingId, state };
}

/** Every trial of the location stays pinned in place; claimed ones keep their seal instead of vanishing. */
function StoryTrialsList({ claim, onNavigate, pendingId, view }: {
  claim: (trialId: string) => Promise<void>;
  onNavigate: (target: StoryTrialNavigationTarget) => void;
  pendingId: string | null;
  view: StoryTrialsView;
}) {
  return (
    <section className="story-trials__list notice-board" aria-label="Випробування">
      <p className="story-trials__progress notice-board__plaque">{tx(`Прогрес випробувань: ${formatFullUiNumber(view.completedCount)} з ${formatFullUiNumber(view.totalCount)}`)}</p>
      {view.trials.filter((trial) => trial.kind === "campaign").map((trial) => (
        <StoryTrialRow
          key={trial.id}
          onClaim={() => void claim(trial.id)}
          onOpen={() => { if (trial.navigation) onNavigate(trial.navigation); }}
          pending={pendingId === trial.id}
          trial={trial}
        />
      ))}
    </section>
  );
}

function StoryTrialsStatus({ load, state }: { load: () => void; state: LoadState }) {
  if (state.status === "loading") return <div className="battle-pass-state">{tx("Відновлюємо випробування…")}</div>;
  if (state.status === "error") {
    return (
      <div className="battle-pass-state">
        <span>{tx("Не вдалося завантажити випробування")}</span>
        <button onClick={() => load()} type="button">{tx("Спробувати ще раз")}</button>
      </div>
    );
  }
  return null;
}

/** The campaign group of the tasks board: the same server trials as the story screen. */
export function CampaignTasksBoard({ onBalanceChange, onNavigate }: {
  onBalanceChange: (player: Pick<PlayerSummary, "gold" | "silver">) => void;
  onNavigate: (target: StoryTrialNavigationTarget) => void;
}) {
  const { claim, claimError, claimNotice, load, pendingId, state } = useStoryTrials(onBalanceChange);
  const view = state.status === "ready" ? state.view : null;
  return (
    <>
      <StoryTrialsStatus load={load} state={state} />
      {view ? (
        <>
          <p className="adventure-plate">{tx(`Щоб пройти пригоду «${tx(view.story.caveName)}», пройди всі випробування.`)}</p>
          {claimNotice ? <p className="adventure-plate" role="status">{tx(claimNotice)}</p> : null}
          {claimError ? <p className="campaign-claim-error" role="alert">{tx(claimError)}</p> : null}
          <StoryTrialsList claim={claim} onNavigate={onNavigate} pendingId={pendingId} view={view} />
        </>
      ) : null}
    </>
  );
}

export function StoryTrialsScreen({ onBack, onBalanceChange, onNavigate, onOpenCampaign }: {
  onBack: () => void;
  onBalanceChange: (player: Pick<PlayerSummary, "gold" | "silver">) => void;
  onNavigate: (target: StoryTrialNavigationTarget) => void;
  onOpenCampaign: () => void;
}) {
  const { claim, claimError, claimNotice, load, pendingId, state } = useStoryTrials(onBalanceChange);
  const view = state.status === "ready" ? state.view : null;
  return (
    <div className="story-trials-screen notice-board-screen tasks-screen">
      <ScreenHeading onBack={onBack} title={tx(view?.story.title ?? "Випробування")} titleFirst />
      <StoryTrialsStatus load={load} state={state} />
      {view ? (
        <>
          <CampaignGiver view={view} />
          <p className="adventure-plate">{tx(`Щоб пройти пригоду «${tx(view.story.caveName)}», пройди всі випробування.`)}</p>
          {claimNotice ? <p className="adventure-plate" role="status">{tx(claimNotice)}</p> : null}
          {claimError ? <p className="campaign-claim-error" role="alert">{tx(claimError)}</p> : null}
          <StoryTrialsList claim={claim} onNavigate={onNavigate} pendingId={pendingId} view={view} />
          <MenuRow compact icon="campaign" metalTexture onClick={onOpenCampaign} title={tx("Кампанія")} />
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
