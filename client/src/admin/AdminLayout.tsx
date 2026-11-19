import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { AdminIdentity } from "@cardastika/shared";
import { initials } from "./adminFormat";

export type AdminSection = "audit" | "cards" | "dashboard" | "events" | "player" | "players" | "promos" | "settings" | "shop";
export type AdminTheme = "dark" | "light";

interface AdminLayoutProps {
  admin: AdminIdentity;
  children: ReactNode;
  currentSection: AdminSection;
  mobileMenuOpen: boolean;
  onLogout: () => void;
  onMenuToggle: () => void;
  onNavigate: (path: string) => void;
  onThemeToggle: () => void;
  theme: AdminTheme;
}

interface NavItem { icon: string; label: string; path: string; section: AdminSection; soon?: boolean }

const navigation: Array<{ group: string; items: NavItem[] }> = [
  {
    group: "Керування",
    items: [
      { icon: "▦", label: "Дашборд", path: "/admin", section: "dashboard" },
      { icon: "☺", label: "Гравці", path: "/admin/players", section: "players" },
      { icon: "▭", label: "Карти", path: "/admin/cards", section: "cards" },
      { icon: "◇", label: "Магазин", path: "/admin/shop", section: "shop", soon: true },
      { icon: "✦", label: "Промокоди", path: "/admin/promos", section: "promos", soon: true },
      { icon: "◷", label: "Події", path: "/admin/events", section: "events", soon: true },
    ],
  },
  {
    group: "Система",
    items: [
      { icon: "≡", label: "Журнал дій", path: "/admin/audit", section: "audit" },
      { icon: "⚙", label: "Налаштування", path: "/admin/settings", section: "settings", soon: true },
    ],
  },
];

const bottomNavigation: NavItem[] = [
  { icon: "▦", label: "Огляд", path: "/admin", section: "dashboard" },
  { icon: "☺", label: "Гравці", path: "/admin/players", section: "players" },
  { icon: "▭", label: "Карти", path: "/admin/cards", section: "cards" },
  { icon: "≡", label: "Журнал", path: "/admin/audit", section: "audit" },
];

const sectionTitles: Record<AdminSection, string> = {
  audit: "Журнал дій",
  cards: "Карти",
  dashboard: "Дашборд",
  events: "Події",
  player: "Гравець",
  players: "Гравці",
  promos: "Промокоди",
  settings: "Налаштування",
  shop: "Магазин",
};

function isActive(current: AdminSection, item: AdminSection) {
  return current === item || (current === "player" && item === "players");
}

export function AdminLayout({ admin, children, currentSection, mobileMenuOpen, onLogout, onMenuToggle, onNavigate, onThemeToggle, theme }: AdminLayoutProps) {
  const [query, setQuery] = useState("");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // "/" focuses the global player search, like most admin tools.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key !== "/" || event.metaKey || event.ctrlKey || target?.closest("input, textarea, select, [contenteditable]")) return;
      event.preventDefault();
      setMobileSearchOpen(true);
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (mobileSearchOpen) searchRef.current?.focus();
  }, [mobileSearchOpen]);

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const value = query.trim();
    setMobileSearchOpen(false);
    searchRef.current?.blur();
    onNavigate(value ? `/admin/players?search=${encodeURIComponent(value)}` : "/admin/players");
    setQuery("");
  };

  const link = (item: NavItem, className: string, content: ReactNode) => (
    <a
      aria-current={isActive(currentSection, item.section) ? "page" : undefined}
      className={className}
      href={item.path}
      key={item.path}
      onClick={(event) => { event.preventDefault(); onNavigate(item.path); }}
    >
      {content}
    </a>
  );

  return (
    <div className="admin-shell">
      {mobileMenuOpen ? <button aria-label="Закрити меню" className="admin-scrim" onClick={onMenuToggle} type="button" /> : null}
      <aside aria-label="Навігація" className={`admin-sidebar${mobileMenuOpen ? " admin-sidebar--open" : ""}`}>
        <div className="admin-brand">
          <span className="admin-brand__mark">C</span>
          <span><strong>Cardastika</strong><small>Адмін-панель</small></span>
        </div>
        <nav className="admin-nav">
          {navigation.map((group) => (
            <section className="admin-nav__group" key={group.group}>
              <p>{group.group}</p>
              {group.items.map((item) => link(
                item,
                `admin-nav__link${isActive(currentSection, item.section) ? " admin-nav__link--active" : ""}`,
                <><span aria-hidden="true" className="admin-nav__icon">{item.icon}</span>{item.label}{item.soon ? <span className="admin-nav__soon">скоро</span> : null}</>,
              ))}
            </section>
          ))}
        </nav>
        <div className="admin-account">
          <span className="admin-avatar">{initials(admin.displayName)}</span>
          <span className="admin-account__copy"><strong>{admin.displayName}</strong><small>Telegram · {admin.telegramUserId}</small></span>
          <button aria-label="Вийти" className="admin-button admin-button--ghost admin-button--icon admin-button--sm" onClick={onLogout} title="Вийти" type="button">⏻</button>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <span className="admin-topbar__title">{sectionTitles[currentSection]}</span>
          <form className={`admin-search${mobileSearchOpen ? " admin-search--open" : ""}`} onSubmit={submitSearch} role="search">
            <input
              aria-label="Пошук гравця"
              onBlur={() => { if (!query) setMobileSearchOpen(false); }}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Пошук гравця: ім’я, @username, Telegram ID"
              ref={searchRef}
              type="search"
              value={query}
            />
            <kbd className="admin-hide-mobile">/</kbd>
          </form>
          <div className="admin-topbar__actions">
            <button aria-label="Пошук гравця" className="admin-button admin-button--ghost admin-button--icon admin-show-mobile" onClick={() => setMobileSearchOpen(true)} type="button">⌕</button>
            <button aria-label={theme === "dark" ? "Світла тема" : "Темна тема"} className="admin-button admin-button--ghost admin-button--icon" onClick={onThemeToggle} title={theme === "dark" ? "Світла тема" : "Темна тема"} type="button">{theme === "dark" ? "☀" : "☾"}</button>
            <a className="admin-button admin-button--secondary admin-hide-mobile" href="/" rel="noreferrer" target="_blank">Відкрити гру ↗</a>
          </div>
        </header>
        <div className="admin-content">{children}</div>
      </div>

      <nav aria-label="Основні розділи" className="admin-bottom-nav">
        {bottomNavigation.map((item) => link(item, "", <><span aria-hidden="true">{item.icon}</span>{item.label}</>))}
        <button aria-expanded={mobileMenuOpen} onClick={onMenuToggle} type="button"><span aria-hidden="true">☰</span>Ще</button>
      </nav>
    </div>
  );
}
