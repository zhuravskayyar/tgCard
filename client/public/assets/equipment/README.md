# Equipment sprite contract

Keep one transparent WebP sprite per base item family. Rarity is never part of the filename and is rendered by CSS classes.

## Naming

- Things: `/assets/equipment/items/{slot}-{element}.webp`
- Artifacts: `/assets/equipment/artifacts/{artifact}.webp`
- Rarity classes: `rarity-common`, `rarity-uncommon`, `rarity-rare`, `rarity-epic`, `rarity-legendary`, `rarity-mythic`

Examples:

- `/assets/equipment/items/boots-fire.webp`
- `/assets/equipment/items/head-water.webp`
- `/assets/equipment/artifacts/amulet.webp`
- `/assets/equipment/artifacts/voodoo.webp`

The catalog keeps separate records for every rarity because rarity controls stats, drops and forge results. Those records reuse the same `assetKey`: `boots-fire` or `amulet`.

`client/src/equipment/equipmentAssets.ts` resolves an item definition to its public sprite path. `EquipmentArt` loads the sprite and falls back to the generic slot icon while an asset is missing. Legendary and mythic rarity VFX are CSS-only.
