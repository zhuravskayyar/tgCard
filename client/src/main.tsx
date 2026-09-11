import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { RussianLanguageProvider } from "./i18n";
import "./styles/global.css";
import "./styles/tokens.css";
import "./styles/controls.css";
import "./styles/surfaces.css";
import "./styles/typography.css";
import "./styles/menu.css";
import "./styles/shell.css";
import "./styles/rewards.css";

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
