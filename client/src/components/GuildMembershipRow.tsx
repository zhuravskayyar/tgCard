import { useEffect, useState } from "react";
import { GUILD_CONFIG, GUILD_ROLE_LABELS, type GuildMineResponse } from "@cardastika/shared";
import { loadMyGuild } from "../telegram/guild";
import { AppIcon } from "./AppIcon";

function GuildShield({ emblemId }: { emblemId?: string }) {
  const match = emblemId ? /^shield-([1-8])$/u.exec(emblemId) : null;
  const index = match ? Number(match[1]) - 1 : null;

  return <span className="profile-guild-card__shield" aria-hidden="true">
    {index === null ? <AppIcon name="guild" size={34} /> : <span className="profile-guild-card__shield-sprite" style={{ top: index < 4 ? "-65%" : "-7%", backgroundPosition: `${(index % 4) * 33.333333}% ${Math.floor(index / 4) * 100}%` }} />}
  </span>;
}

export function GuildMembershipRow({ level, onOpen }: { level: number; onOpen: () => void }) {
  const [state, setState] = useState<{ status: "loading" | "error" } | { status: "ready"; data: GuildMineResponse }>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    void loadMyGuild().then((data) => { if (active) setState({ status: "ready", data }); }).catch(() => { if (active) setState({ status: "error" }); });
    return () => { active = false; };
  }, [attempt]);
  if (state.status === "loading") return <div className="profile-guild-card profile-guild-card--state" aria-live="polite"><GuildShield /><span className="profile-guild-card__copy"><strong>Гільдія</strong><span>Завантаження…</span></span></div>;
  if (state.status === "error") return <button className="profile-guild-card profile-guild-card--state" onClick={() => setAttempt((value) => value + 1)} type="button"><GuildShield /><span className="profile-guild-card__copy"><strong>Гільдія</strong><span>Повторити</span></span></button>;
  if (!("data" in state)) return null;
  const guild = state.data.guild;
  const role = guild?.viewer.member?.role;
  const name = guild?.guild.name ?? (level < GUILD_CONFIG.unlockLevel ? `Гільдія · з ${GUILD_CONFIG.unlockLevel} рівня` : state.data.activeApplication ? "Заявка в гільдію" : "Знайти гільдію");
  const rank = role ? GUILD_ROLE_LABELS[role] : state.data.activeApplication ? "На розгляді" : "Переглянути каталог";
  return <button className="profile-guild-card" aria-label={`${name}, ${rank}. Відкрити гільдію`} onClick={onOpen} type="button"><GuildShield emblemId={guild?.guild.emblemId} /><span className="profile-guild-card__copy"><strong>{name}</strong><span>{rank}</span></span></button>;
}
