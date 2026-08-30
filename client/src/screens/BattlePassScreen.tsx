import { useEffect, useState } from "react";
import type { BattlePassReward, BattlePassMilestoneView, PlayerCardInstance } from "@cardastika/shared";
import { AppIcon } from "../components/AppIcon";
import { CardArtwork } from "../components/CardArtwork";
import { CardHud } from "../components/CardHud";
import { CurrencyIcon } from "../components/CurrencyDisplay";
import { useBattlePass } from "../hooks/useBattlePass";

const DIAMOND_ASSET = "/assets/ui/world-tree/game-icons/diamond.svg";

function formatRemaining(endsAt: string, now: number) {
  const remaining = Math.max(0, new Date(endsAt).getTime() - now);
  const days = Math.floor(remaining / 86_400_000);
  const hours = Math.floor(remaining % 86_400_000 / 3_600_000);
  return `${days} д ${hours} год`;
}

function rewardLabel(reward: BattlePassReward) {
  return reward.label;
}

function rewardIcon(reward: BattlePassReward) {
  if (reward.kind === "boost") return <span className="battle-pass-boost-icon"><CurrencyIcon kind="silver" size={17} /><CurrencyIcon kind="gold" size={17} /></span>;
  if (reward.kind === "silver") return <CurrencyIcon kind="silver" size={18} />;
  if (reward.kind === "gold") return <CurrencyIcon kind="gold" size={18} />;
  return <AppIcon name="card-reward" size={22} />;
}

function romanCircle(circle: number) {
  return ["", "I", "II", "III", "IV", "V"][circle] ?? String(circle);
}

function CardRewardPreview({ card, compact = false }: { card: PlayerCardInstance; compact?: boolean }) {
  return (
    <div className={`${compact ? "battle-pass-card-thumbnail" : "campaign-boss-reward-card battle-pass-card-reveal__card"} deck-card--${card.element} deck-card--${card.rarity}`}>
      <CardArtwork artKey={card.artKey} cardId={card.cardId} element={card.element} />
      <CardHud element={card.element} level={card.level} power={card.finalPower} rarity={card.rarity} showLevel={!compact} />
      {!compact ? <><strong>{card.displayName ?? card.code}</strong><small>Рівень {card.level} · {card.rarity}</small></> : null}
    </div>
  );
}

function Milestone({
  milestone,
  onClaim,
  pending,
  rewardCard,
  isFinal,
  isNext,
  isReached,
  nextReached,
}: {
  milestone: BattlePassMilestoneView;
  onClaim: (id: string) => void;
  pending: boolean;
  rewardCard?: PlayerCardInstance;
  isFinal: boolean;
  isNext: boolean;
  isReached: boolean;
  nextReached: boolean;
}) {
  const isCheckpoint = !milestone.reward;
  const label = milestone.reward?.label;
  return (
    <article className={`battle-pass-milestone${isCheckpoint ? " battle-pass-milestone--checkpoint" : ""}${isFinal ? " battle-pass-milestone--final" : ""}${isNext ? " battle-pass-milestone--next" : ""}${isReached ? " battle-pass-milestone--reached" : ""}${nextReached ? " battle-pass-milestone--next-reached" : ""}${milestone.claimed ? " battle-pass-milestone--claimed" : ""}${milestone.claimable ? " battle-pass-milestone--claimable" : !milestone.claimed ? " battle-pass-milestone--locked" : ""}`}>
      <div className="battle-pass-milestone__axis" aria-hidden="true">
        <span className="battle-pass-milestone__node"><b>{milestone.threshold}</b></span>
      </div>
      <div className="battle-pass-milestone__reward">
        {milestone.reward ? (
          <>
            <div className={`battle-pass-milestone__reward-icon${rewardCard ? " battle-pass-milestone__reward-icon--card" : ""}`}>
              {rewardCard ? <CardRewardPreview card={rewardCard} compact /> : rewardIcon(milestone.reward)}
            </div>
            <div className="battle-pass-milestone__reward-copy">
              <small>БЕЗКОШТОВНА НАГОРОДА</small>
              <strong>{label ?? rewardLabel(milestone.reward)}</strong>
            </div>
            {milestone.claimed ? <span className="battle-pass-milestone__status battle-pass-milestone__status--claimed"><b aria-hidden="true">✓</b> Отримано</span> : milestone.claimable ? <button disabled={pending} onClick={() => onClaim(milestone.id)} type="button">Забрати</button> : <span className="battle-pass-milestone__status battle-pass-milestone__status--locked"><AppIcon name="lock" size={13} /> Закрито</span>}
          </>
        ) : (
          <div className="battle-pass-checkpoint">
            <span className="battle-pass-checkpoint__seal"><AppIcon name="card-reward" size={16} /></span>
            <span><strong>Контрольна точка</strong><small>{milestone.threshold} діамантів</small></span>
          </div>
        )}
      </div>
    </article>
  );
}

