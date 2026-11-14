import { useEffect, useRef, useState } from "react";
import type { NotificationKind, NotificationSettingsResponse } from "@cardastika/shared";
import { getUiLocale } from "../i18n";
import { loadNotificationSettings, saveNotificationSettings } from "../telegram/notifications";
import type { AppIconName } from "./AppIcon";
import { MenuRow } from "./MenuRow";

const ROWS: ReadonlyArray<{ kind: NotificationKind; icon: AppIconName; on: string; off: string }> = [
  { kind: "duelReady", icon: "duel", on: "Дуелі знову доступні: увімкнено", off: "Дуелі знову доступні: вимкнено" },
  { kind: "mail", icon: "mail", on: "Нова пошта: увімкнено", off: "Нова пошта: вимкнено" },
  { kind: "guild", icon: "guild", on: "Чат гільдії: увімкнено", off: "Чат гільдії: вимкнено" },
  { kind: "announcements", icon: "tasks", on: "Оновлення гри: увімкнено", off: "Оновлення гри: вимкнено" },
  { kind: "winback", icon: "home", on: "Нагадування повернутися: увімкнено", off: "Нагадування повернутися: вимкнено" },
];

/** Bot notification switches; the server owns the defaults and delivery. */
export function NotificationSettingsSection() {
  const [settings, setSettings] = useState<NotificationSettingsResponse | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error" | "saveError">("loading");
  const savingRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    void loadNotificationSettings(controller.signal)
      .then((value) => { setSettings(value); setState("ready"); })
      .catch(() => { if (!controller.signal.aborted) setState("error"); });
    return () => controller.abort();
  }, []);

  async function toggle(kind: NotificationKind) {
    if (!settings || savingRef.current) return;
    savingRef.current = true;
    try {
      const preferences = { [kind]: !settings.preferences[kind] };
      setSettings(await saveNotificationSettings({ preferences, locale: getUiLocale() }, new AbortController().signal));
      setState("ready");
    } catch {
      setState("saveError");
    } finally {
      savingRef.current = false;
    }
  }

  return (
    <section className="settings-section" aria-labelledby="settings-notifications">
      <h2 id="settings-notifications">СПОВІЩЕННЯ</h2>
      <div className="settings-card settings-options">
        {settings ? ROWS.map((row) => (
          <MenuRow
            compact
            disabled={!settings.telegramLinked}
            icon={row.icon}
            key={row.kind}
            metalTexture
            onClick={() => void toggle(row.kind)}
            title={settings.preferences[row.kind] ? row.on : row.off}
          />
        )) : null}
      </div>
      {state === "loading" ? <p className="settings-hint">Завантаження сповіщень…</p> : null}
      {settings && !settings.telegramLinked ? <p className="settings-hint">Прив’яжи Telegram в акаунті, щоб отримувати сповіщення.</p> : null}
      {settings?.telegramLinked && !settings.telegramBlocked ? <p className="settings-hint">Сповіщення надсилає бот Cardastika в Telegram.</p> : null}
      {settings?.telegramBlocked ? <p className="settings-error" role="alert">Бот не може тобі написати. Відкрий бота в Telegram і натисни «Старт».</p> : null}
      {state === "error" ? <p className="settings-error" role="alert">Не вдалося завантажити сповіщення.</p> : null}
      {state === "saveError" ? <p className="settings-error" role="alert">Не вдалося зберегти сповіщення.</p> : null}
    </section>
  );
}
