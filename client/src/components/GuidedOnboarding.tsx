import type { TutorialStatus } from "../hooks/useTutorial";
import { AppIcon } from "./AppIcon";

interface GuidedOnboardingProps {
  onResume: () => void;
  status: TutorialStatus;
}

function getRouteLabel(status: TutorialStatus) {
  if (status === "campaign") return "Кампанія";
  if (status && ["duel-first-card", "duel-advantage", "duel-free-play", "duel-result"].includes(status)) return "Дуель";
  return "Стартова дуель";
}

export function GuidedOnboarding({ onResume, status }: GuidedOnboardingProps) {
  if (!status || status === "complete") return null;
  const paused = status === "paused";
  const routeLabel = getRouteLabel(status);
  const campaign = status === "campaign";
  return (
    <section className="guided-route" aria-labelledby="guided-route-title">
      <div className="guided-route__glow" aria-hidden="true" />
      <div className="guided-route__header">
        <span className="guided-route__eyebrow">Навчальний маршрут</span>
        <span className="guided-route__progress">{paused ? "ПРИЗУПИНЕНО" : "НАВЧАННЯ ТРИВАЄ"}</span>
      </div>
      <div className="guided-route__main">
        <div className="guided-route__icon"><AppIcon name="campaign" size={34} /></div>
        <div>
          <h2 id="guided-route-title">Твій шлях у Cardastika</h2>
          <p>{paused ? "Повернися до маршруту, щоб продовжити збережене місце." : campaign ? "Виконуй завдання кампанії, відкривай нові етапи й розкривай історію." : "Зіграй стартову дуель, отримай нагороду й вирушай у кампанію."}</p>
        </div>
      </div>
      <div className="guided-route__footer">
        <span>{paused ? "Маршрут збережено" : `Поточний напрям: ${routeLabel}`}</span>
        <button onClick={onResume} type="button">{paused ? "Продовжити" : "Відкрити навчання"} <AppIcon name="chevron" size={15} /></button>
      </div>
    </section>
  );
}
