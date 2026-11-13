import { hideMissingCardArt } from "../../components/cardArtSource";
import { useBattleExchange, useBattleResultReady } from "../../components/useBattlePresentation";
import { BattleAttackAnimation } from "../../components/BattleAttackAnimation";
import { useEffect, useRef, useState } from "react";
import type {
  DuelExchange,
  GuildProfileResponse,
  GuildRaidBattleLogEntry,
  GuildRaidBossView,
  GuildRaidDamageParticipantView,
  GuildRaidResultParticipantView,
  GuildRaidResultView,
  GuildRaidView,
} from "@cardastika/shared";
import { getDuelLogVisualState, getElementMultiplier, RAID_CARD_SWAP_GOLD } from "@cardastika/game-core";
import { getLeagueByRating } from "@cardastika/shared";
import { AppIcon } from "../../components/AppIcon";
import { formatUiNumber } from "../../i18n";
import { CurrencyIcon } from "../../components/CurrencyDisplay";
import { LeagueBadge } from "../../components/LeagueBadge";
import { BattleCard, getEffectLevel, HpPanel } from "../DuelScreen";
import { MenuRow } from "../../components/MenuRow";
import { ElementArt } from "../../components/ElementAura";
import { GameChat } from "../../components/GameChat";
import {
  decideGuildRaidTreasure,
  enrollGuildRaid,
  leaveGuildRaid,
  loadGuildRaidChat,
  sendGuildRaidChatMessage,
  swapGuildRaidCards,
  loadGuildRaid,
  startGuildRaid,
  startGuildRaidBattle,
  submitGuildRaidAction,
} from "../../telegram/guild";
import { ELEMENT_LABELS, GuildState, guildErrorMessage } from "./GuildUi";

interface GuildRaidScreenProps {
  profile: GuildProfileResponse;
  onRaids?: () => void;
  onMembers: () => void;
  onForum: () => void;
  onDirectory: () => void;
}

function formatRaidNumber(value: number) {
  return formatUiNumber(value);
}

export function toRaidDuelExchange(entry: GuildRaidBattleLogEntry): DuelExchange | null {
  return toDuelExchange(entry);
}

function toDuelExchange(entry: GuildRaidBattleLogEntry): DuelExchange | null {
  if (entry.kind !== "attack" || !entry.attackerCard || !entry.defenderCard || !entry.multiplier || !entry.witchMultiplier) return null;
  return {
    enemyCard: entry.defenderCard,
    enemyDamage: entry.witchDamage,
    enemyMultiplier: entry.witchMultiplier,
    playerCard: entry.attackerCard,
    playerDamage: entry.playerDamage,
    playerMultiplier: entry.multiplier,
    slotIndex: entry.slotIndex ?? 0,
    turnNumber: entry.turnNumber,
    visualState: getDuelLogVisualState(entry.multiplier, entry.witchMultiplier),
  };
}

function RaidBossIdentity({ boss, slot, selected, onSelect, disabled }: {
  boss: GuildRaidBossView;
  slot: 1 | 2;
  selected: boolean;
  onSelect: () => void;
  disabled: boolean;
}) {
  const healthPercent = boss.health > 0 ? Math.max(0, Math.min(100, boss.currentHealth / boss.health * 100)) : 0;
  const defeated = boss.currentHealth <= 0;
  return (
    <button aria-pressed={selected} className={`guild-raid-battle__boss-select${selected ? " is-selected" : ""}${defeated ? " is-defeated" : ""}`} disabled={disabled || defeated} onClick={onSelect} type="button">
      <span className="guild-raid__portrait">
        <img alt={`${boss.displayName}, стихія ${ELEMENT_LABELS[boss.element]}`} onError={hideMissingCardArt} src={`/card-art/${boss.artKey}.webp`} />
      </span>
      <strong className={`guild-raid__boss-name guild-raid__boss-name--${boss.element}`}>{boss.displayName}</strong>
      <span className="guild-raid-battle__boss-hp">{formatRaidNumber(boss.currentHealth)} / {formatRaidNumber(boss.health)}</span>
      <span aria-label={`Здоров’я ${boss.displayName}: ${Math.round(healthPercent)}%`} className="guild-raid-battle__hpbar"><span style={{ width: `${healthPercent}%` }} /></span>
      <small>{defeated ? "Переможена" : selected ? "Обрана ціль" : `Відьма ${slot}`}</small>
    </button>
  );
}

