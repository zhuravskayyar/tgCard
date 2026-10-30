export type BottomNavItem = "home" | "profile" | "guild";

interface NavigationItem {
  id: BottomNavItem;
  label: string;
}

const navigationItems: NavigationItem[] = [
  { id: "home", label: "Головна" },
  { id: "profile", label: "Профіль" },
  { id: "guild", label: "Гільдія" },
];

const navigationIcon = (id: BottomNavItem) => `/assets/ui/home/nav-icon-${id}.webp`;

interface BottomNavProps {
  activeItem: BottomNavItem;
  onSelect?: (item: BottomNavItem) => void;
}

export function BottomNav({ activeItem, onSelect }: BottomNavProps) {
  return (
    <nav className="bottom-navigation" aria-label="Головна навігація">
      <div className="bottom-navigation__items">
        {navigationItems.map((item) => {
          const isActive = item.id === activeItem;

          return (
            <button
              aria-current={isActive ? "page" : undefined}
              className="bottom-navigation__item"
              key={item.id}
              onClick={() => onSelect?.(item.id)}
              type="button"
            >
              <img alt="" aria-hidden="true" className="bottom-navigation__icon" src={navigationIcon(item.id)} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
