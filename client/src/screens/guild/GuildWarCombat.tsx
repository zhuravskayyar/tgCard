import { useEffect, useState } from "react";
import { GUILD_WAR_MAX_KEYS, getStrikeMultiplier } from "@cardastika/game-core";
import type {
  GuildWarAction, GuildWarBattleView, GuildWarFighterView, GuildWarKeyDayView,
  GuildWarParticipantView, GuildWarSkill, GuildWarSlot,
} from "@cardastika/shared";
import { BattleAttackAnimation } from "../../components/BattleAttackAnimation";
import { useBattleExchange, useBattleResultReady } from "../../components/useBattlePresentation";
import { getUiLocale, translateUi } from "../../i18n";
import { BattleCard, getEffectLevel, HpPanel } from "../DuelScreen";
import { ELEMENT_LABELS } from "./GuildUi";

type SendAction = (action: GuildWarAction) => void;

const LOCATION_NAMES = [
  "Несплячі вулкани", "Дощові джунглі", "Холодна тундра", "Долина гейзерів", "Штормовий океан", "Палаючі землі",
] as const;

const BATTLE_LABELS: Record<GuildWarBattleView["state"], string> = {
  upcoming: "Очікування",
  registration: "Запис на бій",
  location: "Бій у локаціях",
  wasteland: "Бій у Пустці",
  settled: "Бій завершився",
};

interface BoardProps {
  id: string;
  player: GuildWarFighterView;
  enemy: GuildWarFighterView;
  active: boolean;
  pending: boolean;
  result: { won: boolean; xp: number } | { won: false; elimination: true } | null;
  skills?: boolean;
  onStrike: (slot: GuildWarSlot, skill: GuildWarSkill) => void;
}

function WarBoard({ id, player, enemy, active, pending, result, skills, onStrike }: BoardProps) {
  const locale = getUiLocale();
  const lastExchange = player.lastTargetId === enemy.playerId ? player.lastExchange : null;
  const clash = useBattleExchange(lastExchange, lastExchange ? `${id}:${lastExchange.turnNumber}` : undefined);
  const resultReady = useBattleResultReady(active, Boolean(result), result?.won ? "win" : "loss");
  const [clock, setClock] = useState(Date.now);
  const waitingForCards = player.readyAt.some((readyAt) => readyAt > clock);
  useEffect(() => {
    if (!active || !waitingForCards) return;
    const timer = window.setTimeout(() => setClock(Date.now()), 250);
    return () => window.clearTimeout(timer);
  }, [active, clock, waitingForCards]);
  const blocked = !active || pending || Boolean(clash) || !enemy.hp || !player.hp;

  function hp(fighter: GuildWarFighterView, tone: "player" | "enemy") {
    return <HpPanel
      currentHp={fighter.hp}
      maximumHp={fighter.maxHp}
      side={{ name: fighter.name, level: fighter.level, photoUrl: fighter.photoUrl, playerId: fighter.playerId }}
      tone={tone}
    />;
  }

  return <section className="guild-war-combat__board">
    {hp(enemy, "enemy")}
    <div className={`duel-board${clash ? " duel-board--clash" : ""}`}>
      {clash ? <BattleAttackAnimation key={clash.turnNumber} exchange={clash} /> : null}
      <div className="duel-card-row duel-card-row--enemy">
        {enemy.cards.map((card, index) => <BattleCard card={card} clashing={clash?.slotIndex === index}
          clashLevel={clash?.slotIndex === index ? getEffectLevel(clash.enemyMultiplier) : undefined} disabled enemy key={card.instanceId} />)}
      </div>
      <div className="duel-multiplier-row">
        {player.cards.map((card, index) => {
          const enemyCard = enemy.cards[index as GuildWarSlot];
          const multiplier = getStrikeMultiplier(card.element, enemyCard.element, player.strikeMultiplierBonus);
          const modifierClass = multiplier < 1 ? "0-5" : multiplier >= 1.5 ? "1-5" : "1";
          return <span className={`duel-multiplier duel-multiplier--${modifierClass}`} key={card.instanceId}>×{Number(multiplier.toFixed(2))}</span>;
        })}
      </div>
      <div className="duel-card-row duel-card-row--player">
        {player.cards.map((card, index) => {
          const slot = index as GuildWarSlot;
          return <BattleCard card={card} clashing={clash?.slotIndex === slot}
            clashLevel={clash?.slotIndex === slot ? getEffectLevel(clash.playerMultiplier) : undefined}
            disabled={blocked || player.readyAt[slot] > clock} key={card.instanceId} onClick={() => onStrike(slot, "normal")} />;
        })}
      </div>
    </div>
    {hp(player, "player")}
    {skills && active ? <div className="guild-war-combat__actions">
      {player.berserkAvailable ? <WarButton disabled={blocked || waitingForCards} onClick={() => onStrike(0, "berserk")}>Берсерк</WarButton> : null}
      {player.ancientAvailable ? <WarButton disabled={blocked || waitingForCards} onClick={() => onStrike(0, "ancient")}>Викликати давню істоту</WarButton> : null}
      {player.crystalAvailable ? <WarButton disabled={blocked || waitingForCards} onClick={() => onStrike(0, "ancient_crystal")}>Використати Кристал магії</WarButton> : null}
    </div> : null}
    {result && resultReady ? <p className="guild-war-notice" role="status">
      {"elimination" in result
        ? translateUi("Ви вибули з бою.", locale)
        : `${translateUi(result.won ? "Ключ здобуто" : "Дуель програно", locale)} · +${result.xp.toLocaleString(locale)} XP`}
    </p> : null}
  </section>;
}