function RaidBattle({ raid, playerName, playerLevel, playerPhotoUrl, pending, targetBossSlot, onTargetChange, onAction, onSwap }: {
  raid: GuildRaidView;
  playerName: string;
  playerLevel: number;
  playerPhotoUrl: string | null;
  pending: boolean;
  targetBossSlot: 1 | 2;
  onTargetChange: (slot: 1 | 2) => void;
  onAction: (slot: 0 | 1 | 2) => void;
  onSwap: () => void;
}) {
  const battle = raid.battle;
  const latestAttack = battle?.battleLog.find((entry) => entry.kind === "attack");
  const clash = useBattleExchange(latestAttack ? toDuelExchange(latestAttack) : null, latestAttack?.id);
  const disabled = clash !== null || pending || battle?.status !== "active";

  if (!battle) return null;
  const playerSide = { name: playerName, level: playerLevel, photoUrl: playerPhotoUrl };
  const selectedBoss = raid.bosses[targetBossSlot - 1];
  const selectedCards = battle.witchActiveCards[targetBossSlot - 1] ?? [];
  const clashSlot = clash?.slotIndex ?? null;
  const multipliers = battle.playerActiveCards.map((card, index) => {
    const enemyCard = selectedCards[index];
    return enemyCard ? getElementMultiplier(card.element, enemyCard.element) : null;
  });
  const enemyHitLevel = clash ? getEffectLevel(clash.playerMultiplier) : "normal";
  const playerHitLevel = clash ? getEffectLevel(clash.enemyMultiplier) : "normal";
  const visibleBattleLog = battle.battleLog.slice(0, 7);
  const selectedBossHealthPercent = selectedBoss && selectedBoss.health > 0
    ? Math.max(0, Math.min(100, selectedBoss.currentHealth / selectedBoss.health * 100))
    : 0;
  return (
    <section aria-label="Бій з відьмами" className={`guild-raid-battle${clash ? " is-clashing" : ""}`}>
      <header className="guild-raid-battle__header">
        <span>Бій · хід {battle.turnNumber}</span>
        <strong>{selectedBoss?.displayName ?? "Відьми"}</strong>
      </header>
      <div className="guild-raid-battle__stage">
        <div className="guild-raid-battle__boss-grid">
          {raid.bosses.map((boss, index) => {
            const slot = (index + 1) as 1 | 2;
            return (
              <article className={`guild-raid-battle__boss-card${slot === targetBossSlot ? " is-target" : ""}`} key={boss.cardId}>
                <RaidBossIdentity boss={boss} disabled={disabled} onSelect={() => onTargetChange(slot)} selected={slot === targetBossSlot} slot={slot} />
              </article>
            );
          })}
        </div>
        {selectedBoss ? <section className="guild-raid-battle__target-panel">
          <div className="guild-raid-battle__target-header">
            <div className="guild-raid-battle__target-identity">
              <span className="guild-raid__portrait guild-raid-battle__target-portrait">
                <img alt={`${selectedBoss.displayName}, стихія ${ELEMENT_LABELS[selectedBoss.element]}`} onError={hideMissingCardArt} src={`/card-art/${selectedBoss.artKey}.webp`} />
              </span>
              <div><strong className={`guild-raid__boss-name guild-raid__boss-name--${selectedBoss.element}`}>{selectedBoss.displayName}</strong></div>
            </div>
            <div className="guild-raid-battle__target-hp"><strong>{formatRaidNumber(selectedBoss.currentHealth)} / {formatRaidNumber(selectedBoss.health)}</strong><span>{Math.round(selectedBossHealthPercent)}%</span></div>
          </div>
          <span aria-label={`Здоров’я ${selectedBoss.displayName}: ${Math.round(selectedBossHealthPercent)}%`} className="guild-raid-battle__target-hpbar"><span style={{ width: `${selectedBossHealthPercent}%` }} /></span>
        </section> : null}
        <section aria-label="Бойове поле рейду" className={`guild-raid-battle__field duel-board${clash ? " duel-board--clash" : ""}`}>
          {clash ? <BattleAttackAnimation key={clash.turnNumber} exchange={clash} /> : null}
          <div className="arena-battlefield__label"><span>ЦІЛЬ</span><span>ВИ</span></div>
          <div aria-label="Карти рейду: 3 колонки × 2 ряди" className="guild-raid-battle__card-matrix">
            <div aria-label={`Карти ${selectedBoss?.displayName ?? "відьми"}`} className="duel-card-row duel-card-row--enemy">
              {selectedCards.map((card, index) => <BattleCard card={card} clashLevel={clashSlot === index && clash ? getEffectLevel(clash.enemyMultiplier) : undefined} clashing={clashSlot === index} disabled enemy key={card.instanceId} />)}
            </div>
            <div aria-label="Множники удару" className="duel-multiplier-row guild-raid-battle__multiplier-row">
              {multipliers.map((multiplier, index) => <span className={`duel-multiplier duel-multiplier--${String(multiplier ?? "none").replace(".", "-")}`} key={index}>{multiplier === null ? "—" : `×${multiplier}`}</span>)}
            </div>
            <div aria-label="Ваші карти рейду" className="duel-card-row duel-card-row--player">
              {battle.playerActiveCards.map((card, index) => <BattleCard card={card} clashLevel={clashSlot === index && clash ? getEffectLevel(clash.playerMultiplier) : undefined} clashing={clashSlot === index} disabled={disabled} key={card.instanceId} onClick={() => onAction(index as 0 | 1 | 2)} />)}
            </div>
          </div>
        </section>
        <HpPanel currentHp={battle.playerHp} damageLevel={playerHitLevel} damageElement={clash?.enemyCard.element} hit={clash !== null} maximumHp={battle.playerMaxHp} side={playerSide} tone="player" />
      </div>
      {battle.status === "active" ? <button className="guild-raid__button guild-raid__button--green" disabled={pending} onClick={onSwap} type="button"><CurrencyIcon kind="gold" size={15} /> <span>{RAID_CARD_SWAP_GOLD}</span> <span>Змінити карти</span></button> : null}
      {visibleBattleLog.length ? <ol aria-label="Журнал бою · до 7 ходів" className="guild-raid-battle__log">
        {visibleBattleLog.map((entry) => <li className={`is-${entry.kind}`} key={entry.id}><span>{entry.text}</span>{entry.kind === "attack" ? <small>Хід {entry.turnNumber}</small> : null}</li>)}
      </ol> : null}
      {battle.status === "lost" ? <p className="guild-raid-battle__result guild-raid-battle__result--loss">Ви вибули. Рейд триває, поки живий хоч один учасник.</p> : null}
      {battle.status === "won" ? <p className="guild-raid-battle__result guild-raid-battle__result--win">Обидві відьми переможені.</p> : null}
    </section>
  );
}

