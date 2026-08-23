import { useCallback, useEffect, useState } from "react";
import type { AbsorptionCandidatesResponse, AbsorptionPreviewResponse, PlayerCardDetailResponse } from "@cardastika/shared";
import { AppIcon } from "../components/AppIcon";
import { CardArtwork } from "../components/CardArtwork";
import { CardNameBadge } from "../components/CardNameBadge";
import { DeckCard } from "../components/DeckCard";
import { ElementSymbol } from "../components/ElementSymbol";
import { MenuRow } from "../components/MenuRow";
import { Pagination } from "../components/Pagination";
import { getTelegramInitData } from "../telegram";
import { absorbCards, levelUpCard, loadAbsorptionCandidates, loadCardDetail, previewCardAbsorption } from "../telegram/playerCards";
import { PlayerDataError } from "../telegram/playerDeck";

const elementLabels = { fire: "Вогонь", water: "Вода", air: "Повітря", earth: "Земля" } as const;
const rarityLabels = { common: "Звичайна", uncommon: "Незвичайна", rare: "Рідкісна", epic: "Епічна", legendary: "Легендарна", mythic: "Міфічна" } as const;

type DetailState = { status: "loading" | "unavailable" | "error" } | { status: "ready"; data: PlayerCardDetailResponse };
type CandidatesState = { status: "loading" | "error" } | { status: "ready"; data: AbsorptionCandidatesResponse };

interface CardDetailScreenProps {
  cardInstanceId: string;
  onBack: () => void;
  onGoldChange: (gold: number) => void;
  onOpenDeck: () => void;
  onOpenShop: () => void;
  onOpenWeakCards: () => void;
}

function requestErrorMessage(error: unknown) {
  if (error instanceof PlayerDataError && error.code === "unsupported_level_data") return "Для цього рівня в джерелі немає підтвердженого значення.";
  if (error instanceof PlayerDataError && error.code === "fodder_in_deck") return "Одна з обраних карт уже увійшла до бойової колоди.";
  return "Дію не виконано. Оновіть дані та спробуйте ще раз.";
}

