import { useEffect, useState } from "react";
import { AppShell } from "./components/AppShell";
import { usePlayerSummary } from "./hooks/usePlayerSummary";
import { HomeScreen } from "./screens/HomeScreen";
import { DeckScreen } from "./screens/DeckScreen";
import { initializeTelegram } from "./telegram";

export function App() {
  const { retry, state: playerSummaryState } = usePlayerSummary();
  const [screen, setScreen] = useState<"home" | "deck">("home");

  useEffect(() => {
    initializeTelegram();
  }, []);

  return (
    <AppShell
      onNavigateHome={() => setScreen("home")}
      onRetryPlayerSummary={retry}
      playerSummaryState={playerSummaryState}
    >
      {screen === "home" ? (
        <HomeScreen onOpenDeck={() => setScreen("deck")} />
      ) : (
        <DeckScreen onBack={() => setScreen("home")} />
      )}
    </AppShell>
  );
}