function RaidReward({ participant, treasurePlayerId }: { participant: GuildRaidResultParticipantView; treasurePlayerId: string | null }) {
  if (participant.playerId === treasurePlayerId) return <span className="guild-raid-result__reward guild-raid-result__reward--card"><span>Відьмин скарб</span></span>;
  if (!participant.reward) return <span className="guild-raid-result__reward guild-raid-result__reward--empty">—</span>;
  if (participant.reward.card) {
    const card = participant.reward.card;
    return <span className="guild-raid-result__reward guild-raid-result__reward--card"><img alt="" onError={hideMissingCardArt} src={`/card-art/${card.artKey ?? card.code}.webp`} /><span>У пошті · {card.displayName ?? card.code}</span></span>;
  }
  if (participant.reward.gold > 0 || participant.reward.silver > 0) {
    return <span className="guild-raid-result__reward guild-raid-result__reward--currency"><span><CurrencyIcon kind="gold" size={15} />+{formatRaidNumber(participant.reward.gold)}</span><span><CurrencyIcon kind="silver" size={15} />+{formatRaidNumber(participant.reward.silver)}</span>{participant.reward.percentage < 100 ? <small>{participant.reward.percentage}% від базової</small> : null}</span>;
  }
  return <span className="guild-raid-result__reward guild-raid-result__reward--empty">Без нагороди</span>;
}

