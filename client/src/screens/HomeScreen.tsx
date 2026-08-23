import { MenuRow } from "../components/MenuRow";
import { ModeTile, type ModeAccent } from "../components/ModeTile";
import type { AppIconName } from "../components/AppIcon";

interface HomeItem {
  icon: AppIconName;
  title: string;
}

interface ModeItem extends HomeItem {
  accent: ModeAccent;
}

const modes: ModeItem[] = [
  { title: "Дуель", icon: "duel", accent: "steel" },
  { title: "Підземелля", icon: "dungeon", accent: "emerald" },
  { title: "Кампанія", icon: "campaign", accent: "gold" },
  { title: "Арена", icon: "arena", accent: "violet" },
  { title: "Колода", icon: "deck", accent: "arcane" },
  { title: "Турнір", icon: "tournament", accent: "bronze" },
];

const secondaryActions: HomeItem[] = [
  { title: "Магазин", icon: "shop" },
  { title: "Батл пас", icon: "battle-pass" },
  { title: "Рейтинг", icon: "ranking" },
  { title: "Колекція", icon: "collection" },
  { title: "Інвентар", icon: "inventory" },
];

interface HomeScreenProps {
  onOpenCampaign: () => void;
  onOpenDuel: () => void;
  onOpenDeck: () => void;
  onOpenCollections: () => void;
  onOpenShop: () => void;
}

export function HomeScreen({ onOpenCampaign, onOpenCollections, onOpenDeck, onOpenDuel, onOpenShop }: HomeScreenProps) {
  return (
    <div className="home-screen">
      <header className="home-heading">
        <span>Зала випробувань</span>
        <h1>Оберіть свій шлях</h1>
      </header>

      <section className="mode-grid" aria-label="Ігрові режими">
        {modes.map((mode) => (
          <ModeTile key={mode.title} {...mode} onClick={mode.icon === "duel" ? onOpenDuel : mode.icon === "deck" ? onOpenDeck : mode.icon === "campaign" ? onOpenCampaign : undefined} />
        ))}
      </section>

      <section className="secondary-menu" aria-label="Додаткові розділи">
        {secondaryActions.map((action) => (
          <MenuRow key={action.title} {...action} onClick={action.icon === "shop" ? onOpenShop : action.icon === "collection" ? onOpenCollections : undefined} />
        ))}
      </section>
    </div>
  );
}
