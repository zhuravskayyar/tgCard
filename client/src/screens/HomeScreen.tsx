import { MenuRow } from "../components/MenuRow";
import { ModeTile, type ModeAccent } from "../components/ModeTile";
import { AppIcon, type AppIconName } from "../components/AppIcon";
import { GuidedOnboarding } from "../components/GuidedOnboarding";
import { useBattlePass } from "../hooks/useBattlePass";
import type { TutorialStatus } from "../hooks/useTutorial";

interface HomeItem {
  available?: boolean;
  icon: AppIconName;
  title: string;
}

interface ModeItem extends HomeItem {
  accent: ModeAccent;
  status?: string;
}

const modes: ModeItem[] = [
  { title: "Дуель", icon: "duel", accent: "steel" },
  { title: "Підземелля", icon: "dungeon", accent: "emerald" },
  { title: "Кампанія", icon: "campaign", accent: "gold" },
  { title: "Арена", icon: "arena", accent: "violet" },
  { title: "Колода", icon: "deck", accent: "arcane" },
  { title: "Турнір", icon: "tournament", accent: "red", status: "Скоро" },
];

const secondaryActions: HomeItem[] = [
  { title: "Завдання", icon: "tasks" },
  { title: "Алмазні нагороди", icon: "battle-pass" },
  { title: "Спорядження", icon: "equipment" },
  { title: "Колекції", icon: "collection" },
  { title: "Найкращі", icon: "ranking" },
  { title: "Магазин", icon: "shop" },
];

interface HomeScreenProps {
  onOpenCampaign: () => void;
  onResumeTutorial: () => void;
  tutorialStatus: TutorialStatus;
  onOpenDuel: () => void;
  onOpenArena: () => void;
  onOpenDungeon: () => void;
  onOpenDeck: () => void;
  onOpenLeaderboard: () => void;
  onOpenCollections: () => void;
  onOpenTasks: () => void;
  onOpenEquipment: () => void;
  onOpenBattlePass: () => void;
  onOpenShop: () => void;
  onOpenSettings: () => void;
  playerLevel?: number;
}

export function HomeScreen({ onOpenBattlePass, onOpenCampaign, onResumeTutorial, tutorialStatus, onOpenCollections, onOpenDeck, onOpenDuel, onOpenArena, onOpenDungeon, onOpenTasks, onOpenEquipment, onOpenLeaderboard, onOpenShop, onOpenSettings, playerLevel }: HomeScreenProps) {
  const { state: battlePassState } = useBattlePass();
  const novice = (playerLevel ?? 2) <= 1;
  const hasDailyTaskReward = battlePassState.status === "ready"
    && battlePassState.data.daily.tasks.some((task) => task.completed && !task.claimed);
  const hasBattlePassReward = battlePassState.status === "ready"
    && battlePassState.data.battlePass.circles.some((circle) => circle.milestones.some((milestone) => milestone.claimable && !milestone.claimed));

  return (
    <div className="home-screen">
      <div className="home-screen__toolbar">
        <button className="home-settings-button" aria-label="Налаштування" onClick={onOpenSettings} type="button">
          <AppIcon name="settings" size={21} />
        </button>
      </div>
      <GuidedOnboarding onResume={onResumeTutorial} status={tutorialStatus} />
      <section className="mode-grid" aria-label="Ігрові режими">
        {modes.map((mode) => (
          <ModeTile dataTutorialTarget={mode.icon === "deck" ? "home-deck" : undefined} key={mode.title} {...mode} status={novice && (mode.icon === "dungeon" || mode.icon === "arena") ? "Після кампанії" : mode.status} onClick={mode.icon === "duel" ? onOpenDuel : mode.icon === "arena" ? onOpenArena : mode.icon === "dungeon" ? onOpenDungeon : mode.icon === "deck" ? onOpenDeck : mode.icon === "campaign" ? onOpenCampaign : undefined} />
        ))}
      </section>
      <section className="home-menu" aria-label="Розділи гри">
        {secondaryActions.map((action) => (
          <MenuRow
            attention={action.icon === "tasks" ? hasDailyTaskReward : action.icon === "battle-pass" ? hasBattlePassReward : false}
            badge={action.available === false ? "Скоро" : undefined}
            disabled={action.available === false}
            detail={novice && !hasBattlePassReward && ["battle-pass", "equipment", "collection", "ranking"].includes(action.icon) ? "Пізніше" : undefined}
            key={action.title}
            icon={action.icon}
            metalTexture
            onClick={action.icon === "tasks" ? onOpenTasks : action.icon === "battle-pass" ? onOpenBattlePass : action.icon === "equipment" ? onOpenEquipment : action.icon === "shop" ? onOpenShop : action.icon === "collection" ? onOpenCollections : action.icon === "ranking" ? onOpenLeaderboard : undefined}
            title={action.title}
          />
        ))}
      </section>
    </div>
  );
}
