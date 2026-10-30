import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { RussianLanguageProvider } from "./i18n";
import "./theme";
import "@fontsource/alegreya-sans/400.css";
import "@fontsource/alegreya-sans/500.css";
import "@fontsource/alegreya-sans/700.css";
import "./styles/global.css";
import "./styles/tokens.css";
import "./styles/theme-sprites.css";
import "./styles/controls.css";
import "./styles/surfaces.css";
import "./styles/typography.css";
import "./styles/menu.css";
import "./styles/shell.css";
import "./styles/rewards.css";
import "./styles/card-plates.css";
import "./styles/home-menu.css";
import "./styles/book-theme.css";
import "./styles/card-upgrade.css";
import "./styles/theme-surfaces.css";
import "./styles/screen-heading.css";
import "./styles/numbers.css";
import "./styles/auth-parchment.css";
import "./styles/element-fx.css";
import "./styles/daily-login.css";
import "./styles/sprite-proportions.css";
import "./styles/reward-fly.css";
import "./styles/treasure-map.css";
import "./styles/shop-stall.css";
import "./styles/equipment-book.css";
import "./styles/profile-book.css";

const rootElement = document.getElementById("root");
const isAdminPath = window.location.pathname === "/admin" || window.location.pathname.startsWith("/admin/");
const RootApplication = isAdminPath
  ? lazy(() => import("./admin/AdminApp"))
  : lazy(() => import("./App").then(({ App }) => ({ default: App })));

if (!rootElement) {
  throw new Error("Root element was not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <RussianLanguageProvider>
      <Suspense fallback={<div aria-busy="true" />}>
        <RootApplication />
      </Suspense>
    </RussianLanguageProvider>
  </StrictMode>,
);
