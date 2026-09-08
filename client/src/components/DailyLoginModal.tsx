import { useState } from "react";
import type { DailyLoginClaimResponse, LariskaDailyRewardPlayerState, LariskaDailyRewardSummary, LariskaDailyRewardView } from "@cardastika/shared";
import { AppIcon } from "./AppIcon";
import { CurrencyIcon } from "./CurrencyDisplay";
import { Lariska } from "./Lariska";
import { formatUiNumber } from "../i18n";

interface DailyLoginModalProps {
  data: LariskaDailyRewardView;
  onClaim: (choiceIndex?: number) => Promise<DailyLoginClaimResponse>;
  onClose: () => void;
  onOpenTasks: () => void;
  onPlayerSummaryChange: (player: LariskaDailyRewardPlayerState) => void;
}

function CurrencyRewards({ reward }: { reward: LariskaDailyRewardSummary }) {
  if (reward.kind !== "currencies") return <p className="daily-login-modal__status">Онови гру, щоб завантажити актуальну нагороду.</p>;
  return (
    <div className="daily-login-modal__currency-slots" aria-label="Нагороди за вхід">
      <div className="daily-login-modal__currency-slot">
        <CurrencyIcon kind="silver" size={32} /><strong>{reward.silver === undefined ? "—" : formatUiNumber(reward.silver)}</strong><small>Срібло</small>
      </div>
      <div className="daily-login-modal__currency-slot">
        <CurrencyIcon kind="gold" size={32} /><strong>{reward.gold === undefined ? "—" : formatUiNumber(reward.gold)}</strong><small>Золото</small>
      </div>
      <div className="daily-login-modal__currency-slot">
        <img alt="" src="/assets/ui/world-tree/game-icons/diamond.svg" width={32} height={32} /><strong>{reward.diamonds === undefined ? "—" : formatUiNumber(reward.diamonds)}</strong><small>Алмази</small>
      </div>
    </div>
  );
}

export function DailyLoginModal({ data, onClaim, onClose, onOpenTasks, onPlayerSummaryChange }: DailyLoginModalProps) {
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function handleClaim() {
    if (pending || !data.claimable) return;
    setPending(true);
    setFeedback(null);
    try {
      const response = await onClaim();
      onPlayerSummaryChange(response.rewardPlayer);
      onClose();
    } catch {
      setFeedback("Не вдалося забрати нагороду. Спробуй ще раз або онови гру.");
    } finally { setPending(false); }
  }

  const reward = data.reward;
  return (
    <div className="daily-login-modal" role="dialog" aria-modal="true" aria-labelledby="daily-login-modal-title">
      <button aria-label="Закрити" className="daily-login-modal__backdrop" disabled={pending} onClick={onClose} type="button" />
      <section className="daily-login-modal__dialog daily-login-modal__dialog--currencies">
        <header className="daily-login-modal__header">
          <div><span>ПОДАРУНОК ЛАРИСКИ</span><h2 id="daily-login-modal-title">Нагорода за вхід</h2></div>
          <button aria-label="Закрити" className="daily-login-modal__close" disabled={pending} onClick={onClose} type="button"><AppIcon name="close" size={17} /></button>
        </header>
        <div className="daily-login-modal__showcase">
          <div className="daily-login-modal__rewards">
            <CurrencyRewards reward={reward} />
            <div className="daily-login-modal__encouragement"><strong>Хочеш ще?</strong><button className="daily-login-modal__tasks-link" disabled={pending} onClick={onOpenTasks} type="button">Виконуй завдання й отримуй алмази <span aria-hidden="true">→</span></button></div>
          </div>
          <div className="daily-login-modal__mascot"><Lariska alt="Лариска з подарунками" emotion={data.dialogue.emotion} /></div>
        </div>
        <div className="daily-login-modal__dialogue"><strong>Лариска</strong><p>{data.dialogue.text}</p></div>
        <p className="daily-login-modal__series-rule">{reward.description} Новий день — о 00:00 UTC.</p>
        <div className="daily-login-modal__status" aria-live="polite">{feedback}</div>
        <button className="daily-login-modal__claim" disabled={pending || !data.claimable || reward.kind !== "currencies"} onClick={handleClaim} type="button">
          {pending ? "Забираємо…" : !data.claimable ? "Сьогодні вже отримано" : "Забрати нагороду"}
        </button>
      </section>
    </div>
  );
}
