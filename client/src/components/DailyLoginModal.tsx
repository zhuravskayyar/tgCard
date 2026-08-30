import { useState } from "react";
import type {
  DailyLoginClaimResponse,
  LariskaDailyChoiceOption,
  LariskaDailyRewardPlayerState,
  LariskaDailyRewardSummary,
  LariskaDailyRewardView,
} from "@cardastika/shared";
import { AppIcon } from "./AppIcon";
import { CurrencyIcon } from "./CurrencyDisplay";
import { Lariska } from "./Lariska";
import { ResourceIcon } from "./ResourceIcon";

interface DailyLoginModalProps {
  data: LariskaDailyRewardView;
  onClaim: (choiceIndex?: number) => Promise<DailyLoginClaimResponse>;
  onClose: () => void;
  onPlayerSummaryChange: (player: LariskaDailyRewardPlayerState) => void;
}

function choiceLabel(option: LariskaDailyChoiceOption) {
  if (option.kind === "card") return option.displayName ?? option.code;
  if (option.kind === "equipment") return option.name;
  return option.label;
}

function choiceMeta(option: LariskaDailyChoiceOption) {
  if (option.kind === "card") return option.rarity + " · " + option.element + " · Lv" + option.level;
  if (option.kind === "equipment") return option.rarity + " · " + option.slot;
  return "преміальна валюта";
}

function RewardIcon({ kind, size = 42 }: { kind: LariskaDailyRewardSummary["kind"] | LariskaDailyChoiceOption["kind"]; size?: number }) {
  if (kind === "gold") return <CurrencyIcon kind="gold" size={size} />;
  if (kind === "arena_tokens_xp") {
    return <span className="daily-login-modal__reward-icons"><ResourceIcon kind="arena-token" size={size} /><ResourceIcon kind="xp" size={Math.max(24, size - 10)} /></span>;
  }
  if (kind === "equipment") return <AppIcon name="equipment" size={size} />;
  return <AppIcon name="card-reward" size={size} />;
}

function RewardTile({ reward }: { reward: LariskaDailyRewardSummary }) {
  return (
    <div className="daily-login-modal__reward-tile">
      <span className="daily-login-modal__reward-icon"><RewardIcon kind={reward.kind} /></span>
      <strong>{reward.label}</strong>
      <small>{reward.description}</small>
    </div>
  );
}

export function DailyLoginModal({ data, onClaim, onClose, onPlayerSummaryChange }: DailyLoginModalProps) {
  const [pending, setPending] = useState(false);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [claimed, setClaimed] = useState(false);
  const [claimedReward, setClaimedReward] = useState<LariskaDailyRewardSummary | null>(null);
  const [claimedDay, setClaimedDay] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function handleClaim() {
    if (pending || claimed || !data.claimable) return;
    const choiceIndex = selectedChoice ?? undefined;
    if (data.reward.kind === "choice" && choiceIndex === undefined) {
      setFeedback("Спочатку обери одну нагороду");
      return;
    }

    setPending(true);
    setFeedback(null);
    try {
      const response = await onClaim(choiceIndex);
      onPlayerSummaryChange(response.rewardPlayer);
      setClaimedReward(data.reward);
      setClaimedDay(data.day);
      setClaimed(true);
      setFeedback(response.streakBonus ? response.grant.label + ". Бонус серії: " + response.streakBonus.label : response.grant.label);
    } catch {
      setFeedback("Нагороду вже забрали або вона тимчасово недоступна");
    } finally {
      setPending(false);
    }
  }

  const reward = claimedReward ?? data.reward;
  const isChoice = reward.kind === "choice" && Boolean(reward.options?.length);

  return (
    <div className="daily-login-modal" role="dialog" aria-modal="true" aria-labelledby="daily-login-modal-title">
      <button aria-label="Закрити" className="daily-login-modal__backdrop" onClick={onClose} type="button" />
      <section className={"daily-login-modal__dialog" + (claimed ? " daily-login-modal__dialog--claimed" : "")}>
        <header className="daily-login-modal__header">
          <div>
            <span>{claimed ? "ОТРИМАНО · ДЕНЬ " + claimedDay : "ДЕНЬ " + data.day} · ТИЖДЕНЬ {data.cycle}</span>
            <h2 id="daily-login-modal-title">Нагорода за вхід</h2>
          </div>
          <button aria-label="Закрити" className="daily-login-modal__close" onClick={onClose} type="button"><AppIcon name="close" size={17} /></button>
        </header>

        <div className="daily-login-modal__days" aria-label="Сім днів циклу">
          {data.calendar.map((calendarDay) => (
            <span className={"daily-login-modal__day" + (calendarDay.isCurrent ? " daily-login-modal__day--current" : "") + (calendarDay.claimed ? " daily-login-modal__day--claimed" : "")} key={calendarDay.day}>{calendarDay.claimed ? "✓" : calendarDay.day}</span>
          ))}
        </div>

        <div className="daily-login-modal__showcase">
          <div className="daily-login-modal__rewards">
            <span className="daily-login-modal__eyebrow">{claimed ? "НАГОРОДУ ОТРИМАНО" : "СЬОГОДНІШНЯ ЗНАХІДКА"}</span>
            {isChoice ? (
              <div className="daily-login-modal__choices" aria-label="Вибір нагороди">
                {reward.options!.map((option, index) => (
                  <button className={selectedChoice === index ? "daily-login-modal__choice daily-login-modal__choice--selected" : "daily-login-modal__choice"} disabled={pending || claimed} key={option.kind + "-" + index} onClick={() => { setSelectedChoice(index); setFeedback(null); }} type="button">
                    <span className="daily-login-modal__choice-icon"><RewardIcon kind={option.kind} size={34} /></span>
                    <strong>{choiceLabel(option)}</strong>
                    <small>{choiceMeta(option)}</small>
                  </button>
                ))}
              </div>
            ) : <RewardTile reward={reward} />}
          </div>
          <div className="daily-login-modal__mascot" aria-hidden="true"><Lariska emotion={data.dialogue.emotion} /></div>
        </div>

        <div className="daily-login-modal__dialogue"><strong>Лариска</strong><p>{data.dialogue.text}</p></div>
        <div className="daily-login-modal__encouragement"><strong>Хочеш ще?</strong><span>Виконуй завдання та отримуй додаткові нагороди.</span></div>
        <div className="daily-login-modal__status" aria-live="polite">{feedback}</div>
        <button className="daily-login-modal__claim" disabled={pending || (!data.claimable && !claimed)} onClick={claimed ? onClose : handleClaim} type="button">
          {pending ? "Забираємо…" : claimed ? "Закрити" : "Забрати"}
        </button>
      </section>
    </div>
  );
}
