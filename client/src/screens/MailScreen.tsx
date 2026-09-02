import { useState } from "react";
import type { PlayerBalance, PlayerMailAction, PlayerMailActionResponse, PlayerMailClaimResponse, PlayerNicknameUpdateResponse } from "@cardastika/shared";
import { AppIcon } from "../components/AppIcon";
import { CurrencyIcon } from "../components/CurrencyDisplay";
import type { MailState } from "../hooks/useMail";
import { getUiNumberLocale } from "../i18n";
import { PlayerNicknameApiError } from "../telegram/nickname";

interface MailScreenProps {
  changeNickname: (nickname: string) => Promise<PlayerNicknameUpdateResponse>;
  claim: (messageId: string) => Promise<PlayerMailClaimResponse | null>;
  currentNickname: string;
  onBack: () => void;
  onBalanceChange: (balance: PlayerBalance) => void;
  onRetry: () => void;
  resolveAction: (messageId: string, action: PlayerMailAction) => Promise<PlayerMailActionResponse | null>;
  state: MailState;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat(getUiNumberLocale(), { day: "2-digit", month: "short" }).format(date);
}

export function MailScreen({ changeNickname, claim, currentNickname, onBack, onBalanceChange, onRetry, resolveAction, state }: MailScreenProps) {
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimError, setClaimError] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState(false);
  const [nicknameMessageId, setNicknameMessageId] = useState<string | null>(null);
  const [nickname, setNickname] = useState(currentNickname);
  const [nicknameError, setNicknameError] = useState<string | null>(null);

  async function handleClaim(messageId: string) {
    setClaimingId(messageId);
    setClaimError(false);
    const result = await claim(messageId);
    if (result) onBalanceChange(result.updatedBalance);
    else setClaimError(true);
    setClaimingId(null);
  }

  function openNicknameEditor(messageId: string) {
    setNicknameMessageId(messageId);
    setNickname(currentNickname);
    setNicknameError(null);
    setActionError(false);
  }

  async function handleMailAction(messageId: string, action: PlayerMailAction) {
    setActionId(messageId);
    setActionError(false);
    const result = await resolveAction(messageId, action);
    if (!result) setActionError(true);
    setActionId(null);
  }

  async function handleNicknameChange() {
    if (!nicknameMessageId) return;
    const normalized = nickname.trim().replace(/\s+/gu, " ");
    const length = Array.from(normalized).length;
    if (!length) {
      setNicknameError("Введи нік.");
      return;
    }
    if (length > 10) {
      setNicknameError("Нік має містити не більше 10 символів.");
      return;
    }

    const messageId = nicknameMessageId;
    setActionId(messageId);
    setNicknameError(null);
    try {
      await changeNickname(normalized);
      const result = await resolveAction(messageId, "change");
      if (!result) throw new Error("mail_action_failed");
      setNicknameMessageId(null);
    } catch (error: unknown) {
      setNicknameError(error instanceof PlayerNicknameApiError && error.code === "nickname_too_long"
        ? "Нік має містити не більше 10 символів."
        : error instanceof PlayerNicknameApiError && error.code === "nickname_required"
          ? "Введи нік."
          : "Не вдалося зберегти нік. Спробуй ще раз.");
    } finally {
      setActionId(null);
    }
  }

  return (
    <section className="mail-screen">
      <header className="shop-heading">
        <button aria-label="Назад" className="shop-back" onClick={onBack} type="button">
          <AppIcon name="chevron" size={20} />
        </button>
        <div>
          <span>Внутрішні повідомлення</span>
          <h1>ПОШТА</h1>
        </div>
      </header>

      {state.status === "loading" ? <div className="mail-state">Завантаження пошти…</div> : null}
      {state.status === "unavailable" ? <div className="mail-state">Пошта доступна після запуску через Telegram.</div> : null}
      {state.status === "error" ? (
        <div className="mail-state mail-state--error">
          <span>Не вдалося завантажити пошту.</span>
          <button onClick={onRetry} type="button">Повторити</button>
        </div>
      ) : null}

      {state.status === "ready" ? (
        state.data.messages.length ? (
          <div className="mail-list" aria-label="Повідомлення">
            {state.data.messages.map((message) => {
              const claimed = message.claimedAt !== null;
              const nicknameAction = message.actionType === "nickname_change";
              const actionCompleted = message.actionCompletedAt !== null;
              const pending = nicknameAction ? !actionCompleted : !claimed;
              const hasReward = message.gold > 0 || message.silver > 0 || message.cardReward !== null;
              return (
                <article className={`mail-message${claimed || actionCompleted ? " mail-message--claimed" : " mail-message--unread"}`} key={message.id}>
                  <div className="mail-message__heading">
                    <span className="mail-message__icon"><AppIcon name="mail" size={22} /></span>
                    <div>
                      <h2>{message.subject}</h2>
                      <time dateTime={message.createdAt}>{formatDate(message.createdAt)}</time>
                    </div>
                    {pending ? <span className="mail-message__new">Нове</span> : null}
                  </div>
                  <p>{message.body}</p>
                  {hasReward ? (
                    <div className="mail-message__rewards" aria-label="Нагорода">
                      {message.gold > 0 ? <span><CurrencyIcon kind="gold" size={19} />+{message.gold}</span> : null}
                      {message.silver > 0 ? <span><CurrencyIcon kind="silver" size={19} />+{message.silver}</span> : null}
                      {message.cardReward ? <span className="mail-message__card-reward"><img alt="" src={`/card-art/${message.cardReward.artKey ?? message.cardReward.code}.png`} />Карта: {message.cardReward.displayName ?? message.cardReward.code} · рівень {message.cardReward.level}</span> : null}
                    </div>
                  ) : null}
                  {nicknameAction ? actionCompleted ? (
                    <span className="mail-message__claimed">Налаштування ніку збережено</span>
                  ) : (
                    <div className="mail-message__actions">
                      <button className="mail-message__action mail-message__action--primary" disabled={actionId !== null} onClick={() => openNicknameEditor(message.id)} type="button">Змінити</button>
                      <button className="mail-message__action" disabled={actionId !== null} onClick={() => void handleMailAction(message.id, "leave")} type="button">Залишити</button>
                    </div>
                  ) : claimed ? (
                    <span className="mail-message__claimed">Подарунок отримано</span>
                  ) : (
                    <button className="mail-message__claim" disabled={claimingId !== null} onClick={() => void handleClaim(message.id)} type="button">
                      {claimingId === message.id ? "Забираємо…" : "Забрати подарунок"}
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mail-state">Нових повідомлень немає.</div>
        )
      ) : null}

      {claimError ? <p className="mail-error" role="alert">Не вдалося отримати подарунок. Спробуйте ще раз.</p> : null}
      {actionError ? <p className="mail-error" role="alert">Не вдалося зберегти вибір. Спробуйте ще раз.</p> : null}

      {nicknameMessageId ? (
        <div className="nickname-mail-overlay">
          <div aria-labelledby="nickname-mail-heading" aria-modal="true" className="nickname-mail-dialog" role="dialog">
            <button aria-label="Закрити" className="nickname-mail-dialog__close" onClick={() => setNicknameMessageId(null)} type="button">×</button>
            <span>ПЕРСОНАЛІЗАЦІЯ</span>
            <h2 id="nickname-mail-heading">ЗМІНИ НІК</h2>
            <p>Введи новий ігровий нік. Максимум 10 символів.</p>
            <input aria-label="Новий нік" autoFocus maxLength={10} onChange={(event) => setNickname(Array.from(event.target.value).slice(0, 10).join(""))} value={nickname} />
            {nicknameError ? <p className="nickname-mail-dialog__error" role="alert">{nicknameError}</p> : null}
            <div className="nickname-mail-dialog__actions">
              <button className="nickname-mail-dialog__cancel" disabled={actionId !== null} onClick={() => setNicknameMessageId(null)} type="button">Скасувати</button>
              <button className="nickname-mail-dialog__confirm" disabled={actionId !== null} onClick={() => void handleNicknameChange()} type="button">{actionId === nicknameMessageId ? "Зберігаємо…" : "Зберегти"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
