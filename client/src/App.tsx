import { useCallback, useEffect, useMemo, useState } from "react";
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
import { CampaignBossScreen, CampaignScreen, CampaignStageScreen } from "./screens/CampaignScreens";
import { LeaderboardScreen } from "./screens/LeaderboardScreen";
import { PlayerProfileScreen } from "./screens/PlayerProfileScreen";
import { MailScreen } from "./screens/MailScreen";
import { DungeonScreen } from "./screens/DungeonScreen";
import { ArenaScreen } from "./screens/ArenaScreen";
import { AuthScreen } from "./screens/AuthScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { InventoryScreen } from "./screens/InventoryScreen";
import { EquipmentScreen } from "./screens/EquipmentScreen";
import { ForgeScreen } from "./screens/ForgeScreen";
import { BattlePassScreen } from "./screens/BattlePassScreen";
import { TasksScreen } from "./screens/TasksScreen";
import { GuildScreen } from "./screens/GuildScreen";
import { getTelegramInitData, initializeTelegram } from "./telegram";
import { authenticateGooglePlayer, authenticateTelegramWebPlayer } from "./telegram/authenticatePlayer";
import { completeTutorial } from "./telegram/tutorial";
import { savePlayerEquipment } from "./telegram/equipment";
import type { BottomNavItem } from "./components/BottomNav";
import { TutorialOverlay } from "./components/TutorialOverlay";
import { DailyLoginModal } from "./components/DailyLoginModal";
import { useMail } from "./hooks/useMail";
import { useDailyLoginReward } from "./hooks/useDailyLoginReward";
import { usePlayerEquipment } from "./hooks/usePlayerEquipment";
import { useTutorial } from "./hooks/useTutorial";
import { getPlayerDisplayName, type DuelView, type EquippedEquipment } from "@cardastika/shared";
import { EMPTY_EQUIPMENT, reconcileEquipment } from "./equipment/equipmentState";

type Screen = "home" | "profile" | "guild" | "inventory" | "equipment" | "forge" | "settings" | "player-profile" | "mail" | "duel" | "arena" | "dungeon" | "leagues" | "deck" | "weak" | "card" | "shop" | "collections" | "collection" | "collection-card" | "campaign" | "campaign-stage" | "campaign-boss" | "battle-pass" | "tasks";

function isOneOf<T extends string>(value: string | null, values: readonly T[]): value is T {
  return value !== null && values.includes(value as T);
}

function withReturnPath(path: string, returnScreen: string) {
  return returnScreen === "home" ? path : `${path}?from=${encodeURIComponent(returnScreen)}`;
}

const TUTORIAL_DUEL_STEPS = ["duel-first-card", "duel-advantage", "duel-free-play", "duel-result"] as const;

function isTutorialDuelStep(step: string | null): step is (typeof TUTORIAL_DUEL_STEPS)[number] {
  return step !== null && TUTORIAL_DUEL_STEPS.includes(step as (typeof TUTORIAL_DUEL_STEPS)[number]);
}

