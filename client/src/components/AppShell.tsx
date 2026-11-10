import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { warmCardMaterialRenderer } from "../cards/cardMaterialShader";
import { useScreenReveal } from "../hooks/useScreenReveal";
import type { PlayerSummaryState } from "../types/player";
import { BottomNav, type BottomNavItem } from "./BottomNav";
import { loadCardArtManifest } from "./cardArtSource";
import { ScreenLoader } from "./ScreenLoader";
import { TopHud } from "./TopHud";

interface AppShellProps {
  activeNavigationItem: BottomNavItem;
  children: ReactNode;
  deckPowerOverride?: number;
  modal?: ReactNode;
  overlay?: ReactNode;
  screenKey?: string;
  onNavigate: (item: BottomNavItem) => void;
  onOpenSettings: () => void;
  onRetryPlayerSummary: () => void;
  playerSummaryState: PlayerSummaryState;
}

export function AppShell({
  activeNavigationItem,
  children,
  deckPowerOverride,
  modal,
  overlay,
  screenKey,
  onNavigate,
  onOpenSettings,
  onRetryPlayerSummary,
  playerSummaryState,
}: AppShellProps) {
  const contentRef = useRef<HTMLElement>(null);

  const revealed = useScreenReveal(screenKey, contentRef);

  useLayoutEffect(() => {
    contentRef.current?.scrollTo({ left: 0, top: 0, behavior: "auto" });
  }, [screenKey]);

  // Prepared after the first paint, so the first screen with cards has nothing left to compile or fetch.
  useEffect(() => {
    void loadCardArtManifest();
    const timer = window.setTimeout(warmCardMaterialRenderer, 200);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="app-shell">
      <TopHud deckPowerOverride={deckPowerOverride} onOpenSettings={onOpenSettings} onRetry={onRetryPlayerSummary} state={playerSummaryState} />
      <main className="app-content" ref={contentRef}>
        <div className={`app-screen-transition${revealed ? "" : " app-screen-transition--pending"}`} key={screenKey}>
          {children}
        </div>
        {revealed ? null : <ScreenLoader />}
      </main>
      <BottomNav activeItem={activeNavigationItem} onSelect={onNavigate} />
      {overlay}
      {modal}
    </div>
  );
}
