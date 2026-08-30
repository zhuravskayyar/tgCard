import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { RussianLanguageProvider } from "./i18n";
import "./styles/global.css";

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
