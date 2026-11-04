# Full card detail reference

Generated with the built-in `image_gen` tool from the full card-detail reference supplied on 2026-10-27. These extend the assets documented in [card-upgrade-assets.md](card-upgrade-assets.md).

Final files in `client/public/assets/ui/upgrade/`:

- `navigation-row-v1.webp`: shared `MenuRow` book variant and expandable weak-card header.
- `protection-strip-v1.webp`: separate protection control.
- `weak-empty-v1.webp`: empty weak-card drawer.
- `icon-deck-v1.webp`, `icon-weak-v1.webp`, `icon-shop-v1.webp`: transparent raster navigation icons.

Transparent margins were trimmed for packaging. Icons were fitted to a 256 × 256 transparent canvas. All final files use lossless WebP; generated originals remain in the Codex generated image directory. Text, values, buttons, collapse state, and server-backed actions remain in React.

## Prompt set

### navigation-row

Use case: ui-mockup. Production game UI sprite. Image 1 is the exact material and composition reference. Create ONLY one empty horizontal navigation plaque like the lower DECK and WEAK CARDS rows: aged cream parchment inside a crisp thin antique bronze and gold ornamental frame, compact heraldic projecting ends and rivets. At the far left, an attached blank dark brown octagonal medallion reserved for a separately rendered icon; the long middle must be clear cream parchment; at the right leave clear parchment for a separate arrow. Approximately 8:1. No text, letters, numbers, arrow, cards, icons, or symbols. Straight-on orthographic view, no perspective. Match the reference's worn bestiary-book style, no modern UI, no glossy plastic. True transparent exterior, opaque interior, entire sprite tightly framed.

### protection-strip

Use case: ui-mockup. Production game UI sprite. Image 1 is the style reference. Create ONLY an empty parchment protection-control strip like the row under the three stats: a shallow rectangular cream parchment panel in a narrow finely engraved antique gold and bronze frame, small decorative corner brackets and modest rivets, balanced straight sides. About 6:1. Plain parchment throughout for a live lock icon, live label and live toggle to be rendered in code. Do not include any lock, switch, knob, letters, numbers, text, symbols, dark medallion, or divider. Crisp tactile book UI matching Image 1. Orthographic front view. Transparent outside the frame, fully opaque paper inside, tightly cropped whole silhouette.

### weak-empty-panel

Use case: ui-mockup. Production game UI background sprite. Image 1 is the style and composition reference. Create ONLY the dark expanded empty-card drawer under WEAK CARDS: a very wide shallow dark brown aged parchment and leather panel, narrow subtle antique bronze border, dim faint engraved stack of old decorative cards on the left quarter, the card backs may show a small fleur-de-lis but absolutely no readable lettering, a tiny engraved fleur-de-lis at lower center with a fine horizontal rule to each side. Leave the central and right 70% plain and dark for live warm beige empty-state copy. About 4.5:1. No text, words, numbers, labels, creatures, people, UI button, or bright glow. Match the reference's bestiary book, flat front view. True transparent outside, opaque dark interior, tight crop.

### deck-row-icon

Use case: stylized-concept. One small production game navigation icon for Image 1's dark octagonal medallions. A compact fan of four old playing-card backs, each with fine antique bronze and warm ivory edges, the front card has a simple engraved fleur-de-lis. Match the lower DECK icon in Image 1: hand-engraved fantasy book UI, crisp readable silhouette and restrained aged gold highlights, no glossy shine. The icon must contrast against dark brown. Only the card stack, no medallion, no background, no panel, no letters, no numbers, no words. Square icon, centered, whole object visible with minimal padding, true transparent background.

### weak-row-icon

Use case: stylized-concept. One small production game navigation icon for Image 1's dark octagonal medallions. Two overlapping worn old cards, the front card slightly tilted with an engraved small broken corner and a simple abstract rune, thin antique bronze and warm ivory edging. Match the lower WEAK CARDS icon in Image 1: hand-engraved fantasy book UI, crisp readable silhouette and aged gold highlights, suitable at 40px, no glossy shine. The icon must contrast against dark brown. Only the cards, no medallion, no background, no panel, no letters, no numbers, no words, no creatures or people. Square centered icon, whole object visible, minimal padding, true transparent background.

### shop-row-icon

Use case: stylized-concept. One small production game navigation icon, in exactly the same hand-engraved antique bronze and ivory style as Image 1's lower card navigation icons. A compact medieval wooden market stall with a simple striped canopy and small closed counter, no people or humanoids, drawn with warm ivory and aged gold edges that contrast against a dark brown octagonal medallion. Crisp readable silhouette, restrained shading, suitable at 40px, no modern objects, no glossy shine. Only the stall, no medallion, no frame, no background, no text, letters, numbers, or logo. Square centered icon, whole object visible, minimal padding, true transparent background.
