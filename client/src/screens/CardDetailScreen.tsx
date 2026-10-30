import { ScreenHeading } from "../components/ScreenHeading";
import { RibbonTitle } from "../components/RibbonTitle";
import { ElementMedallion } from "../components/ElementMedallion";
import { ExperienceVine } from "../components/ExperienceVine";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AbsorptionCandidatesResponse, PlayerCardDetailResponse } from "@cardastika/shared";
import { AppIcon } from "../components/AppIcon";
import { CardFxWrapper } from "../components/CardFxWrapper";
import { CardHud } from "../components/CardHud";
import { ConfirmationDialog } from "../components/ConfirmationDialog";
import { CurrencyIcon } from "../components/CurrencyDisplay";
import { DeckCard } from "../components/DeckCard";
import { MenuRow } from "../components/MenuRow";
import { Pagination } from "../components/Pagination";
import { formatFullUiNumber } from "../i18n";
import { playCardDestructionFx, playCardPowerFx } from "./cardProgressionFx";
import { CardProtectionFx } from "./CardProtectionFx";
import { getTelegramInitData } from "../telegram";
import { absorbCards, levelUpCard, loadAbsorptionCandidates, loadCardDetail, previewCardAbsorption, toggleCardProtection } from "../telegram/playerCards";
import { PlayerDataError } from "../telegram/playerDeck";

