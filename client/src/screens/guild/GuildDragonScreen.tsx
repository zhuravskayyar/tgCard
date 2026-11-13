import { useEffect, useState } from "react";
import type { GuildDragonLairView, GuildDragonRaidListView, GuildDragonRaidView, GuildProfileResponse } from "@cardastika/shared";
import { getElementMultiplier, RAID_CARD_SWAP_GOLD } from "@cardastika/game-core";
import { useCardArtworkSource } from "../../components/cardArtSource";
import { useBattleExchange, useBattleResultReady } from "../../components/useBattlePresentation";
import { BattleAttackAnimation } from "../../components/BattleAttackAnimation";
import { CurrencyIcon } from "../../components/CurrencyDisplay";
import { MenuRow } from "../../components/MenuRow";
import { ElementArt } from "../../components/ElementAura";
import { GameChat } from "../../components/GameChat";
import { formatUiNumber } from "../../i18n";
import { BattleCard, getEffectLevel, HpPanel } from "../DuelScreen";
import {
  enrollGuildDragonRaid,
  loadGuildRaidChat,
  sendGuildRaidChatMessage,
  leaveGuildDragonRaid,
  loadGuildDragonLairs,
  loadGuildDragonRaid,
  startGuildDragonBattle,
  startGuildDragonRaid,
  submitGuildDragonAction,
  swapGuildDragonCards,
  upgradeGuildDragonLair,
} from "../../telegram/guild";
import { ELEMENT_LABELS, GuildState, guildErrorMessage } from "./GuildUi";
import { toRaidDuelExchange } from "./GuildRaidScreen";


function formatHours(hours: number) {
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return days ? `${days} д ${rest} год` : `${rest} год`;
}

function formatUntil(iso: string) {
  const left = Math.max(0, new Date(iso).getTime() - Date.now());
  const hours = Math.floor(left / 3_600_000);
  const minutes = Math.floor((left % 3_600_000) / 60_000);
  return hours >= 24 ? formatHours(hours) : `${hours} год ${minutes} хв`;
}

function lairStatus(lair: GuildDragonLairView) {
  if (lair.status === "active") return `Бій триває · ${lair.participantCount} у бою`;
  if (lair.participantCount) return `Записалося магів: ${lair.participantCount}`;
  return "Поки ніхто не записався.";
}

function LairCard({ lair, pending, onOpen, onEnroll }: { lair: GuildDragonLairView; pending: boolean; onOpen: () => void; onEnroll: () => void }) {
  const art = useCardArtworkSource(lair.dragon.artKey, lair.dragon.cardId);
  return <article className="guild-altar-upgrade">
    <span className="guild-altar-upgrade__art">{art.source ? <img alt={lair.dragon.displayName} onError={art.onSourceError} src={art.source} /> : null}</span>
    <div className="guild-altar-upgrade__body">
      <div className="guild-altar-upgrade__heading"><h4>{lair.lairName}</h4><small>{`Рівень: ${lair.lairLevel}`}</small></div>
      <p>{lair.dragon.displayName}</p>
      <p>{lairStatus(lair)}</p>
      {lair.viewerEnrolled
        ? <button className="guild-altar__buy" disabled={pending} onClick={onOpen} type="button">До рейду</button>
        : lair.viewerAvailableAt
          ? <button className="guild-altar__buy" disabled type="button">{`Відродиться за ${formatUntil(lair.viewerAvailableAt)}`}</button>
          : <button className="guild-altar__buy" disabled={pending} onClick={onEnroll} type="button">Записатися на рейд</button>}
    </div>
  </article>;
}

function DragonPortrait({ lair, lobby = false }: { lair: GuildDragonLairView; lobby?: boolean }) {
  const art = useCardArtworkSource(lair.dragon.artKey, lair.dragon.cardId);
  return <span className={lobby ? "guild-raid__portrait guild-raid__portrait--left" : "guild-raid__portrait guild-raid-battle__target-portrait"}>
    {art.source ? lobby
      ? <ElementArt alt={`${lair.dragon.displayName}, стихія ${ELEMENT_LABELS[lair.dragon.element]}`} cardId={lair.dragon.cardId} element={lair.dragon.element} onError={art.onSourceError} src={art.source} />
      : <img alt={`${lair.dragon.displayName}, стихія ${ELEMENT_LABELS[lair.dragon.element]}`} onError={art.onSourceError} src={art.source} /> : null}
  </span>;
}

