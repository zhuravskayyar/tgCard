import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
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

if (!rootElement) {
  throw new Error("Root element was not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <RussianLanguageProvider>
      <App />
    </RussianLanguageProvider>
  </StrictMode>,
);
