import { useCallback, useEffect, useState } from "react";
import { getPlayerDisplayName, type AuthIdentityView } from "@cardastika/shared";
import { GoogleSignInButton } from "../components/GoogleSignInButton";
import { MenuRow } from "../components/MenuRow";
import { TelegramLoginButton } from "../components/TelegramLoginButton";
import { getTelegramWebApp } from "../telegram";
import {
  linkGoogleAccount,
  linkTelegramAccount,
  loadCurrentAuth,
  logoutPlayer,
} from "../telegram/authenticatePlayer";
import type { PlayerSummaryState } from "../types/player";

interface SettingsScreenProps {
  onBack: () => void;
  onLogout: () => void;
  onReplayTutorial: () => void;
  playerSummaryState: PlayerSummaryState;
  showTutorialReplay: boolean;
}

function isLinked(identities: AuthIdentityView[], provider: AuthIdentityView["provider"]) {
  return identities.some((identity) => identity.provider === provider);
}

export function SettingsScreen({ onBack, onLogout, onReplayTutorial, playerSummaryState, showTutorialReplay }: SettingsScreenProps) {
  const [identities, setIdentities] = useState<AuthIdentityView[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [linkError, setLinkError] = useState<string | null>(null);
  const player = playerSummaryState.status === "ready" ? playerSummaryState.data : null;
  const isTelegram = Boolean(getTelegramWebApp());

  useEffect(() => {
    const controller = new AbortController();
    void loadCurrentAuth(controller.signal)
      .then((value) => { setIdentities(value.identities); setState("ready"); })
      .catch(() => { if (!controller.signal.aborted) setState("error"); });
    return () => controller.abort();
  }, []);

  const link = useCallback(async (provider: "google" | "telegram", credential: string | Record<string, string>) => {
    setLinkError(null);
    const controller = new AbortController();
    try {
      const result = provider === "google"
        ? await linkGoogleAccount(credential as string, controller.signal)
        : await linkTelegramAccount(credential as Record<string, string>, controller.signal);
      setIdentities(result.identities);
    } catch (error) {
      setLinkError(error instanceof Error && "status" in error && Number((error as { status?: unknown }).status) === 409
        ? "Цей акаунт уже прив'язаний до іншого профілю Cardastika."
        : "Не вдалося прив'язати цей спосіб входу.");
    }
  }, []);

  async function handleLogout() {
    await logoutPlayer();
    onLogout();
  }

  return (
    <section className="settings-screen">
      <header className="settings-heading">
        <button className="screen-back" onClick={onBack} type="button" aria-label="Назад">‹</button>
        <h1>НАЛАШТУВАННЯ</h1>
        <span aria-hidden="true" />
      </header>

      <section className="settings-section" aria-labelledby="settings-account">
        <h2 id="settings-account">АКАУНТ</h2>
        <div className="settings-card">
          <div className="settings-provider"><span>Telegram</span>{isLinked(identities, "telegram") ? <strong>✓ Прив'язано</strong> : <TelegramLoginButton onAuth={(data) => void link("telegram", data)} />}</div>
          <div className="settings-provider"><span>Google</span>{isLinked(identities, "google") ? <strong>✓ Прив'язано</strong> : <GoogleSignInButton onCredential={(credential) => void link("google", credential)} />}</div>
        </div>
        {state === "loading" ? <p className="settings-hint">Завантаження способів входу…</p> : null}
        {state === "error" || linkError ? <p className="settings-error" role="alert">{linkError ?? "Не вдалося завантажити способи входу."}</p> : null}
      </section>

      <section className="settings-section" aria-labelledby="settings-profile">
        <h2 id="settings-profile">ПРОФІЛЬ</h2>
        <dl className="settings-card settings-facts">
          <div><dt>Ігрове ім'я</dt><dd>{player ? getPlayerDisplayName(player) : "—"}</dd></div>
          <div><dt>Player ID</dt><dd>#{player?.id ?? "—"}</dd></div>
        </dl>
      </section>

      <section className="settings-section" aria-labelledby="settings-game">
        <h2 id="settings-game">ГРА</h2>
        <div className="settings-card settings-options">
          <MenuRow compact disabled icon="guild" metalTexture title="Звуки — незабаром" />
          <MenuRow compact disabled icon="guild" metalTexture title="Музика — незабаром" />
          <MenuRow compact disabled icon="guild" metalTexture title="Вібрація — незабаром" />
        </div>
      </section>

      <section className="settings-section" aria-labelledby="settings-interface">
        <h2 id="settings-interface">ІНТЕРФЕЙС</h2>
        <div className="settings-card settings-options">
          <MenuRow compact disabled icon="deck" metalTexture title="Анімації — незабаром" />
          <MenuRow compact disabled icon="card-strength" metalTexture title="Ефекти карт — незабаром" />
        </div>
      </section>

      <section className="settings-section" aria-labelledby="settings-other">
        <h2 id="settings-other">ІНШЕ</h2>
        <div className="settings-card settings-options">
          <MenuRow compact disabled icon="guild" metalTexture title="Мова — незабаром" />
          <MenuRow compact disabled icon="mail" metalTexture title="Сповіщення — незабаром" />
          <MenuRow compact disabled icon="guild" metalTexture title="Підтримка — незабаром" />
          {showTutorialReplay ? <MenuRow compact icon="record" metalTexture onClick={onReplayTutorial} title="Як грати · пройти навчання ще раз" /> : null}
          <MenuRow compact disabled icon="lock" metalTexture title="Політика конфіденційності — незабаром" />
        </div>
      </section>

      {!isTelegram ? <button className="settings-logout" onClick={() => void handleLogout()} type="button">Вийти з акаунта</button> : null}
    </section>
  );
}