function DragonHealth({ lair }: { lair: GuildDragonLairView }) {
  const percent = lair.health > 0 ? Math.max(0, Math.min(100, lair.currentHealth / lair.health * 100)) : 0;
  return <section className="guild-raid-battle__target-panel">
    <div className="guild-raid-battle__target-header">
      <div className="guild-raid-battle__target-identity">
        <DragonPortrait lair={lair} />
        <div><strong className={`guild-raid__boss-name guild-raid__boss-name--${lair.dragon.element}`}>{lair.dragon.displayName}</strong></div>
      </div>
      <div className="guild-raid-battle__target-hp"><strong>{formatUiNumber(lair.currentHealth)} / {formatUiNumber(lair.health)}</strong><span>{Math.round(percent)}%</span></div>
    </div>
    <span aria-label={`Здоров’я змія: ${Math.round(percent)}%`} className="guild-raid-battle__target-hpbar"><span style={{ width: `${percent}%` }} /></span>
  </section>;
}

function DragonBattle({ raid, pending, playerName, playerLevel, playerPhotoUrl, onAction, onSwap }: {
  raid: GuildDragonRaidView;
  pending: boolean;
  playerName: string;
  playerLevel: number;
  playerPhotoUrl: string | null;
  onAction: (slot: 0 | 1 | 2) => void;
  onSwap: () => void;
}) {
  const battle = raid.battle!;
  const latestAttack = battle.battleLog.find((entry) => entry.kind === "attack");
  const clash = useBattleExchange(latestAttack ? toRaidDuelExchange(latestAttack) : null, latestAttack?.id);
  const disabled = clash !== null || pending || battle.status !== "active";
  const clashSlot = clash?.slotIndex ?? null;
  const multipliers = battle.playerActiveCards.map((card, index) => {
    const enemy = battle.dragonActiveCards[index];
    return enemy ? getElementMultiplier(card.element, enemy.element) : null;
  });
  const playerHitLevel = clash ? getEffectLevel(clash.enemyMultiplier) : "normal";
  return <section aria-label="Бій зі змієм" className={`guild-raid-battle${clash ? " is-clashing" : ""}`}>
    <header className="guild-raid-battle__header">
      <span>Бій · хід {battle.turnNumber}</span>
      <strong>{raid.lair.lairName}</strong>
    </header>
    <div className="guild-raid-battle__stage">
      <DragonHealth lair={raid.lair} />
      <section aria-label="Бойове поле" className={`guild-raid-battle__field duel-board${clash ? " duel-board--clash" : ""}`}>
        {clash ? <BattleAttackAnimation key={clash.turnNumber} exchange={clash} /> : null}
        <div className="arena-battlefield__label"><span>ЗМІЙ</span><span>ВИ</span></div>
        <div className="guild-raid-battle__card-matrix">
          <div aria-label="Карти змія" className="duel-card-row duel-card-row--enemy">
            {battle.dragonActiveCards.map((card, index) => <BattleCard card={card} clashLevel={clashSlot === index && clash ? getEffectLevel(clash.enemyMultiplier) : undefined} clashing={clashSlot === index} disabled enemy key={card.instanceId} />)}
          </div>
          <div aria-label="Множники удару" className="duel-multiplier-row guild-raid-battle__multiplier-row">
            {multipliers.map((multiplier, index) => <span className={`duel-multiplier duel-multiplier--${String(multiplier ?? "none").replace(".", "-")}`} key={index}>{multiplier === null ? "—" : `×${multiplier}`}</span>)}
          </div>
          <div aria-label="Ваші карти" className="duel-card-row duel-card-row--player">
            {battle.playerActiveCards.map((card, index) => <BattleCard card={card} clashLevel={clashSlot === index && clash ? getEffectLevel(clash.playerMultiplier) : undefined} clashing={clashSlot === index} disabled={disabled} key={card.instanceId} onClick={() => onAction(index as 0 | 1 | 2)} />)}
          </div>
        </div>
      </section>
      <HpPanel currentHp={battle.playerHp} damageElement={clash?.enemyCard.element} damageLevel={playerHitLevel} hit={clash !== null} maximumHp={battle.playerMaxHp} side={{ name: playerName, level: playerLevel, photoUrl: playerPhotoUrl }} tone="player" />
    </div>
    {battle.status === "active" ? <button className="guild-raid__button guild-raid__button--green" disabled={pending} onClick={onSwap} type="button"><CurrencyIcon kind="gold" size={15} /> <span>{RAID_CARD_SWAP_GOLD}</span> <span>Змінити карти</span></button> : null}
    <p className="guild-raid-lobby__hint">{`Подих змія раз на 30 с: −${formatUiNumber(raid.breathDamage)} HP на всіх живих.`}</p>
    {battle.battleLog.length ? <ol aria-label="Журнал бою · останні 5 подій" className="guild-raid-battle__log">
      {battle.battleLog.map((entry) => <li className={`is-${entry.kind === "breath" ? "curse" : entry.kind}`} key={entry.id}><span>{entry.text}</span>{entry.kind === "attack" ? <small>Хід {entry.turnNumber}</small> : null}</li>)}
    </ol> : null}
    {battle.status === "lost" ? <p className="guild-raid-battle__result guild-raid-battle__result--loss">Ви вибули. Рейд триває, поки живий хоч один учасник.</p> : null}
  </section>;
}

