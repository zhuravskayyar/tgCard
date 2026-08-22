import { AppIcon, type AppIconName } from "./AppIcon";

export type BottomNavItem = "home" | "profile" | "guild";

interface NavigationItem {
  icon: AppIconName;
  id: BottomNavItem;
  label: string;
}

const navigationItems: NavigationItem[] = [
  { id: "home", label: "Головна", icon: "home" },
  { id: "profile", label: "Профіль", icon: "profile" },
  { id: "guild", label: "Гільдія", icon: "guild" },
];

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
              <AppIcon name={item.icon} size={24} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