function WarButton({ children, onClick, disabled = false, pressed }: { children: string; onClick: () => void; disabled?: boolean; pressed?: boolean }) {
  return <button aria-pressed={pressed} className="guild-raid__button guild-raid__button--green" disabled={disabled} onClick={onClick} type="button">
    {translateUi(children, getUiLocale())}
  </button>;
}

export function WarKeyCombat({ day, roster, pending, send }: {
  day: GuildWarKeyDayView; roster: GuildWarParticipantView[]; pending: boolean; send: SendAction;
}) {
  const locale = getUiLocale();
  const duel = day.duel;
  const duelFinished = useBattleResultReady(duel?.status === "active", Boolean(duel && duel.status !== "active"));
  return <section className="guild-war-combat">
    <div className="guild-war-match-facts">
      <div><span>{translateUi("Ключі", locale)}</span><strong>{day.keys} / {GUILD_WAR_MAX_KEYS}</strong></div>
      <div><span>{translateUi("Спроб залишилося", locale)}</span><strong>{day.attemptsLeft}</strong></div>
    </div>
    {duel ? <WarBoard id={duel.id} player={duel.player} enemy={duel.enemy} active={duel.status === "active"} pending={pending}
      result={duel.status === "active" ? null : { won: duel.status === "won", xp: duel.xp }}
      onStrike={(slot) => send({ type: "duel_strike", duelId: duel.id, slot, version: duel.player.version })} /> : null}
    {(!duel || duelFinished) && day.attemptsLeft > 0 ? <>
      {day.freeKeys > 0 ? <WarButton disabled={pending} onClick={() => send({ type: "claim_key", expectedKeys: day.keys })}>Взяти вільний ключ</WarButton> : null}
      <ul aria-label={translateUi("Суперники за ключі", locale)} className="guild-war-combat__list">
        {roster.map((member) => {
          const target = day.targets.find(({ playerId }) => playerId === member.playerId);
          if (!target) return null;
          return <li key={member.playerId}>
            <span>{member.name} <small>{translateUi("Ключі", locale)} · {target.keysLeft}</small></span>
            <WarButton disabled={pending || target.attacked || target.keysLeft <= 0}
              onClick={() => send({ type: "start_duel", targetId: member.playerId })}>Викликати на дуель</WarButton>
          </li>;
        })}
      </ul>
    </> : null}
  </section>;
}

