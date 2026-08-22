import { useEffect, useState } from "react";
import { AppShell } from "./components/AppShell";
import { usePlayerSummary } from "./hooks/usePlayerSummary";
import { HomeScreen } from "./screens/HomeScreen";
import { DeckScreen } from "./screens/DeckScreen";
import { ShopScreen } from "./screens/ShopScreen";
import { initializeTelegram } from "./telegram";

export function App() {
  const { retry, state: playerSummaryState, updateBalance } = usePlayerSummary();
  const [screen, setScreen] = useState<"home" | "deck" | "shop">("home");
  const [shopReturnScreen, setShopReturnScreen] = useState<"home" | "deck">("home");

  useEffect(() => {
    initializeTelegram();
  }, []);

  function openShop(returnScreen: "home" | "deck") {
    setShopReturnScreen(returnScreen);
    setScreen("shop");
  }

  return (
    <AppShell
      onNavigateHome={() => setScreen("home")}
      onRetryPlayerSummary={retry}
      playerSummaryState={playerSummaryState}
    >
      {screen === "home" ? (
        <HomeScreen onOpenDeck={() => setScreen("deck")} onOpenShop={() => openShop("home")} />
      ) : null}
      {screen === "deck" ? (
        <DeckScreen onBack={() => setScreen("home")} onOpenShop={() => openShop("deck")} />
      ) : null}
      {screen === "shop" ? (
        <ShopScreen
          onBack={() => setScreen(shopReturnScreen)}
          onBalanceChange={updateBalance}
        />
      ) : null}
    </AppShell>
  );
}