export function BattlePassScreen({ onBack, onPlayerSummaryChange }: { onBack: () => void; onPlayerSummaryChange: (balance: { gold: number; silver: number }) => void }) {
  const { claimMilestone, retry, state } = useBattlePass();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [claimedCard, setClaimedCard] = useState<PlayerCardInstance | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  async function handleMilestoneClaim(id: string) {
    setPendingId(id);
    setFeedback(null);
    try {
      const response = await claimMilestone(id);
      if (response.updatedBalance) onPlayerSummaryChange(response.updatedBalance);
      if (response.card) setClaimedCard(response.card);
      setFeedback(`Нагороду отримано: ${response.reward.label}`);
    } catch {
      setFeedback("Нагороду ще не можна забрати");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="battle-pass-screen">
      <header className="campaign-heading campaign-heading--title-first">
        <button aria-label="Назад" onClick={onBack} type="button"><AppIcon name="chevron" size={18} /></button>
        <div><h1>Батл пас</h1><span>Сезонні безкоштовні нагороди</span></div>
      </header>
      {state.status === "loading" ? <div className="battle-pass-state">Відновлюємо прогрес…</div> : null}
      {state.status === "error" ? <div className="battle-pass-state battle-pass-state--error"><strong>Батл пас недоступний</strong><span>{state.message}</span><button onClick={retry} type="button">Повторити</button></div> : null}
      {state.status === "ready" ? (
        <>
          {state.data.battlePass.circles.map((circle) => {
            const seasonThreshold = circle.threshold;
            const seasonProgress = seasonThreshold ? Math.min(100, state.data.battlePass.diamonds / seasonThreshold * 100) : 100;
            const nextReward = circle.milestones.find(({ reward, claimed }) => reward && !claimed);
            return (
              <section className="battle-pass-hero" key={circle.circle}>
                <div className="battle-pass-hero__summary">
                  <div className="battle-pass-hero__diamond-count"><img alt="" aria-hidden="true" src={DIAMOND_ASSET} /><div><strong>{state.data.battlePass.diamonds}</strong><span>зібрано діамантів</span></div></div>
                  <div className="battle-pass-hero__season-meta"><strong>КОЛО {romanCircle(circle.circle)}</strong><time>До завершення: {formatRemaining(state.data.battlePass.endsAt, now)}</time></div>
                </div>
                <div className="battle-pass-hero__progress-meta"><span>Прогрес сезону</span><strong>{state.data.battlePass.diamonds} / {seasonThreshold} <img alt="" aria-hidden="true" src={DIAMOND_ASSET} /></strong></div>
                <div className="battle-pass-hero__track" aria-hidden="true"><span style={{ width: `${seasonProgress}%` }} /></div>
                {nextReward ? <div className="battle-pass-hero__next"><span>Наступна нагорода</span><strong>на {nextReward.threshold} <img alt="" aria-hidden="true" src={DIAMOND_ASSET} /></strong></div> : null}
                {state.data.battlePass.currencyBoost.active ? <div className="battle-pass-hero__boost"><CurrencyIcon kind="silver" size={17} /><CurrencyIcon kind="gold" size={17} /><strong>×2 срібла та золота</strong><time>ще {formatRemaining(state.data.battlePass.currencyBoost.expiresAt!, now)}</time></div> : null}
                <p>Щоденні завдання відкривають сезонні нагороди.</p>
              </section>
            );
          })}

          <section className="battle-pass-track" aria-label="Безкоштовна доріжка нагород">
            {state.data.battlePass.circles.map((circle) => (
              <section className={`battle-pass-circle${circle.completed ? " battle-pass-circle--completed" : ""}`} key={circle.circle}>
                <header>
                  <div className="battle-pass-circle__chapter"><strong>КОЛО {romanCircle(circle.circle)}</strong><small>{circle.completed ? "Сезон завершено" : "Сезонна доріжка нагород"}</small></div>
                  <div className="battle-pass-circle__total"><strong>{state.data.battlePass.diamonds} / {circle.threshold}</strong><span>💎</span></div>
                </header>
                <div className="battle-pass-circle__progress" aria-hidden="true"><span style={{ width: `${Math.min(100, state.data.battlePass.diamonds / circle.threshold * 100)}%` }} /></div>
                <div className="battle-pass-milestones">
                  {circle.milestones.map((milestone, index) => <Milestone key={milestone.id} milestone={milestone} onClaim={handleMilestoneClaim} pending={pendingId === milestone.id} rewardCard={milestone.reward?.kind === "card" && milestone.claimed ? claimedCard ?? undefined : undefined} isFinal={milestone.threshold === circle.threshold} isNext={milestone.id === (circle.milestones.find(({ threshold }) => threshold > state.data.battlePass.diamonds)?.id ?? null)} isReached={milestone.threshold <= state.data.battlePass.diamonds} nextReached={(circle.milestones[index + 1]?.threshold ?? Number.POSITIVE_INFINITY) <= state.data.battlePass.diamonds} />)}
                </div>
              </section>
            ))}
          </section>

          {claimedCard ? <section className="battle-pass-card-reveal" aria-label="Карткова нагорода"><div><span>Карткова нагорода</span><strong>Карта додана до колекції</strong></div><CardRewardPreview card={claimedCard} /></section> : null}
          {feedback ? <p className="battle-pass-feedback" role="status">{feedback}</p> : null}
        </>
      ) : null}
    </div>
  );
}
