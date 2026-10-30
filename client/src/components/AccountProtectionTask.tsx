import { useCallback, useEffect, useRef, useState } from "react";
import type { AccountProtectionTaskView, LinkIdentityRequest } from "@cardastika/shared";
import { CurrencyIcon } from "./CurrencyDisplay";
import { GoogleSignInButton } from "./GoogleSignInButton";
import { TelegramLoginButton } from "./TelegramLoginButton";
import { getRawTelegramInitData } from "../telegram";
import {
  AccountLinkError,
  linkGoogleAccount,
  linkTelegramAccount,
  linkTelegramMiniAppAccount,
  loadCurrentAuth,
} from "../telegram/authenticatePlayer";

type TaskState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; task: AccountProtectionTaskView };

export function AccountProtectionTask({ onRewardGranted }: { onRewardGranted?: () => void }) {
  const [state, setState] = useState<TaskState>({ status: "loading" });
  const [pending, setPending] = useState(false);
  const [rewardJustGranted, setRewardJustGranted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const requestInFlight = useRef(false);
  const isTelegram = Boolean(getRawTelegramInitData());

  const refresh = useCallback(async (signal: AbortSignal) => {
    const auth = await loadCurrentAuth(signal);
    setState({ status: "ready", task: auth.accountProtection });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal).catch(() => {
      if (!controller.signal.aborted) setState({ status: "error" });
    });
    return () => controller.abort();
  }, [refresh]);

  const link = useCallback(async (request: LinkIdentityRequest) => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const signal = new AbortController().signal;
      const result = request.provider === "google"
        ? await linkGoogleAccount(request.credential, signal)
        : "initData" in request
          ? await linkTelegramMiniAppAccount(request.initData, signal)
          : await linkTelegramAccount(request.authData, signal);
      setNotice(result.rewardGranted ? "Акаунт прив’язано. Золото нараховано." : "Акаунт прив’язано. Нагороду вже отримано раніше.");
      if (result.rewardGranted) {
        setRewardJustGranted(true);
        setState((current) => current.status === "ready"
          ? { status: "ready", task: { ...current.task, status: "completed" } }
          : current);
        onRewardGranted?.();
      } else {
        await refresh(new AbortController().signal);
      }
    } catch (reason) {
      setError(reason instanceof AccountLinkError ? reason.message : "Не вдалося прив’язати акаунт. Спробуй ще раз.");
    } finally {
      requestInFlight.current = false;
      setPending(false);
    }
  }, [onRewardGranted, refresh]);

  const linkTelegramMiniApp = useCallback(() => {
    const initData = getRawTelegramInitData();
    if (!initData) {
      setError("Не вдалося перевірити Telegram. Закрий і знову відкрий гру з Telegram.");
      return;
    }
    void link({ provider: "telegram", initData });
  }, [link]);

  if (state.status === "loading") return null;
  if (state.status === "error") {
    return (
      <section className="tasks-screen__account-protection tasks-screen__account-protection--error" aria-label="Захист акаунта">
        <strong>Не вдалося завантажити завдання</strong>
        <button disabled={pending} onClick={() => {
          const controller = new AbortController();
          setState({ status: "loading" });
          void refresh(controller.signal).catch(() => setState({ status: "error" }));
        }} type="button">Спробувати ще раз</button>
      </section>
    );
  }
  if (state.task.status !== "available" && state.task.status !== "completed") return null;
  const completed = state.task.status === "completed";

  return (
    <section aria-labelledby="account-protection-title" className={`tasks-screen__account-protection${rewardJustGranted ? " tasks-screen__account-protection--rewarded" : ""}`}>
      <div className="tasks-screen__account-protection-heading">
        <span aria-hidden="true">✦</span>
        <div>
          <strong id="account-protection-title">Захисти свій прогрес</strong>
          <p>{completed
            ? "Профіль захищено. Твої карти та прогрес прив’язані до акаунта."
            : "Прив’яжи Google або Telegram, щоб відновити прогрес на іншому пристрої."}</p>
        </div>
        <div aria-label={`Нагорода: ${state.task.rewardGold} золота`} className="tasks-screen__account-protection-reward">
          <CurrencyIcon kind="gold" size={22} />
          <strong>+{state.task.rewardGold}</strong>
        </div>
      </div>
      {!completed ? (
        <div aria-busy={pending} className="tasks-screen__account-protection-actions">
          {isTelegram
            ? <button className="auth-provider-button" disabled={pending} onClick={linkTelegramMiniApp} type="button">{pending ? "Прив’язуємо…" : "Прив’язати Telegram"}</button>
            : <TelegramLoginButton appearance="landing" disabled={pending} onAuth={(authData) => void link({ provider: "telegram", authData })} />}
          <GoogleSignInButton appearance="landing" disabled={pending} onCredential={(credential) => void link({ provider: "google", credential })} />
        </div>
      ) : null}
      {error ? <p className="tasks-screen__account-protection-error" role="alert">{error}</p> : null}
      {notice ? <p className="tasks-screen__account-protection-success" role="status">{notice}</p> : null}
    </section>
  );
}
