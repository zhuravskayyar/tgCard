import { useEffect, useState } from "react";
import { ARENA_UNLOCK_DUEL_RATING, type ChestShopView, type DuelAvailability } from "@cardastika/shared";
import { MenuRow } from "../components/MenuRow";
import { ModeTile, type ModeAccent } from "../components/ModeTile";
import type { AppIconName } from "../components/AppIcon";
import { GuidedOnboarding } from "../components/GuidedOnboarding";
import { useBattlePass } from "../hooks/useBattlePass";
import type { TutorialStatus } from "../hooks/useTutorial";
import { getTelegramInitData } from "../telegram";
import { loadArenaPresence } from "../telegram/arena";
import { loadDuelAvailability } from "../telegram/duel";
import { loadChestShop } from "../telegram/chestShop";
import "../styles/menu-row-gilded.css";

interface HomeItem {
  available?: boolean;
  icon: AppIconName;
  /** Row icon file when it is not named after the AppIcon. */
  iconSprite?: string;
  sprite: string;
  title: string;
}

interface ModeItem extends HomeItem {
  accent: ModeAccent;
  status?: string;
}

// Same six modes and order as the reference home; the campaign is the single story entry.
const modes: ModeItem[] = [
  { title: "Дуель", icon: "duel", sprite: "mode-duel", accent: "gold" },
  { title: "Кампанія", icon: "campaign", sprite: "mode-campaign", accent: "gold" },
  { title: "Турнір", icon: "tournament", sprite: "mode-tournament", accent: "gold" },
  { title: "Арена", icon: "arena", sprite: "mode-arena", accent: "bronze" },
  { title: "Колода", icon: "deck", sprite: "mode-deck", accent: "bronze" },
  { title: "Навала", icon: "skull", sprite: "mode-dungeon", accent: "bronze", status: "Скоро" },
];

const secondaryActions: HomeItem[] = [
  { title: "Завдання", icon: "tasks", sprite: "row-tasks" },
  { title: "Алмазні нагороди", icon: "battle-pass", sprite: "row-battle-pass" },
  { title: "Спорядження", icon: "equipment", sprite: "row-equipment" },
  { title: "Дракон-захисник", icon: "skull", sprite: "row-guardian-dragon", iconSprite: "row-icon-guardian-dragon" },
  { title: "Колекції", icon: "collection", sprite: "row-collection" },
  { title: "Найкращі", icon: "ranking", sprite: "row-ranking" },
  { title: "Магазин", icon: "shop", sprite: "row-shop" },
];

const homeSprite = (name: string) => `/assets/ui/home/sprites/${name}.webp`;
const ARENA_PRESENCE_REFRESH_MS = 15_000;

/** "Someone is in the arena" while arena tasks are unfinished and a same-league player is queued. */
function useArenaPresence(enabled: boolean) {
  const [someoneQueued, setSomeoneQueued] = useState(false);
  useEffect(() => {
    const initData = getTelegramInitData();
    if (!enabled || !initData) return;
    const controller = new AbortController();
    const refresh = () => void loadArenaPresence(initData, controller.signal)
      .then(({ someoneQueued: queued }) => setSomeoneQueued(queued))
      .catch(() => undefined);
    refresh();
    const timer = window.setInterval(refresh, ARENA_PRESENCE_REFRESH_MS);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [enabled]);
  return enabled && someoneQueued;
}

/** "Дуелі: 7", or "Перерва 01:12" once all ten charges are spent; undefined until loaded. */
function useDuelTileStatus(enabled: boolean) {
  const [availability, setAvailability] = useState<DuelAvailability | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    const initData = getTelegramInitData();
    if (!enabled || !initData) return;
    const controller = new AbortController();
    void loadDuelAvailability(initData, controller.signal).then(setAvailability).catch(() => undefined);
    return () => controller.abort();
  }, [enabled, reloadKey]);
  const refillAt = availability?.remaining === 0 ? availability.refillAt : null;
  useEffect(() => {
    if (!refillAt) return undefined;
    const ticker = window.setInterval(() => setNow(Date.now()), 30_000);
    const refill = window.setTimeout(() => setReloadKey((key) => key + 1), Math.max(0, new Date(refillAt).getTime() - Date.now()) + 500);
    return () => { window.clearInterval(ticker); window.clearTimeout(refill); };
  }, [refillAt]);
  if (!enabled || !availability) return undefined;
  if (!refillAt) return `Дуелі: ${availability.remaining}`;
  const minutesLeft = Math.max(1, Math.ceil((new Date(refillAt).getTime() - now) / 60_000));
  const timeLeft = `${Math.floor(minutesLeft / 60)}:${String(minutesLeft % 60).padStart(2, "0")}`;
  return `Перерва ${timeLeft}`;
}

// Until the painted row illustration arrives, the row shows the existing chest sprite as its icon.
const CHEST_SHOP_ROW_ICON = "/assets/ui/chest/chest-closed-icon.webp";

/** "3 год 52 хв" while the chest shop is open, "Відчинити" when this week's opening is ready, else undefined. */
function useChestShopRowDetail(enabled: boolean) {
  const [shop, setShop] = useState<ChestShopView | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const initData = getTelegramInitData();
    if (!enabled || !initData) return undefined;
    const controller = new AbortController();
    void loadChestShop(initData, controller.signal).then(setShop).catch(() => undefined);
    const ticker = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => { controller.abort(); window.clearInterval(ticker); };
  }, [enabled]);
  if (!enabled || !shop) return undefined;
  if (shop.status === "available") return "Відчинити";
  if (shop.status !== "open" || !shop.openUntil) return undefined;
  const minutes = Math.ceil((new Date(shop.openUntil).getTime() - now) / 60_000);
  if (minutes <= 0) return undefined;
  return `${Math.floor(minutes / 60)} год ${minutes % 60} хв`;
}