export function App() {
  const { addCollectionBonus, retry, state: playerSummaryState, updateBalance, updateNickname } = usePlayerSummary();
  const { claim: claimMail, resolveAction: resolveMailAction, retry: retryMail, state: mailState } = useMail();
  const tutorialPlayerId = playerSummaryState.status === "ready" ? playerSummaryState.data.id : null;
  const tutorialEligible = playerSummaryState.status === "ready" && playerSummaryState.data.tutorialEligible === true;
  const tutorial = useTutorial(tutorialPlayerId, tutorialEligible);
  const campaignTraining = tutorial.step === "campaign";
  const tutorialDuelTraining = tutorial.isActive && isTutorialDuelStep(tutorial.step);
  const dailyLogin = useDailyLoginReward(playerSummaryState.status === "ready");
  const playerEquipmentState = usePlayerEquipment(true);
  const [tutorialDuel, setTutorialDuel] = useState<DuelView | null>(null);
  const [webAuthError, setWebAuthError] = useState<string | null>(null);
  const initialPath = typeof window === "undefined" ? "/" : window.location.pathname;
  const initialFrom = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("from");
  const initialEquipmentItemId = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("item");
  const initialPlayerProfile = initialPath.match(/^\/players\/([^/]+)$/);
  const initialCollectionCard = initialPath.match(/^\/collections\/([^/]+)\/cards\/([^/]+)$/);
  const initialCollection = initialPath.match(/^\/collections\/([^/]+)$/);
  const initialCampaignStage = initialPath.match(/^\/campaign\/stages\/([^/]+)$/);
  const initialWeak = initialPath === "/cards/weak";
  const initialCard = initialWeak ? null : initialPath.match(/^\/cards\/([^/]+)$/);
  const initialDeckReturnScreen = isOneOf(initialFrom, ["home", "profile", "campaign-stage", "tasks"] as const) ? initialFrom : "home";
  const initialShopReturnScreen = isOneOf(initialFrom, ["home", "deck", "collection", "campaign-stage", "tasks"] as const) ? initialFrom : "home";
  const initialMailReturnScreen = isOneOf(initialFrom, ["home", "profile"] as const) ? initialFrom : "home";
  const initialDuelReturnScreen = isOneOf(initialFrom, ["home", "campaign-stage", "tasks"] as const) ? initialFrom : "home";
  const initialWeakReturnScreen = isOneOf(initialFrom, ["card", "campaign-stage", "home"] as const) ? initialFrom : "home";
  const initialCollectionsReturnScreen = isOneOf(initialFrom, ["home", "campaign-stage"] as const) ? initialFrom : "home";
  const initialCardReturnScreen = isOneOf(initialFrom, ["deck", "weak", "collection-card"] as const) ? initialFrom : "deck";
  const [screen, setScreen] = useState<Screen>(initialPlayerProfile ? "player-profile" : initialCollectionCard ? "collection-card" : initialCollection ? "collection" : initialPath === "/collections" ? "collections" : initialCampaignStage ? "campaign-stage" : initialPath === "/campaign/boss" ? "campaign-boss" : initialPath === "/campaign" ? "campaign" : initialPath === "/duel" ? "duel" : initialPath === "/arena" ? "arena" : initialPath === "/dungeon" ? "dungeon" : initialPath === "/leagues" ? "leagues" : initialPath === "/mail" ? "mail" : initialPath === "/settings" ? "settings" : initialPath === "/inventory" ? "inventory" : initialPath === "/equipment" ? "equipment" : initialPath === "/forge" ? "forge" : initialPath === "/profile" ? "profile" : initialPath === "/guild" ? "guild" : initialPath === "/deck" ? "deck" : initialWeak ? "weak" : initialCard ? "card" : initialPath === "/shop" ? "shop" : initialPath === "/battle-pass" ? "battle-pass" : initialPath === "/tasks" ? "tasks" : "home");
  const [deckReturnScreen, setDeckReturnScreen] = useState<"home" | "profile" | "campaign-stage" | "tasks">(initialDeckReturnScreen);
  const [shopReturnScreen, setShopReturnScreen] = useState<"home" | "deck" | "collection" | "campaign-stage" | "tasks">(initialShopReturnScreen);
  const [mailReturnScreen, setMailReturnScreen] = useState<"home" | "profile">(initialMailReturnScreen);
  const [duelReturnScreen, setDuelReturnScreen] = useState<"home" | "campaign-stage" | "tasks">(initialDuelReturnScreen);
  const [weakReturnScreen, setWeakReturnScreen] = useState<"card" | "campaign-stage" | "home">(initialWeakReturnScreen);
  const [collectionsReturnScreen, setCollectionsReturnScreen] = useState<"home" | "campaign-stage">(initialCollectionsReturnScreen);
  const [campaignStageId, setCampaignStageId] = useState(() => decodeURIComponent(initialCampaignStage?.[1] ?? "") || "stage_1");
  const [cardInstanceId, setCardInstanceId] = useState<string | null>(() => decodeURIComponent(initialCard?.[1] ?? "") || null);
  const [cardReturnScreen, setCardReturnScreen] = useState<"deck" | "weak" | "collection-card">(initialCardReturnScreen);
  const [collectionId, setCollectionId] = useState<string | null>(() => decodeURIComponent(initialCollectionCard?.[1] ?? initialCollection?.[1] ?? "") || null);
  const [collectionCardId, setCollectionCardId] = useState<string | null>(() => decodeURIComponent(initialCollectionCard?.[2] ?? "") || null);
  const [tutorialCollectionId, setTutorialCollectionId] = useState<string | null>(null);
  const [tutorialCardId, setTutorialCardId] = useState<string | null>(null);
  const [playerProfileId, setPlayerProfileId] = useState<string | null>(() => decodeURIComponent(initialPlayerProfile?.[1] ?? "") || null);
  const [equipment, setEquipment] = useState<EquippedEquipment>(EMPTY_EQUIPMENT);
  const [equipmentItemId, setEquipmentItemId] = useState<string | null>(initialEquipmentItemId);
  const [deckPowerOverride, setDeckPowerOverride] = useState<number | undefined>(undefined);
  const [dailyLoginDismissedDate, setDailyLoginDismissedDate] = useState<string | null>(null);
  const [dailyLoginClaimedDate, setDailyLoginClaimedDate] = useState<string | null>(null);

  const dailyLoginData = dailyLogin.state.status === "ready" ? dailyLogin.state.data : null;
  const dailyLoginClaimed = dailyLoginData !== null && dailyLoginClaimedDate === dailyLoginData.claimDate;
  const showDailyLogin = dailyLoginData !== null
    && !tutorial.isActive
    && dailyLoginDismissedDate !== dailyLoginData.claimDate
    && (dailyLoginData.claimable || dailyLoginClaimed);

  const handleDailyLoginClaim = useCallback(async (choiceIndex?: number) => {
    const response = await dailyLogin.claim(choiceIndex);
    updateBalance(response.rewardPlayer);
    setDailyLoginClaimedDate(response.dailyLogin.claimDate);
    return response;
  }, [dailyLogin.claim, updateBalance]);

  const closeDailyLogin = useCallback(() => {
    if (dailyLoginData) setDailyLoginDismissedDate(dailyLoginData.claimDate);
  }, [dailyLoginData]);

  const loadedEquipment = useMemo(() => (
    playerEquipmentState.state.status === "ready"
      ? reconcileEquipment(playerEquipmentState.state.data.equipment.equipped, playerEquipmentState.state.data.inventory)
      : undefined
  ), [playerEquipmentState.state]);

  useEffect(() => {
    initializeTelegram();
  }, []);

  useEffect(() => {
    if (loadedEquipment) setEquipment(loadedEquipment);
  }, [loadedEquipment]);

  function updatePath(path: string) {
    if (typeof window !== "undefined" && `${window.location.pathname}${window.location.search}` !== path) {
      window.history.pushState(null, "", `${path}${window.location.hash}`);
    }
  }

  function openCollections(returnScreen: "home" | "campaign-stage" = "home") {
    if (campaignTraining && returnScreen !== "campaign-stage") { openCampaign(); return; }
    setCollectionsReturnScreen(returnScreen);
    setScreen("collections");
    updatePath(withReturnPath("/collections", returnScreen));
  }

  function openCollection(id: string) {
    if (campaignTraining && collectionsReturnScreen !== "campaign-stage") { openCampaign(); return; }
    setCollectionId(id);
    setScreen("collection");
    updatePath(withReturnPath(`/collections/${encodeURIComponent(id)}`, collectionsReturnScreen));
  }

  function openCollectionCard(id: string) {
    if (campaignTraining && collectionsReturnScreen !== "campaign-stage") { openCampaign(); return; }
    if (!collectionId) return;
    setCollectionCardId(id);
    setScreen("collection-card");
    updatePath(withReturnPath(`/collections/${encodeURIComponent(collectionId)}/cards/${encodeURIComponent(id)}`, collectionsReturnScreen));
  }

  function goHome() {
    if (campaignTraining) { openCampaign(); return; }
    setScreen("home");
    updatePath("/");
  }

  function openDuel(returnScreen: "home" | "campaign-stage" | "tasks" = "home") {
    if (campaignTraining && returnScreen !== "campaign-stage") { openCampaign(); return; }
    setDuelReturnScreen(returnScreen);
    setScreen("duel");
    updatePath(withReturnPath("/duel", returnScreen));
  }

  function openDungeon() {
    if (campaignTraining) { openCampaign(); return; }
    setScreen("dungeon");
    updatePath("/dungeon");
  }

  function openArena() {
    if (campaignTraining) { openCampaign(); return; }
    setScreen("arena");
    updatePath("/arena");
  }

  function openLeagues() {
    if (campaignTraining) { openCampaign(); return; }
    setScreen("leagues");
    updatePath("/leagues");
  }

  function openPlayerProfile(playerId: string) {
    if (campaignTraining) { openCampaign(); return; }
    setPlayerProfileId(playerId);
    setScreen("player-profile");
    updatePath(`/players/${encodeURIComponent(playerId)}`);
  }

  function openShop(returnScreen: "home" | "deck" | "collection" | "campaign-stage" | "tasks") {
    if (campaignTraining && returnScreen !== "campaign-stage") { openCampaign(); return; }
    setShopReturnScreen(returnScreen);
    setScreen("shop");
    updatePath(withReturnPath("/shop", returnScreen));
  }

  function openMail(returnScreen: "home" | "profile" = "home") {
    if (campaignTraining) { openCampaign(); return; }
    retryMail();
    setMailReturnScreen(returnScreen);
    setScreen("mail");
    updatePath(withReturnPath("/mail", returnScreen));
  }

  function openSettings() {
    if (campaignTraining) { openCampaign(); return; }
    setScreen("settings");
    updatePath("/settings");
  }

  function openInventory() {
    if (campaignTraining) { openCampaign(); return; }
    setScreen("inventory");
    updatePath("/inventory");
  }

  function openEquipment(itemId: string | null = null) {
    if (campaignTraining) { openCampaign(); return; }
    setEquipmentItemId(itemId);
    setScreen("equipment");
    updatePath(itemId ? `/equipment?item=${encodeURIComponent(itemId)}` : "/equipment");
  }

  function openForge() {
    if (campaignTraining) { openCampaign(); return; }
    setEquipmentItemId(null);
    setScreen("forge");
    updatePath("/forge");
  }

  function handleEquipmentChange(nextEquipment: EquippedEquipment) {
    setEquipment(nextEquipment);
    updateBalance({ equipment: { equipped: nextEquipment } });
    const credential = getTelegramInitData();
    if (credential) void savePlayerEquipment(credential, nextEquipment).catch(() => undefined);
  }

  async function handleWebLogin(login: () => Promise<unknown>) {
    setWebAuthError(null);
    try {
      await login();
      retry();
    } catch {
      setWebAuthError("Не вдалося виконати вхід. Спробуйте ще раз.");
    }
  }

  function openDeck(returnScreen: "home" | "profile" | "campaign-stage" | "tasks") {
    if (campaignTraining && returnScreen !== "campaign-stage") { openCampaign(); return; }
    setDeckReturnScreen(returnScreen);
    setScreen("deck");
    updatePath(withReturnPath("/deck", returnScreen));
  }

  function openCard(instanceId: string, returnScreen: "deck" | "weak" | "collection-card") {
    const fromCampaign = (returnScreen === "deck" && deckReturnScreen === "campaign-stage")
      || (returnScreen === "weak" && weakReturnScreen === "campaign-stage")
      || (returnScreen === "collection-card" && collectionsReturnScreen === "campaign-stage");
    if (campaignTraining && !fromCampaign) { openCampaign(); return; }
    setCardInstanceId(instanceId);
    setCardReturnScreen(returnScreen);
    setScreen("card");
    updatePath(withReturnPath(`/cards/${encodeURIComponent(instanceId)}`, returnScreen));
  }

  function openCampaign() {
    setScreen("campaign");
    updatePath("/campaign");
  }

  async function finishTutorial() {
    const initData = getTelegramInitData();
    if (initData) {
      try {
        const player = await completeTutorial(initData);
        updateBalance({ tutorialEligible: player.tutorialEligible });
      } catch {
        // Keep the local route unblocked if the server is temporarily unavailable.
      }
    }
    tutorial.complete();
    openCampaign();
  }

  function openBattlePass() {
    if (campaignTraining) { openCampaign(); return; }
    setScreen("battle-pass");
    updatePath("/battle-pass");
  }

  function openTasks() {
    if (campaignTraining) { openCampaign(); return; }
    setScreen("tasks");
    updatePath("/tasks");
  }

  function openGuild() {
    if (campaignTraining) { openCampaign(); return; }
    setScreen("guild");
    updatePath("/guild");
  }

  function openTaskTarget(taskId: string) {
    if (taskId === "win-duels" || taskId === "play-duels") {
      openDuel("tasks");
      return;
    }
    if (taskId === "acquire-cards" || taskId === "buy-cards") {
      openShop("tasks");
      return;
    }
    if (taskId === "upgrade-card" || taskId === "absorb-cards") {
      openDeck("tasks");
    }
  }

  function openCampaignStage(stageId: string) {
    setCampaignStageId(stageId);
    setScreen("campaign-stage");
    updatePath(`/campaign/stages/${encodeURIComponent(stageId)}`);
  }

  function navigateFromCampaign(target: "deck" | "duel" | "shop" | "collections" | "weak") {
    if (target === "deck") openDeck("campaign-stage");
    if (target === "duel") openDuel("campaign-stage");
    if (target === "shop") openShop("campaign-stage");
    if (target === "collections") openCollections("campaign-stage");
    if (target === "weak") {
      setWeakReturnScreen("campaign-stage");
      setScreen("weak");
      updatePath(withReturnPath("/cards/weak", "campaign-stage"));
    }
  }

  function clickTutorialTarget(target: string) {
    if (typeof document === "undefined") return;
    document.querySelector<HTMLElement>(`[data-tutorial-target~="${target}"]`)?.click();
  }

  const handleTutorialDuelState = useCallback((duel: DuelView) => {
    setTutorialDuel(duel);
    if (!tutorial.isActive || !isTutorialDuelStep(tutorial.step)) return;
    if (duel.result) {
      tutorial.goTo("duel-result");
      return;
    }
    if (duel.battleLog.length === 0) {
      tutorial.goTo("duel-first-card");
      return;
    }
    if (duel.battleLog.length === 1 && tutorial.step === "duel-first-card") {
      tutorial.goTo("duel-advantage");
      return;
    }
    if (duel.battleLog.length === 2 && tutorial.step === "duel-advantage") {
      tutorial.goTo("duel-free-play");
    }
  }, [tutorial.goTo, tutorial.isActive, tutorial.step]);

  function handleTutorialAction() {
    switch (tutorial.step) {
      case "intro":
        tutorial.goTo("duel-first-card");
        openDuel("home");
        return;
      case "duel-result":
        void finishTutorial();
        return;
      case "campaign":
        void finishTutorial();
        return;
      default:
        return;
    }
  }

  function resumeTutorial() {
    const step = tutorial.resumeStep;
    if (step === "campaign") { tutorial.resume(); openCampaign(); return; }
    if (step === "intro") { tutorial.goTo("duel-first-card"); openDuel("home"); return; }
    if (isTutorialDuelStep(step)) { tutorial.resume(); openDuel("home"); }
  }

  useEffect(() => {
    if (!campaignTraining) return;
    const allowed = screen === "campaign" || screen === "campaign-stage" || screen === "campaign-boss"
      || (screen === "deck" && deckReturnScreen === "campaign-stage")
      || (screen === "card" && cardReturnScreen === "deck" && deckReturnScreen === "campaign-stage")
      || (screen === "weak" && weakReturnScreen === "campaign-stage")
      || (screen === "duel" && duelReturnScreen === "campaign-stage")
      || (screen === "shop" && shopReturnScreen === "campaign-stage")
      || (screen === "collections" && collectionsReturnScreen === "campaign-stage")
      || (screen === "collection" && collectionsReturnScreen === "campaign-stage")
      || (screen === "collection-card" && collectionsReturnScreen === "campaign-stage");
    if (!allowed) openCampaign();
  }, [campaignTraining, cardReturnScreen, collectionsReturnScreen, deckReturnScreen, duelReturnScreen, screen, shopReturnScreen, weakReturnScreen]);

  useEffect(() => {
    if (!tutorial.isActive || screen !== "home" || tutorial.step === "campaign") return;
    resumeTutorial();
  }, [screen, tutorial.isActive, tutorial.step]);

  useEffect(() => {
    if (!tutorial.isActive || campaignTraining) return;
    const allowed = screen === "duel" && tutorialDuelTraining;
    if (!allowed) resumeTutorial();
  }, [campaignTraining, screen, tutorial.isActive, tutorial.step, tutorialDuelTraining]);

  function navigateFromBottom(item: BottomNavItem) {
    if (campaignTraining) { openCampaign(); return; }
    if (tutorial.isActive) { resumeTutorial(); return; }
    if (item === "home") goHome();
    if (item === "profile") { setScreen("profile"); updatePath("/profile"); }
    if (item === "guild") openGuild();
  }

  if (playerSummaryState.status === "unauthenticated") {
    return (
      <AuthScreen
        error={webAuthError}
        loading={false}
        onGoogle={(credential) => handleWebLogin(() => authenticateGooglePlayer(credential, new AbortController().signal))}
        onTelegram={(authData) => handleWebLogin(() => authenticateTelegramWebPlayer(authData, new AbortController().signal))}
      />
    );
  }

  return (
    <AppShell
      activeNavigationItem={screen === "guild" ? "guild" : screen === "profile" || screen === "inventory" || screen === "equipment" || screen === "forge" || screen === "player-profile" || (screen === "mail" && mailReturnScreen === "profile") ? "profile" : "home"}
      onNavigate={navigateFromBottom}
      onRetryPlayerSummary={retry}
      playerSummaryState={playerSummaryState}
      screenKey={screen}
      deckPowerOverride={deckPowerOverride}
      overlay={tutorial.isActive && !campaignTraining && tutorial.step !== "duel-result" ? <TutorialOverlay duel={tutorialDuel} onAction={handleTutorialAction} onPause={tutorial.pause} screenKey={screen} step={tutorial.step} /> : null}
      modal={showDailyLogin && dailyLoginData ? <DailyLoginModal data={dailyLoginData} onClaim={handleDailyLoginClaim} onClose={closeDailyLogin} onPlayerSummaryChange={updateBalance} /> : null}
    >
      {screen === "home" ? (
        <HomeScreen
          onOpenCampaign={openCampaign}
          onOpenCollections={() => openCollections("home")}
          onOpenDeck={() => openDeck("home")}
          onOpenDuel={() => openDuel("home")}
          onOpenArena={openArena}
          onOpenDungeon={openDungeon}
          onOpenTasks={openTasks}
          onOpenEquipment={openEquipment}
          onOpenLeaderboard={openLeagues}
          onOpenBattlePass={openBattlePass}
          onOpenShop={() => openShop("home")}
          onOpenSettings={openSettings}
           onResumeTutorial={resumeTutorial}
          tutorialStatus={tutorial.status}
        />
      ) : null}
      {screen === "guild" ? <GuildScreen playerSummaryState={playerSummaryState} onRetryPlayerSummary={retry} /> : null}
      {screen === "duel" ? (
        <DuelScreen
          key={tutorialDuelTraining ? "tutorial-duel" : "normal-duel"}
          onBack={() => duelReturnScreen === "tasks" ? openTasks() : duelReturnScreen === "campaign-stage" ? openCampaignStage(campaignStageId) : goHome()}
          onPlayerSummaryChange={updateBalance}
          onTutorialResult={finishTutorial}
          onTutorialDuelState={handleTutorialDuelState}
          tutorialAllowedSlot={tutorial.step === "duel-first-card" ? 0 : tutorial.step === "duel-advantage" ? 1 : null}
          tutorialMode={tutorialDuelTraining}
        />
      ) : null}
      {screen === "arena" ? <ArenaScreen onBack={goHome} onCollectionCompleted={addCollectionBonus} onPlayerSummaryChange={updateBalance} /> : null}
      {screen === "dungeon" ? <DungeonScreen onBack={goHome} /> : null}
      {screen === "profile" ? (
        <ProfileScreen
          equipment={equipment}
          onOpenDeck={() => openDeck("profile")}
          onOpenGuild={openGuild}
          onOpenInventory={openInventory}
          onOpenMail={() => openMail("profile")}
          onOpenLeagues={openLeagues}
          onRetryPlayerSummary={retry}
          playerSummaryState={playerSummaryState}
          hasUnreadMail={mailState.status === "ready" && mailState.data.unreadCount > 0}
        />
      ) : null}
      {screen === "settings" ? <SettingsScreen onBack={goHome} onLogout={retry} onReplayTutorial={() => { tutorial.replay(); goHome(); }} playerSummaryState={playerSummaryState} showTutorialReplay={tutorial.eligible} /> : null}
      {screen === "inventory" ? <InventoryScreen nickname={playerSummaryState.status === "ready" ? getPlayerDisplayName(playerSummaryState.data) : "Гравець"} onBack={() => navigateFromBottom("profile")} onEquippedSkinChange={(equippedNicknameSkin) => updateBalance({ equippedNicknameSkin })} /> : null}
      {screen === "equipment" ? <EquipmentScreen equipped={equipment} initialItemId={equipmentItemId} inventory={playerEquipmentState.state.status === "ready" ? playerEquipmentState.state.data.inventory : []} inventoryStatus={playerEquipmentState.status} onBack={() => navigateFromBottom("profile")} onEquippedChange={handleEquipmentChange} onOpenForge={openForge} /> : null}
      {screen === "forge" ? <ForgeScreen equipped={equipment} inventory={playerEquipmentState.state.status === "ready" ? playerEquipmentState.state.data.inventory : []} inventoryStatus={playerEquipmentState.status} onBack={openEquipment} /> : null}
      {screen === "mail" ? <MailScreen changeNickname={updateNickname} claim={claimMail} currentNickname={playerSummaryState.status === "ready" ? getPlayerDisplayName(playerSummaryState.data) : ""} onBack={() => mailReturnScreen === "profile" ? navigateFromBottom("profile") : goHome()} onBalanceChange={updateBalance} onRetry={retryMail} resolveAction={resolveMailAction} state={mailState} /> : null}
      {screen === "leagues" ? <LeaderboardScreen onBack={() => navigateFromBottom("profile")} onOpenPlayerProfile={openPlayerProfile} playerSummaryState={playerSummaryState} /> : null}
      {screen === "player-profile" && playerProfileId ? <PlayerProfileScreen onBack={() => { setScreen("leagues"); updatePath("/leagues"); }} playerId={playerProfileId} /> : null}
      {screen === "deck" ? (
        <DeckScreen
          onBack={() => deckReturnScreen === "tasks" ? openTasks() : deckReturnScreen === "profile" ? navigateFromBottom("profile") : deckReturnScreen === "campaign-stage" ? openCampaignStage(campaignStageId) : goHome()}
          onOpenCard={(id) => openCard(id, "deck")}
          onOpenShop={() => openShop("deck")}
        />
      ) : null}
      {screen === "weak" ? (
        <WeakCardsScreen
          onBack={() => weakReturnScreen === "card" && cardInstanceId ? openCard(cardInstanceId, "weak") : weakReturnScreen === "campaign-stage" ? openCampaignStage(campaignStageId) : goHome()}
          onOpenCard={(id) => openCard(id, "weak")}
        />
      ) : null}
      {screen === "card" && cardInstanceId ? (
        <CardDetailScreen
          cardInstanceId={cardInstanceId}
          onBack={() => cardReturnScreen === "deck" ? openDeck(deckReturnScreen) : cardReturnScreen === "weak" && cardInstanceId ? openCard(cardInstanceId, "weak") : collectionCardId ? openCollectionCard(collectionCardId) : openCollections(collectionsReturnScreen)}
          onDeckPowerChange={setDeckPowerOverride}
          onGoldChange={(gold) => updateBalance({ gold })}
          onOpenDeck={() => openDeck("home")}
          onOpenShop={() => openShop("deck")}
          onOpenWeakCards={() => { setWeakReturnScreen("card"); setScreen("weak"); updatePath(withReturnPath("/cards/weak", "card")); }}
        />
      ) : null}
      {screen === "shop" ? (
        <ShopScreen
          onBack={() => shopReturnScreen === "tasks" ? openTasks() : shopReturnScreen === "deck" ? openDeck(deckReturnScreen) : shopReturnScreen === "collection" && collectionId ? openCollection(collectionId) : shopReturnScreen === "campaign-stage" ? openCampaignStage(campaignStageId) : goHome()}
          onBalanceChange={updateBalance}
          onCollectionCompleted={addCollectionBonus}
          onDeckPowerChange={setDeckPowerOverride}
          onEquippedSkinChange={(equippedNicknameSkin) => updateBalance({ equippedNicknameSkin })}
          playerSummaryState={playerSummaryState}
          nickname={playerSummaryState.status === "ready" ? getPlayerDisplayName(playerSummaryState.data) : "Гравець"}
        />
      ) : null}
      {screen === "collections" ? <CollectionsScreen onBack={() => collectionsReturnScreen === "campaign-stage" ? openCampaignStage(campaignStageId) : goHome()} onOpenCollection={openCollection} onOpenLimitedCard={(id) => openCard(id, "collection-card")} /> : null}
      {screen === "collection" && collectionId ? <CollectionDetailScreen collectionId={collectionId} onBack={() => openCollections(collectionsReturnScreen)} onOpenCard={openCollectionCard} onOpenShop={() => openShop("collection")} /> : null}
      {screen === "collection-card" && collectionId && collectionCardId ? <CollectionCardScreen cardId={collectionCardId} collectionId={collectionId} onBack={() => openCollection(collectionId)} onOpenInstance={(id) => openCard(id, "collection-card")} /> : null}
      {screen === "campaign" ? <CampaignScreen onBack={goHome} onCampaignCompleted={tutorial.complete} onOpenBoss={() => { setScreen("campaign-boss"); updatePath("/campaign/boss"); }} onOpenStage={openCampaignStage} /> : null}
      {screen === "campaign-stage" ? <CampaignStageScreen onBack={openCampaign} onNavigate={navigateFromCampaign} onPlayerSummaryChange={updateBalance} stageId={campaignStageId} /> : null}
      {screen === "campaign-boss" ? <CampaignBossScreen onCampaignCompleted={tutorial.complete} onDeckPowerChange={setDeckPowerOverride} onPlayerSummaryChange={updateBalance} onReturn={openCampaign} /> : null}
      {screen === "battle-pass" ? <BattlePassScreen onBack={goHome} onPlayerSummaryChange={(balance) => updateBalance(balance)} /> : null}
      {screen === "tasks" ? <TasksScreen onBack={goHome} onOpenTask={openTaskTarget} /> : null}
    </AppShell>
  );
}
