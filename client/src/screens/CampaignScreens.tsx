import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CampaignBossView,
  CampaignDialogue,
  CampaignNavigationTarget,
  CampaignQuestView,
  CampaignView,
  PlayerSummary,
} from "@cardastika/shared";
import { AppIcon } from "../components/AppIcon";
import { CardArtwork } from "../components/CardArtwork";
import { CardHud } from "../components/CardHud";
import { CurrencyIcon } from "../components/CurrencyDisplay";
import { FirstVisitHint } from "../components/FirstVisitHint";
import { Lariska } from "../components/Lariska";
import { MenuRow } from "../components/MenuRow";
import { MenuTextureSlices } from "../components/MenuTextureSlices";
import { ResourceIcon } from "../components/ResourceIcon";
import { getTelegramInitData, getTelegramWebApp } from "../telegram";
import {
  CampaignApiError,
  claimCampaignQuest,
  loadActiveCampaignBoss,
  loadCampaign,
  loadCampaignBoss,
  startCampaignBoss,
  submitCampaignBossAction,
} from "../telegram/campaign";
import { BattleCard, BattleLog, HpPanel } from "./DuelScreen";

const LAST_CAMPAIGN_BOSS_KEY = "cardastika:last-campaign-boss-id";
const CAMPAIGN_BOSS_REVEALED_KEY = "cardastika:campaign-boss-revealed";
const DEFAULT_TELEGRAM_BOT_USERNAME = "cardastikabot";
const BOSS_UNLOCK_STORY = {
  emotion: "sly",
  id: "boss_unlock_story",
  mascotId: "lariska",
  mascotName: "Лариска",
  text: ["Слід обривається тут… Ні. Воно вже знає, що ми прийшли."],
  trigger: "boss_unlocked",
} satisfies CampaignDialogue;

function CampaignHeading({ eyebrow, onBack, title, titleFirst = false }: {
  eyebrow: string;
  onBack: () => void;
  title: string;
  titleFirst?: boolean;
}) {
  return (
    <header className={`campaign-heading${titleFirst ? " campaign-heading--title-first" : ""}`}>
      <button aria-label="Назад" onClick={onBack} type="button"><AppIcon name="chevron" size={18} /></button>
      <div>
        {titleFirst ? <><h1>{title}</h1><span>{eyebrow}</span></> : <><span>{eyebrow}</span><h1>{title}</h1></>}
      </div>
    </header>
  );
}

export function CampaignDialogueView({ dialogue, onAction, onNext }: {
  dialogue: CampaignDialogue;
  onAction?: (target: CampaignNavigationTarget) => void;
  onNext?: () => void;
}) {
  return (
    <section className={`campaign-dialogue campaign-dialogue--${dialogue.emotion}`}>
      <div className="campaign-dialogue__sprite" aria-hidden="true">
        <Lariska emotion={dialogue.emotion} />
      </div>
      <div className="campaign-dialogue__body">
        <strong>{dialogue.mascotName}</strong>
        {dialogue.text.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        <div className="campaign-dialogue__actions">
          {onNext ? <button onClick={onNext} type="button">Далі</button> : null}
          {dialogue.action && onAction ? (
            <button className="campaign-dialogue__action" onClick={() => onAction(dialogue.action!)} type="button">
              Перейти
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function BoostStatus({ expiresAt, multiplier }: { expiresAt: string | null; multiplier: 1 | 2 }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt || multiplier !== 2) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [expiresAt, multiplier]);
  if (!expiresAt || multiplier !== 2) return null;
  const remaining = Math.max(0, new Date(expiresAt).getTime() - now);
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor(remaining % 3_600_000 / 60_000);
  const seconds = Math.floor(remaining % 60_000 / 1_000);
  return (
    <div className="campaign-boost" role="status">
      <strong>×2</strong>
      <span><ResourceIcon kind="xp" size={15} /> Бойові XP і <CurrencyIcon kind="silver" size={15} /> срібло</span>
      <time>{String(hours).padStart(2, "0")}:{String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}</time>
    </div>
  );
}

type CampaignLoadState =
  | { status: "loading" }
  | { status: "ready"; campaign: CampaignView }
  | { status: "error"; message: string };

function useCampaign(): CampaignLoadState {
  const [state, setState] = useState<CampaignLoadState>({ status: "loading" });
  useEffect(() => {
    const initData = getTelegramInitData();
    if (!initData) {
      setState({ status: "error", message: "Кампанія доступна лише в Telegram Mini App" });
      return;
    }
    const controller = new AbortController();
    void loadCampaign(initData, controller.signal)
      .then((campaign) => setState({ status: "ready", campaign }))
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "error", message: "Не вдалося завантажити кампанію" });
      });
    return () => controller.abort();
  }, []);
  return state;
}

