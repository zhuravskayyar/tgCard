import { useState } from "react";
import type { NicknameSkinId } from "@cardastika/shared";
import { AppIcon } from "../components/AppIcon";
import { NicknameSkinPreview } from "../components/NicknameSkinPreview";
import { usePlayerInventory } from "../hooks/usePlayerInventory";

interface InventoryScreenProps {
  nickname: string;
  onBack: () => void;
  onEquippedSkinChange: (skinId: NicknameSkinId | null) => void;
}

type InventoryTab = "cosmetics" | "items";

export function InventoryScreen({ nickname, onBack, onEquippedSkinChange }: InventoryScreenProps) {
  const { equip, pending, retry, state } = usePlayerInventory();
  const [tab, setTab] = useState<InventoryTab>("cosmetics");
  const inventory = state.status === "ready" ? state.data : null;

  async function handleEquip(skinId: NicknameSkinId | null) {
    const next = await equip(skinId);
    if (next) onEquippedSkinChange(next.equippedNicknameSkin);
  }

  return (
    <section className="inventory-screen">
      <header className="inventory-heading">
        <button aria-label="Назад" className="screen-back" onClick={onBack} type="button"><AppIcon name="chevron" size={19} /></button>
        <div><span>Сховище мандрівника</span><h1>ІНВЕНТАР</h1></div>
      </header>

      <div className="inventory-tabs" role="tablist" aria-label="Розділ інвентарю">
        <button aria-selected={tab === "cosmetics"} className={tab === "cosmetics" ? "inventory-tab inventory-tab--active" : "inventory-tab"} onClick={() => setTab("cosmetics")} role="tab" type="button">
          <AppIcon name="profile" size={21} /> <span>Косметика</span>
        </button>
        <button aria-selected={tab === "items"} className={tab === "items" ? "inventory-tab inventory-tab--active" : "inventory-tab"} onClick={() => setTab("items")} role="tab" type="button">
          <AppIcon name="inventory" size={21} /> <span>Предмети</span>
        </button>
      </div>

      {state.status === "loading" ? <div className="inventory-state">Завантаження інвентарю…</div> : null}
      {state.status === "unavailable" ? <div className="inventory-state">Інвентар доступний після запуску через Telegram.</div> : null}
      {state.status === "error" ? <div className="inventory-state inventory-state--error"><span>Не вдалося завантажити інвентар.</span><button onClick={retry} type="button">Повторити</button></div> : null}

      {inventory && tab === "cosmetics" ? (
        <section className="inventory-section" aria-labelledby="inventory-cosmetics-heading">
          <div className="inventory-section__heading"><div><span>Візуальні ефекти профілю</span><h2 id="inventory-cosmetics-heading">ОФОРМЛЕННЯ НІКУ</h2></div><strong>{inventory.cosmetics.length}/3</strong></div>
          <div className="inventory-cosmetic-list">
            <article className={`inventory-cosmetic${inventory.equippedNicknameSkin === null ? " inventory-cosmetic--equipped" : ""}`}>
              <NicknameSkinPreview compact nickname={nickname} />
              <div><strong>Стандартний</strong><small>Без ефекту</small></div>
              <button disabled={pending !== null || inventory.equippedNicknameSkin === null} onClick={() => void handleEquip(null)} type="button">{pending === "standard" ? "Застосовуємо…" : inventory.equippedNicknameSkin === null ? "Обрано" : "Обрати"}</button>
            </article>
            {inventory.cosmetics.map((cosmetic) => (
              <article className={`inventory-cosmetic${cosmetic.equipped ? " inventory-cosmetic--equipped" : ""}`} key={cosmetic.id}>
                <NicknameSkinPreview compact nickname={nickname} skinId={cosmetic.id} />
                <div><strong>{cosmetic.name}</strong><small>Міфічна косметика</small></div>
                <button disabled={pending !== null || cosmetic.equipped} onClick={() => void handleEquip(cosmetic.id)} type="button">{pending === cosmetic.id ? "Застосовуємо…" : cosmetic.equipped ? "Обрано" : "Обрати"}</button>
              </article>
            ))}
          </div>
          {!inventory.cosmetics.length ? <p className="inventory-empty">Придбай оформлення ніку в магазині, щоб воно з'явилося тут.</p> : null}
          {state.status === "ready" && pending === null && inventory.equippedNicknameSkin === null ? <p className="inventory-hint">Стандартний стиль активний.</p> : null}
        </section>
      ) : null}

      {inventory && tab === "items" ? (
        <section className="inventory-section" aria-labelledby="inventory-items-heading">
          <div className="inventory-section__heading"><div><span>Ресурси та витратні матеріали</span><h2 id="inventory-items-heading">ПРЕДМЕТИ</h2></div><strong>{inventory.items.length}</strong></div>
          {inventory.items.length ? <div className="inventory-item-list">{inventory.items.map((item) => <article className="inventory-item" key={item.id}><AppIcon name="inventory" size={28} /><div><strong>{item.name}</strong><small>{item.type}</small></div><b>×{item.quantity}</b></article>)}</div> : <p className="inventory-empty">Предметів поки немає.</p>}
        </section>
      ) : null}
    </section>
  );
}
