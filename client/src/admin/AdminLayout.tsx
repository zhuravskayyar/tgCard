import type { ReactNode } from "react";
import type { AdminIdentity } from "@cardastika/shared";

export type AdminSection = "audit" | "cards" | "dashboard" | "events" | "player" | "players" | "promos" | "settings" | "shop";

interface AdminLayoutProps {
  admin: AdminIdentity;
  children: ReactNode;
  currentSection: AdminSection;
  mobileMenuOpen: boolean;
  onLogout: () => void;
  onMenuToggle: () => void;
  onNavigate: (path: string) => void;
}

const navigation: Array<{ group: string; items: Array<{ icon: string; label: string; path: string; section: AdminSection }> }> = [
  {
    group: "Керування",
    items: [
      { icon: "▦", label: "Дашборд", path: "/admin", section: "dashboard" },
      { icon: "♙", label: "Гравці", path: "/admin/players", section: "players" },
      { icon: "▱", label: "Карти", path: "/admin/cards", section: "cards" },
      { icon: "◇", label: "Магазин", path: "/admin/shop", section: "shop" },
      { icon: "✦", label: "Промокоди", path: "/admin/promos", section: "promos" },
      { icon: "◷", label: "Події", path: "/admin/events", section: "events" },
    ],
  },
  {
    group: "Система",
    items: [
      { icon: "≡", label: "Журнал дій", path: "/admin/audit", section: "audit" },
      { icon: "⚙", label: "Налаштування", path: "/admin/settings", section: "settings" },
    ],
  },
];

const sectionTitles: Record<AdminSection, string> = {
  audit: "Журнал дій",
  cards: "Карти",
  dashboard: "Дашборд",
  events: "Події",
  player: "Профіль гравця",
  players: "Гравці",
  promos: "Промокоди",
  settings: "Налаштування",
  shop: "Магазин",
};

export function AdminLayout({ admin, children, currentSection, mobileMenuOpen, onLogout, onMenuToggle, onNavigate }: AdminLayoutProps) {
  const initials = admin.displayName.trim().slice(0, 2).toUpperCase() || "AD";
  return (
    <div className="admin-shell">
      <aside className={`admin-sidebar${mobileMenuOpen ? " admin-sidebar--open" : ""}`}>
        <button aria-label="Закрити меню" className="admin-sidebar__backdrop" onClick={onMenuToggle} type="button" />
        <div className="admin-sidebar__panel">
          <div className="admin-brand">
            <span className="admin-brand__mark">C</span>
            <span><strong>Cardastika</strong><small>Control center</small></span>
          </div>
          <nav className="admin-nav" aria-label="Розділи адмін-панелі">
            {navigation.map((group) => (
              <section className="admin-nav__group" key={group.group}>
                <p>{group.group}</p>
                {group.items.map((item) => {
                  const active = currentSection === item.section || (currentSection === "player" && item.section === "players");
                  return (
                    <a
                      aria-current={active ? "page" : undefined}
                      className={active ? "admin-nav__link admin-nav__link--active" : "admin-nav__link"}
                      href={item.path}
                      key={item.path}
                      onClick={(event) => { event.preventDefault(); onNavigate(item.path); }}
                    >
                      <span aria-hidden="true">{item.icon}</span>{item.label}
                    </a>
                  );
                })}
              </section>
            ))}
          </nav>
          <div className="admin-account">
            <span className="admin-account__avatar">{initials}</span>
            <span className="admin-account__copy"><strong>{admin.displayName}</strong><small>Telegram · {admin.telegramUserId}</small></span>
            <button aria-label="Вийти" onClick={onLogout} title="Вийти" type="button">↪</button>
          </div>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <button aria-expanded={mobileMenuOpen} aria-label="Відкрити меню" className="admin-topbar__menu" onClick={onMenuToggle} type="button">☰</button>
          <div><span>Адмін-панель</span><strong>{sectionTitles[currentSection]}</strong></div>
          <a className="admin-topbar__site" href="/" target="_blank" rel="noreferrer">Відкрити гру ↗</a>
        </header>
        <div className="admin-content">{children}</div>
      </main>
    </div>
  );
}
