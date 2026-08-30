import { useEffect, useState } from "react";
import type { AbsorptionCandidatesResponse, PlayerCardDetailResponse } from "@cardastika/shared";
import { AppIcon } from "../components/AppIcon";
import { CardFxWrapper } from "../components/CardFxWrapper";
import { CardNameBadge } from "../components/CardNameBadge";
import { CurrencyIcon } from "../components/CurrencyDisplay";
import { DeckCard } from "../components/DeckCard";
import { MenuRow } from "../components/MenuRow";
import { MenuTextureSlices } from "../components/MenuTextureSlices";
import { Pagination } from "../components/Pagination";
import { getTelegramInitData } from "../telegram";
import { absorbCards, levelUpCard, loadAbsorptionCandidates, loadCardDetail, toggleCardProtection } from "../telegram/playerCards";
import { PlayerDataError } from "../telegram/playerDeck";

const elementLabels = { fire: "Вогонь", water: "Вода", air: "Повітря", earth: "Земля" } as const;
const rarityLabels = { common: "Звичайна", uncommon: "Незвичайна", rare: "Рідкісна", epic: "Епічна", legendary: "Легендарна", mythic: "Міфічна" } as const;

type DetailState = { status: "loading" | "unavailable" | "error" } | { status: "ready"; data: PlayerCardDetailResponse };
type CandidatesState = { status: "loading" | "error" } | { status: "ready"; data: AbsorptionCandidatesResponse };

interface CardDetailScreenProps {
  cardInstanceId: string;
  onBack: () => void;
  onDeckPowerChange: (deckPower: number) => void;
  onGoldChange: (gold: number) => void;
  onOpenDeck: () => void;
  onOpenShop: () => void;
  onOpenWeakCards: () => void;
}

function requestErrorMessage(error: unknown) {
  if (error instanceof PlayerDataError && error.code === "unsupported_level_data") return "Для цього рівня в джерелі немає підтвердженого значення.";
  if (error instanceof PlayerDataError && error.code === "fodder_in_deck") return "Одна з обраних карт уже увійшла до бойової колоди.";
  if (error instanceof PlayerDataError && error.code === "protected_card") return "Захищену карту не можна поглинути.";
  if (error instanceof PlayerDataError && error.code === "insufficient_gold") return "Недостатньо золота для підняття рівня.";
  if (error instanceof PlayerDataError && error.code === "insufficient_elements") return "Недостатньо магічних елементів для підвищення рівня.";
  return "Дію не виконано. Оновіть дані та спробуйте ще раз.";
}

