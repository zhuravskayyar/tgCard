import { useCallback, useEffect, useRef, useState } from "react";
import { getPlayerDisplayName, type AuthIdentityView } from "@cardastika/shared";
import { GoogleSignInButton } from "../components/GoogleSignInButton";
import { MenuRow } from "../components/MenuRow";
import { TelegramLoginButton } from "../components/TelegramLoginButton";
import { getTelegramWebApp } from "../telegram";
import {
  AccountLinkError,
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

type TransferRequest =
  | { provider: "google"; credential: string }
  | { provider: "telegram"; authData: Record<string, string> };

function providerLabel(provider: TransferRequest["provider"]) {
  return provider === "google" ? "Google" : "Telegram";
}

interface AccountTransferDialogProps {
  onCancel: () => void;
  onConfirm: () => void;
  pending: boolean;
  provider: TransferRequest["provider"];
}

function AccountTransferDialog({ onCancel, onConfirm, pending, provider }: AccountTransferDialogProps) {
  const label = providerLabel(provider);
  return (
    <div className="confirmation-backdrop" role="presentation">
      <section aria-labelledby="settings-transfer-title" aria-modal="true" className="confirmation-modal settings-card settings-transfer-dialog" role="dialog">
        <h2 id="settings-transfer-title">Перенести {label}?</h2>
        <p>{label} уже прив'язаний до іншого профілю Cardastika.</p>
        <p>Прогрес і ресурси поточного профілю залишаться без змін. Старий профіль не видаляється, але його активні {label}-сесії буде завершено.</p>
        <div className="settings-transfer-actions">
          <button disabled={pending} onClick={onCancel} type="button">Скасувати</button>
          <button className="settings-transfer-confirm" disabled={pending} onClick={onConfirm} type="button">
            {pending ? "Перенесення…" : `Перенести ${label}`}
          </button>
        </div>
      </section>
    </div>
  );
}

export function SettingsScreen({ onBack, onLogout, onReplayTutorial, playerSummaryState, showTutorialReplay }: SettingsScreenProps) {
  const [identities, setIdentities] = useState<AuthIdentityView[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkNotice, setLinkNotice] = useState<string | null>(null);
  const [pendingProvider, setPendingProvider] = useState<TransferRequest["provider"] | null>(null);
  const [transferRequest, setTransferRequest] = useState<TransferRequest | null>(null);
  const linkInFlightRef = useRef(false);
  const player = playerSummaryState.status === "ready" ? playerSummaryState.data : null;
  const isTelegram = Boolean(getTelegramWebApp());

  useEffect(() => {
    const controller = new AbortController();
    void loadCurrentAuth(controller.signal)
      .then((value) => { setIdentities(value.identities); setState("ready"); })
      .catch(() => { if (!controller.signal.aborted) setState("error"); });
    return () => controller.abort();
  }, []);

  const link = useCallback(async (request: TransferRequest, replaceExisting = false) => {
    if (linkInFlightRef.current) return;
    linkInFlightRef.current = true;
    setLinkError(null);
    setLinkNotice(null);
    setPendingProvider(request.provider);
    const controller = new AbortController();
    try {
      const result = request.provider === "google"
        ? await linkGoogleAccount(request.credential, controller.signal, replaceExisting)
        : await linkTelegramAccount(request.authData, controller.signal, replaceExisting);
      setIdentities(result.identities);
      setTransferRequest(null);
      setLinkNotice(`${providerLabel(request.provider)} ${result.replacedExisting ? "перенесено" : "прив'язано"} до цього профілю.`);
    } catch (error) {
      if (error instanceof AccountLinkError && error.code === "identity_belongs_to_other_player" && !replaceExisting) {
        setTransferRequest(request);
      } else {
        setTransferRequest(null);
        setLinkError(error instanceof AccountLinkError ? error.message : "Не вдалося прив'язати цей спосіб входу.");
      }
    } finally {
      linkInFlightRef.current = false;
      setPendingProvider(null);
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
          <div className="settings-provider">
            <span>Telegram</span>
            {isLinked(identities, "telegram")
              ? <strong>✓ Прив'язано</strong>
              : <TelegramLoginButton disabled={pendingProvider !== null} onAuth={(authData) => void link({ provider: "telegram", authData })} />}
          </div>
          <div className="settings-provider">
            <span>Google</span>
            {isLinked(identities, "google")
              ? <strong>✓ Прив'язано</strong>
              : <GoogleSignInButton disabled={pendingProvider !== null} onCredential={(credential) => void link({ provider: "google", credential })} />}
          </div>
        </div>
        {state === "loading" ? <p className="settings-hint">Завантаження способів входу…</p> : null}
        {linkNotice ? <p className="settings-success" role="status">{linkNotice}</p> : null}
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
      {transferRequest ? (
        <AccountTransferDialog
          onCancel={() => setTransferRequest(null)}
          onConfirm={() => void link(transferRequest, true)}
          pending={pendingProvider !== null}
          provider={transferRequest.provider}
        />
      ) : null}
    </section>
  );
}
