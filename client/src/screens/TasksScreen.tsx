import { useState } from "react";
import { AppIcon } from "../components/AppIcon";
import { DailyTaskRow } from "../components/DailyTaskRow";
import { Lariska } from "../components/Lariska";
import { useBattlePass } from "../hooks/useBattlePass";
import type { LariskaDailyChoiceOption } from "@cardastika/shared";

const DIAMOND_ASSET = "/assets/ui/world-tree/game-icons/diamond.svg";

function choiceOptionLabel(option: LariskaDailyChoiceOption) {
  if (option.kind === "card") return option.displayName ?? option.code;
  if (option.kind === "equipment") return option.name;
  return option.label;
}

function choiceOptionMeta(option: LariskaDailyChoiceOption) {
  if (option.kind === "card") return `${option.rarity} · ${option.element} · Lv${option.level}`;
  if (option.kind === "equipment") return `${option.rarity} · ${option.slot}`;
  return "преміальна валюта";
}

export function TasksScreen({ onBack, onOpenTask, onPlayerSummaryChange }: { onBack: () => void; onOpenTask: (id: string) => void; onPlayerSummaryChange: (balance: { accountXp: number; arenaTokens: number; gold: number; level: number; silver: number }) => void }) {
  const { claimDailyLogin, claimDailyTask, retry, state } = useBattlePass();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pendingDailyLogin, setPendingDailyLogin] = useState(false);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function handleClaim(id: string) {
    setPendingId(id);
    setFeedback(null);
    try {
      await claimDailyTask(id);
      setFeedback("Щоденну нагороду отримано");
    } catch {
      setFeedback("Завдання ще не виконано або нагорода вже забрана");
    } finally {
      setPendingId(null);
    }
  }

  async function handleDailyLoginClaim() {
    if (state.status !== "ready" || !state.data.dailyLogin.claimable) return;
    const choiceIndex = selectedChoice ?? undefined;
    if (state.data.dailyLogin.reward.kind === "choice" && choiceIndex === undefined) {
      setFeedback("Спочатку обери одну зі знахідок Лариски");
      return;
    }
    setPendingDailyLogin(true);
    setFeedback(null);
    try {
      const response = await claimDailyLogin(choiceIndex);
      onPlayerSummaryChange(response.rewardPlayer);
      setSelectedChoice(null);
      setFeedback(response.streakBonus ? `Знахідку отримано. Бонус серії: ${response.streakBonus.label}` : "Знахідку Лариски отримано");
    } catch {
      setFeedback("Знахідку вже забрали або вона тимчасово недоступна");
    } finally {
      setPendingDailyLogin(false);
    }
  }

  const nextRewardMultiplier = state.status === "ready" ? Math.min(3, state.data.daily.currentRewardMultiplier + 1) : 1;
  const dailyEmotion = state.status === "ready"
    ? state.data.daily.completedCount === state.data.daily.tasks.length ? "happy" : state.data.daily.currentRewardMultiplier > 1 ? "sly" : "neutral"
    : "neutral";
  const dailyMessage = state.status === "ready" && state.data.daily.completedCount === state.data.daily.tasks.length
    ? "Усі завдання? Оце вже схоже на прибутковий день."
    : state.status === "ready" && state.data.daily.currentRewardMultiplier > 1
      ? "Сьогодні платять більше. Не змусь мене нагадувати двічі."
      : "У мене для тебе кілька дрібних справ. За них платять.";

  return (
    <div className="tasks-screen">
      <header className="campaign-heading campaign-heading--title-first">
        <button aria-label="Назад" onClick={onBack} type="button"><AppIcon name="chevron" size={18} /></button>
        <div><h1>Завдання</h1><span>Щоденні цілі та алмазні нагороди</span></div>
      </header>

      {state.status === "loading" ? <div className="battle-pass-state">Відновлюємо завдання…</div> : null}
      {state.status === "error" ? <div className="battle-pass-state battle-pass-state--error"><strong>Завдання недоступні</strong><span>{state.message}</span><button onClick={retry} type="button">Повторити</button></div> : null}
      {state.status === "ready" ? (
        <>
          <section className={`lariska-login${state.data.dailyLogin.day === 7 ? " lariska-login--final" : ""}`} aria-label="Знахідки Лариски">
            <header className="lariska-login__heading">
              <div><span>ЩОДЕННИЙ ВХІД</span><h2>Знахідки Лариски</h2></div>
              <strong>Тиждень {state.data.dailyLogin.cycle}</strong>
            </header>
            <div className="lariska-login__calendar" aria-label="Календар щоденних нагород">
              {state.data.dailyLogin.calendar.map((calendarDay) => (
                <div className={`lariska-login__day${calendarDay.isCurrent ? " lariska-login__day--current" : ""}${calendarDay.claimed ? " lariska-login__day--claimed" : ""}`} key={calendarDay.day} title={calendarDay.reward.label}>
                  <strong>{calendarDay.day}</strong>
                  <span>{calendarDay.claimed ? "✓" : calendarDay.isCurrent ? "•" : ""}</span>
                </div>
              ))}
            </div>
            <div className="lariska-login__body">
              <div className="lariska-login__mascot" aria-hidden="true"><Lariska emotion={state.data.dailyLogin.dialogue.emotion} /></div>
              <div className="lariska-login__copy"><strong>Лариска</strong><p>{state.data.dailyLogin.dialogue.text}</p></div>
            </div>
            <div className="lariska-login__reward">
              <div className="lariska-login__reward-head"><span>ДЕНЬ {state.data.dailyLogin.day}</span><strong>{state.data.dailyLogin.reward.label}</strong></div>
              <p>{state.data.dailyLogin.reward.description}</p>
              {state.data.dailyLogin.reward.options ? (
                <div className="lariska-login__choices" aria-label="Вибір щоденної нагороди">
                  {state.data.dailyLogin.reward.options.map((option, index) => (
                    <button className={selectedChoice === index ? "lariska-login__choice lariska-login__choice--selected" : "lariska-login__choice"} disabled={!state.data.dailyLogin.claimable || pendingDailyLogin} key={`${option.kind}-${index}`} onClick={() => setSelectedChoice(index)} type="button">
                      <span>{index + 1}</span>
                      <strong>{choiceOptionLabel(option)}</strong>
                      <small>{choiceOptionMeta(option)}</small>
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="lariska-login__action-row">
                <span className="lariska-login__streak">Серія: <strong>{state.data.dailyLogin.streak}</strong></span>
                <button className="lariska-login__claim" disabled={!state.data.dailyLogin.claimable || pendingDailyLogin || (state.data.dailyLogin.reward.kind === "choice" && selectedChoice === null)} onClick={handleDailyLoginClaim} type="button">
                  {pendingDailyLogin ? "Забираємо…" : state.data.dailyLogin.claimable ? state.data.dailyLogin.reward.kind === "choice" ? "Вибрати й забрати" : "Забрати знахідку" : "Забрано сьогодні"}
                </button>
              </div>
            </div>
            <div className="lariska-login__streak-rewards" aria-label="Бонуси серії">
              {state.data.dailyLogin.streakRewards.map((reward) => <span className={reward.claimed ? "lariska-login__streak-reward lariska-login__streak-reward--claimed" : "lariska-login__streak-reward"} key={reward.threshold}><strong>{reward.threshold}</strong>{reward.claimed ? "✓" : ""}<small>{reward.label}</small></span>)}
            </div>
          </section>

          <section className="tasks-screen__panel" aria-label="Щоденні завдання">
          <div className="tasks-screen__mascot">
            <div className="tasks-screen__mascot-art" aria-hidden="true"><Lariska emotion={dailyEmotion} /></div>
            <div className="tasks-screen__mascot-copy"><strong>Лариска</strong><p>{dailyMessage}</p></div>
          </div>
          <div className="tasks-screen__marathon" aria-labelledby="tasks-marathon-heading">
            <div className="tasks-screen__ornate-heading">
              <span aria-hidden="true" />
              <strong id="tasks-marathon-heading">Марафон почнеться в понеділок!</strong>
              <span aria-hidden="true" />
            </div>
            <div className="tasks-screen__rule">
              <span aria-hidden="true" />
              <strong>{state.data.daily.currentRewardMultiplier === 1 ? "Сьогодні звичайна нагорода" : `Сьогодні нагорода ×${state.data.daily.currentRewardMultiplier}`}</strong>
              <span aria-hidden="true" />
            </div>
            <p className="tasks-screen__description">Виконайте сьогодні {state.data.daily.tasks.length} завдань, і завтра нагорода подвоїться!</p>
            <div aria-label={`Поточний множник нагороди ×${state.data.daily.currentRewardMultiplier}, наступний рівень ×${nextRewardMultiplier}`} className="tasks-screen__multiplier">
              <strong>×{state.data.daily.currentRewardMultiplier}</strong>
              <span aria-hidden="true">→</span>
              <strong><img alt="" aria-hidden="true" src={DIAMOND_ASSET} />×{nextRewardMultiplier}</strong>
            </div>
            <div className="tasks-screen__completed">
              <span aria-hidden="true" />
              <strong>Сьогодні виконано: {state.data.daily.completedCount}</strong>
              <span aria-hidden="true" />
            </div>
          </div>
          <div className="tasks-screen__list">{state.data.daily.tasks.map((task) => <DailyTaskRow key={task.id} onClaim={handleClaim} onOpen={onOpenTask} pending={pendingId === task.id} task={task} />)}</div>
          {feedback ? <p className="battle-pass-feedback" role="status">{feedback}</p> : null}
          </section>
        </>
      ) : null}
    </div>
  );
}
