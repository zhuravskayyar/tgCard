import { useState } from "react";
import type { NicknameSkinId, PlayerSummary } from "@cardastika/shared";
import { AppIcon } from "./AppIcon";
import { NicknameSkinPreview } from "./NicknameSkinPreview";
import { ShopWallet } from "./ShopWallet";
import { useNicknameSkinShop } from "../hooks/useNicknameSkinShop";

interface NicknameSkinShopPanelProps {
  nickname: string;
  onBalanceChange: (balance: Partial<Pick<PlayerSummary, "arenaTokens">>) => void;
  onEquippedSkinChange: (skinId: NicknameSkinId | null) => void;
}

const purchaseErrorMessages: Record<string, string> = {
  insufficient_arena_tokens: "Недостатньо жетонів.",
  nickname_skin_already_owned: "Цей стиль уже є в інвентарі.",
  database_unavailable: "Косметика тимчасово недоступна.",
};

export function NicknameSkinShopPanel({ nickname, onBalanceChange, onEquippedSkinChange }: NicknameSkinShopPanelProps) {
  const { purchase, purchaseErrorCode, purchasing, retry, state } = useNicknameSkinShop();
  const [previewIndex, setPreviewIndex] = useState(0);
  const [selectedSkin, setSelectedSkin] = useState<NicknameSkinId | null>(null);
  const [choiceOpen, setChoiceOpen] = useState(false);
  const offer = state.status === "ready" ? state.offer : null;
  const activeChoice = offer?.choices[previewIndex % offer.choices.length];
  const isCollectionComplete = offer ? offer.progress.owned === offer.progress.total : false;
  const tokenShortage = offer ? Math.max(0, offer.price - offer.tokenBalance) : 0;

  function openChoice() {
    if (!offer || !offer.canAfford || isCollectionComplete) return;
    setSelectedSkin(null);
    setChoiceOpen(true);
  }

  async function confirmChoice() {
    if (!selectedSkin || purchasing) return;
    const result = await purchase(selectedSkin);
    if (!result) return;
    onBalanceChange(result.updatedBalance);
    onEquippedSkinChange(result.inventory.equippedNicknameSkin);
    setChoiceOpen(false);
    setSelectedSkin(null);
  }

  return (
    <section className="nickname-shop-section" aria-labelledby="nickname-shop-heading">
      <ShopWallet items={[{ id: "arena-tokens", icon: <AppIcon name="arena-token" size={18} />, label: "Жетони", value: offer?.tokenBalance }]} />
      <div className="shop-section-heading"><span aria-hidden="true" /><h2 id="nickname-shop-heading">КОСМЕТИКА</h2><span aria-hidden="true" /></div>
      {state.status === "loading" ? <div className="shop-state">Завантаження косметики…</div> : null}
      {state.status === "unavailable" ? <div className="shop-state">Косметика доступна після запуску через Telegram.</div> : null}
      {state.status === "error" ? <div className="shop-state shop-state--error"><span>Не вдалося завантажити косметику.</span><button onClick={retry} type="button">Повторити</button></div> : null}
      {offer && activeChoice ? (
        <article className="nickname-pack-card">
          <div className="nickname-pack-card__visual">
            <div className="nickname-pack-card__visual-heading"><span>Живе прев’ю</span><strong>{activeChoice.name}</strong></div>
            <NicknameSkinPreview nickname={nickname} skinId={activeChoice.id} />
            <div aria-label="Варіанти стилю" className="nickname-pack-card__series" role="group">
              {offer.choices.map((choice, index) => {
                const owned = offer.ownedSkinIds.includes(choice.id);
                const equipped = offer.equippedSkinId === choice.id;
                return (
                  <button aria-label={`Показати ${choice.name}`} className={`nickname-series-item${previewIndex === index ? " nickname-series-item--active" : ""}${owned ? " nickname-series-item--owned" : ""}`} key={choice.id} onClick={() => setPreviewIndex(index)} type="button">
                    <NicknameSkinPreview compact nickname={nickname} skinId={choice.id} />
                    <strong>{choice.name}</strong>
                    <small>{equipped ? "Використовується" : owned ? "Придбано" : "Доступно"}</small>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="nickname-pack-card__body">
            <div><span>Серія 01 · 3 стилі</span><h3>{offer.name}</h3><p>{offer.subtitle}</p></div>
            <div className="nickname-pack-card__progress"><span>Колекція</span><strong>{offer.progress.owned}/{offer.progress.total}</strong></div>
            <span aria-label={`Прогрес колекції: ${offer.progress.owned} з ${offer.progress.total}`} className="nickname-pack-card__progress-track"><span style={{ width: `${(offer.progress.owned / offer.progress.total) * 100}%` }} /></span>
            {isCollectionComplete ? <p className="nickname-pack-card__complete">Колекцію завершено</p> : null}
            <button className={`nickname-pack-card__buy${!offer.canAfford && !isCollectionComplete ? " nickname-pack-card__buy--insufficient" : ""}`} disabled={!offer.canAfford || isCollectionComplete || purchasing} onClick={openChoice} type="button">
              {purchasing ? "Підтверджуємо…" : isCollectionComplete ? "Колекцію завершено" : offer.canAfford ? <><AppIcon name="arena-token" size={18} />Купити за {offer.price}</> : <><span>Не вистачає {tokenShortage}</span><AppIcon name="arena-token" size={18} /></>}
            </button>
            {!isCollectionComplete ? <small>Обери 1 із 3 стилів · після покупки його можна екіпірувати</small> : null}
          </div>
        </article>
      ) : null}
      {purchaseErrorCode ? <p className="shop-error" role="alert">{purchaseErrorMessages[purchaseErrorCode] ?? "Не вдалося придбати стиль."}</p> : null}

      {choiceOpen && offer ? (
        <div className="nickname-choice-overlay" role="presentation">
          <div aria-labelledby="nickname-choice-heading" aria-modal="true" className="nickname-choice-dialog" role="dialog">
            <button aria-label="Закрити" className="nickname-choice-dialog__close" onClick={() => setChoiceOpen(false)} type="button">×</button>
            <span>Міфічна косметика · {offer.price} жетонів</span>
            <h2 id="nickname-choice-heading">ОБЕРИ СКІН НІКУ</h2>
            <p>Обраний стиль буде доданий до інвентарю. Жетони спишуться після підтвердження.</p>
            <div className="nickname-choice-list">
              {offer.choices.map((choice) => {
                const owned = offer.ownedSkinIds.includes(choice.id);
                const equipped = offer.equippedSkinId === choice.id;
                const selected = selectedSkin === choice.id;
                return (
                  <article className={`nickname-choice${selected ? " nickname-choice--selected" : ""}${owned ? " nickname-choice--owned" : ""}`} key={choice.id}>
                    <NicknameSkinPreview nickname={nickname} skinId={choice.id} />
                    <div><strong>{choice.name}</strong><small>{equipped ? "Використовується" : owned ? "Придбано" : "Міфічна косметика"}</small></div>
                    <button disabled={owned || purchasing} onClick={() => setSelectedSkin(choice.id)} type="button">{equipped ? "Використовується" : owned ? "Придбано" : selected ? "Обрано" : "Обрати"}</button>
                  </article>
                );
              })}
            </div>
            <div className="nickname-choice-dialog__actions">
              <button className="nickname-choice-dialog__cancel" onClick={() => setChoiceOpen(false)} type="button">Скасувати</button>
              <button className="nickname-choice-dialog__confirm" disabled={!selectedSkin || purchasing} onClick={() => void confirmChoice()} type="button">{purchasing ? "Списуємо…" : "Підтвердити покупку"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
