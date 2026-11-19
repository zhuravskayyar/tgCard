import { useEffect, type CSSProperties } from "react";
import { CardFxWrapper } from "../../components/CardFxWrapper";
import { CardHud } from "../../components/CardHud";
import type { BattlePassFinalCardPreview, BattlePassCatalog, BattlePassCatalogEntry, BattlePassCircleView, BattlePassMilestoneView, BattlePassOwnedItem, BattlePassReward } from "@cardastika/shared";
import { formatFullUiNumber, getUiLocale, translateUi } from "../../i18n";
import { rewardIcon } from "./rewardIcons";

const tx = (value: string) => translateUi(value, getUiLocale());
const DIAMOND_ASSET = "/assets/ui/icons/icon-diamond-v1.webp";
const CARD_BACK = "/assets/ui/cards/card-back-v2.webp";

type TileState = "claimed" | "ready" | "locked";

/** The catalog line that explains a reward: items by kind, VIP equipment apart from the free one. */
export function catalogIdFor(reward: BattlePassReward, vip: boolean) {
  if (reward.kind === "item") return reward.item;
  if (reward.kind === "equipment" && vip) return "vip-equipment";
  return reward.kind;
}

/**
 * A reward in its medallion with the caption beside it (free: caption on the left, VIP: on the right).
 * A ready reward claims on tap; any other opens its description.
 */
function RewardTile({ caption, onClaim, onInfo, pending, reward, rewardId, state, vip = false }: {
  caption: string;
  onClaim: (id: string) => void;
  onInfo: (catalogId: string) => void;
  pending: boolean;
  reward: BattlePassReward;
  rewardId: string;
  state: TileState;
  vip?: boolean;
}) {
  const icon = rewardIcon(reward.kind === "item" ? reward.item : reward.kind);
  const ready = state === "ready";
  return (
    <button
      aria-label={ready ? `${tx("Забрати")}: ${tx(caption)}` : tx(caption)}
      className={`reward-track__tile reward-track__tile--${state}${vip ? " reward-track__tile--vip" : ""}`}
      disabled={ready && pending}
      onClick={() => (ready ? onClaim(rewardId) : onInfo(catalogIdFor(reward, vip)))}
      type="button"
    >
      <span className="reward-track__medallion" aria-hidden="true">
        <img alt="" className="reward-track__icon" src={icon} />
        {state === "claimed" ? <img alt="" className="reward-track__seal" src="/assets/ui/trials/board/seal-v1.webp" /> : null}
      </span>
      <span className="reward-track__caption">
        <strong>{tx(caption)}</strong>
        {ready ? <small className="reward-track__claim">{pending ? tx("Відкриваємо…") : tx("Забрати")}</small> : null}
      </span>
    </button>
  );
}

/** Short caption of a free reward: the amount, not the long label. */
function freeCaption(reward: BattlePassReward) {
  if (reward.kind === "boost") return `×${reward.multiplier} · ${tx("24 год")}`;
  return reward.label;
}

function milestoneTiles(milestone: BattlePassMilestoneView, vipActive: boolean) {
  // The server decides what can be claimed; everything else simply waits, as in the reference.
  const free: TileState = milestone.claimed ? "claimed" : milestone.claimable ? "ready" : "locked";
  const vipReward = milestone.vip;
  const vip: TileState | null = !vipReward ? null
    : vipReward.claimed ? "claimed"
      : vipActive && vipReward.claimable ? "ready" : "locked";
  return { free, vip };
}

/**
 * Share of the spine to light up. Rows are evenly spaced but thresholds are not, so the fill is
 * interpolated row by row: a stop's centre lights up exactly when its threshold is reached.
 */
function spineFill(thresholds: readonly number[], from: number, to: number, diamonds: number) {
  const rows = thresholds.length;
  if (rows === 0) return Math.min(1, Math.max(0, (diamonds - from) / Math.max(1, to - from)));
  const points = [{ at: 0, value: from }, ...thresholds.map((value, index) => ({ at: (index + .5) / rows, value })), { at: 1, value: to }];
  if (diamonds <= from) return 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!;
    const next = points[index]!;
    if (diamonds <= next.value) return previous.at + (next.at - previous.at) * (diamonds - previous.value) / Math.max(1, next.value - previous.value);
  }
  return 1;
}

