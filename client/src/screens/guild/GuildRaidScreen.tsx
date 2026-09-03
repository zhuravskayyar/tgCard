import { useEffect, useRef, useState, type FormEvent } from "react";
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
import { getDuelLogVisualState, getElementMultiplier } from "@cardastika/game-core";
import { getLeagueByRating } from "@cardastika/shared";
import { AppIcon } from "../../components/AppIcon";
import { CurrencyIcon } from "../../components/CurrencyDisplay";
import { LeagueBadge } from "../../components/LeagueBadge";
import { BattleCard, DuelClashOverlay, DuelFlyingCard, getEffectLevel, getImpactLevel, HpPanel } from "../DuelScreen";
import { MenuRow } from "../../components/MenuRow";
import {
  enrollGuildRaid,
  leaveGuildRaid,
  loadGuildRaid,
  startGuildRaid,
  startGuildRaidBattle,
  submitGuildRaidAction,
} from "../../telegram/guild";
import { ELEMENT_LABELS, GuildState, guildErrorMessage } from "./GuildUi";

interface GuildRaidScreenProps {
  profile: GuildProfileResponse;
  onMembers: () => void;
  onForum: () => void;
  onDirectory: () => void;
}

interface RaidChatMessage {
  id: number;
  body: string;
}

function formatRaidNumber(value: number) {
  return new Intl.NumberFormat("uk-UA").format(value);
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
  return (
    <button aria-pressed={selected} className={`guild-raid-battle__boss-select${selected ? " is-selected" : ""}`} disabled={disabled} onClick={onSelect} type="button">
      <span className="guild-raid__portrait">
        <img alt={`${boss.displayName}, стихія ${ELEMENT_LABELS[boss.element]}`} src={`/card-art/${boss.artKey}.png`} />
      </span>
      <strong className={`guild-raid__boss-name guild-raid__boss-name--${boss.element}`}>{boss.displayName}</strong>
      <span className="guild-raid-battle__boss-hp">{formatRaidNumber(boss.currentHealth)} / {formatRaidNumber(boss.health)}</span>
      <span aria-label={`Здоров’я ${boss.displayName}: ${Math.round(healthPercent)}%`} className="guild-raid-battle__hpbar"><span style={{ width: `${healthPercent}%` }} /></span>
      <small>{selected ? "Обрана ціль" : `Відьма ${slot}`}</small>
    </button>
  );
}

