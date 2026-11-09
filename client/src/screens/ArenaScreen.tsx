import { ScreenHeading } from "../components/ScreenHeading";
import { useBattleExchange, useBattleResultReady } from "../components/useBattlePresentation";
import { BattleAttackAnimation } from "../components/BattleAttackAnimation";
import { CardBack } from "../components/CardBack";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ArenaBattleLogEntry,
  ArenaCardSlot,
  ArenaLeaderboardResponse,
  ArenaParticipantView,
  ArenaProfileResponse,
  ArenaQueueView,
  ArenaShopItem,
  ArenaShopCatalogResponse,
  ArenaView,
  CollectionCompletionNotice,
  DuelExchange,
  PlayerSummary,
} from "@cardastika/shared";
import { EQUIPMENT_SLOT_LABELS, getElementMultiplier, STARTER_EQUIPMENT_DEFINITIONS } from "@cardastika/game-core";
import { EquipmentSprite, rarityStyle } from "../components/EquipmentBook";
import { AppIcon } from "../components/AppIcon";
import { BattleCard, BattleLog, getEffectLevel, HpPanel, PlayerAvatar } from "./DuelScreen";
import type { DuelEffectLevel } from "./DuelScreen";
import { FirstVisitHint } from "../components/FirstVisitHint";
import { CurrencyIcon } from "../components/CurrencyDisplay";
import { ARENA_TOKEN_ICON_SOURCE, ResourceIcon } from "../components/ResourceIcon";
import { getTelegramInitData } from "../telegram";
import { formatUiNumber } from "../i18n";
import {
  ArenaApiError,
  changeArenaCards,
  changeArenaTarget,
  joinArenaQueue,
  leaveArenaQueue,
  loadActiveArena,
  loadArenaLeaderboard,
  loadArenaProfile,
  loadArenaShop,
  purchaseArenaShopItem,
  submitArenaAction,
} from "../telegram/arena";
import "../styles/arena-book.css";

type ArenaTab = "battle" | "league" | "shop";

interface ArenaScreenProps {
  onBack: () => void;
  onCollectionCompleted: (completion: CollectionCompletionNotice) => void;
  onPlayerSummaryChange: (summary: Partial<Pick<PlayerSummary, "arenaLeagueIndex" | "arenaRating" | "arenaTokens" | "arenaTop3Count" | "arenaWins" | "cardShards" | "gold" | "silver">>) => void;
}

function cooldownSeconds(until: string | null, now = Date.now()) {
  if (!until) return 0;
  return Math.max(0, Math.ceil((new Date(until).getTime() - now) / 1_000));
}

function ArenaHeading({ onBack }: { onBack: () => void }) {
  return (
    <ScreenHeading onBack={onBack} title="Арена" action={<span className="arena-heading__token"><ResourceIcon kind="arena-token" size={20} /> Арена</span>} />
  );
}

function ArenaTabs({ active, onChange }: { active: ArenaTab; onChange: (tab: ArenaTab) => void }) {
  return (
    <nav className="arena-tabs" aria-label="Розділи Арени">
      <button className={active === "battle" ? "is-active" : ""} onClick={() => onChange("battle")} type="button"><AppIcon name="arena" size={17} />Бій</button>
      <button className={active === "league" ? "is-active" : ""} onClick={() => onChange("league")} type="button"><AppIcon name="ranking" size={17} />Ліга</button>
      <button className={active === "shop" ? "is-active" : ""} onClick={() => onChange("shop")} type="button"><AppIcon name="arena-shop" size={17} />Магазин</button>
    </nav>
  );
}

function ArenaTokenBalance({ value }: { value: number }) {
  return <span className="arena-token-balance"><ResourceIcon kind="arena-token" size={20} />{formatUiNumber(value)}</span>;
}

const ARTIFACT_DEFINITIONS_BY_ID = new Map(STARTER_EQUIPMENT_DEFINITIONS.filter(({ category }) => category === "artifacts").map((definition) => [definition.id, definition]));

/** Every fighter's artifacts and their rarity are visible in the arena. */
function ArenaArtifacts({ itemIds }: { itemIds: readonly string[] | undefined }) {
  const definitions = (itemIds ?? []).flatMap((itemId) => ARTIFACT_DEFINITIONS_BY_ID.get(itemId) ?? []);
  if (!definitions.length) return null;
  return (
    <span aria-label={`Артефакти: ${definitions.map((definition) => `${definition.name}`).join(", ")}`} className="arena-participant__artifacts" role="img">
      {definitions.map((definition) => (
        <span className="arena-participant__artifact" key={definition.id} style={rarityStyle(definition.rarity)} title={`${EQUIPMENT_SLOT_LABELS[definition.slot]} · ${definition.name}`}>
          <EquipmentSprite definition={definition} />
        </span>
      ))}
    </span>
  );
}

