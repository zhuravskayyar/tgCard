import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { installSoundEffects } from "./audio";
import { LanguageProvider } from "./i18n";
import "./theme";
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
import "./styles/bestiary.css";

const rootElement = document.getElementById("root");
const isAdminPath = window.location.pathname === "/admin" || window.location.pathname.startsWith("/admin/");
const RootApplication = isAdminPath
  ? lazy(() => import("./admin/AdminApp"))
  : lazy(() => import("./App").then(({ App }) => ({ default: App })));

if (!rootElement) {
  throw new Error("Root element was not found");
}

if (!isAdminPath) installSoundEffects();

createRoot(rootElement).render(
  <StrictMode>
    <LanguageProvider>
      <Suspense fallback={<div aria-busy="true" />}>
        <RootApplication />
      </Suspense>
    </LanguageProvider>
  </StrictMode>,
);

// Dev-only phone diagnostics (`?fps=1`); production builds drop this branch.
if (import.meta.env.DEV) {
  void import("./dev/devFlags").then(({ DEV_FPS }) => {
    if (DEV_FPS) void import("./dev/perfOverlay").then(({ startPerfOverlay }) => startPerfOverlay());
  });
}
