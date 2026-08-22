import { useEffect } from "react";
import { AppShell } from "./components/AppShell";
import { usePlayerSummary } from "./hooks/usePlayerSummary";
import { HomeScreen } from "./screens/HomeScreen";
import { initializeTelegram } from "./telegram";

export function App() {
  const { retry, state: playerSummaryState } = usePlayerSummary();

  useEffect(() => {
    initializeTelegram();
  }, []);

  return (
    <AppShell onRetryPlayerSummary={retry} playerSummaryState={playerSummaryState}>
      <HomeScreen />
    </AppShell>
  );
}
