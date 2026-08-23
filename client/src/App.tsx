import { useEffect, useState } from "react";
import { AppShell } from "./components/AppShell";
import { usePlayerSummary } from "./hooks/usePlayerSummary";
import { HomeScreen } from "./screens/HomeScreen";
import { DeckScreen } from "./screens/DeckScreen";
import { ShopScreen } from "./screens/ShopScreen";
import { CardDetailScreen } from "./screens/CardDetailScreen";
import { WeakCardsScreen } from "./screens/WeakCardsScreen";
import { initializeTelegram } from "./telegram";

export function App() {
  const { retry, state: playerSummaryState, updateBalance } = usePlayerSummary();
  const [screen, setScreen] = useState<"home" | "deck" | "weak" | "card" | "shop">("home");
  const [shopReturnScreen, setShopReturnScreen] = useState<"home" | "deck">("home");
  const [cardInstanceId, setCardInstanceId] = useState<string | null>(null);
  const [cardReturnScreen, setCardReturnScreen] = useState<"deck" | "weak">("deck");

  useEffect(() => {
    initializeTelegram();
  }, []);

  function openShop(returnScreen: "home" | "deck") {
    setShopReturnScreen(returnScreen);
    setScreen("shop");
  }

  function openCard(instanceId: string, returnScreen: "deck" | "weak") {
    setCardInstanceId(instanceId);
    setCardReturnScreen(returnScreen);
    setScreen("card");
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
        <DeckScreen onBack={() => setScreen("home")} onOpenCard={(id) => openCard(id, "deck")} />
      ) : null}
      {screen === "weak" ? (
        <WeakCardsScreen onBack={() => setScreen("card")} onOpenCard={(id) => openCard(id, "weak")} />
      ) : null}
      {screen === "card" && cardInstanceId ? (
        <CardDetailScreen
          cardInstanceId={cardInstanceId}
          onBack={() => setScreen(cardReturnScreen)}
          onGoldChange={(gold) => updateBalance({ gold })}
          onOpenDeck={() => setScreen("deck")}
          onOpenShop={() => openShop("deck")}
          onOpenWeakCards={() => setScreen("weak")}
        />
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
