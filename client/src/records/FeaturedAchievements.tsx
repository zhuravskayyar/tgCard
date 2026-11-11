import { getUiLocale, translateUi } from "../i18n";
import { getFeaturedAchievements, isCompactAchievementImage } from "./recordsCatalog";
import type { AchievementProgressState } from "./useAchievementProgress";

interface FeaturedAchievementsProps {
  onRetry: () => void;
  state: AchievementProgressState;
}

export function FeaturedAchievements({ onRetry, state }: FeaturedAchievementsProps) {
  const locale = getUiLocale();
  const featured = state.status === "ready" ? getFeaturedAchievements(state.data.statistics) : [];

  if (state.status === "loading") return <p className="pf-empty" role="status">{translateUi("Завантажуємо прогрес нагород…", locale)}</p>;
  if (state.status === "unavailable") return <p className="pf-empty" role="status">{translateUi("Увійди в гру, щоб побачити особистий прогрес.", locale)}</p>;
  if (state.status === "error") return <div className="pf-retry"><p className="pf-empty" role="alert">{translateUi("Не вдалося завантажити прогрес нагород.", locale)}</p><button className="eq-button eq-button--parchment" onClick={onRetry} type="button">{translateUi("Повторити", locale)}</button></div>;
  if (featured.length === 0) return <p className="pf-empty" role="status">{translateUi("Здобутих відзнак поки немає.", locale)}</p>;

  return <div className={`pf-grid pf-grid--honors pf-grid--honors-${featured.length}`}>
    {featured.map(({ earnedLevel, record }) => <article key={record.id}>
      <span className="pf-grid__title">{translateUi(record.title, locale)}</span>
      <img alt="" className={`pf-grid__icon${isCompactAchievementImage(record) ? " pf-grid__icon--compact" : ""}`} src={record.image} />
      <small>{record.levels.length > 1 ? `${translateUi("Рівень", locale)} ${earnedLevel}` : translateUi("Здобуто", locale)}</small>
    </article>)}
  </div>;
}