interface HomeScreenProps {
  campaignTitle?: string;
  onOpenCampaign: () => void;
  onResumeTutorial: () => void;
  tutorialStatus: TutorialStatus;
  onOpenDuel: () => void;
  onOpenTournament: () => void;
  onOpenArena: () => void;
  onOpenDungeon: () => void;
  onOpenDeck: () => void;
  onOpenLeaderboard: () => void;
  onOpenCollections: () => void;
  onOpenTasks: () => void;
  onOpenEquipment: () => void;
  onOpenGuardianDragon: () => void;
  onOpenBattlePass: () => void;
  onOpenShop: () => void;
  onOpenChestShop: () => void;
  playerLevel?: number;
  /** Undefined while the player summary is loading. */
  arenaUnlocked?: boolean;
}

export function HomeScreen({ campaignTitle, onOpenBattlePass, onOpenCampaign, onResumeTutorial, tutorialStatus, onOpenCollections, onOpenDeck, onOpenDuel, onOpenTournament, onOpenArena, onOpenDungeon, onOpenTasks, onOpenEquipment, onOpenGuardianDragon, onOpenLeaderboard, onOpenShop, onOpenChestShop, playerLevel, arenaUnlocked }: HomeScreenProps) {
  const chestShopDetail = useChestShopRowDetail(playerLevel !== undefined && playerLevel > 1);
  const { state: battlePassState } = useBattlePass();
  const novice = playerLevel !== undefined && playerLevel <= 1;
  const arenaLocked = arenaUnlocked === false;
  const arenaOccupied = useArenaPresence(!novice && arenaUnlocked === true);
  const duelStatus = useDuelTileStatus(playerLevel !== undefined && !novice);
  const hasDailyTaskReward = battlePassState.status === "ready"
    && battlePassState.data.daily.tasks.some((task) => task.completed && !task.claimed);
  const hasBattlePassReward = battlePassState.status === "ready"
    && battlePassState.data.battlePass.circles.some((circle) => circle.milestones.some((milestone) => milestone.claimable && !milestone.claimed));

  return (
    <div className="home-screen">
      <GuidedOnboarding onResume={onResumeTutorial} status={tutorialStatus} />
      <div className="home-screen__content">
        <section className="mode-grid" aria-label="Ігрові режими">
          {modes.map((mode) => (
            <ModeTile dataTutorialTarget={mode.icon === "deck" ? "home-deck" : undefined} iconSrc={homeSprite(mode.sprite)} key={mode.title} {...mode} status={novice && mode.icon === "arena" ? "Після кампанії" : mode.icon === "arena" && arenaLocked ? `Дуелі ${ARENA_UNLOCK_DUEL_RATING}` : mode.icon === "arena" && arenaOccupied ? "Хтось є" : mode.icon === "campaign" && campaignTitle ? campaignTitle : mode.icon === "duel" ? duelStatus : mode.status} onClick={mode.icon === "duel" ? onOpenDuel : mode.icon === "tournament" ? onOpenTournament : mode.icon === "arena" ? onOpenArena : mode.icon === "dungeon" ? onOpenDungeon : mode.icon === "deck" ? onOpenDeck : mode.icon === "campaign" ? onOpenCampaign : undefined} />
          ))}
        </section>
        <section className="home-menu" aria-label="Розділи гри">
          {/* The guardian dragon belongs to mages from the third epic duel league, the arena's threshold. */}
          {secondaryActions.filter((action) => action.sprite !== "row-guardian-dragon" || arenaUnlocked === true).map((action) => (
            <MenuRow
              attention={action.icon === "tasks" ? hasDailyTaskReward : action.icon === "battle-pass" ? hasBattlePassReward : false}
              badge={action.available === false ? "Скоро" : undefined}
              disabled={action.available === false}
              detail={novice && !hasBattlePassReward && ["battle-pass", "equipment", "collection", "ranking"].includes(action.icon) ? "Пізніше" : undefined}
              key={action.title}
              chevron
              icon={action.icon}
              iconSrc={homeSprite(action.iconSprite ?? `row-icon-${action.icon}`)}
              illustrationSrc={homeSprite(action.sprite)}
              metalTexture
              onClick={action.sprite === "row-guardian-dragon" ? onOpenGuardianDragon : action.icon === "tasks" ? onOpenTasks : action.icon === "battle-pass" ? onOpenBattlePass : action.icon === "equipment" ? onOpenEquipment : action.icon === "shop" ? onOpenShop : action.icon === "collection" ? onOpenCollections : action.icon === "ranking" ? onOpenLeaderboard : undefined}
              title={action.title}
            />
          ))}
          {/* Chest shop: below the shop, only while this week's opening is ready or running (reference: «Лавка сундуков» with its time left). */}
          {chestShopDetail ? (
            <MenuRow chevron className="menu-row--gilded" detail={chestShopDetail} icon="shop" iconSrc={CHEST_SHOP_ROW_ICON} metalTexture onClick={onOpenChestShop} title="Лавка скринь" />
          ) : null}
        </section>
      </div>
    </div>
  );
}
