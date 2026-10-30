import { getCardUpgradeIndicator } from "@cardastika/game-core";
import type { DailyTaskView } from "@cardastika/shared";
import { ScreenHeading } from "../components/ScreenHeading";
import { AppIcon } from "../components/AppIcon";
import { DeckCard } from "../components/DeckCard";
import { ElementMedallion } from "../components/ElementMedallion";
import { ElementSymbol } from "../components/ElementSymbol";
import { MenuRow } from "../components/MenuRow";
import { RibbonTitle } from "../components/RibbonTitle";
import { useBattlePass } from "../hooks/useBattlePass";
import { usePlayerDeck } from "../hooks/usePlayerDeck";
import { useWeakCards } from "../hooks/useWeakCards";
import { formatFullUiNumber } from "../i18n";

interface DeckScreenProps {
  onBack: () => void;
  onOpenCampaign: () => void;
  onOpenCard: (instanceId: string) => void;
  onOpenDuel: () => void;
  onOpenShop: () => void;
  onOpenTasks: () => void;
  onOpenWeakCards: () => void;
  showTutorialRule?: boolean;
}

const DECK_ELEMENTS = ["fire", "water", "earth", "air"] as const;
const homeSprite = (name: string) => `/assets/ui/home/sprites/${name}.webp`;
// Daily tasks that progress from this screen, in the order the player can act on them.
const DECK_TASK_IDS = ["upgrade-card", "absorb-cards"] as const;

function weakCardsCopy(count: number) {
  const lastDigit = count % 10;
  const lastTwo = count % 100;
  const single = lastDigit === 1 && lastTwo !== 11;
  const noun = single ? "слабка карта" : lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14) ? "слабкі карти" : "слабких карт";
  return `У тебе ${formatFullUiNumber(count)} ${noun} — поглинь ${single ? "її" : "їх"}, щоб посилити бойову колоду.`;
}

function deckTaskCopy(task: DailyTaskView) {
  const remaining = Math.max(0, task.target - task.progress);
  return task.id === "absorb-cards"
    ? `Поглинь ще ${formatFullUiNumber(remaining)}, щоб виконати щоденне завдання.`
    : "Підвищ рівень бойової карти, щоб виконати щоденне завдання.";
}

export function DeckScreen({ onBack, onOpenCampaign, onOpenCard, onOpenDuel, onOpenShop, onOpenTasks, onOpenWeakCards, showTutorialRule = false }: DeckScreenProps) {
  const { retry, state } = usePlayerDeck();
  const { state: weakState } = useWeakCards(1);
  const { state: battlePassState } = useBattlePass();
  const elementCounts = state.status === "ready"
    ? state.deck.cards.reduce<Record<string, number>>((counts, card) => ({ ...counts, [card.element]: (counts[card.element] ?? 0) + 1 }), {})
    : null;
  const hasUpgrade = state.status === "ready"
    && state.deck.cards.some((card) => getCardUpgradeIndicator(card.level, card.levelProgressElements) !== undefined);
  const deckTask = battlePassState.status === "ready"
    ? DECK_TASK_IDS.map((id) => battlePassState.data.daily.tasks.find((task) => task.id === id)).find((task) => task && !task.completed) ?? null
    : null;
  const weakCount = weakState.status === "ready" ? weakState.data.totalCards : null;

  return (
    <section className="deck-screen">
      <ScreenHeading backLabel="Назад на головну" onBack={onBack} title="МОЯ КОЛОДА" action={
        <strong aria-label={state.status === "ready" ? `Загальна сила колоди: ${formatFullUiNumber(state.deck.totalPower)}` : "Загальна сила колоди недоступна"}>
          {state.status === "ready" ? formatFullUiNumber(state.deck.totalPower) : "—"}
        </strong>
      } />

      {state.status === "loading" ? <div className="deck-state" aria-live="polite">Завантаження колоди…</div> : null}
      {state.status === "unavailable" ? <div className="deck-state">Колода доступна після запуску через Telegram.</div> : null}
      {state.status === "missing" ? <div className="deck-state">Недостатньо карт для бойової колоди.</div> : null}
      {state.status === "error" ? (
        <div className="deck-state deck-state--error">
          <span>Не вдалося завантажити колоду.</span>
          <button onClick={retry} type="button">Повторити</button>
        </div>
      ) : null}

      {state.status === "ready" ? (
        <>
          {showTutorialRule ? <section className="deck-rule-note" data-tutorial-target="deck-rule" aria-label="Правило бойової колоди">
            <div><strong>9 карт у бойовій колоді</strong><span>Автоматично обрані найсильніші допустимі карти</span></div>
            <div className="deck-rule-note__elements">
              {DECK_ELEMENTS.map((element) => <span key={element}><ElementSymbol element={element} /><strong>{elementCounts?.[element] ?? 0}</strong></span>)}
            </div>
          </section> : null}
          {hasUpgrade ? <RibbonTitle as="div" className="deck-upgrade-ribbon" size="wide">Покращуй позначені карти</RibbonTitle> : null}
          <div className="deck-grid" aria-label="Дев’ять карт автоматичної бойової колоди">
            {state.deck.cards.map((card, index) => (
              <DeckCard card={card} dataTutorialTarget={index === 0 ? "deck-card" : undefined} key={card.slot} onClick={() => onOpenCard(card.instanceId)} />
            ))}
          </div>
          {showTutorialRule ? null : (
            <div className="deck-elements" aria-label="Стихії бойової колоди">
              {DECK_ELEMENTS.map((element) => <span key={element}><ElementMedallion element={element} /><strong>{elementCounts?.[element] ?? 0}</strong></span>)}
            </div>
          )}

          <div className="deck-notes">
            {deckTask ? (
              <button className="deck-note" onClick={onOpenTasks} type="button">
                <span>{deckTaskCopy(deckTask)}</span>
                <small>{formatFullUiNumber(deckTask.progress)} / {formatFullUiNumber(deckTask.target)}</small>
                <span aria-hidden="true" className="deck-note__chevron"><AppIcon name="chevron" size={18} /></span>
              </button>
            ) : null}
            {weakCount !== null && weakCount > 0 ? (
              <button className="deck-note" onClick={onOpenWeakCards} type="button">
                <span>{weakCardsCopy(weakCount)}</span>
                <span aria-hidden="true" className="deck-note__chevron"><AppIcon name="chevron" size={18} /></span>
              </button>
            ) : null}
            {weakCount === 0 ? (
              <p className="deck-note deck-note--info">Слабких карт немає. Нові карти приходять із дуелей, кампанії та магазину.</p>
            ) : null}
          </div>

          <nav className="deck-actions" aria-label="Куди далі">
            <MenuRow chevron icon="duel" iconSrc={homeSprite("mode-duel")} illustrationSrc={homeSprite("row-duel")} onClick={onOpenDuel} title="Дуелі" />
            <MenuRow chevron icon="campaign" iconSrc={homeSprite("mode-campaign")} illustrationSrc={homeSprite("row-campaign")} onClick={onOpenCampaign} title="Кампанія" />
            <MenuRow chevron icon="shop" iconSrc={homeSprite("row-icon-shop")} illustrationSrc={homeSprite("row-shop")} onClick={onOpenShop} title="Магазин" />
          </nav>
        </>
      ) : null}
    </section>
  );
}