function RaidBattle({ raid, playerName, playerLevel, playerPhotoUrl, pending, targetBossSlot, onTargetChange, onAction }: {
  raid: GuildRaidView;
  playerName: string;
  playerLevel: number;
  playerPhotoUrl: string | null;
  pending: boolean;
  targetBossSlot: 1 | 2;
  onTargetChange: (slot: 1 | 2) => void;
  onAction: (slot: 0 | 1 | 2) => void;
}) {
  const battle = raid.battle;
  const [clash, setClash] = useState<DuelExchange | null>(null);
  const lastLogIdRef = useRef(battle?.battleLog[0]?.id ?? null);
  const disabled = pending || battle?.status !== "active";

  useEffect(() => {
    const latest = battle?.battleLog[0];
    if (!latest || latest.id === lastLogIdRef.current) return;
    lastLogIdRef.current = latest.id;
    const exchange = toDuelExchange(latest);
    if (!exchange) return;
    setClash(exchange);
    const timer = window.setTimeout(() => setClash(null), 900);
    return () => window.clearTimeout(timer);
  }, [battle?.battleLog]);

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
  const clashImpactLevel = getImpactLevel(enemyHitLevel, playerHitLevel);
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
                <img alt={`${selectedBoss.displayName}, стихія ${ELEMENT_LABELS[selectedBoss.element]}`} src={`/card-art/${selectedBoss.artKey}.png`} />
              </span>
              <div><strong className={`guild-raid__boss-name guild-raid__boss-name--${selectedBoss.element}`}>{selectedBoss.displayName}</strong></div>
            </div>
            <div className="guild-raid-battle__target-hp"><strong>{formatRaidNumber(selectedBoss.currentHealth)} / {formatRaidNumber(selectedBoss.health)}</strong><span>{Math.round(selectedBossHealthPercent)}%</span></div>
          </div>
          <span aria-label={`Здоров’я ${selectedBoss.displayName}: ${Math.round(selectedBossHealthPercent)}%`} className="guild-raid-battle__target-hpbar"><span style={{ width: `${selectedBossHealthPercent}%` }} /></span>
        </section> : null}
        <section aria-label="Бойове поле івенту" className={`guild-raid-battle__field duel-board${clash ? " duel-board--clash" : ""}`}>
          {clash ? <div aria-hidden="true" className="duel-flight-layer">
            <DuelFlyingCard card={clash.playerCard} impactLevel={clashImpactLevel} side="player" slotIndex={clash.slotIndex} />
            <DuelFlyingCard card={clash.enemyCard} impactLevel={clashImpactLevel} side="enemy" slotIndex={clash.slotIndex} />
          </div> : null}
          {clash ? <DuelClashOverlay exchange={clash} /> : null}
          <div className="arena-battlefield__label"><span>ЦІЛЬ</span><span>ВИ</span></div>
          <div aria-label="Карти івенту: 3 колонки × 2 ряди" className="guild-raid-battle__card-matrix">
            <div aria-label={`Карти ${selectedBoss?.displayName ?? "відьми"}`} className="duel-card-row duel-card-row--enemy">
              {selectedCards.map((card, index) => <BattleCard card={card} clashLevel={clashSlot === index && clash ? getEffectLevel(clash.enemyMultiplier) : undefined} clashing={clashSlot === index} disabled enemy key={card.instanceId} />)}
            </div>
            <div aria-label="Множники удару" className="duel-multiplier-row guild-raid-battle__multiplier-row">
              {multipliers.map((multiplier, index) => <span className={`duel-multiplier duel-multiplier--${String(multiplier ?? "none").replace(".", "-")}`} key={index}>{multiplier === null ? "—" : `×${multiplier}`}</span>)}
            </div>
            <div aria-label="Ваші карти івенту" className="duel-card-row duel-card-row--player">
              {battle.playerActiveCards.map((card, index) => <BattleCard card={card} clashLevel={clashSlot === index && clash ? getEffectLevel(clash.playerMultiplier) : undefined} clashing={clashSlot === index} disabled={disabled} key={card.instanceId} onClick={() => onAction(index as 0 | 1 | 2)} />)}
            </div>
          </div>
        </section>
        <HpPanel currentHp={battle.playerHp} damageLevel={playerHitLevel} damageElement={clash?.enemyCard.element} hit={clash !== null} maximumHp={battle.playerMaxHp} side={playerSide} tone="player" />
      </div>
      {visibleBattleLog.length ? <ol aria-label="Журнал бою · до 7 ходів" className="guild-raid-battle__log">
        {visibleBattleLog.map((entry) => <li className={`is-${entry.kind}`} key={entry.id}><span>{entry.text}</span>{entry.kind === "attack" ? <small>Хід {entry.turnNumber}</small> : null}</li>)}
      </ol> : null}
      {battle.status === "lost" ? <p className="guild-raid-battle__result guild-raid-battle__result--loss">Ви вибули, але можете повторити бій.</p> : null}
      {battle.status === "won" ? <p className="guild-raid-battle__result guild-raid-battle__result--win">Обидві відьми переможені.</p> : null}
    </section>
  );
}

function RaidReward({ participant }: { participant: GuildRaidResultParticipantView }) {
  if (participant.reward.card) {
    const card = participant.reward.card;
    return <span className="guild-raid-result__reward guild-raid-result__reward--card"><img alt="" src={`/card-art/${card.artKey ?? card.code}.png`} /><span>У пошті · {card.displayName ?? card.code}</span></span>;
  }
  if (participant.reward.gold > 0 || participant.reward.silver > 0) {
    return <span className="guild-raid-result__reward guild-raid-result__reward--currency"><span><CurrencyIcon kind="gold" size={15} />+{formatRaidNumber(participant.reward.gold)}</span><span><CurrencyIcon kind="silver" size={15} />+{formatRaidNumber(participant.reward.silver)}</span>{participant.reward.percentage < 100 ? <small>{participant.reward.percentage}% від базової</small> : null}</span>;
  }
  return <span className="guild-raid-result__reward guild-raid-result__reward--empty">Без нагороди</span>;
}