function DragonLair({ raid, list, pending, onEnroll, onStart, onBattle, onUpgrade }: {
  raid: GuildDragonRaidView;
  list: GuildDragonRaidListView | null;
  pending: boolean;
  onEnroll: () => void;
  onStart: () => void;
  onBattle: () => void;
  onUpgrade: () => void;
}) {
  const { lair, enrollment, lastResult } = raid;
  const upgrade = lair.nextUpgrade;
  return <section className="guild-raid-lobby">
    <div aria-label="Змій лігва" className="guild-raid__bosses guild-raid__bosses--single">
      <strong>{lair.lairName}</strong>
      <div className="guild-raid__boss" data-element={lair.dragon.element}><DragonPortrait lair={lair} lobby /><strong className={`guild-raid__boss-name guild-raid__boss-name--${lair.dragon.element}`}>{lair.dragon.displayName}</strong><small>{formatUiNumber(lair.currentHealth)} / {formatUiNumber(lair.health)} HP</small></div>
    </div>
    <p className="guild-raid-lobby__participants">Записано учасників: <strong>{enrollment.participantCount}</strong></p>
    <p className="guild-raid-lobby__hint">{`Відродження змія: ${formatHours(lair.respawnHours)}`}</p>
    <p className="guild-raid-lobby__hint">{`Переможено зміїв: ${formatUiNumber(lair.defeatedCount)}`}</p>
    {lair.viewerAvailableAt ? <p className="guild-raid-lobby__hint">{`Цей змій відродиться для вас за ${formatUntil(lair.viewerAvailableAt)}.`}</p> : null}
    {lair.status === "open" && !lair.viewerAvailableAt ? <button className="guild-raid__button guild-raid__button--green" disabled={pending} onClick={onEnroll} type="button">{enrollment.enrolled ? "Вийти із запису" : "Записатися в рейд"}</button> : null}
    {lair.status === "open" && enrollment.canStart ? <button className="guild-raid__button guild-raid__button--green" disabled={pending} onClick={onStart} type="button">Відкрити рейд</button> : null}
    {lair.status === "open" && enrollment.enrolled && !enrollment.canStart ? <p className="guild-raid-lobby__hint">Рейд відкриває найстарший за званням серед записаних.</p> : null}
    {lair.status === "active" && !enrollment.enrolled && !lair.viewerAvailableAt ? <button className="guild-raid__button guild-raid__button--green" disabled={pending} onClick={onEnroll} type="button">Приєднатися до рейду</button> : null}
    {lair.status === "active" && raid.battle?.status === "lost" ? <p className="guild-raid-battle__result guild-raid-battle__result--loss">Ви вибули. Рейд триває, поки живий хоч один учасник.</p> : null}
    {lair.status === "active" && enrollment.enrolled && !raid.battle ? <button className="guild-raid__button guild-raid__button--green" disabled={pending} onClick={onBattle} type="button">Почати свій бій</button> : null}
    {raid.participants.length ? <ol aria-label="Учасники рейду" className="guild-raid-result__standings">
      {raid.participants.map((participant, index) => <li className={participant.alive ? "" : "is-defeated"} key={participant.playerId}>
        <span aria-hidden="true" className="guild-raid-result__placement">{index + 1}</span>
        <span className="guild-raid-result__player"><strong>{participant.displayName}</strong><small>{`Очки змієборця: ${formatUiNumber(participant.slayerPoints)}${participant.alive ? "" : " · вибув"}`}</small></span>
        <strong className="guild-raid-result__damage">{formatUiNumber(participant.damage)}</strong>
      </li>)}
    </ol> : null}
    {lastResult ? <p className={`guild-raid-battle__result guild-raid-battle__result--${lastResult.outcome === "won" ? "win" : "loss"}`}>
      {lastResult.outcome === "won"
        ? `Минулий рейд виграно. Карту «${lastResult.winner?.card.displayName ?? lair.dragon.displayName}» отримав ${lastResult.winner?.displayName ?? "—"}.`
        : `Минулий рейд програно. Рейд-лідер: ${lastResult.leaderName ?? "—"}.`}
    </p> : null}
    {list?.canUpgrade && upgrade ? <div className="guild-raid__menu guild-menu-list guild-dragon-lairs">
      <MenuRow actionContent={<span className="menu-row__detail"><CurrencyIcon kind={upgrade.currency} size={14} /> {formatUiNumber(upgrade.amount)}</span>} compact disabled={pending || !upgrade.allowed} icon="guild" onClick={onUpgrade} subtitle={upgrade.allowed ? "Швидше відродження" : "Не вище за рівень гільдії"} title={`Покращити до ${upgrade.level} рівня`} />
    </div> : null}
  </section>;
}