function shortParticipantName(name: string) {
  const firstWord = name.trim().split(/\s+/)[0] ?? name;
  return firstWord.length > 10 ? `${firstWord.slice(0, 9)}…` : firstWord;
}

function percentage(value: number, maximum: number) {
  return maximum > 0 ? Math.max(0, Math.min(100, value / maximum * 100)) : 0;
}

function queueSeconds(queue: ArenaQueueView) {
  return Math.max(0, Math.ceil((new Date(queue.startsAt).getTime() - Date.now()) / 1_000));
}

function sameQueueView(left: ArenaQueueView | null, right: ArenaQueueView | null) {
  if (left === right) return true;
  if (!left || !right) return left === right;
  return left.queueId === right.queueId
    && left.participantCount === right.participantCount
    && left.maxParticipants === right.maxParticipants
    && left.startsAt === right.startsAt;
}

function sameArenaView(left: ArenaView | null, right: ArenaView | null) {
  if (left === right) return true;
  if (!left || !right) return left === right;
  return left.matchId === right.matchId
    && left.status === right.status
    && left.version === right.version
    && left.targetId === right.targetId;
}

function arenaLogToDuelExchange(entry: ArenaBattleLogEntry, playerId: string, turnNumber: number): DuelExchange | null {
  if (!entry.attackerCard || !entry.targetCard) return null;
  const playerAttack = entry.attackerId === playerId;
  const playerHit = entry.targetId === playerId;
  const botExchange = !playerAttack && !playerHit;
  const playerMultiplier = playerAttack ? entry.multiplier : 0.5;
  const enemyMultiplier = playerHit ? entry.multiplier : 0.5;
  return {
    enemyCard: playerAttack || botExchange ? entry.targetCard : entry.attackerCard,
    enemyDamage: playerHit ? entry.damage : entry.counterDamage ?? 0,
    enemyMultiplier,
    playerCard: playerAttack || botExchange ? entry.attackerCard : entry.targetCard,
    playerDamage: playerAttack || botExchange ? entry.damage : entry.counterDamage ?? 0,
    playerMultiplier: botExchange ? entry.multiplier : playerMultiplier,
    slotIndex: entry.slotIndex,
    turnNumber,
    visualState: (playerAttack || botExchange) && entry.multiplier === 1.5
      ? "player_strong"
      : playerHit && entry.multiplier === 1.5 ? "enemy_strong" : "neutral",
  };
}

function ArenaQueuePanel({ queue, pending, onLeave }: { queue: ArenaQueueView; pending: string | null; onLeave: () => void }) {
  const [remaining, setRemaining] = useState(() => queueSeconds(queue));

  useEffect(() => {
    setRemaining(queueSeconds(queue));
    const timer = window.setInterval(() => setRemaining((current) => {
      const next = queueSeconds(queue);
      return current === next ? current : next;
    }), 1_000);
    return () => window.clearInterval(timer);
  }, [queue]);

  const total = Math.max(1, Math.round((new Date(queue.startsAt).getTime() - new Date(queue.createdAt).getTime()) / 1_000));
  const shownRemaining = Math.min(remaining, total);
  const progress = Math.max(0, Math.min(100, (1 - shownRemaining / total) * 100));
  return (
    <section aria-live="polite" className="arena-queue-panel">
      <div className="arena-queue-panel__crest"><AppIcon name="arena" size={42} /></div>
      <span>РЕЄСТРАЦІЯ НА АРЕНУ</span>
      <h2>Бій почнеться через</h2>
      <strong className="arena-queue-panel__timer">00:{String(shownRemaining).padStart(2, "0")}</strong>
      <div aria-label={`Підготовка бою: ${Math.round(progress)}%`} className="arena-queue-panel__progress"><span style={{ width: `${progress}%` }} /></div>
      <p><b>{queue.participantCount} / {queue.maxParticipants}</b> живих учасників у черзі</p>
      <small>Справжні гравці можуть приєднатися до завершення таймера. Вільні місця заповнять боти після відліку.</small>
      <button className="duel-secondary-button" disabled={pending !== null} onClick={onLeave} type="button">Скасувати запис</button>
    </section>
  );
}