function RaidResult({ result, canStart, onStart, pending }: { result: GuildRaidResultView; canStart: boolean; onStart: () => void; pending: boolean }) {
  return <section aria-label="Підсумок рейду" className="guild-raid-result">
    <div className="guild-raid-result__banner"><span>Рейд завершено</span><h3>ВІДЬМИ ПЕРЕМОЖЕНІ</h3><small>Рівень {result.level} · учасників {result.participantCount}</small></div>
    <div className="guild-raid-result__summary"><span>Загальна шкода</span><strong>{formatRaidNumber(result.totalDamage)}</strong></div>
    {result.treasurePlayer ? <p className="guild-raid-lobby__hint">Доступ до відьминого скарбу отримав випадковий учасник: <strong>{result.treasurePlayer.displayName}</strong>.</p> : null}
    <ol className="guild-raid-result__standings" aria-label="Результати учасників рейду">
      {result.participants.map((participant) => <li className={participant.playerId === result.treasurePlayer?.playerId ? "is-card-winner" : ""} key={participant.playerId}>
        <LeagueBadge league={getLeagueByRating(participant.duelRating)} size="sm" />
        <span className="guild-raid-result__player"><strong>{participant.displayName}</strong><small><AppIcon name="duel" size={16} /> {formatRaidNumber(participant.damage)} шкоди</small></span>
        <RaidReward participant={participant} treasurePlayerId={result.treasurePlayer?.playerId ?? null} />
      </li>)}
    </ol>
    {canStart ? <button className="guild-raid__button guild-raid__button--green" disabled={pending} onClick={onStart} type="button">Атакувати відьом наступного рівня</button> : null}
  </section>;
}

