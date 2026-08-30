import { useState } from "react";
import { AppIcon } from "../components/AppIcon";
import { DailyTaskRow } from "../components/DailyTaskRow";
import { Lariska } from "../components/Lariska";
import { useBattlePass } from "../hooks/useBattlePass";

const DIAMOND_ASSET = "/assets/ui/world-tree/game-icons/diamond.svg";

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
        <div><h1>Завдання</h1><span>Щоденні цілі та нагороди за виконання</span></div>
      </header>

      {state.status === "loading" ? <div className="battle-pass-state">Відновлюємо завдання…</div> : null}
      {state.status === "error" ? <div className="battle-pass-state battle-pass-state--error"><strong>Завдання недоступні</strong><span>{state.message}</span><button onClick={retry} type="button">Повторити</button></div> : null}
      {state.status === "ready" ? (
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
      ) : null}
    </div>
  );
}