function ParticipantList({ participants, playerId, targetId, disabled, onSelectTarget }: { participants: ArenaParticipantView[]; playerId: string; targetId: string | null; disabled: boolean; onSelectTarget: (participantId: string) => void }) {
  const targets = participants.filter((participant) => participant.id !== playerId);
  const aliveTargets = targets.filter((participant) => participant.alive).length;
  return (
    <section className="arena-participants">
      <header><h2>Цілі</h2><span>{aliveTargets} живих · натисніть аватар</span></header>
      <ol>
        {targets.map((participant) => (
          <li className={`${participant.id === playerId ? "is-player " : ""}${participant.id === targetId ? "is-target " : ""}${!participant.alive ? "is-dead" : ""}`} key={participant.id} title={participant.name}>
            <div className="arena-participant__top">
              <span className="arena-rank">{participant.placement ?? "•"}</span>
              <button
                aria-label={participant.id === playerId ? `Ваш аватар, ${participant.name}` : `Обрати ціллю ${participant.name}`}
                className="arena-participant__avatar-button"
                disabled={disabled || participant.id === playerId || !participant.alive}
                onClick={() => onSelectTarget(participant.id)}
                type="button"
              >
                <PlayerAvatar name={participant.name} photoUrl={participant.photoUrl} />
              </button>
              <strong>{shortParticipantName(participant.name)}</strong>
              {!participant.alive ? <span className="arena-participant__dead" aria-label="Вибув"><AppIcon name="skull" size={16} /></span> : null}
            </div>
            <div className="arena-participant__hpbar" aria-label={`HP ${participant.hp} з ${participant.maxHp}`}>
              <span style={{ width: `${percentage(participant.hp, participant.maxHp)}%` }} />
            </div>
            <small className="arena-participant__damage">{participant.totalDamageDealt}</small>
            <ArenaArtifacts itemIds={participant.artifactItemIds} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function ArenaSlot({ slot, enemy, disabled, defeated = false, onClick, lane, clashLevel, clashing = false }: { slot: ArenaCardSlot; enemy?: boolean; disabled?: boolean; defeated?: boolean; onClick?: () => void; lane: number; clashLevel?: DuelEffectLevel; clashing?: boolean }) {
  const [cooldownNow, setCooldownNow] = useState(() => Date.now());
  useEffect(() => {
    if (!slot.cooldownUntil) return;
    const cooldownEnd = new Date(slot.cooldownUntil).getTime();
    let timer: number | undefined;
    const refresh = () => {
      const now = Date.now();
      setCooldownNow(now);
      const remaining = cooldownEnd - now;
      if (remaining > 0) timer = window.setTimeout(refresh, Math.min(1_000, remaining));
    };
    timer = window.setTimeout(refresh, Math.min(1_000, Math.max(0, cooldownEnd - Date.now())));
    return () => { if (timer !== undefined) window.clearTimeout(timer); };
  }, [slot.cooldownUntil]);

  const cooldown = cooldownSeconds(slot.cooldownUntil, cooldownNow);
  const canAttack = Boolean(slot.card && !enemy && !disabled && !defeated && cooldown <= 0);
  const handleClick = () => {
    if (canAttack) onClick?.();
  };
  return (
    <div className={`arena-slot${cooldown > 0 ? " is-cooldown" : " is-ready"}${defeated ? " is-defeated" : ""}${slot.card ? "" : " is-hidden"}`}>
      {slot.card ? <BattleCard card={slot.card} clashLevel={clashLevel} clashing={clashing} enemy={enemy} disabled={!canAttack} key={`${slot.card.instanceId}-${lane}`} onClick={handleClick} /> : <div aria-label={cooldown > 0 ? `Лінія ${lane + 1}: карта відкриється через ${cooldown} с` : `Лінія ${lane + 1}: карта прихована`} className="arena-hidden-card"><CardBack className="arena-hidden-card__back" />{cooldown > 0 ? <span className="arena-hidden-card__timer">{cooldown}</span> : null}</div>}
    </div>
  );
}

function ArenaLog({ animateLatest, match }: { animateLatest: boolean; match: ArenaView }) {
  const [expanded, setExpanded] = useState(false);
  const exchanges = match.battleLog
    .map((entry, index) => arenaLogToDuelExchange(entry, match.playerId, match.battleLog.length - index))
    .filter((entry): entry is DuelExchange => entry !== null);
  const entries = expanded ? exchanges : exchanges.slice(0, 7);
  return (
    <BattleLog
      animateLatest={animateLatest}
      emptyMessage="Ваша перша атака або удар по вас ще попереду."
      entries={entries}
      headerAction={<button aria-expanded={expanded} className="battle-log__toggle" onClick={() => setExpanded((value) => !value)} type="button">{entries.length}/{exchanges.length || 0} {expanded ? "⌃" : "⌄"}</button>}
    />
  );
}

function ArenaBattle({ match, pending, onAction, onTarget, onCards }: {
  match: ArenaView;
  pending: string | null;
  onAction: (slotIndex: 0 | 1 | 2) => void;
  onTarget: (targetId?: string) => void;
  onCards: () => void;
}) {
  const latestAttack = match.battleLog.find(entry => entry.attackerId === match.playerId);
  const clash = useBattleExchange(latestAttack?.attackerId === match.playerId ? arenaLogToDuelExchange(latestAttack, match.playerId, match.battleLog.length) : null, latestAttack?.id);

  const target = match.participants.find((participant) => participant.id === match.targetId);
  const player = match.participants.find((participant) => participant.id === match.playerId);
  const playerDefeated = player?.alive === false;
  const clashSlot = clash?.slotIndex ?? null;
  const enemyHitLevel = clash ? getEffectLevel(clash.playerMultiplier) : "normal";
  const aliveEnemies = match.participants.filter((participant) => participant.id !== match.playerId && participant.alive).length;
  const multipliers = match.playerSlots.map((slot, index) => {
    const enemyCard = match.targetSlots?.[index]?.card;
    return slot.card && enemyCard ? getElementMultiplier(slot.card.element, enemyCard.element) : null;
  });
  return (
    <div className={`duel-page duel-battle arena-battle${clash ? " duel-battle--clash" : ""}`}>
      {target ? <HpPanel currentHp={target.hp} damageElement={clash?.playerCard.element} damageLevel={enemyHitLevel} detail={`Вороги: ${aliveEnemies}`} hit={clash !== null} maximumHp={target.maxHp} side={target} tone="enemy" /> : null}
      <section aria-label="Бойове поле" className={`duel-board${clash ? " duel-board--clash" : ""}`}>
        {clash ? <BattleAttackAnimation key={clash.turnNumber} exchange={clash} /> : null}
          <div className="duel-card-row duel-card-row--enemy">{match.targetSlots ? match.targetSlots.map((slot, index) => <ArenaSlot clashLevel={clashSlot === index && clash ? getEffectLevel(clash.enemyMultiplier) : undefined} clashing={clashSlot === index} enemy key={index} lane={index} slot={slot} />) : clash ? [0, 1, 2].map(index => index === clash.slotIndex ? <BattleCard card={clash.enemyCard} enemy key={index} /> : <div aria-hidden="true" key={index} />) : null}</div>
          <div className="duel-multiplier-row" aria-label="Множники удару">
            {multipliers.map((multiplier, index) => <span className={multiplier === null ? "duel-multiplier arena-multiplier--none" : `duel-multiplier duel-multiplier--${String(multiplier).replace(".", "-")}`} key={index}>{multiplier === null ? " " : `×${multiplier}`}</span>)}
          </div>
          <div className="duel-card-row duel-card-row--player">{match.playerSlots.map((slot, index) => <ArenaSlot clashLevel={clashSlot === index && clash ? getEffectLevel(clash.playerMultiplier) : undefined} clashing={clashSlot === index} defeated={playerDefeated} key={index} lane={index} slot={slot} disabled={clash !== null || match.status !== "active" || pending !== null} onClick={() => onAction(index as 0 | 1 | 2)} />)}</div>
      </section>
      {player ? <HpPanel currentHp={player.hp} detail={`Завдано: ${formatUiNumber(player.totalDamageDealt)}`} maximumHp={player.maxHp} side={player} tone="player" /> : null}
      <div className="arena-controls">
        <div className="arena-actions">
          <button aria-label="Змінити ціль" className="duel-secondary-button" disabled={clash !== null || match.status !== "active" || pending !== null} onClick={() => onTarget()} title="Змінити ціль" type="button"><AppIcon name="target" size={20} /><span>Ціль</span></button>
          <button aria-label="Оновити карти" className="duel-secondary-button" disabled={clash !== null || match.status !== "active" || pending !== null} onClick={onCards} title="Оновити карти" type="button"><AppIcon name="refresh" size={20} /><span>Карти</span><small>{match.changeCardsCost === 0 ? "0" : <><CurrencyIcon kind="gold" size={15} />{match.changeCardsCost}</>}</small></button>
        </div>
        <p aria-live="polite" className="arena-action-status">{pending ? "…" : playerDefeated ? "Вибули" : "Обери карту"}</p>
      </div>
      <ParticipantList disabled={clash !== null || match.status !== "active" || pending !== null} onSelectTarget={onTarget} participants={match.participants} playerId={match.playerId} targetId={match.targetId} />
      <ArenaLog animateLatest={clash !== null} match={match} />
    </div>
  );
}

function ArenaResult({ match, onArena, onQueue }: { match: ArenaView; onArena: () => void; onQueue: () => void }) {
  const result = match.result;
  if (!result) return null;
  const won = result.reward.status === "win";
  const ordered = [...match.participants].sort((left, right) => (left.placement ?? 99) - (right.placement ?? 99));
  const renderParticipant = (participant: ArenaParticipantView) => (
    <li className={participant.id === match.playerId ? "is-player" : ""} key={participant.id}>
      <span className="arena-result__rank">{participant.placement}</span>
      <PlayerAvatar name={participant.name} photoUrl={participant.photoUrl} />
      <strong>{participant.name}</strong>
      <span className="arena-result__damage"><AppIcon name="duel" size={16} /> {formatUiNumber(participant.totalDamageDealt)}<small>ходи: {participant.moves}</small></span>
    </li>
  );
  return (
    <section className={`arena-result ${won ? "is-win" : "is-loss"}`}>
      <span>Арена завершена</span>
      <h1>{won ? "ПЕРЕМОГА" : "ПОРАЗКА"}</h1>
      {won ? <p className="arena-result__subtitle">Ви один із переможців!</p> : null}
      {!result.reward.counted ? <p className="arena-result__subtitle">Ви не билися в цьому бою. Його не зараховано.</p> : null}
      <strong className="arena-result__place">Рейтинг арени: {result.reward.ratingAfter} ({result.reward.ratingChange > 0 ? "+" : ""}{result.reward.ratingChange})</strong>
      {result.leagueAfter.index > result.leagueBefore.index ? <p className="arena-result__subtitle">Нова ліга: {result.leagueAfter.name}</p> : null}
      <div className="arena-result__standings">
        <div className="arena-result__group arena-result__group--winners"><h2>Переможці</h2><ol>{ordered.slice(0, 3).map(renderParticipant)}</ol></div>
        <div className="arena-result__group arena-result__group--contenders"><h2>Претенденти</h2><ol>{ordered.slice(3).map(renderParticipant)}</ol></div>
      </div>
      {result.reward.arenaTokens > 0 || result.reward.promotionSilver > 0 ? <div className="arena-result__rewards">{result.reward.arenaTokens > 0 ? <span><ArenaTokenBalance value={result.reward.arenaTokens} /></span> : null}{result.reward.promotionSilver > 0 ? <span><CurrencyIcon kind="silver" size={18} />+{formatUiNumber(result.reward.promotionSilver)} срібла за нову лігу</span> : null}</div> : null}
      <div className="arena-result__actions"><button className="duel-primary-button" onClick={onQueue} type="button">Записатися знову</button><button className="duel-secondary-button" onClick={onArena} type="button">На арену</button></div>
    </section>
  );
}

function LeagueTab({ profile, initData }: { profile: ArenaProfileResponse; initData: string | null }) {
  const [board, setBoard] = useState<ArenaLeaderboardResponse | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!initData) return;
    const controller = new AbortController();
    void loadArenaLeaderboard(initData, controller.signal).then(setBoard).catch((reason: unknown) => { if (!(reason instanceof DOMException && reason.name === "AbortError")) setFailed(true); });
    return () => controller.abort();
  }, [initData, profile.arenaRating]);
  const next = profile.nextArenaLeague;
  const floor = profile.arenaLeague.minRating;
  const progress = next ? percentage(profile.arenaRating - floor, next.minRating - floor) : 100;
  const playerListed = board?.entries.some(({ playerId }) => playerId === board.player.playerId);
  return (
    <section className="arena-league-panel">
      <div className="arena-league-panel__crest"><AppIcon name="arena" size={48} /></div>
      <span>Ліга арени</span><h2>{profile.arenaLeague.name}</h2>
      <strong>Рейтинг арени: {profile.arenaRating}</strong>
      <div className="arena-league-panel__progress" aria-label={next ? `До ліги ${next.name}: ${Math.round(progress)}%` : "Найвища ліга"}><i style={{ width: `${progress}%` }} /></div>
      {next ? <p>До ліги «{next.name}»: {Math.max(0, next.minRating - profile.arenaRating)} рейтингу. Перший перехід: +{next.promotionReward.toLocaleString("uk-UA")} срібла.</p> : <p>Це найвища ліга арени.</p>}
      <div className="arena-league-panel__stats"><span>Перемоги <b>{formatUiNumber(profile.arenaWins)}</b></span><span>Топ-3 <b>{formatUiNumber(profile.arenaTop3Count)}</b></span><span>Жетони <b>{formatUiNumber(profile.arenaTokens)}</b></span></div>
      <h3 className="arena-league-panel__title">Рейтинг ліги</h3>
      {board ? <ol className="arena-leaderboard">
        {board.entries.map((entry) => <li className={entry.playerId === board.player.playerId ? "is-player" : ""} key={entry.playerId}><span>{entry.rank}</span><PlayerAvatar name={entry.name} photoUrl={entry.photoUrl} /><strong>{entry.name}</strong><b>{entry.rating}</b></li>)}
        {!playerListed ? <li className="is-player"><span>{board.player.rank}</span><PlayerAvatar name={board.player.name} photoUrl={board.player.photoUrl} /><strong>{board.player.name}</strong><b>{board.player.rating}</b></li> : null}
      </ol> : <p role={failed ? "alert" : "status"}>{failed ? "Не вдалося завантажити рейтинг ліги." : "Завантажуємо рейтинг ліги…"}</p>}
    </section>
  );
}

function cosmeticPreview(type?: string) {
  if (type === "avatar") return "/assets/arena/avatar-preview.svg";
  if (type === "frame") return "/assets/arena/frame-preview.svg";
  if (type === "title") return "/assets/arena/title-preview.svg";
  return ARENA_TOKEN_ICON_SOURCE;
}

function arenaShopRewardPreview(item: ArenaShopItem) {
  if (item.rewardType === "shards") return "/assets/ui/shop/icon_card_shard_v2.webp";
  if (item.rewardType === "card") return "/assets/ui/world-tree/game-icons/card-random.svg";
  if (item.rewardType === "equipment") return "/assets/ui/world-tree/game-icons/equipment-backpack.svg";
  return cosmeticPreview(item.cosmeticType);
}

function ShopTab({ profile, catalog, catalogError, catalogLoading, pending, onLoad, onPurchase }: { profile: ArenaProfileResponse; catalog: ArenaShopCatalogResponse | null; catalogError: string | null; catalogLoading: boolean; pending: string | null; onLoad: () => void; onPurchase: (id: string) => void }) {
  useEffect(() => { if (!catalog && !catalogError) onLoad(); }, [catalog, catalogError, onLoad]);
  return (
    <section className="arena-shop-panel">
      <header><div><span>Магазин арени</span><h2>Трофеї за жетони</h2></div><ArenaTokenBalance value={profile.arenaTokens} /></header>
      <p className="arena-shop-panel__intro">Витрачайте жетони Арени на загальні осколки, випадкове спорядження, карти та косметику.</p>
      {!catalog ? catalogError ? <div className="arena-empty-state" role="alert"><span>{catalogError}</span><button className="duel-secondary-button" disabled={catalogLoading} onClick={onLoad} type="button">{catalogLoading ? "Завантажуємо…" : "Повторити"}</button></div> : <div aria-live="polite" className="arena-empty-state" role="status">Завантажуємо асортимент…</div> : <div className="arena-shop-grid">{catalog.items.map((item) => <article className="arena-shop-item" key={item.id}><div aria-hidden="true" className="arena-shop-item__art">{item.rewardType === "cosmetic" && item.cosmeticType === "card_back" ? <CardBack className="arena-shop-item__card-back" /> : <img alt="" src={arenaShopRewardPreview(item)} />}</div><div className="arena-shop-item__details"><strong>{item.displayName}</strong><small>{item.rewardType === "cosmetic" ? "Косметика" : item.rewardType === "card" ? "Випадкова карта" : item.rewardType === "equipment" ? "Спорядження" : "Загальні осколки"}</small></div><button aria-label={`Придбати за ${item.price} жетонів`} className="arena-shop-item__purchase" disabled={pending !== null || profile.arenaTokens < item.price} onClick={() => onPurchase(item.id)} type="button"><span>Купити</span><span className="arena-shop-item__price"><ResourceIcon kind="arena-token" size={17} /><strong>{item.price}</strong></span></button></article>)}</div>}
    </section>
  );
}

export function ArenaScreen({ onBack, onCollectionCompleted, onPlayerSummaryChange }: ArenaScreenProps) {
  const [profile, setProfile] = useState<ArenaProfileResponse | null>(null);
  const [match, setMatch] = useState<ArenaView | null>(null);
  const resultReady = useBattleResultReady(match?.status === "active", match?.status === "finished", match?.result?.reward.status ?? null);
  const [queueState, setQueueState] = useState<ArenaQueueView | null>(null);
  const [catalog, setCatalog] = useState<ArenaShopCatalogResponse | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [tab, setTab] = useState<ArenaTab>("battle");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const pendingRef = useRef<string | null>(null);
  const catalogLoadInFlightRef = useRef(false);
  const pollInFlightRef = useRef(false);
  const syncRevisionRef = useRef(0);

  const initData = getTelegramInitData();

  function retrySync() {
    setError(null);
    setLoadAttempt((current) => current + 1);
  }

  function beginPending(kind: string) {
    if (pendingRef.current !== null) return false;
    pendingRef.current = kind;
    syncRevisionRef.current += 1;
    setPending(kind);
    return true;
  }

  function endPending() {
    pendingRef.current = null;
    setPending(null);
  }

  const syncProfile = useCallback(async (signal?: AbortSignal) => {
    if (!initData) throw new Error("Telegram unavailable");
    const next = await loadArenaProfile(initData, signal);
    setProfile(next);
    onPlayerSummaryChange({ arenaLeagueIndex: next.arenaLeague.index, arenaRating: next.arenaRating, arenaTokens: next.arenaTokens, arenaTop3Count: next.arenaTop3Count, arenaWins: next.arenaWins, cardShards: next.cardShards });
    return next;
  }, [initData, onPlayerSummaryChange]);

  const syncMatch = useCallback(async (signal?: AbortSignal, hideFinished = false) => {
    if (!initData) throw new Error("Telegram unavailable");
    const syncRevision = syncRevisionRef.current;
    const response = await loadActiveArena(initData, signal);
    if (syncRevision !== syncRevisionRef.current) return null;
    const next = hideFinished && response.arena?.status === "finished" ? null : response.arena;
    setQueueState((current) => sameQueueView(current, response.queue) ? current : response.queue);
    setMatch((current) => sameArenaView(current, next) ? current : next);
    if (next?.result) {
      onPlayerSummaryChange(next.result.player);
      setProfile((current) => current ? {
        ...current,
        arenaLeague: next.result!.leagueAfter,
        arenaRating: next.result!.reward.ratingAfter,
        arenaTokens: next.result!.player.arenaTokens ?? current.arenaTokens,
        arenaTop3Count: next.result!.player.arenaTop3Count ?? current.arenaTop3Count,
        arenaWins: next.result!.player.arenaWins ?? current.arenaWins,
        cardShards: next.result!.player.cardShards ?? current.cardShards,
      } : current);
    }
    return next;
  }, [initData, onPlayerSummaryChange]);

  const loadShopCatalog = useCallback(async () => {
    if (!initData || catalog || catalogLoadInFlightRef.current) return;
    catalogLoadInFlightRef.current = true;
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      setCatalog(await loadArenaShop(initData));
    } catch {
      setCatalogError("Магазин тимчасово недоступний.");
    } finally {
      catalogLoadInFlightRef.current = false;
      setCatalogLoading(false);
    }
  }, [catalog, initData]);

  useEffect(() => {
    if (!initData) { setError("Арена доступна лише в Telegram Mini App"); return; }
    const controller = new AbortController();
    void Promise.all([syncProfile(controller.signal), syncMatch(controller.signal, true)]).catch((reason: unknown) => { if (!(reason instanceof DOMException && reason.name === "AbortError")) setError("Не вдалося завантажити арену"); });
    return () => controller.abort();
  }, [initData, loadAttempt, syncMatch, syncProfile]);

  useEffect(() => {
    const shouldPoll = Boolean(initData && pending === null && (match?.status === "active" || queueState));
    if (!shouldPoll) return;
    const timer = window.setInterval(() => {
      if (pendingRef.current !== null || pollInFlightRef.current) return;
      pollInFlightRef.current = true;
      void syncMatch().catch(() => undefined).finally(() => { pollInFlightRef.current = false; });
    }, 1_200);
    return () => window.clearInterval(timer);
  }, [initData, match?.status, pending, queueState, syncMatch]);

  async function queue() {
    if (!initData) return;
    if (!beginPending("queue")) return;
    setError(null);
    try {
      const response = await joinArenaQueue(initData);
      setMatch(response.match);
      setQueueState(response.queue);
      await syncProfile();
    } catch (reason: unknown) { setError(reason instanceof ArenaApiError && reason.code === "invalid_battle_deck" ? "Потрібна повна бойова колода 3/2/2/2." : "Не вдалося поставити бій у чергу"); } finally { endPending(); }
  }

  async function leaveQueue() {
    if (!initData) return;
    if (!beginPending("leave-queue")) return;
    setError(null);
    try { await leaveArenaQueue(initData); setQueueState(null); } catch { setError("Не вдалося скасувати запис."); } finally { endPending(); }
  }

  async function mutate(kind: string, call: () => Promise<ArenaView>) {
    if (!match || !beginPending(kind)) return;
    setError(null);
    try { const next = await call(); setMatch(next); if (next.result) onPlayerSummaryChange(next.result.player); } catch (reason: unknown) {
      if (reason instanceof ArenaApiError && reason.code === "arena_state_conflict") await syncMatch();
      else setError("Стан бою змінився. Синхронізуйте та спробуйте ще раз.");
    } finally { endPending(); }
  }

  async function purchase(offerId: string) {
    if (!initData) return;
    if (!beginPending(offerId)) return;
    setError(null);
    try { const result = await purchaseArenaShopItem(initData, { offerId }); onPlayerSummaryChange({ arenaTokens: result.arenaTokens, cardShards: result.cardShards, gold: result.playerGold, silver: result.silver }); if (result.collectionCompleted) onCollectionCompleted(result.collectionCompleted); await syncProfile(); } catch (reason: unknown) { setError(reason instanceof ArenaApiError && reason.code === "insufficient_arena_tokens" ? "Недостатньо жетонів Арени." : "Покупку не виконано."); } finally { endPending(); }
  }

  if (!profile) return <div className="arena-screen"><ArenaHeading onBack={onBack} /><div className="arena-empty-state" role={error ? "alert" : "status"}><span>{error ?? "Завантажуємо арену…"}</span>{error && initData ? <button className="duel-secondary-button" onClick={retrySync} type="button">Повторити</button> : null}</div></div>;
  if (match && !resultReady) return <div className="arena-screen arena-screen--battle"><ArenaHeading onBack={onBack} /><ArenaBattle match={match} pending={pending} onAction={(slot) => { if (initData) void mutate(`slot-${slot}`, () => submitArenaAction(initData, match.matchId, { slotIndex: slot, expectedVersion: match.version })); }} onTarget={(targetId) => { if (initData) void mutate("target", () => changeArenaTarget(initData, match.matchId, { expectedVersion: match.version, ...(targetId ? { targetId } : {}) })); }} onCards={() => { if (initData) void mutate("cards", () => changeArenaCards(initData, match.matchId, { expectedVersion: match.version })); }} /></div>;
  if (match?.status === "finished") return (
    <div className="arena-screen">
      <ArenaHeading onBack={onBack} />
      <ArenaTabs active={tab} onChange={setTab} />
      {error ? <><p className="arena-error" role="alert">{error}</p><button className="duel-secondary-button" disabled={pending !== null} onClick={retrySync} type="button">Оновити стан</button></> : null}
      {tab === "battle" ? <ArenaResult match={match} onArena={() => { setMatch(null); setQueueState(null); setError(null); setTab("battle"); }} onQueue={() => void queue()} /> : null}
      {tab === "league" ? <LeagueTab initData={initData} profile={profile} /> : null}
      {tab === "shop" ? <ShopTab catalog={catalog} catalogError={catalogError} catalogLoading={catalogLoading} onLoad={loadShopCatalog} onPurchase={(id) => void purchase(id)} pending={pending} profile={profile} /> : null}
    </div>
  );
  if (queueState) return <div className="arena-screen"><ArenaHeading onBack={onBack} /><ArenaQueuePanel onLeave={() => void leaveQueue()} pending={pending} queue={queueState} /></div>;

  return (
    <div className="arena-screen">
      <ArenaHeading onBack={onBack} />
      <FirstVisitHint id="arena" title="Арена" items={["Обери суперника.", "Обери карту для атаки.", "Переможці — троє з найбільшою шкодою. Менше 3 ходів — бій не зараховується.", "Жетони арени можна витрачати в її магазині."]} />
      <ArenaTabs active={tab} onChange={setTab} />
      {error ? <><p className="arena-error" role="alert">{error}</p><button className="duel-secondary-button" disabled={pending !== null} onClick={retrySync} type="button">Оновити стан</button></> : null}
      {tab === "battle" ? <section className="arena-lobby"><div className="arena-lobby__hero"><AppIcon name="arena" size={46} /><div><span>6 учасників · 15 секунд</span><h2>Готові вийти на пісок?</h2><p>Перемагають троє, хто завдав найбільше шкоди. Зробіть щонайменше 3 ходи, щоб бій зарахувався.</p></div></div><div className="arena-lobby__stats"><span>Ліга <b>{profile.arenaLeague.name}</b></span><span>Рейтинг <b>{profile.arenaRating}</b></span><span>Жетони <ArenaTokenBalance value={profile.arenaTokens} /></span></div><button className="duel-primary-button" disabled={pending !== null} onClick={() => void queue()} type="button">{pending === "queue" ? "Записуємо в чергу…" : "Записатися на арену"}</button></section> : null}
      {tab === "league" ? <LeagueTab initData={initData} profile={profile} /> : null}
      {tab === "shop" ? <ShopTab catalog={catalog} catalogError={catalogError} catalogLoading={catalogLoading} onLoad={loadShopCatalog} onPurchase={(id) => void purchase(id)} pending={pending} profile={profile} /> : null}
    </div>
  );
}