function RaidDefeatResult({ altarLevel, bosses, leaderboard, nextLevel, participantCount, onRetry, pending }: {
  altarLevel: number;
  bosses: readonly GuildRaidBossView[];
  leaderboard: readonly GuildRaidDamageParticipantView[];
  nextLevel: number;
  participantCount: number;
  onRetry: () => void;
  pending: boolean;
}) {
  return <section aria-label="Підсумок поразки в рейді" className="guild-raid-result guild-raid-result--defeat">
    <div className="guild-raid-result__banner"><h3>ВАША КОМАНДА<br />ПЕРЕМОЖЕНА</h3></div>
    <div aria-label="Відьми рейду" className="guild-raid-result__bosses">
      {bosses[0] ? <span className="guild-raid-result__boss"><img alt={`${bosses[0].displayName}, стихія ${ELEMENT_LABELS[bosses[0].element]}`} onError={hideMissingCardArt} src={`/card-art/${bosses[0].artKey}.webp`} /></span> : <span />}
      <p>Відьми насміхаються<br />над цими магами…</p>
      {bosses[1] ? <span className="guild-raid-result__boss"><img alt={`${bosses[1].displayName}, стихія ${ELEMENT_LABELS[bosses[1].element]}`} onError={hideMissingCardArt} src={`/card-art/${bosses[1].artKey}.webp`} /></span> : <span />}
    </div>
    <div className="guild-raid-result__defeat-copy"><p>Ніхто нічого не отримав.</p><p>Поточний рівень алтаря гільдії — <strong>{altarLevel}</strong></p></div>
    <p className="guild-raid-result__leaders-title">Лідери за шкодою</p>
    <ol className="guild-raid-result__standings" aria-label="Поточний рейтинг учасників рейду">
      {leaderboard.map((participant, index) => <li key={participant.playerId}>
        <span aria-hidden="true" className="guild-raid-result__placement">{index + 1}</span>
        <LeagueBadge league={getLeagueByRating(participant.duelRating)} size="sm" />
        <span className="guild-raid-result__player"><strong>{participant.displayName}</strong></span>
        <strong className="guild-raid-result__damage"><AppIcon name="duel" size={16} /> {formatRaidNumber(participant.damage)}</strong>
      </li>)}
    </ol>
    <p className="guild-raid-result__participants">Всього учасників: {participantCount}</p>
    <p className="guild-raid-result__participants">Ви вибули. Якщо впадуть усі, рівень почнеться заново з повним здоров’ям відьом.</p>
    <figure className="guild-raid-result__battle-art"><figcaption><strong>Битви з відьмами</strong><span>Записано магів: {participantCount}</span><small>Рівень наступного івенту: {nextLevel}</small></figcaption></figure>
  </section>;
}

function formatMinutes(total: number) {
  const hours = Math.floor(total / 60);
  const minutes = Math.round(total % 60);
  return hours ? `${hours} год${minutes ? ` ${minutes} хв` : ""}` : `${minutes} хв`;
}

function formatTreasureTime(iso: string) {
  const left = Math.max(0, new Date(iso).getTime() - Date.now());
  const hours = Math.floor(left / 3_600_000);
  const minutes = Math.ceil((left % 3_600_000) / 60_000);
  return hours ? `${hours} год ${minutes} хв` : `${minutes} хв`;
}

function RaidTreasure({ raid, pending, onDecision }: { raid: GuildRaidView; pending: boolean; onDecision: (dig: boolean) => void }) {
  const treasure = raid.treasure;
  if (!treasure || treasure.status === "declined" || treasure.status === "expired") return null;
  if (treasure.status === "offered") return <section aria-label="Відьмин скарб" className="guild-raid-result__retry">
    <p><strong>{`Відьмин скарб ${treasure.level} рівня`}</strong></p>
    <p>{`Пошук триває ${formatMinutes(treasure.digMinutes)}.`}</p>
    <p>У цей час бої з відьмами закриті, а вийти з гільдії не можна.</p>
    <p>Вирішіть до кінця тижня.</p>
    <button className="guild-raid__button guild-raid__button--green" disabled={pending} onClick={() => onDecision(true)} type="button">Шукати скарб</button>
    <button className="guild-raid__button guild-raid__button--green" disabled={pending} onClick={() => onDecision(false)} type="button">Відмовитися і битися далі</button>
  </section>;
  if (treasure.status === "digging" && treasure.digEndsAt) return <p className="guild-raid-lobby__hint">{`Ви шукаєте відьмин скарб: ще ${formatTreasureTime(treasure.digEndsAt)}.`}</p>;
  if (treasure.status === "claimed" && treasure.reward) {
    const reward = treasure.reward;
    return <p className="guild-raid-battle__result guild-raid-battle__result--win">Скарб знайдено й надіслано в пошту: {reward.kind === "card" ? `карта «${reward.card.displayName ?? reward.card.code}» ${reward.card.level} рівня` : `${formatRaidNumber(reward.amount)} ${reward.kind === "gold" ? "золота" : "срібла"}`}.</p>;
  }
  return null;
}

