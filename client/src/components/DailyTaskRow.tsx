import type { DailyTaskView } from "@cardastika/shared";
import { AppIcon, type AppIconName } from "./AppIcon";

const DIAMOND_ASSET = "/assets/ui/world-tree/game-icons/diamond.svg";

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
    <article className={`quest-paper${task.claimed ? " quest-paper--claimed" : task.completed ? " quest-paper--completed" : ""}`}>
      <div className="quest-paper__content">
        <header className="quest-paper__header">
          <span className="quest-paper__icon"><AppIcon name={task.claimed || task.completed ? "card-reward" : action.icon} size={22} /></span>
          <div className="quest-paper__title">
            <span>Щоденне завдання</span>
            <strong>{task.title}</strong>
          </div>
        </header>

        <div className="quest-paper__meta">
          <span>Прогрес: {task.progress} з {task.target}</span>
          <span className="quest-paper__reward">+{task.rewardDiamonds}<img alt="" aria-hidden="true" src={DIAMOND_ASSET} /> діамантів</span>
        </div>
        <span className="quest-paper__track" aria-hidden="true"><span style={{ width: `${percent}%` }} /></span>

        <footer className="quest-paper__footer">
          <span className="quest-paper__status">
            {task.claimed ? "Нагороду забрано" : task.completed ? "Завдання виконано" : "Виконайте завдання"}
          </span>
          {task.claimed ? (
            <span aria-label="Нагороду забрано" className="quest-paper__done">✓</span>
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
