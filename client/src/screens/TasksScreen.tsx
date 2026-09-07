import { useState } from "react";
import { AppIcon } from "../components/AppIcon";
import { DailyTaskRow } from "../components/DailyTaskRow";
import { Lariska } from "../components/Lariska";
import { useBattlePass } from "../hooks/useBattlePass";

const DIAMOND_ASSET = "/assets/ui/world-tree/game-icons/diamond.svg";

function getDailyReset(taskDate: string) {
  const [year, month, day] = taskDate.split("-").map(Number);
  const resetAt = Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)
    ? new Date(Date.UTC(year, month - 1, day + 1))
    : null;
  const hoursLeft = resetAt ? Math.max(0, Math.ceil((resetAt.getTime() - Date.now()) / 3_600_000)) : 0;

  return {
    label: hoursLeft > 0 ? `ще ${hoursLeft} год.` : "оновлення скоро",
    resetAt: resetAt?.toISOString() ?? undefined,
  };
}

export function TasksScreen({ onBack, onOpenTask }: { onBack: () => void; onOpenTask: (id: string) => void }) {
  const { claimDailyTask, retry, state } = useBattlePass();
  const [pendingId, setPendingId] = useState<string | null>(null);
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

  const dailyEmotion = state.status === "ready"
    ? state.data.daily.completedCount === state.data.daily.tasks.length ? "happy" : state.data.daily.currentRewardMultiplier > 1 ? "sly" : "neutral"
    : "neutral";
  const dailyMessage = state.status === "ready" && state.data.daily.completedCount === state.data.daily.tasks.length
    ? "Усі завдання? Оце вже схоже на прибутковий день."
    : state.status === "ready" && state.data.daily.currentRewardMultiplier > 1
      ? "Сьогодні платять більше. Не змусь мене нагадувати двічі."
      : "У мене для тебе кілька дрібних справ. За них платять.";
  const dailyReset = state.status === "ready" ? getDailyReset(state.data.daily.taskDate) : null;
  const nextRewardMultiplier = state.status === "ready"
    ? Math.min(3, state.data.daily.currentRewardMultiplier + 1)
    : 1;

  return (
    <div className="tasks-screen">
      <header className="campaign-heading campaign-heading--title-first">
        <button aria-label="Назад" onClick={onBack} type="button"><AppIcon name="chevron" size={18} /></button>
        <div><h1>Завдання</h1><span>Щоденні цілі та нагороди за виконання</span></div>
      </header>

      {state.status === "loading" ? <div className="battle-pass-state">Відновлюємо завдання…</div> : null}
      {state.status === "error" ? <div className="battle-pass-state battle-pass-state--error"><strong>Завдання недоступні</strong><span>{state.message}</span><button onClick={retry} type="button">Повторити</button></div> : null}
      {state.status === "ready" ? (
        <section className="tasks-screen__panel" aria-label="Щоденні завдання">
          <div className="tasks-screen__mascot">
            <div className="tasks-screen__mascot-art" aria-hidden="true"><Lariska emotion={dailyEmotion} /></div>
            <div className="tasks-screen__mascot-copy"><strong>Лариска</strong><p>{dailyMessage}</p></div>
            <time className="tasks-screen__mascot-reset" dateTime={dailyReset?.resetAt} title="Щоденні завдання оновлюються опівночі за UTC">{dailyReset?.label}</time>
          </div>
          <div className="tasks-screen__marathon" aria-labelledby="tasks-marathon-heading">
            <div className="tasks-screen__ornate-heading">
              <span aria-hidden="true" />
              <strong id="tasks-marathon-heading">Щоденна нагорода</strong>
              <span aria-hidden="true" />
            </div>
            <div className="tasks-screen__daily-reward-row">
              <div className="tasks-screen__daily-progress">
                <strong>Виконай усі завдання</strong>
                <div
                  aria-label={`Виконано ${state.data.daily.completedCount} з ${state.data.daily.tasks.length}`}
                  aria-valuemax={state.data.daily.tasks.length}
                  aria-valuemin={0}
                  aria-valuenow={state.data.daily.completedCount}
                  className="tasks-screen__daily-progress-track"
                  role="progressbar"
                >
                  <span style={{ width: `${state.data.daily.tasks.length === 0 ? 0 : state.data.daily.completedCount / state.data.daily.tasks.length * 100}%` }} />
                </div>
                <small>{state.data.daily.completedCount} / {state.data.daily.tasks.length}</small>
              </div>
              <div aria-label={`Множник нагороди ×${state.data.daily.currentRewardMultiplier}`} className="tasks-screen__daily-reward">
                <img alt="" aria-hidden="true" src={DIAMOND_ASSET} />
                <strong>×{state.data.daily.currentRewardMultiplier}</strong>
                <small>сьогодні</small>
              </div>
            </div>
            <p className="tasks-screen__daily-note">Завтра множник: ×{nextRewardMultiplier}</p>
          </div>
          <div className="tasks-screen__list">{state.data.daily.tasks.map((task) => <DailyTaskRow key={task.id} onClaim={handleClaim} onOpen={onOpenTask} pending={pendingId === task.id} task={task} />)}</div>
          {feedback ? <p className="battle-pass-feedback" role="status">{feedback}</p> : null}
          </section>
      ) : null}
    </div>
  );
}
