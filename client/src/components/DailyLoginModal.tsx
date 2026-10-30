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
      <div className="daily-login-modal__currency-slot" data-reward-source="silver">
        <span className="daily-login-modal__reward-ring"><CurrencyIcon kind="silver" size={34} /></span><strong>{reward.silver === undefined ? "—" : formatUiNumber(reward.silver)}</strong><small>Срібло</small>
      </div>
      <div className="daily-login-modal__currency-slot" data-reward-source="gold">
        <span className="daily-login-modal__reward-ring"><CurrencyIcon kind="gold" size={34} /></span><strong>{reward.gold === undefined ? "—" : formatUiNumber(reward.gold)}</strong><small>Золото</small>
      </div>
      <div className="daily-login-modal__currency-slot">
        <span className="daily-login-modal__reward-ring"><img alt="" src="/assets/ui/icons/icon-diamond-v1.webp" width={34} height={34} /></span><strong>{reward.diamonds === undefined ? "—" : formatUiNumber(reward.diamonds)}</strong><small>Алмази</small>
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
      // The letter stays open while the rewards fly out of it.
      await new Promise((resolve) => window.setTimeout(resolve, 1_100));
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
        <button aria-label="Закрити" className="daily-login-modal__close" disabled={pending} onClick={onClose} type="button"><AppIcon name="close" size={22} /></button>
        <h2 className="daily-login-modal__title" id="daily-login-modal-title">Нагорода за вхід</h2>
        <div className="daily-login-modal__mascot"><Lariska alt="Лариска з подарунками" emotion={data.dialogue.emotion} /></div>
        <CurrencyRewards reward={reward} />
        <div className="daily-login-modal__dialogue"><strong>Лариска</strong><p>{data.dialogue.text}</p></div>
        <p className="daily-login-modal__series-rule">{reward.description} Новий день — о 00:00 UTC.</p>
        <div className="daily-login-modal__status" aria-live="polite">{feedback}</div>
        <button className="daily-login-modal__claim" disabled={pending || !data.claimable || reward.kind !== "currencies"} onClick={handleClaim} type="button">
          {pending ? "Забираємо…" : !data.claimable ? "Сьогодні вже отримано" : "Забрати нагороду"}
        </button>
        <button className="daily-login-modal__tasks-link" disabled={pending} onClick={onOpenTasks} type="button">Виконуй завдання й отримуй алмази <span aria-hidden="true">→</span></button>
      </section>
    </div>
  );
}