export function CampaignScreen({ onBack, onCampaignCompleted, onOpenBoss, onOpenStage }: {
  onBack: () => void;
  onCampaignCompleted: () => void;
  onOpenBoss: () => void;
  onOpenStage: (stageId: string) => void;
}) {
  const state = useCampaign();
  const completionNotified = useRef(false);
  useEffect(() => {
    if (state.status === "ready" && state.campaign.completedAt && !completionNotified.current) {
      completionNotified.current = true;
      onCampaignCompleted();
    }
  }, [onCampaignCompleted, state]);
  const activeStage = state.status === "ready"
    ? state.campaign.stages.find(({ state: stageState }) => stageState === "active") ?? null
    : null;
  const visibleStages = state.status === "ready"
    ? activeStage ? [activeStage] : state.campaign.stages.slice(-1)
    : [];
  return (
    <div className="campaign-screen">
      <CampaignHeading eyebrow="Шлях гравця" onBack={onBack} title="Кампанія" titleFirst />
      <FirstVisitHint id="campaign" title="Кампанія" items={["Проходь етапи кампанії.", "Виконуй завдання етапу.", "За завершення отримуєш нагороди та відкриваєш наступний етап."]} />
      {state.status === "loading" ? <div className="campaign-loading">Відновлюємо прогрес…</div> : null}
      {state.status === "error" ? <div className="campaign-error"><strong>Кампанія недоступна</strong><span>{state.message}</span></div> : null}
      {state.status === "ready" ? (
        <>
          <BoostStatus expiresAt={state.campaign.boost.expiresAt} multiplier={state.campaign.boost.multiplier} />
          <CampaignDialogueView dialogue={activeStage?.dialogue ?? state.campaign.boss.dialogue} />
          <section className="campaign-stage-list" aria-label="Етапи кампанії">
            {visibleStages.map((stage) => (
              <button
                aria-current={stage.state === "active" ? "step" : undefined}
                aria-label={stage.state === "locked" ? `Етап ${stage.number}: ${stage.title}, заблоковано` : undefined}
                className={`campaign-stage-row menu-row--metal-texture campaign-stage-row--${stage.state}`}
                disabled={stage.state === "locked"}
                key={stage.id}
                onClick={() => onOpenStage(stage.id)}
                type="button"
              >
                <MenuTextureSlices />
                <span className="campaign-stage-row__icon">
                  <AppIcon name={stage.state === "locked" ? "lock" : "campaign"} size={21} />
                </span>
                <span className="campaign-stage-row__content">
                  <span className="campaign-stage-row__meta">
                    <small>Етап {stage.number}</small>
                    {stage.state !== "locked" ? <span className="campaign-stage-row__progress">{stage.claimedCount}/6</span> : null}
                  </span>
                  <strong>{stage.title}</strong>
                  {stage.state === "active" ? (
                    <span className="campaign-stage-row__track" aria-hidden="true">
                      <span style={{ width: `${Math.min(100, stage.claimedCount / 6 * 100)}%` }} />
                    </span>
                  ) : null}
                </span>
                <span className="campaign-stage-row__action" aria-hidden="true">{stage.state === "active" && stage.quests.some((quest) => quest.state === "active" || quest.state === "completed") ? <span className="menu-row__indicator" /> : null}</span>
              </button>
            ))}
          </section>
          {state.campaign.boss.state !== "locked" ? (
            <section className="campaign-final-trial" aria-label="Фінальне випробування">
              <MenuRow
                active={state.campaign.boss.state === "unlocked"}
                attention={state.campaign.boss.state === "unlocked"}
                badge={state.campaign.boss.state === "completed" ? "Завершено" : undefined}
                compact
                icon="campaign"
                metalTexture
                onClick={onOpenBoss}
                title="Фінальне випробування"
              />
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function rewardLabel(quest: CampaignQuestView) {
  return (
    <span className="campaign-quest__reward-value">
      {quest.reward.xp ? <span><ResourceIcon kind="xp" size={13} />{quest.reward.xp} XP</span> : null}
      {quest.reward.silver ? <span><CurrencyIcon kind="silver" size={13} />{quest.reward.silver} срібла</span> : null}
    </span>
  );
}

function getReferralLink(startParam: string) {
  const configured = (import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined)?.trim().replace(/^@/, "");
  const botUsername = configured || DEFAULT_TELEGRAM_BOT_USERNAME;
  return `https://t.me/${botUsername}?startapp=${encodeURIComponent(startParam)}`;
}

function ReferralPanel({ campaign }: { campaign: CampaignView }) {
  const [feedback, setFeedback] = useState<string | null>(null);
  const referralLink = useMemo(() => getReferralLink(campaign.referral.startParam), [campaign.referral.startParam]);

  async function shareReferral() {
    const telegram = getTelegramWebApp();
    if (referralLink && telegram?.openTelegramLink) {
      const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent("Приєднуйся до Cardastika")}`;
      telegram.openTelegramLink(shareUrl);
      return;
    }
    if (referralLink && navigator.share) {
      await navigator.share({ title: "Cardastika", text: "Приєднуйся до Cardastika", url: referralLink });
      return;
    }
    if (referralLink && navigator.clipboard) {
      await navigator.clipboard.writeText(referralLink);
      setFeedback("Посилання скопійовано");
      return;
    }
    setFeedback("Посилання ще не налаштовано");
  }

  return (
    <div className="campaign-referral">
      <span>Запрошення до Cardastika</span>
      <strong>Прийнято друзів: {campaign.referral.acceptedFriends}</strong>
      <small>Бонус буде нараховано після першого запуску друга</small>
      <button onClick={() => void shareReferral()} type="button">Переслати запрошення</button>
      {feedback ? <em>{feedback}</em> : null}
    </div>
  );
}

export function CampaignStageScreen({ onBack, onNavigate, onPlayerSummaryChange, stageId }: {
  onBack: () => void;
  onNavigate: (target: CampaignNavigationTarget) => void;
  onPlayerSummaryChange: (player: Partial<Pick<PlayerSummary, "gold" | "level" | "silver">>) => void;
  stageId: string;
}) {
  const initialState = useCampaign();
  const [campaign, setCampaign] = useState<CampaignView | null>(null);
  const [pendingQuest, setPendingQuest] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimNotice, setClaimNotice] = useState<string | null>(null);
  useEffect(() => {
    if (initialState.status === "ready") setCampaign(initialState.campaign);
  }, [initialState]);
  const stage = campaign?.stages.find(({ id }) => id === stageId) ?? null;

  async function claim(questId: string) {
    const initData = getTelegramInitData();
    if (!initData || pendingQuest) return;
    setPendingQuest(questId);
    setClaimError(null);
    setClaimNotice(null);
    try {
      const response = await claimCampaignQuest(initData, questId);
      setCampaign(response.campaign);
      onPlayerSummaryChange(response.player);
      setClaimNotice(questId === "2.6"
        ? "Буст ×2 активний на 24 години"
        : `Нагороду за квест ${questId} отримано`);
    } catch {
      setClaimError("Не вдалося забрати нагороду. Оновіть прогрес і спробуйте ще раз.");
    } finally {
      setPendingQuest(null);
    }
  }

  return (
    <div className="campaign-screen campaign-stage-screen">
      <CampaignHeading eyebrow={stage ? `Етап ${stage.number}` : "Кампанія"} onBack={onBack} title={stage?.title ?? "Етап"} />
      {initialState.status === "loading" || !campaign ? <div className="campaign-loading">Завантажуємо завдання…</div> : null}
      {initialState.status === "error" ? <div className="campaign-error"><span>{initialState.message}</span></div> : null}
      {stage ? (
        <>
          <BoostStatus expiresAt={campaign!.boost.expiresAt} multiplier={campaign!.boost.multiplier} />
          <CampaignDialogueView dialogue={stage.dialogue} onAction={onNavigate} />
          {stage.number === 2 ? <ReferralPanel campaign={campaign!} /> : null}
          {claimError ? <p className="campaign-claim-error">{claimError}</p> : null}
          {claimNotice ? <p className="campaign-claim-notice">{claimNotice}</p> : null}
          <section className="campaign-quest-list" aria-label={`Квести етапу ${stage.number}`}>
            {stage.quests.map((quest) => (
              <article
                className={`campaign-quest campaign-quest--${quest.state}${quest.state === "active" && quest.navigation ? " campaign-quest--navigable" : ""}`}
                key={quest.id}
                onClick={quest.state === "active" && quest.navigation ? () => onNavigate(quest.navigation!) : undefined}
                onKeyDown={quest.state === "active" && quest.navigation ? (event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onNavigate(quest.navigation!);
                  }
                } : undefined}
                role={quest.state === "active" && quest.navigation ? "link" : undefined}
                tabIndex={quest.state === "active" && quest.navigation ? 0 : undefined}
              >
                <header>
                  <span>{quest.id}</span>
                  <strong>{quest.title}</strong>
                  {quest.state === "claimed" || quest.state === "completed" ? <em>Виконано</em> : null}
                  {quest.state === "locked" ? <em><AppIcon name="lock" size={12} />Заблоковано</em> : null}
                </header>
                <p>{quest.description}</p>
                <div className="campaign-quest__progress">
                  <span style={{ width: `${Math.min(100, quest.progress / quest.target * 100)}%` }} />
                </div>
                <footer>
                  <span><small>Прогрес</small><strong>{quest.progress}/{quest.target}</strong></span>
                  <span><small>Нагорода</small><strong>{rewardLabel(quest)}</strong></span>
                </footer>
                <div className="campaign-quest__actions">
                  {quest.state === "completed" ? (
                    <button disabled={pendingQuest !== null} onClick={() => void claim(quest.id)} type="button">
                      {pendingQuest === quest.id ? "Видаємо…" : "Забрати нагороду"}
                    </button>
                  ) : null}
                  {quest.state === "active" && quest.navigation ? (
                    <span className="campaign-quest__go" aria-hidden="true"><AppIcon name="chevron" size={17} /></span>
                  ) : null}
                </div>
              </article>
            ))}
          </section>
        </>
      ) : null}
    </div>
  );
}

type BossScreenState =
  | { status: "loading" }
  | { status: "presentation"; battle: CampaignBossView | null; campaign: CampaignView; reveal: "story" | "reveal" | "done" }
  | { status: "battle"; battle: CampaignBossView }
  | { status: "error"; message: string };

function BossUnlockReveal({ onComplete }: { onComplete: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onComplete, 1_200);
    return () => window.clearTimeout(timer);
  }, [onComplete]);
  return (
    <section className="campaign-boss-reveal" role="status">
      <AppIcon name="campaign" size={34} />
      <strong>ВІДКРИТО: ЛІГВО МАНТИКОРИ</strong>
    </section>
  );
}

function BossPresentation({ battle, boss, onEnter, onReturn }: {
  battle: CampaignBossView | null;
  boss: CampaignView["boss"];
  onEnter: () => void;
  onReturn: () => void;
}) {
  const completed = boss.state === "completed";
  const resume = battle?.status === "active";
  return (
    <div className="campaign-screen campaign-boss-screen">
      <CampaignHeading eyebrow="Фінальне випробування" onBack={onReturn} title="Лігво Мантикори" />
      <section className="campaign-boss-hero" aria-labelledby="campaign-boss-name">
        <img alt="Мантикора у своєму лігві" src="/assets/manticore-boss.webp" />
        <div>
          <span>ФІНАЛЬНИЙ БОС</span>
          <h1 id="campaign-boss-name">{boss.name}</h1>
        </div>
      </section>
      <blockquote className="campaign-boss-story">
        <Lariska emotion="sly" />
        <strong>Лариска</strong>
        <p>Слід обривається тут… Ні. Воно вже знає, що ми прийшли.</p>
      </blockquote>
      <section className="campaign-boss-facts" aria-label="Інформація про Мантикору">
        <div><small>Рівень</small><strong>{boss.level}</strong></div>
        <div><small>Колода</small><strong>{boss.deckSize} карт</strong></div>
        <div><small>Таємниця</small><strong>{boss.hiddenCardCount} карти</strong></div>
        <p>{boss.warning}</p>
      </section>
      <section className="campaign-boss-reward" aria-label="Нагорода за перемогу">
        <span>Нагорода за перемогу</span>
        <strong>{boss.reward.card.name} · Lv{boss.reward.card.level} · Rare</strong>
        <p><ResourceIcon kind="xp" size={14} /> Досвід залежить від нанесеного урону · <span className="campaign-currency-copy"><CurrencyIcon kind="silver" size={14} />{boss.reward.silver} срібла за перемогу</span></p>
      </section>
      <button className="campaign-boss-enter" disabled={completed} onClick={onEnter} type="button">
        {completed ? "МАНТИКОРУ ПЕРЕМОЖЕНО" : resume ? "ПРОДОВЖИТИ БІЙ" : "ВСТУПИТИ В БІЙ"}
      </button>
    </div>
  );
}

function BossVictoryResult({ battle, onReturn }: { battle: CampaignBossView; onReturn: () => void }) {
  const [dialogueIndex, setDialogueIndex] = useState(0);
  const result = battle.result!;
  const dialogues = result.dialogues ?? [];
  if (dialogues[dialogueIndex]) {
    return (
      <div className="campaign-boss-result">
        <CampaignDialogueView
          dialogue={dialogues[dialogueIndex]!}
          onNext={() => setDialogueIndex((index) => index + 1)}
        />
      </div>
    );
  }
  return (
    <section className="campaign-boss-result campaign-boss-result--win">
      <span>Кампанію 1 завершено</span>
      <h1>КАМПАНІЮ ЗАВЕРШЕНО</h1>
      <div className="campaign-boss-result__rewards">
        <div><small><ResourceIcon kind="xp" size={14} />Досвід</small><strong><ResourceIcon kind="xp" size={16} />+{result.xp} XP</strong></div>
        <div><small>Срібло</small><strong><CurrencyIcon kind="silver" size={16} />+{result.silver}</strong></div>
      </div>
      {result.accountBoostMultiplier === 2 ? <p>Буст ×2 активний на 24 години</p> : null}
      {result.rewardCard ? (
        <div className={`campaign-boss-reward-card deck-card--${result.rewardCard.element} deck-card--${result.rewardCard.rarity}`}>
          <CardArtwork artKey={result.rewardCard.artKey} cardId={result.rewardCard.cardId} element={result.rewardCard.element} />
          <CardHud element={result.rewardCard.element} level={result.rewardCard.level} power={result.rewardCard.finalPower} rarity={result.rewardCard.rarity} showLevel />
          <strong>{result.rewardCard.displayName ?? result.rewardCard.code}</strong>
        </div>
      ) : null}
      <button onClick={onReturn} type="button">До кампанії</button>
    </section>
  );
}

function BossLossResult({ onRetry, onReturn }: { onRetry: () => void; onReturn: () => void }) {
  return (
    <section className="campaign-boss-result campaign-boss-result--loss">
      <span>Бій завершено</span>
      <h1>ПОРАЗКА</h1>
      <p>Карти Мантикори знову приховані. Переглянь журнал і спробуй ще раз.</p>
      <button onClick={onRetry} type="button">Повторити бій</button>
      <button className="campaign-secondary-button" onClick={onReturn} type="button">До кампанії</button>
    </section>
  );
}

export function CampaignBossScreen({ onCampaignCompleted, onDeckPowerChange, onPlayerSummaryChange, onReturn }: {
  onCampaignCompleted: () => void;
  onDeckPowerChange: (deckPower: number) => void;
  onPlayerSummaryChange: (player: Partial<Pick<PlayerSummary, "gold" | "level" | "silver">>) => void;
  onReturn: () => void;
}) {
  const [state, setState] = useState<BossScreenState>({ status: "loading" });
  const [pendingSlot, setPendingSlot] = useState<0 | 1 | 2 | null>(null);
  const [introIndex, setIntroIndex] = useState(0);

  const showBattle = useCallback((battle: CampaignBossView) => {
    window.localStorage.setItem(LAST_CAMPAIGN_BOSS_KEY, battle.battleId);
    if (battle.result) {
      onPlayerSummaryChange(battle.result.player);
      if (battle.result.deckPower !== undefined) onDeckPowerChange(battle.result.deckPower);
      if (battle.result.outcome === "win") onCampaignCompleted();
    }
    setState({ status: "battle", battle });
  }, [onCampaignCompleted, onDeckPowerChange, onPlayerSummaryChange]);

  const start = useCallback(async (initData: string, signal?: AbortSignal) => {
    setState({ status: "loading" });
    try {
      showBattle(await startCampaignBoss(initData, signal));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setState({ status: "error", message: "Не вдалося розпочати бій із Мантикорою" });
    }
  }, [showBattle]);

  const finishReveal = useCallback(() => {
    setState((current) => current.status === "presentation"
      ? { ...current, reveal: "done" }
      : current);
  }, []);

  useEffect(() => {
    const initData = getTelegramInitData();
    if (!initData) {
      setState({ status: "error", message: "Бій доступний лише в Telegram Mini App" });
      return;
    }
    const controller = new AbortController();
    void (async () => {
      try {
        const [campaign, active] = await Promise.all([
          loadCampaign(initData, controller.signal),
          loadActiveCampaignBoss(initData, controller.signal),
        ]);
        if (campaign.boss.state === "locked") {
          setState({ status: "error", message: "Фінальне випробування ще не відкрито" });
          return;
        }
        let battle = active.battle;
        const remembered = battle ? null : window.localStorage.getItem(LAST_CAMPAIGN_BOSS_KEY);
        if (!battle && remembered) {
          try {
            battle = await loadCampaignBoss(initData, remembered, controller.signal);
          } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") return;
            window.localStorage.removeItem(LAST_CAMPAIGN_BOSS_KEY);
          }
        }
        const firstReveal = campaign.boss.state === "unlocked"
          && window.localStorage.getItem(CAMPAIGN_BOSS_REVEALED_KEY) !== "1";
        setState({
          status: "presentation",
          battle,
          campaign,
          reveal: firstReveal ? "story" : "done",
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "error", message: "Не вдалося відкрити лігво Мантикори" });
      }
    })();
    return () => controller.abort();
  }, []);

  function enterBattle() {
    if (state.status !== "presentation" || state.campaign.boss.state === "completed") return;
    if (state.battle?.status === "active") {
      showBattle(state.battle);
      return;
    }
    const initData = getTelegramInitData();
    if (initData) void start(initData);
  }

  async function action(slotIndex: 0 | 1 | 2) {
    if (state.status !== "battle" || state.battle.status !== "active" || pendingSlot !== null) return;
    const initData = getTelegramInitData();
    if (!initData) return;
    setPendingSlot(slotIndex);
    try {
      showBattle(await submitCampaignBossAction(initData, state.battle.battleId, {
        slotIndex,
        expectedVersion: state.battle.version,
      }));
    } catch (error) {
      if (error instanceof CampaignApiError && error.code === "campaign_boss_state_conflict") {
        try {
          showBattle(await loadCampaignBoss(initData, state.battle.battleId));
        } catch {
          setState({ status: "error", message: "Не вдалося синхронізувати бій" });
        }
      } else {
        setState({ status: "error", message: "Хід не виконано. Спробуйте ще раз" });
      }
    } finally {
      setPendingSlot(null);
    }
  }

  function retry() {
    const initData = getTelegramInitData();
    window.localStorage.removeItem(LAST_CAMPAIGN_BOSS_KEY);
    if (initData) void start(initData);
  }

  if (state.status === "loading") return <div className="campaign-loading campaign-loading--boss">Відкриваємо лігво…</div>;
  if (state.status === "error") {
    return <div className="campaign-error campaign-error--boss"><strong>Бій недоступний</strong><span>{state.message}</span><button onClick={onReturn} type="button">До кампанії</button></div>;
  }
  if (state.status === "presentation") {
    if (state.reveal === "story") {
      return (
        <div className="campaign-screen campaign-boss-screen">
          <CampaignHeading eyebrow="Фінальне випробування" onBack={onReturn} title="Лігво Мантикори" />
          <CampaignDialogueView
            dialogue={BOSS_UNLOCK_STORY}
            onNext={() => {
              window.localStorage.setItem(CAMPAIGN_BOSS_REVEALED_KEY, "1");
              setState((current) => current.status === "presentation"
                ? { ...current, reveal: "reveal" }
                : current);
            }}
          />
        </div>
      );
    }
    if (state.reveal === "reveal") {
      return (
        <div className="campaign-screen campaign-boss-screen">
          <CampaignHeading eyebrow="Фінальне випробування" onBack={onReturn} title="Лігво Мантикори" />
          <BossUnlockReveal onComplete={finishReveal} />
        </div>
      );
    }
    return (
      <BossPresentation
        battle={state.battle}
        boss={state.campaign.boss}
        onEnter={enterBattle}
        onReturn={onReturn}
      />
    );
  }
  if (state.battle.status !== "active") {
    return state.battle.result?.outcome === "win"
      ? <BossVictoryResult battle={state.battle} onReturn={onReturn} />
      : <BossLossResult onRetry={retry} onReturn={onReturn} />;
  }
  const battle = state.battle;
  const introDialogue = battle.introDialogues[introIndex];
  if (introDialogue) {
    return <CampaignDialogueView dialogue={introDialogue} onNext={() => setIntroIndex((index) => index + 1)} />;
  }
  return (
    <div className="duel-battle campaign-boss-battle">
      <div className="campaign-boss-battle__warning">Карти боса приховані до удару</div>
      <HpPanel currentHp={battle.enemyHp} maximumHp={battle.enemyMaxHp} side={battle.opponent} tone="enemy" />
      <div className="duel-board" aria-label="Таємне бойове поле Мантикори">
        <div className="duel-card-row duel-card-row--enemy">
          {battle.enemyActiveCards.map((slot) => (
            <div aria-label="Прихована карта боса" className="duel-card duel-card--enemy campaign-boss-hidden-card" key={slot.slotIndex}>?</div>
          ))}
        </div>
        <div className="campaign-boss-hidden-connectors" aria-hidden="true"><span /><span /><span /></div>
        <div className="duel-card-row duel-card-row--player">
          {battle.playerActiveCards.map((card, index) => (
            <BattleCard
              card={card}
              disabled={pendingSlot !== null}
              key={card.instanceId}
              onClick={() => void action(index as 0 | 1 | 2)}
              selected={pendingSlot === index}
            />
          ))}
        </div>
      </div>
      <HpPanel currentHp={battle.playerHp} maximumHp={battle.playerMaxHp} side={battle.player} tone="player" />
      <p className="duel-action-hint">{pendingSlot === null ? "Обирай слот" : "Мантикора відкриває карту…"}</p>
      <BattleLog entries={battle.battleLog} />
    </div>
  );
}