function RaidResult({ result, canStart, onStart, pending }: { result: GuildRaidResultView; canStart: boolean; onStart: () => void; pending: boolean }) {
  return <section aria-label="Підсумок івенту гільдії" className="guild-raid-result">
    <div className="guild-raid-result__banner"><span>Івент гільдії завершено</span><h3>ВІДЬМИ ПЕРЕМОЖЕНІ</h3><small>Рівень {result.level} · учасників {result.participantCount}</small></div>
    <div className="guild-raid-result__summary"><span>Загальна шкода</span><strong>{formatRaidNumber(result.totalDamage)}</strong></div>
    <ol className="guild-raid-result__standings" aria-label="Результати учасників івенту">
      {result.participants.map((participant) => <li className={participant.reward.card ? "is-card-winner" : ""} key={participant.playerId}>
        <LeagueBadge league={getLeagueByRating(participant.duelRating)} size="sm" />
        <span className="guild-raid-result__player"><strong>{participant.displayName}</strong><small>⚔ {formatRaidNumber(participant.damage)} шкоди</small></span>
        <RaidReward participant={participant} />
      </li>)}
    </ol>
    {canStart ? <button className="guild-raid__button guild-raid__button--start" disabled={pending} onClick={onStart} type="button">Відкрити наступний івент</button> : null}
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
  return <section aria-label="Підсумок поразки івенту гільдії" className="guild-raid-result guild-raid-result--defeat">
    <div className="guild-raid-result__banner"><h3>ВАША КОМАНДА<br />ПЕРЕМОЖЕНА</h3></div>
    <div aria-label="Відьми івенту" className="guild-raid-result__bosses">
      {bosses[0] ? <span className="guild-raid-result__boss"><img alt={`${bosses[0].displayName}, стихія ${ELEMENT_LABELS[bosses[0].element]}`} src={`/card-art/${bosses[0].artKey}.png`} /></span> : <span />}
      <p>Відьми насміхаються<br />над цими магами…</p>
      {bosses[1] ? <span className="guild-raid-result__boss"><img alt={`${bosses[1].displayName}, стихія ${ELEMENT_LABELS[bosses[1].element]}`} src={`/card-art/${bosses[1].artKey}.png`} /></span> : <span />}
    </div>
    <div className="guild-raid-result__defeat-copy"><p>Ніхто нічого не отримав.</p><p>Поточний рівень алтаря гільдії — <strong>{altarLevel}</strong></p></div>
    <p className="guild-raid-result__leaders-title">Лідери за шкодою</p>
    <ol className="guild-raid-result__standings" aria-label="Поточний рейтинг учасників івенту">
      {leaderboard.map((participant, index) => <li key={participant.playerId}>
        <span aria-hidden="true" className="guild-raid-result__placement">{index + 1}</span>
        <LeagueBadge league={getLeagueByRating(participant.duelRating)} size="sm" />
        <span className="guild-raid-result__player"><strong>{participant.displayName}</strong></span>
        <strong className="guild-raid-result__damage">⚔ {formatRaidNumber(participant.damage)}</strong>
      </li>)}
    </ol>
    <p className="guild-raid-result__participants">Всього учасників: {participantCount}</p>
    <div className="guild-raid-result__retry"><p>Ще спроба?</p><button className="guild-raid__button guild-raid__button--green" disabled={pending} onClick={onRetry} type="button">Повторити бій</button></div>
    <figure className="guild-raid-result__battle-art"><img alt="" src="/assets/guild/guild-altar-battle.png" /><figcaption><strong>Битви з відьмами</strong><span>Записано магів: {participantCount}</span><small>Рівень наступного івенту: {nextLevel}</small></figcaption></figure>
  </section>;
}

