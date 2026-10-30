import { ScreenHeading } from "../../components/ScreenHeading";
import { useEffect, useRef, useState } from "react";
import { getCardLevelTableEntry, getUpgradeGoldPrice, getUpgradeProgress, MAX_CARD_LEVEL } from "@cardastika/game-core";
import type { CardElement, GuildProfileResponse, PlayerCardInstance } from "@cardastika/shared";
import { AppIcon } from "../../components/AppIcon";
import { CardFxWrapper } from "../../components/CardFxWrapper";
import { CardHud } from "../../components/CardHud";
import { CurrencyIcon } from "../../components/CurrencyDisplay";
import { DeckCard } from "../../components/DeckCard";
import { MenuRow } from "../../components/MenuRow";
import { MenuTextureSlices } from "../../components/MenuTextureSlices";
import { ElementSymbol } from "../../components/ElementSymbol";
import { RibbonTitle } from "../../components/RibbonTitle";
import { formatFullUiNumber } from "../../i18n";
import { ELEMENT_LABELS, GuildState, formatNumber, type AsyncState } from "./GuildUi";

interface GuildCardScreenProps {
  busy: boolean;
  onCardBack: () => void;
  onForum: () => void;
  onTreasury: () => void;
  onLoadCardCandidates: () => void;
  onLoadTreasuryCardCandidates: () => void;
  onSetGuildCard: (instanceId: string) => Promise<boolean>;
  onDonateGuildCardElements: (instanceIds: string[]) => Promise<boolean>;
  profile: GuildProfileResponse;
  guildCardCandidates: AsyncState<PlayerCardInstance[]>;
  treasuryCardCandidates: AsyncState<PlayerCardInstance[]>;
}

const ELEMENTS = ["fire", "water", "air", "earth"] as const;

const RARITY_LABELS = {
  common: "Звичайна",
  uncommon: "Незвичайна",
  rare: "Рідкісна",
  epic: "Епічна",
  legendary: "Легендарна",
  mythic: "Міфічна",
} as const;

