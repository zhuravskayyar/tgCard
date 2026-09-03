import { useRef } from "react";
import type { GuildProfileResponse } from "@cardastika/shared";
import { GuildScrollTitle } from "./GuildScrollTitle";
import { ELEMENT_LABELS, GuildEmblem, GuildRoleBadge, LANGUAGE_LABELS, MODE_LABELS, formatNumber } from "./GuildUi";
import "./guild-polish.css";

export function GuildIdentity({ profile, includeStickyTitle = true }: { profile: GuildProfileResponse; includeStickyTitle?: boolean }) {
  const heroRef = useRef<HTMLElement>(null);
  const { guild, viewer } = profile;
  const freeSlots = Math.max(0, guild.memberCapacity - guild.memberCount);
  const guildExperiencePercent = guild.nextLevelExperience === null
    ? 100
    : guild.nextLevelExperience > 0
      ? Math.min(100, Math.max(0, guild.experience / guild.nextLevelExperience * 100))
      : 0;

  return <>
    {includeStickyTitle ? <GuildScrollTitle name={guild.name} emblemId={guild.emblemId} heroRef={heroRef} /> : null}
    <section className="guild-hero" ref={heroRef} aria-labelledby="guild-hero-title">
      <div className="guild-hero__emblem"><GuildEmblem emblemId={guild.emblemId} /></div>
      <div className="guild-hero__identity">
        <span className="guild-eyebrow">Гільдія · рівень {guild.level}</span>
        <h2 id="guild-hero-title">{guild.name}</h2>
        <div className="guild-hero__meta">
          {viewer.member ? <GuildRoleBadge role={viewer.member.role} /> : <span>Публічний профіль</span>}
          <span aria-hidden="true">·</span>
          <span>{guild.themeElement ? ELEMENT_LABELS[guild.themeElement] : "Без стихії"}</span>
          <span aria-hidden="true">·</span>
          <span>{LANGUAGE_LABELS[guild.language]}</span>
        </div>
      </div>
      <div className="guild-hero__level" aria-label={`Рівень гільдії ${guild.level}`}>
        <strong>{guild.level}</strong>
        <small>рівень</small>
      </div>
    </section>
    <div className="guild-hero__facts" aria-label="Коротко про гільдію">
      <div><strong>{guild.memberCount}/{guild.memberCapacity}</strong><small>склад</small></div>
      <div><strong>{formatNumber(guild.activityScore)}</strong><small>XP / 7 днів</small></div>
      <div><strong>{freeSlots}</strong><small>вільних місць</small></div>
    </div>
    <div className="guild-hero__status">
      <span className="guild-status-dot" aria-hidden="true" />
      <span>{guild.isFull ? "Місць немає" : MODE_LABELS[guild.recruitmentMode]}</span>
      {!guild.isFull ? <span className="guild-hero__status-free">Ще {freeSlots}</span> : null}
    </div>
    <div className="guild-hero__xp" aria-label={guild.nextLevelExperience === null ? `Досвід гільдії: ${formatNumber(guild.experience)} XP, максимальний рівень` : `Досвід гільдії: ${formatNumber(guild.experience)} з ${formatNumber(guild.nextLevelExperience)} XP`}>
      <div><span>Досвід гільдії</span><strong>{guild.nextLevelExperience === null ? `${formatNumber(guild.experience)} XP · максимум` : `${formatNumber(guild.experience)} / ${formatNumber(guild.nextLevelExperience)} XP`}</strong></div>
      <div className="guild-progress" role="progressbar" aria-valuemax={guild.nextLevelExperience ?? undefined} aria-valuemin={0} aria-valuenow={guild.experience}><span style={{ width: `${guildExperiencePercent}%` }} /></div>
    </div>
    {guild.description ? <p className="guild-description guild-hero__description">{guild.description}</p> : null}
  </>;
}
