import { useLayoutEffect, useRef, useState } from "react";
import { ScreenHeading } from "../components/ScreenHeading";
import { formatUiNumber, getUiLocale, translateUi } from "../i18n";
import { AchievementGlyph } from "../records/AchievementGlyph";
import { ACHIEVEMENT_RECORD_GROUPS, isCompactAchievementImage, type AchievementLevel, type AchievementRecord } from "../records/recordsCatalog";
import { useAchievementProgress } from "../records/useAchievementProgress";

interface RecordsScreenProps {
  onBack: () => void;
}

function goalLabel(record: AchievementRecord, level: AchievementLevel, locale: ReturnType<typeof getUiLocale>) {
  return level.target
    ? translateUi(level.target, locale)
    : `${formatUiNumber(level.threshold)} ${translateUi(record.unit, locale)}`.trim();
}

export function RecordsScreen({ onBack }: RecordsScreenProps) {
  const locale = getUiLocale();
  const { retry, state } = useAchievementProgress();
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const screenRef = useRef<HTMLElement>(null);
  const listScrollTopRef = useRef(0);
  const stats = state.status === "ready" ? state.data.statistics : null;
  const selectedGroup = ACHIEVEMENT_RECORD_GROUPS.find(({ records }) => records.some(({ id }) => id === selectedRecordId));
  const selectedRecord = selectedGroup?.records.find(({ id }) => id === selectedRecordId);
  const selectedCurrent = selectedRecord ? stats?.[selectedRecord.statistic] ?? null : null;

  useLayoutEffect(() => {
    screenRef.current?.closest<HTMLElement>(".app-content")?.scrollTo({ top: selectedRecordId ? 0 : listScrollTopRef.current, behavior: "auto" });
  }, [selectedRecordId]);

  const openRecord = (id: string) => {
    listScrollTopRef.current = screenRef.current?.closest<HTMLElement>(".app-content")?.scrollTop ?? 0;
    setSelectedRecordId(id);
  };

  const renderLevel = (record: AchievementRecord, level: AchievementLevel, index: number, current: number | null) => {
    const title = translateUi(record.title, locale);
    const reached = current !== null && current >= level.threshold;
    const progress = current === null ? null : `${translateUi("Прогрес", locale)}: ${formatUiNumber(Math.min(current, level.threshold))} ${translateUi("із", locale)} ${formatUiNumber(level.threshold)}`;
    return (
      <li className={`records-level${reached ? " records-level--complete" : ""}`} key={`${record.id}-${level.threshold}`}>
        <AchievementGlyph compact={isCompactAchievementImage(record)} label={`${title}, ${translateUi("рівень", locale)} ${index + 1}`} src={record.image} tier={index} />
        <div className="records-level__content">
          {record.levels.length > 1 ? <span className="records-level__number">{translateUi("Рівень", locale)} {index + 1}</span> : null}
          <strong className="records-level__target">{goalLabel(record, level, locale)}</strong>
          {reached ? <em>{translateUi("Здобуто", locale)}</em> : null}
        </div>
        {!reached && progress ? <p className="records-level__progress">{progress}</p> : null}
      </li>
    );
  };

  return (
    <section aria-label={selectedRecord ? translateUi(selectedRecord.title, locale) : translateUi("Перелік рекордів", locale)} className="profile-screen pf-screen records-screen" ref={screenRef}>
      <ScreenHeading
        description={selectedRecord ? undefined : translateUi("Відкрий нагороду, щоб побачити умови кожного рівня та свій прогрес.", locale)}
        eyebrow={selectedRecord ? translateUi("Рекорди", locale) : undefined}
        onBack={selectedRecord ? () => setSelectedRecordId(null) : onBack}
        title={selectedRecord ? translateUi(selectedRecord.title, locale) : translateUi("Рекорди", locale)}
      />

      {state.status === "loading" ? <p className="records-status" role="status">{translateUi("Завантажуємо прогрес нагород…", locale)}</p> : null}
      {state.status === "unavailable" ? <p className="records-status" role="status">{translateUi("Увійди в гру, щоб побачити особистий прогрес.", locale)}</p> : null}
      {state.status === "error" ? (
        <div className="records-status records-status--error" role="alert">
          <span>{translateUi("Не вдалося завантажити прогрес нагород.", locale)}</span>
          <button className="eq-button eq-button--parchment" onClick={retry} type="button">{translateUi("Повторити", locale)}</button>
        </div>
      ) : null}

      {selectedRecord ? (
        <div className="records-page">
          {selectedCurrent === null && state.status === "ready" ? <p className="records-status">{translateUi("Статистика цього режиму ще не збирається.", locale)}</p> : null}
          {selectedRecord.levels.some(({ threshold }) => selectedCurrent === null || selectedCurrent < threshold) ? (
            <section className="pf-section records-section">
              <h2>{translateUi(selectedCurrent === null ? "Умови та прогрес" : "В процесі", locale)}</h2>
              <ol className="eq-plate pf-plate records-levels">
                {selectedRecord.levels.map((level, index) => selectedCurrent !== null && selectedCurrent >= level.threshold ? null : renderLevel(selectedRecord, level, index, selectedCurrent))}
              </ol>
            </section>
          ) : null}
          {selectedCurrent !== null && selectedRecord.levels.some(({ threshold }) => selectedCurrent >= threshold) ? (
            <section className="pf-section records-section">
              <h2>{translateUi("Готові", locale)}</h2>
              <ol className="eq-plate pf-plate records-levels">
                {selectedRecord.levels.map((level, index) => selectedCurrent >= level.threshold ? renderLevel(selectedRecord, level, index, selectedCurrent) : null)}
              </ol>
            </section>
          ) : null}
        </div>
      ) : (
        ACHIEVEMENT_RECORD_GROUPS.map((group) => {
          const groupTitle = translateUi(group.title, locale);
          return (
            <section aria-label={groupTitle} className="pf-section records-section" key={group.title}>
              <h2>{groupTitle}</h2>
              <div className="eq-plate pf-plate records-plate">
                <div aria-label={groupTitle} className="records-grid" role="list">
                  {group.records.map((record) => {
                    const current = stats?.[record.statistic] ?? null;
                    const completedLevels = current === null ? null : record.levels.filter(({ threshold }) => current >= threshold).length;
                    return (
                      <div className="records-entry" key={record.id} role="listitem">
                        <button className="records-card" onClick={() => openRecord(record.id)} type="button">
                          <img alt="" aria-hidden="true" className={isCompactAchievementImage(record) ? "records-card__image records-card__image--compact" : "records-card__image"} height={56} loading="lazy" src={record.image} width={56} />
                          <strong className="records-card__title">{translateUi(record.title, locale)}</strong>
                          {state.status === "ready" ? <small>{completedLevels === null ? "—" : `${translateUi("Отримано", locale)} ${completedLevels} ${translateUi("із", locale)} ${record.levels.length}`}</small> : null}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          );
        })
      )}
    </section>
  );
}
