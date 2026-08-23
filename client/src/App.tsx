import { useEffect, useState } from "react";
import { AppShell } from "./components/AppShell";
import { usePlayerSummary } from "./hooks/usePlayerSummary";
import { HomeScreen } from "./screens/HomeScreen";
import { DeckScreen } from "./screens/DeckScreen";
import { ProfileScreen } from "./screens/ProfileScreen";
import { ShopScreen } from "./screens/ShopScreen";
import { CardDetailScreen } from "./screens/CardDetailScreen";
import { WeakCardsScreen } from "./screens/WeakCardsScreen";
import { CollectionCardScreen, CollectionDetailScreen, CollectionsScreen } from "./screens/CollectionsScreens";
import { DuelScreen } from "./screens/DuelScreen";
import { initializeTelegram } from "./telegram";
import type { BottomNavItem } from "./components/BottomNav";

export function App() {
  const { retry, state: playerSummaryState, updateBalance } = usePlayerSummary();
  type Screen = "home" | "profile" | "duel" | "deck" | "weak" | "card" | "shop" | "collections" | "collection" | "collection-card";
  const initialPath = typeof window === "undefined" ? "/" : window.location.pathname;
  const initialCollectionCard = initialPath.match(/^\/collections\/([^/]+)\/cards\/([^/]+)$/);
  const initialCollection = initialPath.match(/^\/collections\/([^/]+)$/);
  const [screen, setScreen] = useState<Screen>(initialCollectionCard ? "collection-card" : initialCollection ? "collection" : initialPath === "/collections" ? "collections" : initialPath === "/duel" ? "duel" : "home");
  const [deckReturnScreen, setDeckReturnScreen] = useState<"home" | "profile">("home");
  const [shopReturnScreen, setShopReturnScreen] = useState<"home" | "deck">("home");
  const [cardInstanceId, setCardInstanceId] = useState<string | null>(null);
  const [cardReturnScreen, setCardReturnScreen] = useState<"deck" | "weak" | "collection-card">("deck");
  const [collectionId, setCollectionId] = useState<string | null>(() => decodeURIComponent(initialCollectionCard?.[1] ?? initialCollection?.[1] ?? "") || null);
  const [collectionCardId, setCollectionCardId] = useState<string | null>(() => decodeURIComponent(initialCollectionCard?.[2] ?? "") || null);

  useEffect(() => {
    initializeTelegram();
  }, []);

  function updatePath(path: string) {
    if (typeof window !== "undefined" && window.location.pathname !== path) window.history.pushState(null, "", path);
  }

  function openCollections() {
    setScreen("collections");
    updatePath("/collections");
  }

  function openCollection(id: string) {
    setCollectionId(id);
    setScreen("collection");
    updatePath(`/collections/${encodeURIComponent(id)}`);
  }

  function openCollectionCard(id: string) {
    if (!collectionId) return;
    setCollectionCardId(id);
    setScreen("collection-card");
    updatePath(`/collections/${encodeURIComponent(collectionId)}/cards/${encodeURIComponent(id)}`);
  }

  function goHome() {
    setScreen("home");
    updatePath("/");
  }

  function openDuel() {
    setScreen("duel");
    updatePath("/duel");
  }

  function openShop(returnScreen: "home" | "deck") {
    setShopReturnScreen(returnScreen);
    setScreen("shop");
  }

  function openDeck(returnScreen: "home" | "profile") {
    setDeckReturnScreen(returnScreen);
    setScreen("deck");
  }

  function openCard(instanceId: string, returnScreen: "deck" | "weak" | "collection-card") {
    setCardInstanceId(instanceId);
    setCardReturnScreen(returnScreen);
    setScreen("card");
  }

  function navigateFromBottom(item: BottomNavItem) {
    if (item === "home") goHome();
    if (item === "profile") { setScreen("profile"); updatePath("/"); }
  }

  return (
    <AppShell
      activeNavigationItem={screen === "profile" ? "profile" : "home"}
      onNavigate={navigateFromBottom}
      onRetryPlayerSummary={retry}
      playerSummaryState={playerSummaryState}
    >
      {screen === "home" ? (
        <HomeScreen onOpenCollections={openCollections} onOpenDeck={() => openDeck("home")} onOpenDuel={openDuel} onOpenShop={() => openShop("home")} />
      ) : null}
      {screen === "duel" ? (
        <DuelScreen onBack={goHome} onPlayerSummaryChange={updateBalance} />
      ) : null}
      {screen === "profile" ? (
        <ProfileScreen
          onOpenDeck={() => openDeck("profile")}
          onRetryPlayerSummary={retry}
          playerSummaryState={playerSummaryState}
        />
      ) : null}
      {screen === "deck" ? (
        <DeckScreen onBack={() => setScreen(deckReturnScreen)} onOpenCard={(id) => openCard(id, "deck")} onOpenShop={() => openShop("deck")} />
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
      {screen === "collections" ? <CollectionsScreen onBack={goHome} onOpenCollection={openCollection} /> : null}
      {screen === "collection" && collectionId ? <CollectionDetailScreen collectionId={collectionId} onBack={openCollections} onOpenCard={openCollectionCard} /> : null}
      {screen === "collection-card" && collectionId && collectionCardId ? <CollectionCardScreen cardId={collectionCardId} collectionId={collectionId} onBack={() => openCollection(collectionId)} onOpenInstance={(id) => openCard(id, "collection-card")} /> : null}
    </AppShell>
  );
}
