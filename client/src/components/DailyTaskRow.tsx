import type { DailyTaskView } from "@cardastika/shared";
import { AppIcon, type AppIconName } from "./AppIcon";

const DIAMOND_ASSET = "/assets/ui/icons/icon-diamond-v1.webp";

const taskActions: Record<string, { icon: AppIconName; label: string }> = {
  "absorb-cards": { icon: "card-absorb", label: "До колоди" },
  "acquire-cards": { icon: "shop", label: "До магазину" },
  "buy-cards": { icon: "shop", label: "До магазину" },
  "play-duels": { icon: "duel", label: "До дуелей" },
  "upgrade-card": { icon: "card-strength", label: "До колоди" },
  "win-duels": { icon: "duel", label: "До дуелей" },
};

export function DailyTaskRow({ task, onClaim, onOpen, pending }: { task: DailyTaskView; onClaim: (id: string) => void; onOpen: (id: string) => void; pending: boolean }) {
  const percent = Math.min(100, task.target === 0 ? 100 : task.progress / task.target * 100);
  const action = taskActions[task.id] ?? { icon: "tasks" as const, label: "До завдання" };

  return (
    <article className={`quest-paper story-notice${task.claimed ? " quest-paper--claimed" : task.completed ? " quest-paper--completed" : ""}`}>
      <span aria-hidden="true" className="story-notice__nail" />
      <div className="quest-paper__content">
        <header className="quest-paper__header">
          <span className="quest-paper__icon"><AppIcon name={task.claimed || task.completed ? "card-reward" : action.icon} size={22} /></span>
          <div className="quest-paper__title">
            <strong>{task.title}</strong>
          </div>
          <span aria-label={`Нагорода: ${task.rewardDiamonds} діамантів`} className="quest-paper__reward">+{task.rewardDiamonds}<img alt="" aria-hidden="true" src={DIAMOND_ASSET} /></span>
        </header>

        <div className="quest-paper__progress">
          <div className="quest-paper__progress-head"><span>Прогрес</span><strong>{task.progress} / {task.target}</strong></div>
          <span
            aria-label={`Прогрес: ${task.progress} з ${task.target}`}
            aria-valuemax={task.target}
            aria-valuemin={0}
            aria-valuenow={task.progress}
            className="quest-paper__track"
            role="progressbar"
          ><span style={{ width: `${percent}%` }} /></span>
        </div>

        <footer className="quest-paper__footer">
          {task.claimed || task.completed
            ? <img alt={task.claimed ? "Нагороду забрано" : "Завдання виконано"} className="story-notice__seal" src="/assets/ui/trials/board/seal-v1.webp" />
            : null}
          {task.claimed ? (
            <span className="quest-paper__status quest-paper__status--done">Нагороду забрано</span>
          ) : task.completed ? (
            <button className="quest-paper__button quest-paper__button--claim" disabled={pending} onClick={() => onClaim(task.id)} type="button">
              {pending ? "Забираємо…" : "Забрати нагороду"}
            </button>
          ) : (
            <button className="quest-paper__button quest-paper__button--action" onClick={() => onOpen(task.id)} type="button">
              <AppIcon name={action.icon} size={15} />
              {action.label}
            </button>
          )}
        </footer>
      </div>
    </article>
  );
}