const ELEMENT_GENITIVE = { fire: "вогню", water: "води", earth: "землі", air: "повітря" } as const;
const homeSprite = (name: string) => `/assets/ui/home/sprites/${name}.webp`;

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
  const [cardDisplayPower, setCardDisplayPower] = useState<number | null>(null);
  const [levelConfirmationOpen, setLevelConfirmationOpen] = useState(false);
  const [absorptionCandidate, setAbsorptionCandidate] = useState<AbsorptionCandidatesResponse["cards"][number] | null>(null);
  const [pendingAction, setPendingAction] = useState<"level" | "absorb" | "protection" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const actionInFlightRef = useRef(false);
  const absorptionPanelRef = useRef<HTMLElement>(null);
  const cardDetailRef = useRef<HTMLDivElement>(null);
  const absorptionCardRefs = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    if (!actionSuccess) return;
    const timer = window.setTimeout(() => setActionSuccess(null), 2600);
    return () => window.clearTimeout(timer);
  }, [actionSuccess]);

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

  // Per-candidate progress gain from the server preview, shown under each weak card.
  const [candidateGains, setCandidateGains] = useState<Record<string, number>>({});
  useEffect(() => {
    const initData = getTelegramInitData();
    if (!initData || candidates.status !== "ready" || candidates.data.cards.length === 0) {
      setCandidateGains({});
      return;
    }
    const controller = new AbortController();
    void Promise.all(candidates.data.cards.map((candidate) => previewCardAbsorption(initData, cardInstanceId, [candidate.instanceId], controller.signal)
      .then((preview) => [candidate.instanceId, Math.max(0, Math.round(preview.afterPercent - preview.beforePercent))] as const)
      .catch(() => null)))
      .then((entries) => {
        if (!controller.signal.aborted) setCandidateGains(Object.fromEntries(entries.filter((entry) => entry !== null)));
      });
    return () => controller.abort();
  }, [candidates, cardInstanceId]);

  async function performLevelUp() {
    const initData = getTelegramInitData();
    if (!initData || actionInFlightRef.current) return;
    const previousCard = detail.status === "ready" ? detail.data.card : null;
    actionInFlightRef.current = true;
    setPendingAction("level"); setActionError(null);
    try {
      const result = await levelUpCard(initData, cardInstanceId);
      setDetail({ status: "ready", data: result });
      onGoldChange(result.playerGold);
      if (result.deckPower !== undefined) onDeckPowerChange(result.deckPower);
      const powerDelta = previousCard ? result.card.finalPower - previousCard.finalPower : 0;
      const rarityChanged = previousCard !== null && result.card.rarity !== previousCard.rarity;
      const levelChanged = previousCard !== null && result.card.level !== previousCard.level;
      if (powerDelta > 0 || rarityChanged || levelChanged) {
        const startingPower = previousCard?.finalPower ?? result.card.finalPower;
        setCardDisplayPower(startingPower);
        window.requestAnimationFrame(() => {
          void playCardPowerFx(cardDetailRef.current, powerDelta, rarityChanged, startingPower, setCardDisplayPower)
            .catch(() => undefined)
            .finally(() => setCardDisplayPower(null));
        });
      }
      setActionSuccess("Рівень карти підвищено.");
      setLevelConfirmationOpen(false);
    } catch (error) { setActionError(requestErrorMessage(error)); }
    finally { actionInFlightRef.current = false; setPendingAction(null); }
  }

  function requestLevelUp() {
    if (actionInFlightRef.current) return;
    setActionError(null);
    setActionSuccess(null);
    if (progression.requiredGold !== null && progression.requiredGold > 0) {
      setLevelConfirmationOpen(true);
      return;
    }
    void performLevelUp();
  }

  async function performAbsorption(fodderInstanceIds: readonly string[]) {
    const initData = getTelegramInitData();
    if (!initData || actionInFlightRef.current || fodderInstanceIds.length === 0) return;
    const previousCard = detail.status === "ready" ? detail.data.card : null;
    actionInFlightRef.current = true;
    setPendingAction("absorb"); setActionError(null);
    try {
      const result = await absorbCards(initData, cardInstanceId, [...fodderInstanceIds]);
      const consumedIds = new Set(result.consumedInstanceIds);
      setDetail({ status: "ready", data: result });
      onGoldChange(result.playerGold);
      if (result.deckPower !== undefined) onDeckPowerChange(result.deckPower);
      setAbsorptionCandidate(null);
      const powerDelta = previousCard ? result.card.finalPower - previousCard.finalPower : 0;
      const rarityChanged = previousCard !== null && result.card.rarity !== previousCard.rarity;
      const levelChanged = previousCard !== null && result.card.level !== previousCard.level;
      const shouldAnimatePower = powerDelta > 0 || rarityChanged || levelChanged;
      const startingPower = previousCard?.finalPower ?? result.card.finalPower;
      if (shouldAnimatePower) setCardDisplayPower(startingPower);
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      const effects = result.consumedInstanceIds.map((instanceId) => {
        const element = absorptionCardRefs.current.get(instanceId) ?? null;
        return playCardDestructionFx(element);
      });
      if (shouldAnimatePower) {
        effects.push(playCardPowerFx(cardDetailRef.current, powerDelta, rarityChanged, startingPower, setCardDisplayPower)
          .catch(() => undefined)
          .finally(() => setCardDisplayPower(null)));
      }
      await Promise.all(effects.map((effect) => effect.catch(() => undefined)));
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
      setActionSuccess("Карту поглинуто. Сила основної карти оновлена.");
    } catch (error) {
      setActionError(requestErrorMessage(error));
      setCandidateAttempt((current) => current + 1);
    } finally { actionInFlightRef.current = false; setPendingAction(null); }
  }

  function requestAbsorption(candidate: AbsorptionCandidatesResponse["cards"][number]) {
    if (actionInFlightRef.current || pendingAction) return;
    setActionError(null);
    setActionSuccess(null);
    setAbsorptionCandidate(candidate);
  }

  async function performProtectionToggle() {
    const initData = getTelegramInitData();
    if (!initData || actionInFlightRef.current || detail.status !== "ready") return;
    actionInFlightRef.current = true;
    setPendingAction("protection"); setActionError(null);
    try {
      const result = await toggleCardProtection(initData, cardInstanceId);
      setDetail({ status: "ready", data: result });
      onGoldChange(result.playerGold);
      setActionSuccess(result.card.protectedFromAbsorption ? "Захист карти увімкнено." : "Захист карти вимкнено.");
    } catch (error) {
      setActionError(requestErrorMessage(error));
    } finally {
      actionInFlightRef.current = false;
      setPendingAction(null);
    }
  }

  if (detail.status !== "ready") {
    return <section className="card-detail-screen">
      <ScreenHeading onBack={onBack} title="Карта" />
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
    : progression.availability === "insufficient_elements" ? "Заповніть прогрес рівня поглинанням слабких карт."
      : progression.availability === "insufficient_gold" ? "Недостатньо золота. Поглинання може зменшити ціну."
      : availabilityText;
  const hasAbsorptionAction = candidates.status === "ready" && candidates.data.totalCards > 0;
  // The upgrade plate appears only when there is something to act on: weak cards to absorb, a golden level, or a free upgrade.
  const showUpgradePlate = progression.availability !== "maximum_level"
    && (hasAbsorptionAction || progression.isGoldLevel || (progression.availability === "ready" && progression.requiredGold === 0) || pendingAction === "level");

  return <section className="card-detail-screen" data-expanded-panel="progress">
    <ScreenHeading backTutorialTarget="card-back" onBack={onBack} title={card.displayName ?? "Карта"} description={<span className="card-detail-meta"><span>{card.displayName ?? "Назва недоступна"}</span><span aria-hidden="true"> · </span><span data-tutorial-target="card-element">{elementLabels[card.element]}</span><span aria-hidden="true"> · </span><span data-tutorial-target="card-rarity">{rarityLabels[card.rarity]}</span></span>} />

    <div className="card-detail-overview">
      <div className="card-detail-overview__main">
        <div aria-label={`${card.displayName ?? "Карта"}, сила ${formatFullUiNumber(card.finalPower)}`} className={`card-detail-card deck-card--${card.element} deck-card--${card.rarity}`} ref={cardDetailRef} role="img">
          <CardFxWrapper artKey={card.artKey} cardId={card.cardId} element={card.element} interactive rarity={card.rarity}>
            <CardHud element={card.element} level={card.level} power={cardDisplayPower ?? card.finalPower} rarity={card.rarity} />
          </CardFxWrapper>
          <CardProtectionFx active={card.protectedFromAbsorption} targetRef={cardDetailRef} />
        </div>

        <div className="card-detail-overview__side">
          <div className="card-detail-reference-stats" aria-label="Поточні характеристики">
          <div className="card-detail-reference-stat" data-tutorial-target="card-strength">
            <span>Сила</span>
            <strong>{formatFullUiNumber(card.finalPower)}</strong>
          </div>
          <div className="card-detail-reference-stat">
            <span>Рівень</span>
            <strong>{card.level}</strong>
          </div>
          <div className="card-detail-reference-stat">
            <span>У колоді</span>
            <strong aria-label={inActiveDeck ? "Карта входить до бойової колоди" : "Карта поза бойовою колодою"}>{inActiveDeck ? 1 : 0}</strong>
          </div>
          </div>
          <button
            aria-checked={card.protectedFromAbsorption}
            aria-busy={pendingAction === "protection"}
            className={`card-protection-toggle${card.protectedFromAbsorption ? " card-protection-toggle--active" : ""}`}
            disabled={pendingAction !== null}
            onClick={performProtectionToggle}
            role="switch"
            type="button"
          >
            <AppIcon name="lock" size={17} />
            <span>{pendingAction === "protection" ? "Оновлення…" : <>Захист<span className="card-protection-toggle__state"> {card.protectedFromAbsorption ? "увімкнено" : "вимкнено"}</span></>}</span>
            <span aria-hidden="true" className="card-protection-toggle__switch"><span /></span>
          </button>
        </div>
      </div>

      {showUpgradePlate ? <section className={`progression-panel progression-panel--reference progression-panel--${progression.availability}${progression.isGoldLevel ? " progression-panel--gold" : ""}`} aria-label="Прокачка карти">
        <div className="progression-panel__content" id="card-progression-content">
        {progressionHint ? <p className="progression-panel__external-hint">{progressionHint}</p> : null}
        <div className="level-progress" role="progressbar" aria-label="Прогрес рівня" aria-valuemax={100} aria-valuemin={0} aria-valuenow={progression.percent}><ExperienceVine level={card.level} progress={progression.percent / 100} /></div>
        <div className="progression-panel__upgrade-row"><button className={`level-up-button${progression.requiredGold === 0 ? " level-up-button--free" : ""}`} disabled={progression.availability !== "ready" || pendingAction !== null} onClick={requestLevelUp} type="button">
          <span>{pendingAction === "level" ? "Підвищення…" : progression.requiredGold === 0 ? "Покращити безкоштовно" : "Підняти рівень"}</span>
        </button></div>
        <div className="progression-panel__facts"><div><span>Сила:</span><strong className="progression-panel__power-preview">{progression.powerAfterLevel === null ? "—" : <><span className="ui-number">{formatFullUiNumber(card.finalPower)}</span><span aria-hidden="true">→</span><span className="ui-number progression-panel__next-power">{formatFullUiNumber(progression.powerAfterLevel)}</span></>}</strong></div><div><span>Ціна:</span><strong>{progression.requiredGold === null ? "—" : progression.requiredGold > 0 ? <><CurrencyIcon kind="gold" size={20} /><span className="ui-number">{progression.requiredGold}</span></> : "Безкоштовно"}</strong></div></div>
        </div>
      </section> : null}
    </div>

    {typeof document !== "undefined" && (actionError && !absorptionCandidate && !levelConfirmationOpen || actionSuccess) ? createPortal(
      <div className="card-detail-feedback-layer">
        {actionError && !absorptionCandidate && !levelConfirmationOpen ? <p className="card-action-error" role="alert">{actionError}</p> : null}
        {actionSuccess ? <p className="action-feedback action-feedback--success" key={actionSuccess} role="status">{actionSuccess}</p> : null}
      </div>,
      document.body,
    ) : null}

    {candidates.status === "ready" && candidates.data.totalCards === 0 ? <p className="absorption-empty"><ElementMedallion element={card.element} size={22} />Немає слабких карт стихії {ELEMENT_GENITIVE[card.element]}</p> : null}
    {candidates.status === "error" ? <div className="selector-state"><span>Не вдалося завантажити карти.</span><button onClick={() => setCandidateAttempt((current) => current + 1)} type="button">Повторити</button></div> : null}
    {hasAbsorptionAction && candidates.status === "ready" ? (
      <section aria-label="Слабкі карти для поглинання" className="absorption-panel" ref={absorptionPanelRef} tabIndex={-1}>
        <RibbonTitle as="h2" className="absorption-panel__title" size="wide">Слабкі карти</RibbonTitle>
        <div className="absorption-grid absorption-grid--inline">
          {candidates.data.cards.map((candidate) => (
            <div className="absorption-card-slot" data-absorption-candidate={candidate.instanceId} key={candidate.instanceId} ref={(element) => { if (element) absorptionCardRefs.current.set(candidate.instanceId, element); else absorptionCardRefs.current.delete(candidate.instanceId); }}>
              <DeckCard card={candidate} disabled={pendingAction !== null} onClick={() => requestAbsorption(candidate)} />
              <button className="absorption-card-slot__action" disabled={pendingAction !== null} onClick={() => requestAbsorption(candidate)} type="button">
                <span>Поглинути</span>
                <strong>{candidateGains[candidate.instanceId] === undefined ? "…" : `+${candidateGains[candidate.instanceId]}%`}</strong>
              </button>
            </div>
          ))}
        </div>
        <Pagination currentPage={candidates.data.page} onPageChange={setCandidatePage} totalPages={candidates.data.totalPages} />
      </section>
    ) : null}

    <nav className="card-detail-actions" aria-label="Дії з картою"><MenuRow chevron icon="deck" iconSrc={homeSprite("mode-deck")} illustrationSrc={homeSprite("row-deck")} onClick={onOpenDeck} title="Колода" /><MenuRow chevron icon="weak-cards" attention={hasAbsorptionAction} iconSrc={homeSprite("row-icon-weak-cards")} illustrationSrc={homeSprite("row-weak-cards")} onClick={onOpenWeakCards} title="Слабкі карти" /><MenuRow chevron icon="shop" iconSrc={homeSprite("row-icon-shop")} illustrationSrc={homeSprite("row-shop")} onClick={onOpenShop} title="Магазин" /></nav>

    {levelConfirmationOpen && progression.requiredGold !== null ? <ConfirmationDialog busy={pendingAction === "level"} busyLabel="Підвищення…" confirmLabel="Підняти рівень" description={<p>Підняття рівня коштує <strong><CurrencyIcon kind="gold" size={16} />{progression.requiredGold}</strong> золота.</p>} error={actionError} onCancel={() => setLevelConfirmationOpen(false)} onConfirm={() => void performLevelUp()} restoreFocusTargetRef={absorptionPanelRef} title="Підняти рівень?" variant="primary" /> : null}
    {absorptionCandidate ? <ConfirmationDialog busy={pendingAction === "absorb"} busyLabel="Поглинання…" confirmLabel="Поглинути карту" description={<p>Поглинути карту <strong>{absorptionCandidate.displayName ?? "без назви"}</strong>? Вона буде витрачена, щоб посилити цю карту.</p>} error={actionError} onCancel={() => setAbsorptionCandidate(null)} onConfirm={() => void performAbsorption([absorptionCandidate.instanceId])} restoreFocusTargetRef={absorptionPanelRef} title="Підтвердити поглинання?" /> : null}
  </section>;
}