export function CardDetailScreen({ cardInstanceId, onBack, onGoldChange, onOpenDeck, onOpenShop, onOpenWeakCards }: CardDetailScreenProps) {
  const [detail, setDetail] = useState<DetailState>({ status: "loading" });
  const [detailAttempt, setDetailAttempt] = useState(0);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [candidatePage, setCandidatePage] = useState(1);
  const [candidateAttempt, setCandidateAttempt] = useState(0);
  const [candidates, setCandidates] = useState<CandidatesState>({ status: "loading" });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<AbsorptionPreviewResponse | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<"level" | "absorb" | null>(null);
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
    if (!selectorOpen) return;
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
  }, [candidateAttempt, candidatePage, cardInstanceId, selectorOpen]);

  const selectedList = [...selectedIds].sort();
  const selectedKey = selectedList.join(",");
  useEffect(() => {
    if (!selectedKey) { setPreview(null); setPreviewError(null); return; }
    const initData = getTelegramInitData();
    if (!initData) return;
    const controller = new AbortController();
    setPreview(null);
    setPreviewError(null);
    const ids = selectedKey.split(",");
    void previewCardAbsorption(initData, cardInstanceId, ids, controller.signal)
      .then(setPreview)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setPreviewError(requestErrorMessage(error));
      });
    return () => controller.abort();
  }, [cardInstanceId, selectedKey]);

  const toggleSelection = useCallback((instanceId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(instanceId)) next.delete(instanceId); else next.add(instanceId);
      return next;
    });
  }, []);

  async function performLevelUp() {
    const initData = getTelegramInitData();
    if (!initData || pendingAction) return;
    setPendingAction("level"); setActionError(null);
    try {
      const result = await levelUpCard(initData, cardInstanceId);
      setDetail({ status: "ready", data: result });
      onGoldChange(result.playerGold);
    } catch (error) { setActionError(requestErrorMessage(error)); }
    finally { setPendingAction(null); }
  }

  async function confirmAbsorption() {
    const initData = getTelegramInitData();
    if (!initData || pendingAction || selectedList.length === 0) return;
    setPendingAction("absorb"); setActionError(null);
    try {
      const result = await absorbCards(initData, cardInstanceId, selectedList);
      setDetail({ status: "ready", data: result });
      onGoldChange(result.playerGold);
      setSelectedIds(new Set()); setConfirmationOpen(false); setCandidatePage(1);
      setCandidateAttempt((current) => current + 1);
    } catch (error) {
      setConfirmationOpen(false); setActionError(requestErrorMessage(error));
      setCandidateAttempt((current) => current + 1);
    } finally { setPendingAction(null); }
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
    : progression.availability === "insufficient_gold" ? "Недостатньо золота для поточного прогресу."
      : progression.availability === "maximum_level" ? "Досягнуто максимального рівня." : null;

  return <section className="card-detail-screen">
    <header className="card-detail-topbar"><button aria-label="Назад" onClick={onBack} type="button"><AppIcon name="chevron" size={20} /></button></header>
    <div className="card-detail-heading">
      {card.displayName ? <CardNameBadge name={card.displayName} /> : <h1 className="card-detail-name-empty">Назва карти недоступна</h1>}
      <p className="card-detail-meta">{elementLabels[card.element]} <span aria-hidden="true">•</span> {rarityLabels[card.rarity]}</p>
      <strong className={`card-detail-status${inActiveDeck ? " card-detail-status--deck" : ""}`}>{inActiveDeck ? "У бойовій колоді" : "Слабка карта"}</strong>
    </div>

    <div aria-label={`Сила ${card.finalPower}`} className={`card-detail-card deck-card--${card.element} deck-card--${card.rarity}`} role="img">
      <CardArtwork artKey={card.artKey} element={card.element} />
      <strong className="card-detail-card__power">{card.finalPower}</strong>
      <span className="card-detail-card__element" aria-hidden="true"><ElementSymbol element={card.element} /></span>
      <span className="card-detail-card__rarity" aria-hidden="true" />
    </div>

    <div className="card-primary-stats" aria-label="Поточні характеристики"><div><span>Рівень</span><strong>{card.level}</strong></div><div><span>Сила</span><strong>{card.finalPower}</strong></div></div>

    <section className={`progression-panel${progression.isGoldLevel ? " progression-panel--gold" : ""}`} aria-label="Прогрес рівня">
      <div className="progression-panel__heading"><div><span>Прогрес рівня</span><strong>{progression.percent}%</strong></div>{progression.isGoldLevel ? <small>Золотий рівень</small> : null}</div>
      <div className="level-progress" role="progressbar" aria-valuemax={100} aria-valuemin={0} aria-valuenow={progression.percent}><span style={{ width: `${progression.percent}%` }} /></div>
      <div className="progression-panel__facts"><div><span>Сила після рівня</span><strong>{progression.powerIncrease === null ? "—" : `+${progression.powerIncrease}`}</strong></div><div><span>Ціна покращення</span><strong>{progression.requiredGold ?? "—"}</strong></div></div>
      {progression.storedOverflowElements > 0 ? <p>Надлишковий потенціал збережено: {progression.storedOverflowElements}</p> : null}
      {availabilityText ? <p>{availabilityText}</p> : null}
      <button className="level-up-button" disabled={progression.availability !== "ready" || pendingAction !== null} onClick={performLevelUp} type="button">
        <span>{pendingAction === "level" ? "Підвищення…" : "Підняти рівень"}</span>
        {progression.requiredGold !== null && progression.requiredGold > 0 ? <strong><AppIcon name="gold" size={18} />{progression.requiredGold}</strong> : null}
      </button>
    </section>

    {actionError ? <p className="card-action-error" role="alert">{actionError}</p> : null}

    <section className="absorption-panel">
      <button className="absorption-toggle" onClick={() => setSelectorOpen((open) => !open)} type="button"><span>Поглинути слабкі</span><AppIcon name="chevron" size={18} /></button>
      {selectorOpen ? <div className="absorption-selector">
        <header><strong>Карти тієї ж стихії</strong><span>Обрано: {selectedIds.size}</span></header>
        {candidates.status === "loading" ? <div className="selector-state">Завантаження…</div> : null}
        {candidates.status === "error" ? <div className="selector-state"><span>Не вдалося завантажити карти.</span><button onClick={() => setCandidateAttempt((current) => current + 1)} type="button">Повторити</button></div> : null}
        {candidates.status === "ready" && candidates.data.totalCards === 0 ? <div className="selector-state">Немає слабких карт цієї стихії.</div> : null}
        {candidates.status === "ready" && candidates.data.totalCards > 0 ? <><div className="deck-grid absorption-grid">{candidates.data.cards.map((candidate) => <DeckCard card={candidate} key={candidate.instanceId} onClick={() => toggleSelection(candidate.instanceId)} selected={selectedIds.has(candidate.instanceId)} showLevel />)}</div><Pagination currentPage={candidates.data.page} onPageChange={setCandidatePage} totalPages={candidates.data.totalPages} /></> : null}
        {selectedIds.size > 0 ? <div className="absorption-preview">
          {preview ? <><div><span>Прогрес</span><strong>{preview.beforePercent}% → {preview.afterPercent}%</strong></div>{preview.resultingStoredElements > 0 ? <p>Надлишковий потенціал буде збережено.</p> : null}<p>Буде поглинуто назавжди: {preview.selectedCards} карти</p></> : <p>{previewError ?? "Розрахунок прогресу…"}</p>}
          <button disabled={!preview || Boolean(previewError)} onClick={() => setConfirmationOpen(true)} type="button">Підтвердити вибір</button>
        </div> : null}
      </div> : null}
    </section>

    <nav className="card-detail-actions" aria-label="Дії з картою"><MenuRow compact icon="deck" onClick={onOpenDeck} title="Колода" /><MenuRow compact icon="inventory" onClick={onOpenWeakCards} title="Слабкі карти" /><MenuRow compact icon="shop" onClick={onOpenShop} title="Магазин" /></nav>

    {confirmationOpen ? <div className="confirmation-backdrop" role="presentation"><div aria-labelledby="absorb-confirm-title" aria-modal="true" className="confirmation-modal" role="dialog"><h2 id="absorb-confirm-title">Поглинути {selectedIds.size} карти?</h2><p>Вони назавжди зникнуть з інвентарю. Їхній накопичений потенціал перейде до цієї карти.</p><div><button disabled={pendingAction !== null} onClick={() => setConfirmationOpen(false)} type="button">Скасувати</button><button disabled={pendingAction !== null} onClick={confirmAbsorption} type="button">{pendingAction === "absorb" ? "Поглинання…" : "Поглинути"}</button></div></div></div> : null}
  </section>;
}