function RaidLobby({ altarLevel, raid, pending, onEnrollment, onStart, onBattle }: {
  altarLevel: number;
  raid: GuildRaidView;
  pending: boolean;
  onEnrollment: () => void;
  onStart: () => void;
  onBattle: () => void;
}) {
  const latestBattle = raid.battle?.raidLevel === raid.level ? raid.battle : null;
  const currentResult = raid.lastResult?.level === raid.level ? raid.lastResult : null;
  if (currentResult) return <RaidResult canStart={raid.enrollment.canStart} onStart={onStart} pending={pending} result={currentResult} />;
  if (latestBattle?.status === "lost" && raid.status === "active") return <RaidDefeatResult altarLevel={altarLevel} bosses={raid.bosses} leaderboard={raid.damageLeaderboard} nextLevel={raid.nextLevel} participantCount={raid.damageLeaderboard.length} onRetry={onBattle} pending={pending} />;
  return (
    <section className="guild-raid-lobby">
      <div className="guild-raid__bosses" aria-label="Дві випадкові відьми івенту">
        {raid.bosses[0] ? <RaidBossPreview boss={raid.bosses[0]} side="left" /> : null}
        <strong>{raid.name}</strong>
        {raid.bosses[1] ? <RaidBossPreview boss={raid.bosses[1]} side="right" /> : null}
      </div>
      <p className="guild-raid-lobby__participants">Записано учасників: <strong>{raid.enrollment.participantCount}</strong></p>
      {latestBattle?.status === "won" ? <p className="guild-raid-battle__result guild-raid-battle__result--win">Відьми цього рівня переможені. Івент готовий до нового бою.</p> : null}
      {latestBattle?.status === "lost" && raid.status === "active" ? <button className="guild-raid__button guild-raid__button--green" disabled={pending} onClick={onBattle} type="button">Повторити бій</button> : null}
      {raid.status === "open" && raid.enrollment.enrolled ? <button className="guild-raid__button guild-raid__button--green" disabled={pending} onClick={onEnrollment} type="button">Вийти із запису</button> : null}
      {raid.status === "open" && !raid.enrollment.enrolled ? <button className="guild-raid__button guild-raid__button--green" disabled={pending} onClick={onEnrollment} type="button">Приєднатися до івенту</button> : null}
      {raid.status === "open" && raid.enrollment.canStart ? <button className="guild-raid__button guild-raid__button--start" disabled={pending} onClick={onStart} type="button">Відкрити бій</button> : null}
      {raid.status === "open" && raid.enrollment.enrolled && !raid.enrollment.canStart ? <p className="guild-raid-lobby__hint">Чекаємо, поки глава гільдії відкриє івент.</p> : null}
      {raid.status === "active" && latestBattle?.status !== "active" && latestBattle?.status !== "lost" && raid.enrollment.enrolled ? <button className="guild-raid__button guild-raid__button--start" disabled={pending} onClick={onBattle} type="button">Почати свій бій</button> : null}
      {raid.status === "active" && !raid.enrollment.enrolled ? <button className="guild-raid__button guild-raid__button--green" disabled={pending} onClick={onEnrollment} type="button">Приєднатися до івенту</button> : null}
    </section>
  );
}

function RaidBossPreview({ boss, side }: { boss: GuildRaidBossView; side: "left" | "right" }) {
  return <div className="guild-raid__boss"><span className={`guild-raid__portrait guild-raid__portrait--${side}`}><img alt={`${boss.displayName}, стихія ${ELEMENT_LABELS[boss.element]}`} src={`/card-art/${boss.artKey}.png`} /></span><strong className={`guild-raid__boss-name guild-raid__boss-name--${boss.element}`}>{boss.displayName}</strong></div>;
}