export function GuildDragonScreen({ profile, onBack }: { profile: GuildProfileResponse; onBack: () => void }) {
  const [rankingOpen, setRankingOpen] = useState(false);
  const guildId = profile.guild.id;
  const [list, setList] = useState<{ status: "loading" | "ready" | "error"; data?: GuildDragonRaidListView; message?: string }>({ status: "loading" });
  const [lairCode, setLairCode] = useState<string | null>(null);
  const [raid, setRaid] = useState<GuildDragonRaidView | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function reloadList() {
    try {
      setList({ status: "ready", data: await loadGuildDragonLairs(guildId) });
    } catch (error) {
      setList({ status: "error", message: guildErrorMessage(error) });
    }
  }

  async function reloadRaid(code: string) {
    try {
      setRaid(await loadGuildDragonRaid(guildId, code));
    } catch (error) {
      setNotice(guildErrorMessage(error));
    }
  }

  useEffect(() => { void reloadList(); }, [guildId]);
  useEffect(() => {
    if (!lairCode) return;
    void reloadRaid(lairCode);
  }, [lairCode]);
  // Poll while the raid runs, and while the viewer waits in the sign-up for the leader to open it.
  const shouldPoll = Boolean(lairCode && raid && (raid.lair.status === "active" || raid.enrollment.enrolled));
  useEffect(() => {
    if (!lairCode || !shouldPoll) return;
    const timer = window.setInterval(() => { void reloadRaid(lairCode); }, 1_500);
    return () => window.clearInterval(timer);
  }, [lairCode, shouldPoll]);

  async function perform(operation: () => Promise<GuildDragonRaidView>) {
    if (pending) return;
    setPending(true);
    setNotice(null);
    try {
      setRaid(await operation());
    } catch (error) {
      setNotice(guildErrorMessage(error));
      if (lairCode) await reloadRaid(lairCode);
    } finally {
      setPending(false);
    }
  }

  async function enrollFromList(code: string) {
    if (pending) return;
    setPending(true);
    setNotice(null);
    try {
      setRaid(await enrollGuildDragonRaid(guildId, code));
      setLairCode(code);
    } catch (error) {
      setNotice(guildErrorMessage(error));
    } finally {
      setPending(false);
    }
  }

  function back() {
    if (rankingOpen) {
      setRankingOpen(false);
      return;
    }
    if (lairCode) {
      setLairCode(null);
      setRaid(null);
      setNotice(null);
      void reloadList();
      return;
    }
    onBack();
  }

  async function upgrade() {
    if (!lairCode || pending) return;
    setPending(true);
    try {
      setList({ status: "ready", data: await upgradeGuildDragonLair(guildId, lairCode) });
      await reloadRaid(lairCode);
    } catch (error) {
      setNotice(guildErrorMessage(error));
    } finally {
      setPending(false);
    }
  }

  const listData = list.data ?? null;
  const title = rankingOpen ? "Рейтинг змієборців" : lairCode && raid ? `${raid.lair.lairName} · ${raid.lair.lairLevel} рівень` : "Рейди на зміїв";
  const member = profile.viewer.member;
  const battle = raid?.battle ?? null;
  const battleFinished = Boolean(battle && battle.status !== "active");
  // The last strike plays to the end before the lobby with the result comes back.
  const resultReady = useBattleResultReady(battle?.status === "active", battleFinished, battle?.status === "won" ? "win" : battle?.status === "lost" ? "loss" : null);
  const battleVisible = Boolean(battle) && !resultReady;
  return <section className="guild-raid" aria-labelledby="guild-dragon-title">
    <div className="guild-section-bar guild-raid__title"><h2 id="guild-dragon-title">{title}</h2></div>
    {rankingOpen && listData ? <section className="guild-raid-lobby">
      {listData.ranking.length ? <ol aria-label="Рейтинг змієборців" className="guild-raid-result__standings">
        {listData.ranking.map((row, index) => <li key={row.playerId}>
          <span aria-hidden="true" className="guild-raid-result__placement">{index + 1}</span>
          <span className="guild-raid-result__player"><strong>{row.displayName}</strong></span>
          <strong className="guild-raid-result__damage">{formatUiNumber(row.points)}</strong>
        </li>)}
      </ol> : <p className="guild-raid-lobby__hint">Очок змієборця ще ні в кого немає.</p>}
    </section> : !lairCode ? list.status === "loading" ? <GuildState>Завантаження лігв…</GuildState> : list.status === "error" || !listData ? <GuildState error onRetry={() => void reloadList()}>{list.message ?? "Лігва тимчасово недоступні."}</GuildState> : <>
      <p className="guild-raid-lobby__participants">{`Ваші очки змієборця: ${formatUiNumber(listData.slayerPoints)}`}</p>
      {listData.canUpgrade ? <p className="guild-raid-lobby__hint"><span>Казна гільдії:</span> <CurrencyIcon kind="gold" size={14} /> {formatUiNumber(listData.treasury.gold)} <CurrencyIcon kind="silver" size={14} /> {formatUiNumber(listData.treasury.silver)}</p> : null}
      {(["ancient", "rare"] as const).map((kind) => <section aria-label={kind === "ancient" ? "Старі змії" : "Рідкісні змії"} className="guild-menu-section" key={kind}>
        <h3 className="guild-raid-result__leaders-title">{kind === "ancient" ? "Старі змії" : "Рідкісні змії"} · {formatUiNumber(listData.lairs.find((lair) => lair.kind === kind)?.health ?? 0)} HP</h3>
        <div className="guild-altar guild-altar__upgrades">
          {listData.lairs.filter((lair) => lair.kind === kind).map((lair) => <LairCard key={lair.code} lair={lair} onEnroll={() => { void enrollFromList(lair.code); }} onOpen={() => setLairCode(lair.code)} pending={pending} />)}
        </div>
      </section>)}
    </> : !raid ? <GuildState>Завантаження лігва…</GuildState> : battleVisible ? <DragonBattle onAction={(slot) => { void perform(() => submitGuildDragonAction(guildId, lairCode, raid.battle!.battleId, { expectedVersion: raid.battle!.version, slotIndex: slot })); }} onSwap={() => { void perform(() => swapGuildDragonCards(guildId, lairCode, raid.battle!.battleId, raid.battle!.version)); }} pending={pending} playerLevel={member?.level ?? 1} playerName={member?.displayName ?? "Ви"} playerPhotoUrl={member?.photoUrl ?? null} raid={raid} /> : <DragonLair list={listData} onBattle={() => { void perform(() => startGuildDragonBattle(guildId, lairCode)); }} onEnroll={() => { void perform(() => raid.enrollment.enrolled && raid.lair.status === "open" ? leaveGuildDragonRaid(guildId, lairCode) : enrollGuildDragonRaid(guildId, lairCode)); }} onStart={() => { void perform(() => startGuildDragonRaid(guildId, lairCode)); }} onUpgrade={() => { void upgrade(); }} pending={pending} raid={raid} />}
    {lairCode && raid && !battleVisible && !rankingOpen ? <GameChat inputLabel="Повідомлення в чат лігва" key={lairCode} load={(_initData, signal) => loadGuildRaidChat(guildId, lairCode, signal)} send={(_initData, body) => sendGuildRaidChatMessage(guildId, lairCode, body)} signInNotice="Увійдіть у гру, щоб переглянути чат лігва." title="Чат лігва" unavailableNotice="Чат лігва тимчасово недоступний." /> : null}
    {notice ? <p className="guild-raid__status" role="status">{notice}</p> : null}
    {!battleVisible ? <div className="guild-raid__menu guild-menu-list" aria-label="Розділи рейдів">
      {lairCode || rankingOpen ? <MenuRow compact icon="campaign" onClick={back} title="Усі лігва" /> : <MenuRow compact icon="ranking" onClick={() => setRankingOpen(true)} title="Рейтинг змієборців" />}
      <MenuRow compact icon="guild" onClick={onBack} title="Рейди гільдії" />
    </div> : null}
  </section>;
}