function RaidLobby({ altarLevel, raid, pending, onEnrollment, onStart, onBattle, onTreasure }: {
  altarLevel: number;
  raid: GuildRaidView;
  pending: boolean;
  onEnrollment: () => void;
  onStart: () => void;
  onBattle: () => void;
  onTreasure: (dig: boolean) => void;
}) {
  if (!raid.unlocked) return <GuildState>Рейди на відьом відкриваються з {raid.unlockLevel} рівня гільдії. Зараз рівень гільдії — {raid.guildLevel}.</GuildState>;
  const treasurePanel = <RaidTreasure onDecision={onTreasure} pending={pending} raid={raid} />;
  const latestBattle = raid.battle?.raidLevel === raid.level ? raid.battle : null;
  const currentResult = raid.lastResult?.level === raid.level ? raid.lastResult : null;
  if (currentResult) return <>{treasurePanel}<RaidResult canStart={raid.enrollment.canStart} onStart={onStart} pending={pending} result={currentResult} /></>;
  if (latestBattle?.status === "lost" && raid.status === "active") return <RaidDefeatResult altarLevel={altarLevel} bosses={raid.bosses} leaderboard={raid.damageLeaderboard} nextLevel={raid.nextLevel} participantCount={raid.damageLeaderboard.length} onRetry={onBattle} pending={pending} />;
  return (
    <section className="guild-raid-lobby">
      <div className="guild-raid__bosses" aria-label="Дві випадкові відьми рейду">
        {raid.bosses[0] ? <RaidBossPreview boss={raid.bosses[0]} side="left" /> : null}
        <strong>{raid.name}</strong>
        {raid.bosses[1] ? <RaidBossPreview boss={raid.bosses[1]} side="right" /> : null}
      </div>
      <p className="guild-raid-lobby__participants">Записано учасників: <strong>{raid.enrollment.participantCount}</strong></p>
      {treasurePanel}
      {latestBattle?.status === "won" ? <p className="guild-raid-battle__result guild-raid-battle__result--win">Відьми цього рівня переможені. Івент готовий до нового бою.</p> : null}

      {raid.status === "open" && raid.enrollment.enrolled ? <button className="guild-raid__button guild-raid__button--green" disabled={pending} onClick={onEnrollment} type="button">Вийти із запису</button> : null}
      {raid.status === "open" && !raid.enrollment.enrolled ? <button className="guild-raid__button guild-raid__button--green" disabled={pending} onClick={onEnrollment} type="button">Записатися в рейд</button> : null}
      {raid.status === "open" && raid.enrollment.canStart ? <button className="guild-raid__button guild-raid__button--green" disabled={pending} onClick={onStart} type="button">Відкрити рейд</button> : null}
      {raid.status === "open" && raid.enrollment.enrolled && !raid.enrollment.canStart ? <p className="guild-raid-lobby__hint">Чекаємо, поки рейд-лідер — найстарший за званням серед записаних — відкриє рейд.</p> : null}
      {raid.status === "active" && latestBattle?.status !== "active" && latestBattle?.status !== "lost" && raid.enrollment.enrolled ? <button className="guild-raid__button guild-raid__button--green" disabled={pending} onClick={onBattle} type="button">Почати свій бій</button> : null}
      {raid.status === "active" && !raid.enrollment.enrolled ? <button className="guild-raid__button guild-raid__button--green" disabled={pending} onClick={onEnrollment} type="button">Записатися в рейд</button> : null}
    </section>
  );
}

function RaidBossPreview({ boss, side }: { boss: GuildRaidBossView; side: "left" | "right" }) {
  return <div className="guild-raid__boss" data-element={boss.element}><span className={`guild-raid__portrait guild-raid__portrait--${side}`}><ElementArt alt={`${boss.displayName}, стихія ${ELEMENT_LABELS[boss.element]}`} cardId={boss.cardId} element={boss.element} src={`/card-art/${boss.artKey}.webp`} /></span><strong className={`guild-raid__boss-name guild-raid__boss-name--${boss.element}`}>{boss.displayName}</strong></div>;
}

