import { useEffect, useRef, useState } from "react";
import { EQUIPMENT_RARITY_CONFIG, STARTER_EQUIPMENT_DEFINITIONS } from "@cardastika/game-core";
import { EquipmentItemCard } from "../components/EquipmentBook";
import { ShopRewardReveal } from "../components/ShopRewardReveal";
import type { ChestShopFeedEntry, ChestShopGrantedPrize, ChestShopPossiblePrize, ChestShopView, PlayerSummary } from "@cardastika/shared";
import { CHEST_OPENING_MS, ChestOpening, type ChestOpeningPhase } from "../components/ChestOpening";
import { CurrencyIcon } from "../components/CurrencyDisplay";
import { ScreenHeading } from "../components/ScreenHeading";
import { formatUiNumber } from "../i18n";
import { getTelegramInitData } from "../telegram";
import { ChestShopApiError, loadChestShop, openChestShop, openShopChest } from "../telegram/chestShop";
import "../styles/chest-shop.css";

const DIAMOND_ICON = "/assets/ui/icons/icon-diamond-v1.webp";
/** How long the open chest glows before a card prize takes the screen. */
const CARD_REVEAL_DELAY_MS = 900;

function formatLeft(until: string, now: number) {
  const minutes = Math.max(0, Math.ceil((new Date(until).getTime() - now) / 60_000));
  const days = Math.floor(minutes / 1_440);
  const hours = Math.floor(minutes % 1_440 / 60);
  if (days > 0) return `${days} д ${hours} год`;
  return `${hours} год ${minutes % 60} хв`;
}

/** The reference feed wording: kind only, no element, level or exact amount. */
function feedPrizeLabel(entry: Pick<ChestShopFeedEntry, "kind" | "equipmentRarity">) {
  switch (entry.kind) {
    case "gold_small": return "золото";
    case "gold_large": return "багато золота";
    case "diamonds": return "алмази в нагороди";
    case "equipment": return entry.equipmentRarity === "rare" ? "рідкісне спорядження" : entry.equipmentRarity === "uncommon" ? "незвичайне спорядження" : "звичайне спорядження";
    case "card": return "карту";
    case "source": return "джерело магії";
  }
}

const PRIZE_ICONS = {
  equipment: "/assets/ui/home/sprites/row-icon-equipment.webp",
  card: "/assets/ui/icons/icon-card-reward-v1.webp",
  source: "/assets/ui/icons/icon-crystals-v1.webp",
} as const;

/** One prize: a fixed icon column, then the amount or the name, so the list lines up. */
function PrizeLine({ prize }: { prize: ChestShopPossiblePrize | ChestShopGrantedPrize }) {
  const name = "name" in prize && prize.name ? prize.name : null;
  let icon: React.ReactNode;
  let text: string;
  switch (prize.kind) {
    case "gold_small":
    case "gold_large":
      icon = <CurrencyIcon kind="gold" size={20} />;
      text = formatUiNumber(prize.amount ?? 0);
      break;
    case "diamonds":
      icon = <img alt="" src={DIAMOND_ICON} />;
      text = formatUiNumber(prize.amount ?? 0);
      break;
    case "equipment": {
      // A granted prize names the real item; the list of possible prizes only knows the rarity.
      const item = "equipmentItemId" in prize && prize.equipmentItemId ? STARTER_EQUIPMENT_DEFINITIONS.find(({ id }) => id === prize.equipmentItemId) : undefined;
      icon = <img alt="" src={PRIZE_ICONS.equipment} />;
      text = item ? item.name : `${EQUIPMENT_RARITY_CONFIG[prize.equipmentRarity ?? "common"].label} річ або артефакт`;
      break;
    }
    case "card":
      icon = <img alt="" src={PRIZE_ICONS.card} />;
      text = name ? `${name}, ${prize.level ?? 1} рівень` : `Карта ${prize.level ?? 1} рівня`;
      break;
    case "source":
      icon = <img alt="" src={PRIZE_ICONS.source} />;
      text = name ? `${name}, ${prize.level ?? 1} рівень` : `Джерело магії ${prize.level ?? 1} рівня`;
      break;
  }
  const numeric = prize.kind === "gold_small" || prize.kind === "gold_large" || prize.kind === "diamonds";
  return <span className="chest-shop__prize"><span className="chest-shop__prize-icon">{icon}</span><span className={numeric ? "ui-number" : undefined}>{text}</span></span>;
}

