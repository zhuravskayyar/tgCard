import { useEffect, useState } from "react";
import type { GuildRaidStatusView } from "@cardastika/shared";
import { MenuRow } from "./MenuRow";
import { getTelegramInitData } from "../telegram";
import { loadMyRaidStatus } from "../telegram/guild";
import "../styles/raid-status-banner.css";

const POLL_MS = 30_000;

function describe(raid: NonNullable<GuildRaidStatusView>) {
  const title = raid.kind === "dragon" ? `Рейд: ${raid.name}` : `Рейд на відьом · ${raid.level ?? 1} рівень`;
  const subtitle = raid.state === "enrolled" ? "Ви записані — чекаємо рейд-лідера"
    : raid.state === "fighting" ? "Бій триває — повернутися до рейду"
    : raid.state === "fallen" ? "Ви вибули — рейд триває"
    : raid.state === "won" ? "Рейд виграно — подивитися підсумок"
    : "Рейд програно — подивитися підсумок";
  return { title, subtitle };
}

/** Reference: on other pages a message links back to the raid the player takes part in, and reports its end. */
export function RaidStatusBanner({ screenKey, onOpen }: { screenKey: string; onOpen: () => void }) {
  const [raid, setRaid] = useState<GuildRaidStatusView>(null);

  useEffect(() => {
    if (!getTelegramInitData()) return;
    let active = true;
    const load = () => {
      void loadMyRaidStatus().then((data) => { if (active) setRaid(data.raid); }).catch(() => undefined);
    };
    load();
    const timer = window.setInterval(load, POLL_MS);
    return () => { active = false; window.clearInterval(timer); };
  }, [screenKey]);

  if (!raid) return null;
  const { title, subtitle } = describe(raid);
  return <div className="raid-status-banner">
    <MenuRow attention={raid.state === "fighting"} compact icon="campaign" onClick={onOpen} subtitle={subtitle} title={title} />
  </div>;
}