export function GuildRaidScreen({ profile, onRaids, onMembers, onForum, onDirectory }: GuildRaidScreenProps) {
  const { guild } = profile;
  const [raidState, setRaidState] = useState<{ status: "loading" | "ready" | "error"; data?: GuildRaidView; message?: string }>({ status: "loading" });
  const [pending, setPending] = useState(false);
  const [targetBossSlot, setTargetBossSlot] = useState<1 | 2>(1);
  const activeBattleIdRef = useRef<string | null>(null);
  const [notice, setNotice] = useState("Рейд готується до запису.");

  function applyRaid(data: GuildRaidView) {
    setRaidState({ status: "ready", data });
    const battleId = data.battle?.battleId ?? null;
    const selectedBoss = data.bosses[targetBossSlot - 1];
    const preferredBossSlot = data.battle?.targetBossSlot ?? targetBossSlot;
    const preferredBoss = data.bosses[preferredBossSlot - 1];
    const nextLivingBossSlot = data.bosses.findIndex((boss) => boss.currentHealth > 0);
    if (battleId !== activeBattleIdRef.current || selectedBoss?.currentHealth <= 0) {
      activeBattleIdRef.current = battleId;
      setTargetBossSlot(preferredBoss?.currentHealth > 0
        ? preferredBossSlot
        : nextLivingBossSlot >= 0 ? (nextLivingBossSlot + 1) as 1 | 2 : preferredBossSlot);
    }
    const currentBattle = data.battle?.raidLevel === data.level ? data.battle : null;
    if (currentBattle?.status === "won") setNotice("Відьми цього рівня переможені. Можна відкривати новий бій.");
    else if (currentBattle?.status === "lost") setNotice("Ви вибули. Рейд триває, поки живий хоч один учасник.");
    else if (data.status === "active" && currentBattle?.status === "active") setNotice("Бій триває. Оберіть карту й ціль.");
    else if (data.status === "active") setNotice("Рейд відкрито. Учасники можуть приєднатися та почати свої бої.");
    else if (data.enrollment.enrolled) setNotice(data.enrollment.canStart ? "Ви рейд-лідер. Можна відкрити рейд." : "Ви записані. Дочекайтеся, поки рейд-лідер відкриє рейд.");
    else setNotice("Рейд готовий до запису.");
  }

  async function reload(initial = false) {
    if (initial) setRaidState({ status: "loading" });
    try {
      applyRaid(await loadGuildRaid(guild.id));
    } catch (error: unknown) {
      setRaidState({ status: "error", message: guildErrorMessage(error) });
    }
  }

  useEffect(() => {
    void reload(true);
  }, [guild.id]);

  const raid = raidState.data;
  useEffect(() => {
    if (!raid || (raid.status !== "active" && !(raid.status === "open" && raid.enrollment.enrolled)) || raid.lastResult?.level === raid.level) return;
    const timer = window.setInterval(() => { void reload(); }, 1_200);
    return () => window.clearInterval(timer);
  }, [raid?.id, raid?.status, raid?.battle?.status, raid?.enrollment.enrolled, guild.id]);

  async function perform(kind: string, operation: () => Promise<GuildRaidView>) {
    if (pending) return;
    setPending(true);
    try {
      applyRaid(await operation());
    } catch (error: unknown) {
      setNotice(guildErrorMessage(error));
      if (kind === "action") await reload();
    } finally {
      setPending(false);
    }
  }

  function toggleEnrollment() {
    if (!raid) return;
    void perform("enrollment", () => raid.enrollment.enrolled ? leaveGuildRaid(guild.id) : enrollGuildRaid(guild.id));
  }

  function openRaid() {
    void perform("start", () => startGuildRaid(guild.id));
  }

  function startBattle() {
    void perform("battle", () => startGuildRaidBattle(guild.id));
  }

  function attack(slotIndex: 0 | 1 | 2) {
    if (!raid?.battle || raid.battle.status !== "active") return;
    void perform("action", () => submitGuildRaidAction(guild.id, raid.battle!.battleId, {
      bossSlot: targetBossSlot,
      expectedVersion: raid.battle!.version,
      slotIndex,
    }));
  }

  function swapCards() {
    if (!raid?.battle || raid.battle.status !== "active") return;
    void perform("action", () => swapGuildRaidCards(guild.id, raid.battle!.battleId, raid.battle!.version));
  }

  function decideTreasure(dig: boolean) {
    if (!raid?.treasure) return;
    void perform("treasure", () => decideGuildRaidTreasure(guild.id, raid.treasure!.id, dig));
  }

  const currentBattle = raid && raid.battle?.raidLevel === raid.level ? raid.battle : null;
  const currentResult = raid && raid.lastResult?.level === raid.level ? raid.lastResult : null;
  const battleFinished = Boolean(currentBattle && (currentBattle.status !== "active" || raid?.status !== "active"));
  const resultReady = useBattleResultReady(currentBattle?.status === "active" && raid?.status === "active", battleFinished, currentBattle?.status === "won" ? "win" : currentBattle?.status === "lost" ? "loss" : null);
  const battleVisible = Boolean(currentBattle) && !resultReady;
  const resultVisible = Boolean(currentResult || currentBattle?.status === "lost");
  return <section className="guild-raid" aria-labelledby="guild-raid-title" data-raid-id={raid?.id}>
    <div className="guild-section-bar guild-raid__title"><h2 id="guild-raid-title">{raid ? `Рейди на відьом · ${raid.level} рівень` : "Рейди на відьом"}</h2></div>

    {raidState.status === "loading" ? <GuildState>Завантаження рейду…</GuildState> : raidState.status === "error" || !raid ? <GuildState error onRetry={() => void reload(true)}>{raidState.message ?? "Рейд тимчасово недоступний."}</GuildState> : battleVisible ? <RaidBattle raid={raid} pending={pending} playerLevel={profile.viewer.member?.level ?? 1} playerName={profile.viewer.member?.displayName ?? "Ви"} playerPhotoUrl={profile.viewer.member?.photoUrl ?? null} targetBossSlot={targetBossSlot} onAction={attack} onSwap={swapCards} onTargetChange={setTargetBossSlot} /> : <RaidLobby altarLevel={profile.altar.currentLevel} onBattle={startBattle} onEnrollment={toggleEnrollment} onStart={openRaid} onTreasure={decideTreasure} pending={pending} raid={raid} />}

    {!battleVisible && !resultVisible ? <GameChat inputLabel="Повідомлення в чат рейду" load={(_initData, signal) => loadGuildRaidChat(guild.id, "witches", signal)} send={(_initData, body) => sendGuildRaidChatMessage(guild.id, "witches", body)} signInNotice="Увійдіть у гру, щоб переглянути чат рейду." title="Чат рейду" unavailableNotice="Чат рейду тимчасово недоступний." /> : null}

    {raidState.status === "ready" ? <p className="guild-raid__status" role="status">{notice}</p> : null}
    {!battleVisible && !resultVisible ? <div className="guild-raid__menu guild-menu-list" aria-label="Розділи гільдії">{onRaids ? <MenuRow compact icon="guild" metalTexture onClick={onRaids} title="Рейди гільдії" /> : null}<MenuRow compact detail={`${guild.memberCount} / ${guild.memberCapacity}`} icon="profile" metalTexture onClick={onMembers} title="Склад" /><MenuRow compact icon="collection" metalTexture onClick={onForum} title="Форум гільдії" /><MenuRow compact icon="ranking" metalTexture onClick={onDirectory} title="Найкращі гільдії" /></div> : null}
  </section>;
}