export function GuildRaidScreen({ profile, onMembers, onForum, onDirectory }: GuildRaidScreenProps) {
  const { guild } = profile;
  const [raidState, setRaidState] = useState<{ status: "loading" | "ready" | "error"; data?: GuildRaidView; message?: string }>({ status: "loading" });
  const [pending, setPending] = useState(false);
  const [targetBossSlot, setTargetBossSlot] = useState<1 | 2>(1);
  const activeBattleIdRef = useRef<string | null>(null);
  const [notice, setNotice] = useState("Івент гільдії готується до запису.");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<RaidChatMessage[]>([]);

  function applyRaid(data: GuildRaidView) {
    setRaidState({ status: "ready", data });
    const battleId = data.battle?.battleId ?? null;
    if (battleId !== activeBattleIdRef.current) {
      activeBattleIdRef.current = battleId;
      setTargetBossSlot(data.battle?.targetBossSlot ?? 1);
    }
    const currentBattle = data.battle?.raidLevel === data.level ? data.battle : null;
    if (currentBattle?.status === "won") setNotice("Відьми цього рівня переможені. Можна відкривати новий бій.");
    else if (currentBattle?.status === "lost") setNotice("Бій завершено. Можна спробувати ще раз.");
    else if (data.status === "active" && currentBattle?.status === "active") setNotice("Бій триває. Оберіть карту й ціль.");
    else if (data.status === "active") setNotice("Івент гільдії відкрито. Учасники можуть приєднатися та почати свої бої.");
    else if (data.enrollment.enrolled) setNotice(data.enrollment.canStart ? "Ви глава гільдії. Можна відкрити івент." : "Ви записані. Дочекайтеся старту глави гільдії.");
    else setNotice("Івент гільдії готовий до запису.");
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
    if (!raid || raid.status !== "active" || raid.lastResult?.level === raid.level) return;
    const timer = window.setInterval(() => { void reload(); }, 1_200);
    return () => window.clearInterval(timer);
  }, [raid?.id, raid?.status, raid?.battle?.status, guild.id]);

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

  function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setMessages((current) => [...current, { id: Date.now(), body }]);
    setDraft("");
  }

  const currentBattle = raid && raid.battle?.raidLevel === raid.level ? raid.battle : null;
  const currentResult = raid && raid.lastResult?.level === raid.level ? raid.lastResult : null;
  const battleVisible = raid?.status === "active" && currentBattle?.status === "active";
  const resultVisible = Boolean(currentResult || currentBattle?.status === "lost");
  return <section className="guild-raid" aria-labelledby="guild-raid-title" data-raid-id={raid?.id}>
    <div className="guild-section-bar guild-raid__title"><h2 id="guild-raid-title">{raid ? `Івент гільдії · ${raid.name} ${raid.level} рівня` : "Івент гільдії · Відьми"}</h2></div>

    {raidState.status === "loading" ? <GuildState>Завантаження івенту…</GuildState> : raidState.status === "error" || !raid ? <GuildState error onRetry={() => void reload(true)}>{raidState.message ?? "Івент тимчасово недоступний."}</GuildState> : battleVisible ? <RaidBattle raid={raid} pending={pending} playerLevel={profile.viewer.member?.level ?? 1} playerName={profile.viewer.member?.displayName ?? "Ви"} playerPhotoUrl={profile.viewer.member?.photoUrl ?? null} targetBossSlot={targetBossSlot} onAction={attack} onTargetChange={setTargetBossSlot} /> : <RaidLobby altarLevel={profile.altar.currentLevel} onBattle={startBattle} onEnrollment={toggleEnrollment} onStart={openRaid} pending={pending} raid={raid} />}

    {!battleVisible && !resultVisible ? <section className="guild-raid__chat" aria-labelledby="guild-raid-chat-title">
      <h3 id="guild-raid-chat-title">Чат івенту</h3>
      <div className="guild-raid__messages" aria-live="polite">
        {messages.length ? messages.map((message) => <p key={message.id}><strong>Ви</strong><span>{message.body}</span></p>) : <p className="guild-raid__empty">Чат івенту поки порожній.</p>}
      </div>
      <form className="guild-raid__composer" onSubmit={submitMessage}>
        <input aria-label="Повідомлення в чат івенту" maxLength={240} placeholder="Повідомлення для івенту…" value={draft} onChange={(event) => setDraft(event.target.value)} />
        <button aria-label="Надіслати повідомлення" type="submit"><AppIcon name="chevron" size={18} /></button>
      </form>
    </section> : null}

    {raidState.status === "ready" ? <p className="guild-raid__status" role="status">{notice}</p> : null}
    {!battleVisible && !resultVisible ? <div className="guild-raid__menu guild-menu-list" aria-label="Розділи гільдії"><MenuRow compact detail={`${guild.memberCount} / ${guild.memberCapacity}`} icon="profile" metalTexture onClick={onMembers} title="Склад" /><MenuRow compact detail="Розмови гільдії" icon="collection" metalTexture onClick={onForum} title="Форум гільдії" /><MenuRow compact detail="Каталог" icon="ranking" metalTexture onClick={onDirectory} title="Найкращі гільдії" /></div> : null}
  </section>;
}