export function GuildCardScreen({ busy, onCardBack, onForum, onTreasury, onLoadCardCandidates, onLoadTreasuryCardCandidates, onSetGuildCard, onDonateGuildCardElements, profile, guildCardCandidates, treasuryCardCandidates }: GuildCardScreenProps) {
  const active = profile.guildCard.active;
  const [selectionOpen, setSelectionOpen] = useState(false);
  const [selectedElement, setSelectedElement] = useState<CardElement>(active?.element ?? "fire");
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const candidatesRequested = useRef<string | null>(null);
  const cardCandidatesRequested = useRef(false);

  useEffect(() => {
    if (!active) return;
    const requestKey = `${active.instanceId}:${active.level}:${active.levelProgressElements}:${active.storedElements}`;
    if (candidatesRequested.current === requestKey) return;
    candidatesRequested.current = requestKey;
    onLoadTreasuryCardCandidates();
  }, [active?.instanceId, active?.level, active?.levelProgressElements, active?.storedElements, onLoadTreasuryCardCandidates]);
  useEffect(() => {
    if (active) setSelectedElement(active.element);
  }, [active?.element, active?.instanceId]);
  useEffect(() => {
    setSelectedCardIds([]);
  }, [active?.instanceId, active?.level, active?.levelProgressElements, active?.storedElements, treasuryCardCandidates.status]);

  function openCardSelection() {
    setSelectionOpen(true);
    if (cardCandidatesRequested.current) return;
    cardCandidatesRequested.current = true;
    onLoadCardCandidates();
  }

  function toggleCard(instanceId: string) {
    setSelectedCardIds((current) => current.includes(instanceId) ? current.filter((id) => id !== instanceId) : [...current, instanceId]);
  }

  async function donateSelectedCards() {
    if (busy || selectedCardIds.length === 0) return;
    if (await onDonateGuildCardElements(selectedCardIds)) setSelectedCardIds([]);
  }

  function selectElement(element: CardElement) {
    setSelectedElement(element);
    setSelectedCardIds([]);
  }

  if (!active) {
    return <section className="card-detail-screen guild-card-screen" aria-labelledby="guild-card-screen-title">
      <ScreenHeading backLabel="До складу гільдії" onBack={onCardBack} title="Карта гільдії" titleId="guild-card-screen-title" />
      <RibbonTitle size="medium">КАРТА ГІЛЬДІЇ</RibbonTitle>
      <div className="guild-card-screen__empty">
        <AppIcon name="card-reward" size={30} />
        <strong>Карту ще не обрано</strong>
        <p>Лідер гільдії може виставити одну карту зі своєї бойової колоди.</p>
        {profile.guildCard.canManage ? <button className="guild-primary-button" disabled={busy} onClick={openCardSelection} type="button">Обрати карту</button> : null}
      </div>
      {selectionOpen ? <GuildCardSelection busy={busy} candidates={guildCardCandidates} active={active} onClose={() => setSelectionOpen(false)} onLoad={onLoadCardCandidates} onSet={onSetGuildCard} /> : null}
      <GuildCardNavigation busy={busy} onBack={onCardBack} onForum={onForum} onTreasury={onTreasury} />
    </section>;
  }

  const atMaximum = active.level >= MAX_CARD_LEVEL;
  const progression = atMaximum ? { filledElements: 0, percent: 100, requiredElements: 0 } : getUpgradeProgress(active.levelProgressElements, active.level);
  const nextLevel = atMaximum ? null : getCardLevelTableEntry(active.level + 1);
  const upgradeGold = atMaximum ? null : getUpgradeGoldPrice(active.level + 1, active.levelProgressElements);
  const visibleCandidates = treasuryCardCandidates.status === "ready" ? treasuryCardCandidates.data.filter((candidate) => candidate.element === selectedElement) : [];
  const hasCandidates = visibleCandidates.length > 0;
  const progressionClass = atMaximum ? "progression-panel--maximum_level" : progression.percent >= 100 ? "progression-panel--ready" : "progression-panel--insufficient_elements";

  return <section className="card-detail-screen guild-card-screen" aria-labelledby="guild-card-screen-title">
    <ScreenHeading backLabel="До складу гільдії" onBack={onCardBack} title={active.displayName ?? active.code} titleId="guild-card-screen-title" />
    <RibbonTitle size="medium">КАРТА ГІЛЬДІЇ</RibbonTitle>

    <div className="card-detail-overview">
      <div className="card-detail-overview__main">
        <div aria-label={`Сила ${formatFullUiNumber(active.finalPower)}`} className={`card-detail-card deck-card--${active.element} deck-card--${active.rarity}`} role="img">
          <CardFxWrapper artKey={active.artKey} cardId={active.cardId} element={active.element} interactive rarity={active.rarity}>
            <CardHud element={active.element} level={active.level} power={active.finalPower} rarity={active.rarity} showLevel />
          </CardFxWrapper>
        </div>
        <div className="card-detail-reference-stats" aria-label="Поточні характеристики карти гільдії">
          <div className="card-detail-reference-stat"><AppIcon name="card-strength" size={17} /><span>Сила:</span><strong>{formatFullUiNumber(active.finalPower)}</strong></div>
          <div className="card-detail-reference-stat"><span aria-hidden="true" className="card-detail-reference-stat__level-icon">↑</span><span>Рівень:</span><strong>{formatNumber(active.level)}</strong></div>
          <div className="card-detail-reference-stat"><AppIcon name="guild" size={17} /><span>Карта гільдії</span></div>
          <div className="card-detail-reference-stat"><AppIcon name="element-cards" size={17} /><span>Елемент:</span><strong>{ELEMENT_LABELS[active.element]}</strong></div>
        </div>
      </div>

      <section className={`progression-panel progression-panel--reference ${progressionClass}`} aria-label="Прокачка карти гільдії">
        <div className="progression-panel__reference-heading"><span>Прогрес рівня</span><strong>{formatNumber(progression.percent)}%</strong></div>
        <div className="level-progress" role="progressbar" aria-label="Прогрес рівня" aria-valuemax={100} aria-valuemin={0} aria-valuenow={progression.percent}><span style={{ width: `${progression.percent}%` }} /></div>
        <div className="progression-panel__upgrade-row"><button className="level-up-button" disabled type="button"><span>Підняти рівень</span></button></div>
        <div className="progression-panel__facts"><div><span>Сила після рівня</span><strong>{nextLevel?.powerIncrease === null || nextLevel?.powerIncrease === undefined ? "—" : `+${formatFullUiNumber(nextLevel.powerIncrease)}`}</strong></div><div><span>Ціна покращення</span><strong>{upgradeGold === null ? "—" : <><CurrencyIcon kind="gold" size={15} />{formatNumber(upgradeGold)}</>}</strong></div></div>
      </section>
      <p className="progression-panel__external-hint">Прокачка карти гільдії відбувається через внесок магічних елементів.</p>
    </div>

    <section className="absorption-panel guild-card-screen__absorption" aria-labelledby="guild-card-absorption-title">
      <div className="weak-cards-heading menu-row--metal-texture">
        <MenuTextureSlices />
        <span id="guild-card-absorption-title">Карти на поглинення</span>
        <small>{treasuryCardCandidates.status === "ready" ? visibleCandidates.length : treasuryCardCandidates.status === "loading" ? "…" : "—"}</small>
      </div>
      <div className="guild-card-screen__elements" aria-label="Фільтр карт за стихією">
        {ELEMENTS.map((element) => <button aria-label={`Карти стихії ${ELEMENT_LABELS[element]}`} aria-pressed={element === selectedElement} className={element === selectedElement ? `guild-card-screen__element guild-card-screen__element--${element} guild-card-screen__element--active` : `guild-card-screen__element guild-card-screen__element--${element}`} key={element} onClick={() => selectElement(element)} type="button"><ElementSymbol element={element} /></button>)}
      </div>
      <div className="guild-card-screen__absorption-copy"><strong>Спільний внесок у карту</strong><span>Виберіть слабкі карти зі списку. Фільтр вище допоможе знайти потрібну стихію. Обрані карти зникнуть із вашої колекції, а їхні елементи підсилять карту гільдії.</span></div>
      {treasuryCardCandidates.status === "loading" ? <div className="selector-state">Завантаження…</div> : null}
      {treasuryCardCandidates.status === "error" ? <div className="selector-state"><span>Не вдалося завантажити карти.</span><button onClick={onLoadTreasuryCardCandidates} type="button">Повторити</button></div> : null}
      {treasuryCardCandidates.status === "ready" && !hasCandidates ? <div className="selector-state">Немає карт стихії «{ELEMENT_LABELS[selectedElement].toLowerCase()}» для поглинення.</div> : null}
      {hasCandidates ? <>
        <div className="deck-grid absorption-grid" aria-label={`Слабкі карти стихії ${ELEMENT_LABELS[selectedElement]}`}>
          {visibleCandidates.map((candidate) => <DeckCard card={candidate} key={candidate.instanceId} onClick={() => toggleCard(candidate.instanceId)} selected={selectedCardIds.includes(candidate.instanceId)} showLevel />)}
        </div>
        <div className="guild-card-screen__absorption-action"><span>{selectedCardIds.length ? `Обрано карт: ${selectedCardIds.length}` : "Оберіть карти для внеску"}</span><button className="guild-primary-button" disabled={busy || selectedCardIds.length === 0} onClick={() => void donateSelectedCards()} type="button">{busy ? "Вносимо…" : `Пожертвувати вибрані (${selectedCardIds.length})`}</button></div>
      </> : null}
    </section>

    {profile.guildCard.canManage ? <button className="guild-card-screen__change" disabled={busy} onClick={openCardSelection} type="button">Змінити карту гільдії</button> : null}
    {selectionOpen ? <GuildCardSelection busy={busy} candidates={guildCardCandidates} active={active} onClose={() => setSelectionOpen(false)} onLoad={onLoadCardCandidates} onSet={onSetGuildCard} /> : null}
    <GuildCardNavigation busy={busy} onBack={onCardBack} onForum={onForum} onTreasury={onTreasury} />
  </section>;
}