/** One small card picture: the real card art with its power, or the card back while it is unknown. */
function FinalCardFace({ preview, vip }: { preview: BattlePassFinalCardPreview | null; vip: boolean }) {
  if (!preview) return <img alt="" aria-hidden="true" className="reward-track__card-back" src={CARD_BACK} />;
  return (
    <span aria-hidden="true" className={`reward-track__card-face campaign-boss-reward-card deck-card--${preview.element} deck-card--${preview.rarity}${vip ? " reward-track__card-face--vip" : ""}`}>
      <CardFxWrapper artKey={preview.artKey} cardId={preview.cardId} element={preview.element} rarity={preview.rarity}>
        <CardHud element={preview.element} level={preview.level} power={preview.finalPower} rarity={preview.rarity} />
      </CardFxWrapper>
      {vip ? <img alt="" className="reward-track__card-crest" src="/assets/ui/battle-pass/bp-vip-crest-v1.webp" /> : null}
    </span>
  );
}

/**
 * The circle's final card, shown in advance like the reference: the card itself, then an arrow to the
 * same card in the VIP frame. With VIP bought only the VIP card is shown, since that is what comes.
 */
function FinalCard({ milestone, onClaim, onInfo, pending, preview, state, vipActive }: {
  milestone: BattlePassMilestoneView;
  onClaim: (id: string) => void;
  onInfo: (catalogId: string) => void;
  pending: boolean;
  preview: BattlePassFinalCardPreview | null;
  state: TileState;
  vipActive: boolean;
}) {
  const reward = milestone.reward!;
  const ready = state === "ready";
  const title = preview ? preview.displayName ?? preview.code : reward.label;
  return (
    <button
      aria-label={ready ? `${tx("Забрати")}: ${tx(title)}` : tx(title)}
      className={`reward-track__card reward-track__card--${state}`}
      disabled={ready && pending}
      onClick={() => (ready ? onClaim(milestone.id) : onInfo(catalogIdFor(reward, false)))}
      type="button"
    >
      <span className="reward-track__card-pair">
        {vipActive ? null : <FinalCardFace preview={preview} vip={false} />}
        {vipActive || preview ? (
          <>
            {vipActive ? null : <img alt="" aria-hidden="true" className="reward-track__card-arrow" src="/assets/ui/icons/icon-arrow-up-v1.webp" />}
            <span className="reward-track__card-vip">
              <FinalCardFace preview={preview} vip />
            </span>
          </>
        ) : null}
        {state === "claimed" ? <img alt="" aria-hidden="true" className="reward-track__seal" src="/assets/ui/trials/board/seal-v1.webp" /> : null}
      </span>
      {ready ? <span className="reward-track__caption"><small className="reward-track__claim">{pending ? tx("Відкриваємо…") : tx("Забрати")}</small></span> : null}
    </button>
  );
}

/**
 * One circle as a vertical track: free rewards on the left, VIP on the right, the diamond
 * threshold in the middle and the final card below. The spine fills up to the player's diamonds.
 */
export function RewardTrack({ circle, diamonds, onClaim, onInfo, onOpenItems, pendingId, totalCircles, vipActive }: {
  circle: BattlePassCircleView;
  diamonds: number;
  onClaim: (id: string) => void;
  onInfo: (catalogId: string | null) => void;
  onOpenItems: () => void;
  pendingId: string | null;
  totalCircles: number;
  vipActive: boolean;
}) {
  const stops = circle.milestones.slice(0, -1);
  const final = circle.milestones.at(-1)!;
  const filled = spineFill(stops.map(({ threshold }) => threshold), circle.fromDiamonds, final.threshold, diamonds);
  const finalTiles = milestoneTiles(final, vipActive);
  return (
    <section aria-label={tx("Нагороди кола")} className="reward-track">
      <p className="reward-track__circle">
        {tx(`Зібрано алмазів (іде ${circle.circle} коло сезону з ${totalCircles})`)}
        <span><img alt="" aria-hidden="true" src={DIAMOND_ASSET} />{formatFullUiNumber(Math.floor(diamonds))}</span>
      </p>
      <div className="reward-track__heads" aria-hidden="true">
        <span>{tx("Нагороди для всіх магів")}</span>
        <span />
        <span className="reward-track__heads-vip">{tx("Нагороди у VIP-доступі")}</span>
      </div>
      <div className="reward-track__rows" style={{ "--track-done": diamonds >= final.threshold ? 1 : 0, "--track-fill": filled } as CSSProperties}>
        <span aria-hidden="true" className="reward-track__spine"><i /></span>
        <img alt="" aria-hidden="true" className="reward-track__pin" src="/assets/ui/battle-pass-map/pin-v1.webp" />
        {stops.map((milestone) => {
          const tiles = milestoneTiles(milestone, vipActive);
          const reached = diamonds >= milestone.threshold;
          return (
            <div className={`reward-track__row${reached ? " reward-track__row--reached" : ""}`} key={milestone.id}>
              <div className="reward-track__side reward-track__side--free">
                {milestone.reward ? <RewardTile caption={freeCaption(milestone.reward)} onClaim={onClaim} onInfo={onInfo} pending={pendingId === milestone.id} reward={milestone.reward} rewardId={milestone.id} state={tiles.free} /> : null}
              </div>
              <span className="reward-track__threshold">
                <strong>{formatFullUiNumber(milestone.threshold)}</strong>
              </span>
              <div className="reward-track__side reward-track__side--vip">
                {milestone.vip && tiles.vip ? <RewardTile caption={milestone.vip.reward.label} onClaim={onClaim} onInfo={onInfo} pending={pendingId === milestone.vip.id} reward={milestone.vip.reward} rewardId={milestone.vip.id} state={tiles.vip} vip /> : null}
              </div>
            </div>
          );
        })}
      </div>
      <div className={`reward-track__final${diamonds >= final.threshold ? " reward-track__final--reached" : ""}`}>
        <span className="reward-track__threshold reward-track__threshold--final">
          <img alt="" aria-hidden="true" src={DIAMOND_ASSET} />
          <strong>{formatFullUiNumber(final.threshold)}</strong>
        </span>
        {final.reward ? <FinalCard milestone={final} onClaim={onClaim} onInfo={onInfo} pending={pendingId === final.id} preview={circle.finalCard ?? null} state={finalTiles.free} vipActive={vipActive} /> : null}
        <button className="eq-button reward-track__items-button" onClick={onOpenItems} type="button">{tx("Мої магічні предмети")}</button>
        <button className="reward-track__info-link" onClick={() => onInfo(null)} type="button">{tx("Опис магічних предметів")}</button>
      </div>
    </section>
  );
}