export function WarTeamCombat({ battle, guildId, pending, send, formatDate }: {
  battle: GuildWarBattleView; guildId: string; pending: boolean; send: SendAction; formatDate: (date: string) => string;
}) {
  const locale = getUiLocale();
  const [targetId, setTargetId] = useState<string | null>(null);
  const target = battle.targets.find(({ playerId }) => playerId === targetId)
    ?? battle.targets.find(({ playerId }) => playerId === battle.player?.lastTargetId)
    ?? battle.targets[0];
  const active = battle.state === "location" || battle.state === "wasteland";
  const player = battle.player;
  const next = battle.state === "upcoming" ? battle.registrationAt : battle.state === "registration" ? battle.locationAt
    : battle.state === "location" ? battle.wastelandAt : battle.state === "wasteland" ? battle.endsAt : null;
  return <section className="guild-war-side guild-war-combat">
    <header className="guild-war-side__header">
      <h3>{translateUi("Бій {s}", locale).replace("{s}", String(battle.number))}</h3>
      <span className="guild-war-side__rating">{translateUi(BATTLE_LABELS[battle.state], locale)}</span>
    </header>
    {next ? <small>{translateUi("Наступний етап о {s}", locale).replace("{s}", formatDate(next))}</small> : null}
    {battle.state === "settled" ? <p className="guild-war-notice">{translateUi(battle.winnerGuildId === guildId ? "Перемога гільдії" : battle.winnerGuildId ? "Поразка гільдії" : "Нічия", locale)}</p> : null}
    {battle.canJoin || battle.alliesByLocation || battle.locationId !== null ? <ul className="guild-war-combat__list">
      {battle.locations.map((location) => {
        const allies = battle.alliesByLocation?.find(({ locationId }) => locationId === location.id)?.names;
        return <li key={location.id}>
          <span>{translateUi(LOCATION_NAMES[location.id] ?? "", locale)} <small>
            {location.elements.map((element) => translateUi(ELEMENT_LABELS[element], locale)).join(" / ")} · +5%
            {allies?.length ? <span className="guild-war-combat__allies">{allies.join(", ")}</span> : null}
          </small></span>
          {battle.canJoin ? <WarButton disabled={pending} onClick={() => send({
            type: "join_battle", number: battle.number, locationId: location.id, acceptLateFee: battle.lateJoinGold > 0,
          })}>{battle.lateJoinGold ? "Вступити за ключ і 10 золота" : "Вступити за ключ"}</WarButton> : null}
          {battle.locationId === location.id ? <small>{translateUi("Ваша локація", locale)}</small> : null}
        </li>;
      })}
    </ul> : null}
    {player && battle.state === "settled" ? <small>
      {translateUi("Завдано шкоди {s}", locale).replace("{s}", player.damage.toLocaleString(locale))}
      {battle.earnedXp != null ? ` · +${battle.earnedXp.toLocaleString(locale)} XP` : null}
    </small> : null}
    {player && active && !target ? <p className="guild-war-notice">
      {translateUi(player.hp ? "У цій локації немає суперників." : "Ви вибули з бою.", locale)}
    </p> : null}
    {player && active && target ? <>
      {battle.targets.length > 1 ? <div className="guild-war-combat__actions">
        {battle.targets.map((opponent) => <WarButton disabled={pending || !opponent.hp} key={opponent.playerId} onClick={() => setTargetId(opponent.playerId)}
          pressed={opponent.playerId === target.playerId}>{opponent.name}</WarButton>)}
      </div> : null}
      <WarBoard id={`team-${battle.number}`} active={active && player.hp > 0} pending={pending}
        result={player.hp > 0 ? null : { won: false, elimination: true }} skills player={player} enemy={target}
        onStrike={(slot, skill) => {
          setTargetId(target.playerId);
          send({ type: "battle_strike", number: battle.number, slot, skill, targetId: target.playerId, version: player.version });
        }} />
    </> : null}
  </section>;
}