function GuildCardSelection({ active, busy, candidates, onClose, onLoad, onSet }: { active: PlayerCardInstance | null; busy: boolean; candidates: AsyncState<PlayerCardInstance[]>; onClose: () => void; onLoad: () => void; onSet: (instanceId: string) => Promise<boolean> }) {
  const [pending, setPending] = useState<PlayerCardInstance | null>(null);
  const selectedInstanceId = pending?.instanceId ?? active?.instanceId;

  async function confirmSelection() {
    if (!pending || busy) return;
    if (await onSet(pending.instanceId)) {
      setPending(null);
      onClose();
    }
  }

  return <section className="guild-card-screen__selection" aria-label="Вибір карти гільдії">
    <div className="guild-card-screen__selection-heading"><div><strong>Карта з бойової колоди</strong><small>Тільки лідер може змінити карту гільдії.</small></div><button className="guild-inline-button" onClick={onClose} type="button">Закрити</button></div>
    {candidates.status === "loading" ? <GuildState>Завантажуємо колоду лідера…</GuildState> : candidates.status === "error" ? <div className="guild-card-screen__candidate-state"><span>{candidates.message}</span><button className="guild-secondary-button" disabled={busy} onClick={onLoad} type="button">Повторити</button></div> : candidates.data.length === 0 ? <div className="guild-card-screen__candidate-state"><span>У бойовій колоді лідера немає доступних карт.</span><button className="guild-secondary-button" disabled={busy} onClick={onLoad} type="button">Оновити</button></div> : <>
      <div className="guild-card-screen__selection-grid">{candidates.data.map((candidate) => <DeckCard card={candidate} key={candidate.instanceId} selected={candidate.instanceId === selectedInstanceId} showLevel onClick={() => setPending(candidate)} />)}</div>
      {pending ? <div className="guild-card-screen__selection-confirmation"><span>Виставити «{pending.displayName ?? pending.code}» як карту гільдії?</span><div><button className="guild-primary-button" disabled={busy} onClick={() => void confirmSelection()} type="button">{busy ? "Зберігаємо…" : "Підтвердити"}</button><button className="guild-secondary-button" disabled={busy} onClick={() => setPending(null)} type="button">Скасувати</button></div></div> : <p className="guild-helper">Торкніться карти, щоб підготувати вибір.</p>}
    </>}
  </section>;
}

function GuildCardNavigation({ busy, onBack, onForum, onTreasury }: { busy: boolean; onBack: () => void; onForum: () => void; onTreasury: () => void }) {
  return <nav className="card-detail-actions guild-card-screen__actions" aria-label="Розділи карти гільдії">
    <MenuRow compact icon="inventory" metalTexture disabled={busy} onClick={onTreasury} title="Казна" />
    <MenuRow compact icon="deck" metalTexture disabled={busy} onClick={onBack} title="Бойова колода" />
    <div className="guild-card-screen__divider" aria-hidden="true" />
    <MenuRow compact icon="collection" metalTexture disabled={busy} onClick={onForum} title="Форум гільдії" />
    <MenuRow compact icon="mail" metalTexture disabled title="Чат гільдії" />
  </nav>;
}