function CatalogEntry({ entry, focused }: { entry: BattlePassCatalogEntry; focused: boolean }) {
  return (
    <li className={`reward-catalog__entry${focused ? " reward-catalog__entry--focused" : ""}`} id={`reward-info-${entry.id}`}>
      <span aria-hidden="true" className="reward-track__medallion reward-catalog__medallion"><img alt="" className="reward-track__icon" src={rewardIcon(entry.icon)} /></span>
      <div>
        <strong>{tx(entry.title)}</strong>
        <p>{tx(entry.effect)}</p>
        <p className="reward-catalog__usage">• {tx(entry.usage)}</p>
      </div>
    </li>
  );
}

/** «Опис магічних предметів»: every reward of the season with what it does; opens on the tapped one. */
export function RewardCatalog({ catalog, focusId }: { catalog: BattlePassCatalog; focusId: string | null }) {
  useEffect(() => {
    if (focusId) document.getElementById(`reward-info-${focusId}`)?.scrollIntoView({ block: "center" });
  }, [focusId]);
  return (
    <section aria-label={tx("Опис магічних предметів")} className="reward-catalog">
      <h3 className="reward-catalog__group">{tx("Нагороди для всіх магів")}</h3>
      <ul>{catalog.free.map((entry) => <CatalogEntry entry={entry} focused={entry.id === focusId} key={entry.id} />)}</ul>
      <h3 className="reward-catalog__group reward-catalog__group--vip">{tx("Нагороди VIP-доступу")}</h3>
      <ul>{catalog.vip.map((entry) => <CatalogEntry entry={entry} focused={entry.id === focusId} key={entry.id} />)}</ul>
      <p className="reward-catalog__rule">{tx(catalog.uniqueRule)}</p>
    </section>
  );
}

/** «Мої магічні предмети»: what the player holds now; each line opens its description. */
export function OwnedItems({ catalog, onInfo, owned }: { catalog: BattlePassCatalog; onInfo: (catalogId: string) => void; owned: readonly BattlePassOwnedItem[] }) {
  const entries = owned.map((item) => ({ entry: catalog.vip.find(({ id }) => id === item.item), item })).filter((line) => line.entry);
  return (
    <section aria-label={tx("Мої магічні предмети")} className="reward-catalog">
      {entries.length ? (
        <ul>
          {entries.map(({ entry, item }) => (
            <li className="reward-catalog__entry" key={item.item}>
              <span aria-hidden="true" className="reward-track__medallion reward-catalog__medallion"><img alt="" className="reward-track__icon" src={rewardIcon(item.item)} /></span>
              <button className="reward-catalog__owned" onClick={() => onInfo(item.item)} type="button">
                <strong>{tx(entry!.title)} <small>× {formatFullUiNumber(item.quantity)}</small></strong>
                <p className="reward-catalog__usage">• {tx(entry!.usage)}</p>
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="reward-catalog__empty">{tx("У тебе поки немає магічних предметів.")}</p>}
    </section>
  );
}
