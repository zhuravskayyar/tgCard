import { useCallback, useEffect, useMemo, useState } from "react";
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
import { ElementSymbol } from "../components/ElementSymbol";
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

function CampaignHeading({ eyebrow, onBack, title }: {
  eyebrow: string;
  onBack: () => void;
  title: string;
}) {
  return (
    <header className="campaign-heading">
      <button aria-label="Назад" onClick={onBack} type="button"><AppIcon name="chevron" size={18} /></button>
      <div><span>{eyebrow}</span><h1>{title}</h1></div>
    </header>
  );
}

export function CampaignDialogueView({ dialogue, onAction, onNext }: {
  dialogue: CampaignDialogue;
  onAction?: (target: CampaignNavigationTarget) => void;
  onNext?: () => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [dialogue.id]);
  const artUrl = dialogue.npcArtKey ? `/assets/${dialogue.npcArtKey}.png` : null;
  return (
    <section className={`campaign-dialogue campaign-dialogue--${dialogue.emotion}`}>
      <div className="campaign-dialogue__sprite" aria-hidden="true">
        {artUrl && !imageFailed ? <img alt="" onError={() => setImageFailed(true)} src={artUrl} /> : null}
        {!artUrl || imageFailed ? <span><AppIcon name="campaign" size={42} /></span> : null}
      </div>
      <div className="campaign-dialogue__body">
        <strong>{dialogue.npcName}</strong>
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
      <span>Бойові XP і срібло</span>
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

export function CampaignScreen({ onBack, onOpenBoss, onOpenStage }: {
  onBack: () => void;
  onOpenBoss: () => void;
  onOpenStage: (stageId: string) => void;
}) {
  const state = useCampaign();
  return (
    <div className="campaign-screen">
      <CampaignHeading eyebrow="Шлях гравця" onBack={onBack} title="Кампанія" />
      {state.status === "loading" ? <div className="campaign-loading">Відновлюємо прогрес…</div> : null}
      {state.status === "error" ? <div className="campaign-error"><strong>Кампанія недоступна</strong><span>{state.message}</span></div> : null}
      {state.status === "ready" ? (
        <>
          <BoostStatus expiresAt={state.campaign.boost.expiresAt} multiplier={state.campaign.boost.multiplier} />
          <CampaignDialogueView dialogue={state.campaign.stages.find(({ state: stageState }) => stageState === "active")?.dialogue ?? state.campaign.boss.dialogue} />
          <section className="campaign-stage-list" aria-label="Етапи кампанії">
            {state.campaign.stages.map((stage) => (
              <button
                className={`campaign-stage-row campaign-stage-row--${stage.state}`}
                disabled={stage.state === "locked"}
                key={stage.id}
                onClick={() => onOpenStage(stage.id)}
                type="button"
              >
                <span><small>Етап {stage.number}</small><strong>{stage.title}</strong></span>
                <span className="campaign-stage-row__progress">{stage.claimedCount}/6</span>
                <AppIcon name="chevron" size={18} />
              </button>
            ))}
          </section>
          <section className={`campaign-boss-preview campaign-boss-preview--${state.campaign.boss.state}`}>
            <span>Фінальний бос</span>
            <h2>{state.campaign.boss.name}</h2>
            <p>{state.campaign.boss.warning}</p>
            {state.campaign.boss.state === "locked" ? <strong>Заберіть нагороди за всі 36 квестів</strong> : null}
            {state.campaign.boss.state === "unlocked" ? (
              <button onClick={onOpenBoss} type="button">Вступити в бій</button>
            ) : null}
            {state.campaign.boss.state === "completed" ? <strong>Кампанію 1 завершено</strong> : null}
          </section>
        </>
      ) : null}
    </div>
  );
}

function rewardLabel(quest: CampaignQuestView) {
  return [
    quest.reward.xp ? `${quest.reward.xp} XP` : null,
    quest.reward.silver ? `${quest.reward.silver} срібла` : null,
  ].filter(Boolean).join(" + ");
}

function getReferralLink(startParam: string) {
  const configured = (import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined)?.trim().replace(/^@/, "");
  return configured ? `https://t.me/${configured}?startapp=${encodeURIComponent(startParam)}` : null;
}

function ReferralPanel({ campaign }: { campaign: CampaignView }) {
  const [feedback, setFeedback] = useState<string | null>(null);
  const referralLink = useMemo(() => getReferralLink(campaign.referral.startParam), [campaign.referral.startParam]);

  async function shareReferral() {
    if (referralLink && navigator.share) {
      await navigator.share({ title: "Cardastika", text: "Приєднуйся до Cardastika", url: referralLink });
      return;
    }
    if (referralLink && getTelegramWebApp()?.openTelegramLink) {
      const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent("Приєднуйся до Cardastika")}`;
      getTelegramWebApp()?.openTelegramLink?.(shareUrl);
      return;
    }
    await navigator.clipboard.writeText(referralLink ?? campaign.referral.startParam);
    setFeedback(referralLink ? "Посилання скопійовано" : "Referral-код скопійовано");
  }

  return (
    <div className="campaign-referral">
      <span>Ваш referral-код</span>
      <strong>{campaign.referral.code}</strong>
      <small>Прийнято друзів: {campaign.referral.acceptedFriends}</small>
      <button onClick={() => void shareReferral()} type="button">Поділитися</button>
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
              <article className={`campaign-quest campaign-quest--${quest.state}`} key={quest.id}>
                <header><span>{quest.id}</span><strong>{quest.title}</strong><em>{quest.state === "claimed" ? "Виконано" : quest.state === "completed" ? "Нагорода готова" : quest.state === "locked" ? "Закрито" : "Активно"}</em></header>
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
                      {pendingQuest === quest.id ? "Видаємо…" : "Забрати"}
                    </button>
                  ) : null}
                  {quest.state === "active" && quest.navigation ? (
                    <button className="campaign-quest__go" onClick={() => onNavigate(quest.navigation!)} type="button">Перейти</button>
                  ) : null}
                  {quest.state === "claimed" ? <strong className="campaign-quest__done">Виконано</strong> : null}
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
  | { status: "battle"; battle: CampaignBossView }
  | { status: "error"; message: string };

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
        <div><small>Досвід</small><strong>+{result.xp} XP</strong></div>
        <div><small>Срібло</small><strong>+{result.silver}</strong></div>
      </div>
      {result.accountBoostMultiplier === 2 ? <p>Буст ×2 активний на 24 години</p> : null}
      {result.rewardCard ? (
        <div className="campaign-boss-reward-card">
          <CardArtwork artKey={result.rewardCard.artKey} element={result.rewardCard.element} />
          <span><ElementSymbol element={result.rewardCard.element} /></span>
          <strong>{result.rewardCard.displayName ?? result.rewardCard.code}</strong>
          <small>Lv{result.rewardCard.level} · Rare</small>
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

export function CampaignBossScreen({ onPlayerSummaryChange, onReturn }: {
  onPlayerSummaryChange: (player: Partial<Pick<PlayerSummary, "gold" | "level" | "silver">>) => void;
  onReturn: () => void;
}) {
  const [state, setState] = useState<BossScreenState>({ status: "loading" });
  const [pendingSlot, setPendingSlot] = useState<0 | 1 | 2 | null>(null);
  const [introIndex, setIntroIndex] = useState(0);

  const showBattle = useCallback((battle: CampaignBossView) => {
    window.localStorage.setItem(LAST_CAMPAIGN_BOSS_KEY, battle.battleId);
    if (battle.result) onPlayerSummaryChange(battle.result.player);
    setState({ status: "battle", battle });
  }, [onPlayerSummaryChange]);

  const start = useCallback(async (initData: string, signal?: AbortSignal) => {
    setState({ status: "loading" });
    try {
      showBattle(await startCampaignBoss(initData, signal));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setState({ status: "error", message: "Не вдалося розпочати бій із Мантикорою" });
    }
  }, [showBattle]);

  useEffect(() => {
    const initData = getTelegramInitData();
    if (!initData) {
      setState({ status: "error", message: "Бій доступний лише в Telegram Mini App" });
      return;
    }
    const controller = new AbortController();
    void (async () => {
      try {
        const active = await loadActiveCampaignBoss(initData, controller.signal);
        if (active.battle) {
          showBattle(active.battle);
          return;
        }
        const remembered = window.localStorage.getItem(LAST_CAMPAIGN_BOSS_KEY);
        if (remembered) {
          try {
            showBattle(await loadCampaignBoss(initData, remembered, controller.signal));
            return;
          } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") return;
            window.localStorage.removeItem(LAST_CAMPAIGN_BOSS_KEY);
          }
        }
        await start(initData, controller.signal);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "error", message: "Не вдалося відновити бій із Мантикорою" });
      }
    })();
    return () => controller.abort();
  }, [showBattle, start]);

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

  if (state.status === "loading") return <div className="campaign-loading campaign-loading--boss">Пробуджуємо лігво…</div>;
  if (state.status === "error") {
    return <div className="campaign-error campaign-error--boss"><strong>Бій недоступний</strong><span>{state.message}</span><button onClick={onReturn} type="button">До кампанії</button></div>;
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