function FeedRow({ entry, now }: { entry: ChestShopFeedEntry; now: number }) {
  const seconds = Math.max(0, Math.round((now - new Date(entry.openedAt).getTime()) / 1_000));
  const ago = seconds < 60 ? `${seconds} с тому` : seconds < 3_600 ? `${Math.floor(seconds / 60)} хв тому` : `${Math.floor(seconds / 3_600)} год тому`;
  return (
    <li className="chest-shop__feed-row">
      <strong>{entry.playerName}</strong>
      <small>{ago}</small>
      <span>{`Скриня №${entry.chestNumber}: ${feedPrizeLabel(entry)}`}</span>
    </li>
  );
}

export function ChestShopScreen({ onBack, onPlayerSummaryChange }: {
  onBack: () => void;
  onPlayerSummaryChange: (player: Pick<PlayerSummary, "gold" | "silver">) => void;
}) {
  const [shop, setShop] = useState<ChestShopView | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [phase, setPhase] = useState<ChestOpeningPhase>("idle");
  const [prize, setPrize] = useState<ChestShopGrantedPrize | null>(null);
  const [openedChestNumber, setOpenedChestNumber] = useState(0);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const busyRef = useRef(false);

  useEffect(() => {
    const initData = getTelegramInitData();
    if (!initData) { setLoadFailed(true); return undefined; }
    const controller = new AbortController();
    void loadChestShop(initData, controller.signal).then(setShop).catch((reason: unknown) => {
      if (!(reason instanceof DOMException && reason.name === "AbortError")) setLoadFailed(true);
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // When the four hours run out, the server already reads the shop as closed; refresh to show it.
  useEffect(() => {
    if (!shop?.openUntil) return undefined;
    const initData = getTelegramInitData();
    if (!initData) return undefined;
    const timer = window.setTimeout(() => void loadChestShop(initData).then(setShop).catch(() => undefined), Math.max(0, new Date(shop.openUntil).getTime() - Date.now()) + 500);
    return () => window.clearTimeout(timer);
  }, [shop?.openUntil]);

  function errorMessage(reason: unknown) {
    if (reason instanceof ChestShopApiError && reason.code === "not_enough_silver") return "Недостатньо срібла.";
    if (reason instanceof ChestShopApiError && reason.code === "chest_shop_closed") return "Лавка вже зачинилася.";
    return "Дію не виконано. Оновіть дані та спробуйте ще раз.";
  }

  async function handleOpenShop() {
    const initData = getTelegramInitData();
    if (!initData || busyRef.current) return;
    busyRef.current = true;
    setError(null);
    try {
      setShop(await openChestShop(initData));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      busyRef.current = false;
    }
  }

  async function handleOpenChest() {
    const initData = getTelegramInitData();
    if (!initData || !shop || busyRef.current) return;
    busyRef.current = true;
    setRequesting(true);
    setError(null);
    setPrize(null);
    const chestNumber = shop.chestNumber;
    // The server answers first; the opening plays only for a chest that really opened, so a refusal never
    // shakes the chest and a slow answer never leaves an empty open chest on screen.
    const reveal = async (granted: ChestShopGrantedPrize, next: ChestShopView) => {
      setRequesting(false);
      setPhase("opening");
      await new Promise((resolve) => window.setTimeout(resolve, CHEST_OPENING_MS));
      setPrize(granted);
      setOpenedChestNumber(chestNumber);
      setPhase("opened");
      setShop(next);
    };
    try {
      const result = await openShopChest(initData, chestNumber);
      onPlayerSummaryChange(result.player);
      await reveal(result.prize, result.shop);
    } catch (reason) {
      setRequesting(false);
      const fresh = await loadChestShop(initData).catch(() => null);
      // A lost response: the chest was already opened, so show what it gave instead of an error.
      if (reason instanceof ChestShopApiError && reason.code === "chest_shop_conflict" && fresh?.lastOpening?.chestNumber === chestNumber) {
        await reveal(fresh.lastOpening.prize, fresh);
      } else {
        setPhase("idle");
        setError(errorMessage(reason));
        if (fresh) setShop(fresh);
      }
    } finally {
      busyRef.current = false;
    }
  }

  const opened = phase === "opened" && prize;
  // Equipment shows the same item card as the equipment chests: picture, rarity and bonuses.
  const equipmentItem = opened && prize.kind === "equipment" && prize.equipmentItemId
    ? STARTER_EQUIPMENT_DEFINITIONS.find(({ id }) => id === prize.equipmentItemId)
    : undefined;
  const [itemCardClosed, setItemCardClosed] = useState(false);
  useEffect(() => setItemCardClosed(false), [prize]);
  // A card or magic source: the open chest glows for a moment, then the card is shown like a shop reward.
  const [cardRevealReady, setCardRevealReady] = useState(false);
  useEffect(() => {
    setCardRevealReady(false);
    if (!opened || !prize.card) return undefined;
    const timer = window.setTimeout(() => setCardRevealReady(true), CARD_REVEAL_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [opened, prize]);

  if (opened && prize.card && cardRevealReady && !itemCardClosed) {
    return (
      <ShopRewardReveal
        continueLabel={shop?.status === "open" ? "До наступної скрині" : "Далі"}
        onContinue={() => { setItemCardClosed(true); setPhase("idle"); setPrize(null); }}
        packHeading={`Зі скрині №${openedChestNumber}`}
        purchases={[{
          deckChanged: prize.deckChanged ?? false,
          newDiscovery: prize.newDiscovery ?? false,
          reward: prize.card,
          updatedBalance: { gold: 0, silver: 0 },
          updatedChances: [],
        }]}
        revealHeading={`Зі скрині №${openedChestNumber}`}
        revealedAtOnce
      />
    );
  }

  return (
    <div className="chest-shop-screen">
      <ScreenHeading onBack={onBack} title="Лавка скринь" />
      {!shop && !loadFailed ? <p className="chest-shop__note">Відчиняємо лавку…</p> : null}
      {loadFailed ? <p className="chest-shop__note">Не вдалося завантажити лавку.</p> : null}
      {shop ? (
        <section className="chest-shop__panel">
          {shop.status === "open" || opened ? (
            <>
              <h2>{opened ? "Ти отримав:" : `Скриня ${shop.chestNumber} з ${shop.chestCount}`}</h2>
              <ChestOpening phase={phase} prize={opened ? <PrizeLine prize={prize} /> : undefined} />
              {opened ? (
                <button className="ui-button ui-button--primary chest-shop__action" onClick={() => { setPhase("idle"); setPrize(null); }} type="button">
                  {shop.status === "open" ? "До наступної скрині" : "Далі"}
                </button>
              ) : (
                <>
                  <p className="chest-shop__hint">Може випасти одне з цього:</p>
                  <ul className="chest-shop__prizes">
                    {shop.possiblePrizes.map((item) => <li key={item.kind}><PrizeLine prize={item} /></li>)}
                  </ul>
                  <button className="ui-button ui-button--primary chest-shop__action" disabled={phase === "opening" || requesting} onClick={() => void handleOpenChest()} type="button">
                    <span>{requesting ? "Відкриваємо…" : "Відкрити"}</span>
                    <span className="chest-shop__price"><CurrencyIcon kind="silver" size={18} /><span className="ui-number">{formatUiNumber(shop.price)}</span></span>
                  </button>
                </>
              )}
              {shop.status === "open" && shop.openUntil ? <p className="chest-shop__note">{`Залишилось ${formatLeft(shop.openUntil, now)}, щоб відкрити всі скрині`}</p> : null}
            </>
          ) : shop.status === "available" ? (
            <>
              <h2>Лавка скринь</h2>
              <ChestOpening phase="idle" />
              <p className="chest-shop__hint">Раз на тиждень лавка відчиняється на 4 години: 15 скринь по черзі за срібло, і що далі, то цінніший приз.</p>
              <button className="ui-button ui-button--primary chest-shop__action" onClick={() => void handleOpenShop()} type="button">Відчинити лавку</button>
            </>
          ) : (
            <>
              <h2>Лавка зачинена</h2>
              <p className="chest-shop__hint">{`Наступного разу лавка відчиниться через ${formatLeft(shop.nextWeekAt, now)}.`}</p>
            </>
          )}
          {error ? <p className="chest-shop__error" role="alert">{error}</p> : null}
          {equipmentItem && !itemCardClosed ? (
            <EquipmentItemCard celebrate definition={equipmentItem} eyebrow={`Зі скрині №${openedChestNumber}`} onClose={() => setItemCardClosed(true)}>
              <button className="eq-button eq-button--leather" onClick={() => setItemCardClosed(true)} type="button">Забрати</button>
            </EquipmentItemCard>
          ) : null}
        </section>
      ) : null}
      {shop?.feed.length ? (
        <section className="chest-shop__panel chest-shop__feed" aria-label="Призи інших гравців">
          <h2>Щасливчики</h2>
          <ul>{shop.feed.map((entry) => <FeedRow entry={entry} key={`${entry.openedAt}-${entry.playerName}-${entry.chestNumber}`} now={now} />)}</ul>
        </section>
      ) : null}
    </div>
  );
}