export function CardDetailScreen({ cardInstanceId, onBack, onDeckPowerChange, onGoldChange, onOpenDeck, onOpenShop, onOpenWeakCards }: CardDetailScreenProps) {
  const [detail, setDetail] = useState<DetailState>({ status: "loading" });
  const [detailAttempt, setDetailAttempt] = useState(0);
  const [candidatePage, setCandidatePage] = useState(1);
  const [candidateAttempt, setCandidateAttempt] = useState(0);
  const [candidates, setCandidates] = useState<CandidatesState>({ status: "loading" });
  const [levelConfirmationOpen, setLevelConfirmationOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<"level" | "absorb" | "protection" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const initData = getTelegramInitData();
    if (!initData) { setDetail({ status: "unavailable" }); return; }
    const controller = new AbortController();
    setDetail({ status: "loading" });
    void loadCardDetail(initData, cardInstanceId, controller.signal)
      .then((data) => setDetail({ status: "ready", data }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setDetail({ status: "error" });
      });
    return () => controller.abort();
  }, [cardInstanceId, detailAttempt]);

  useEffect(() => {
    const initData = getTelegramInitData();
    if (!initData) return;
    const controller = new AbortController();
    setCandidates({ status: "loading" });
    void loadAbsorptionCandidates(initData, cardInstanceId, candidatePage, controller.signal)
      .then((data) => setCandidates({ status: "ready", data }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setCandidates({ status: "error" });
      });
    return () => controller.abort();
  }, [candidateAttempt, candidatePage, cardInstanceId]);

  async function performLevelUp() {
    const initData = getTelegramInitData();
    if (!initData || pendingAction) return;
    setPendingAction("level"); setActionError(null);
    try {
      const result = await levelUpCard(initData, cardInstanceId);
      setDetail({ status: "ready", data: result });
      onGoldChange(result.playerGold);
      if (result.deckPower !== undefined) onDeckPowerChange(result.deckPower);
    } catch (error) { setActionError(requestErrorMessage(error)); }
    finally { setPendingAction(null); setLevelConfirmationOpen(false); }
  }

  function requestLevelUp() {
    if (progression.requiredGold !== null && progression.requiredGold > 0) {
      setLevelConfirmationOpen(true);
      return;
    }
    void performLevelUp();
  }

  async function performAbsorption(fodderInstanceIds: readonly string[]) {
    const initData = getTelegramInitData();
    if (!initData || pendingAction || fodderInstanceIds.length === 0) return;
    setPendingAction("absorb"); setActionError(null);
    try {
      const result = await absorbCards(initData, cardInstanceId, [...fodderInstanceIds]);
      const consumedIds = new Set(result.consumedInstanceIds);
      setDetail({ status: "ready", data: result });
      onGoldChange(result.playerGold);
      if (result.deckPower !== undefined) onDeckPowerChange(result.deckPower);
      setCandidates((current) => {
        if (current.status !== "ready") return current;
        const totalCards = Math.max(0, current.data.totalCards - consumedIds.size);
        const totalPages = Math.ceil(totalCards / current.data.pageSize);
        return {
          status: "ready",
          data: {
            ...current.data,
            cards: current.data.cards.filter(({ instanceId }) => !consumedIds.has(instanceId)),
            page: Math.min(current.data.page, Math.max(1, totalPages)),
            totalCards,
            totalPages,
          },
        };
      });
      setCandidatePage(1);
      setCandidateAttempt((current) => current + 1);
    } catch (error) {
      setActionError(requestErrorMessage(error));
      setCandidateAttempt((current) => current + 1);
    } finally { setPendingAction(null); }
  }

  async function performProtectionToggle() {
    const initData = getTelegramInitData();
    if (!initData || pendingAction || detail.status !== "ready") return;
    setPendingAction("protection"); setActionError(null);
    try {
      const result = await toggleCardProtection(initData, cardInstanceId);
      setDetail({ status: "ready", data: result });
      onGoldChange(result.playerGold);
    } catch (error) {
      setActionError(requestErrorMessage(error));
    } finally {
      setPendingAction(null);
    }
  }

  if (detail.status !== "ready") {
    return <section className="card-detail-screen">
      <header className="card-detail-topbar"><button aria-label="Назад" onClick={onBack} type="button"><AppIcon name="chevron" size={20} /></button></header>
      <div className="deck-state">
        {detail.status === "loading" ? "Завантаження карти…" : null}
        {detail.status === "unavailable" ? "Карта доступна після запуску через Telegram." : null}
        {detail.status === "error" ? <><span>Не вдалося завантажити карту.</span><button onClick={() => setDetailAttempt((current) => current + 1)} type="button">Повторити</button></> : null}
      </div>
    </section>;
  }

  const { card, inActiveDeck, progression } = detail.data;
  const availabilityText = progression.availability === "unsupported_level_data" ? "Дані ціни для наступного рівня ще не підтверджені."
    : progression.availability === "insufficient_elements" ? "Потрібно заповнити прогрес рівня."
    : progression.availability === "insufficient_gold" ? "Недостатньо золота для покращення."
      : progression.availability === "maximum_level" ? "Досягнуто максимального рівня." : null;
  const progressionHint = progression.availability === "ready"
    ? progression.requiredGold === 0 ? "Покращення доступне безкоштовно." : "Підніміть карту за золото. Поглинання може зменшити ціну."
    : progression.availability === "insufficient_elements" || progression.availability === "insufficient_gold"
      ? "Потрібно більше золота. Поглинання може зменшити ціну."
      : availabilityText;
  const hasAbsorptionAction = candidates.status === "ready" && candidates.data.totalCards > 0;

  return <section className="card-detail-screen">
    <header className="card-detail-topbar">
      <button aria-label="Назад" data-tutorial-target="card-back" onClick={onBack} type="button"><AppIcon name="chevron" size={20} /></button>
      <div className="card-detail-heading">
        {card.displayName ? <CardNameBadge name={card.displayName} /> : <h1 className="card-detail-name-empty">Назва карти недоступна</h1>}
        <p className="card-detail-meta"><span data-tutorial-target="card-element">{elementLabels[card.element]}</span> <span aria-hidden="true">•</span> <span data-tutorial-target="card-rarity">{rarityLabels[card.rarity]}</span></p>
      </div>
    </header>

    <div className="card-detail-overview">
      <div className="card-detail-overview__main">
        <div aria-label={`Сила ${card.finalPower}`} className={`card-detail-card deck-card--${card.element} deck-card--${card.rarity}`} role="img">
          <CardFxWrapper artKey={card.artKey} cardId={card.cardId} element={card.element} rarity={card.rarity}>
            {card.protectedFromAbsorption ? <span aria-label="Карта захищена" className="card-detail-card__protection"><AppIcon name="lock" size={20} /></span> : null}
          </CardFxWrapper>
        </div>

        <div className="card-detail-reference-stats" aria-label="Поточні характеристики">
          <div className="card-detail-reference-stat" data-tutorial-target="card-strength">
            <AppIcon name="card-strength" size={17} />
            <span>Сила:</span>
            <strong>{card.finalPower}</strong>
          </div>
          <div className="card-detail-reference-stat">
            <span aria-hidden="true" className="card-detail-reference-stat__level-icon">↑</span>
            <span>Рівень:</span>
            <strong>{card.level}</strong>
          </div>
          <div className="card-detail-reference-stat">
            <AppIcon name="deck" size={17} />
            <span>{inActiveDeck ? "У бойовій колоді" : "Слабка карта"}</span>
          </div>
          <button
            aria-pressed={card.protectedFromAbsorption}
            className={`card-protection-toggle${card.protectedFromAbsorption ? " card-protection-toggle--active" : ""}`}
            disabled={pendingAction !== null}
            onClick={performProtectionToggle}
            type="button"
          >
            <AppIcon name="lock" size={17} />
            <span>{pendingAction === "protection" ? "Оновлення…" : card.protectedFromAbsorption ? "Захист увімкнено" : "Захист вимкнено"}</span>
          </button>
        </div>
      </div>

      <section className={`progression-panel progression-panel--reference progression-panel--${progression.availability}${progression.isGoldLevel ? " progression-panel--gold" : ""}`} aria-label="Прокачка карти">
        <div className="progression-panel__reference-heading"><span>Прогрес рівня</span></div>
        <div className="level-progress" role="progressbar" aria-label="Прогрес рівня" aria-valuemax={100} aria-valuemin={0} aria-valuenow={progression.percent}><span style={{ width: `${progression.percent}%` }} /></div>
        <div className="progression-panel__upgrade-row"><button className={`level-up-button${progression.requiredGold === 0 ? " level-up-button--free" : ""}`} disabled={progression.availability !== "ready" || pendingAction !== null} onClick={requestLevelUp} type="button">
          <span>{pendingAction === "level" ? "Підвищення…" : progression.requiredGold === 0 ? "Покращити безкоштовно" : "Підняти рівень"}</span>
        </button></div>
        <div className="progression-panel__facts"><div><span>Сила після рівня</span><strong>{progression.powerIncrease === null ? "—" : `+${progression.powerIncrease}`}</strong></div><div><span>{progression.requiredGold !== null && progression.requiredGold > 0 ? "Ціна покращення" : "Вартість"}</span><strong>{progression.requiredGold === null ? "—" : progression.requiredGold > 0 ? <><CurrencyIcon kind="gold" size={15} />{progression.requiredGold}</> : "Безкоштовно"}</strong></div></div>
      </section>
      {progressionHint ? <p className="progression-panel__external-hint">{progressionHint}</p> : null}
    </div>

    {actionError ? <p className="card-action-error" role="alert">{actionError}</p> : null}

    <section className="absorption-panel">
      <div className="weak-cards-heading menu-row--metal-texture">
        <MenuTextureSlices />
        <span>Слабкі карти</span>
        <small>{candidates.status === "ready" ? candidates.data.totalCards : candidates.status === "loading" ? "…" : "—"}</small>
      </div>
      {candidates.status === "loading" ? <div className="selector-state">Завантаження…</div> : null}
      {candidates.status === "error" ? <div className="selector-state"><span>Не вдалося завантажити карти.</span><button onClick={() => setCandidateAttempt((current) => current + 1)} type="button">Повторити</button></div> : null}
      {candidates.status === "ready" && candidates.data.totalCards === 0 ? <div className="selector-state">Немає слабких карт цієї стихії.</div> : null}
      {candidates.status === "ready" && candidates.data.totalCards > 0 ? <><div className="deck-grid absorption-grid">{candidates.data.cards.map((candidate) => <DeckCard card={candidate} key={candidate.instanceId} onClick={() => void performAbsorption([candidate.instanceId])} showLevel />)}</div><Pagination currentPage={candidates.data.page} onPageChange={setCandidatePage} totalPages={candidates.data.totalPages} /></> : null}
    </section>

    <nav className="card-detail-actions" aria-label="Дії з картою"><MenuRow compact icon="deck" metalTexture onClick={onOpenDeck} title="Колода" /><MenuRow compact icon="weak-cards" attention={hasAbsorptionAction} metalTexture onClick={onOpenWeakCards} title="Слабкі карти" /><MenuRow compact icon="shop" metalTexture onClick={onOpenShop} title="Магазин" /></nav>

    {levelConfirmationOpen && progression.requiredGold !== null ? <div className="confirmation-backdrop" role="presentation"><div aria-labelledby="level-confirm-title" aria-modal="true" className="confirmation-modal" role="dialog"><h2 id="level-confirm-title">Підняти рівень?</h2><p>Підняття рівня коштує <strong><CurrencyIcon kind="gold" size={16} />{progression.requiredGold}</strong> золота.</p><div><button disabled={pendingAction !== null} onClick={() => setLevelConfirmationOpen(false)} type="button">Скасувати</button><button disabled={pendingAction !== null} onClick={() => void performLevelUp()} type="button">{pendingAction === "level" ? "Підвищення…" : "Підняти рівень"}</button></div></div></div> : null}
  </section>;
}
