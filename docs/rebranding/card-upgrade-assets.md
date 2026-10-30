# Card upgrade sprites

Generated with the built-in `image_gen` tool from the user-provided card upgrade reference, 2026-10-27. All labels, values, progress, and state remain live UI data. The sprites contain no baked text or numbers.

Final assets in `client/public/assets/ui/upgrade/`:

| File | Use |
| --- | --- |
| `heading-v1.webp` | Upgrade title plate, recessed back control, right fleur-de-lis |
| `paper-panel-v1.webp` | Progress panel and scalable parchment frames |
| `action-button-v1.webp` | Dark bronze and leather upgrade action |
| `progress-rail-v1.webp` | Empty progress rail with a live fill drawn inside |

The generated PNGs remain in the Codex generated image directory. Only empty transparent margins were trimmed for packaging; the final sprites use lossless WebP with alpha.

## Generation prompts

### Header

Use case: ui-mockup. Asset: one production raster sprite for the top title plaque of the card upgrade screen. Image 1 is a style and composition reference, not an edit target. Recreate only the top horizontal title plaque as a clean empty UI asset. Antique gilded dark bronze frame, cream aged parchment center, a large dark recessed back-button square attached at the far left, small hand-engraved fleur-de-lis ornament at the far right. Keep the entire middle an uninterrupted blank parchment field, no divider or extra counter compartment. Exact feel of an old bestiary book, crisp ink engraving and worn gold edging as in Image 1. Straight-on orthographic game UI, ultra-wide thin banner around 8:1. No words, letters, numbers, arrow, card art, or UI mockup. Transparent background outside the complete silhouette, opaque materials inside, tight canvas around the sprite with only a few pixels margin.

### Paper panel

Use case: ui-mockup. Asset: one production raster sprite for the parchment progress panel in the card upgrade screen. Image 1 is a style reference. Create an empty rectangular parchment panel matching the large PROGRESS LEVEL panel in the lower middle of Image 1: finely engraved antique bronze and gold corner brackets, narrow worn metallic edging, aged cream parchment, delicate faded sepia tree branches and cartographic engraving near the outer edges only. The center must be plain light parchment with generous blank space for live text and controls. Landscape panel about 2:1. No heading, text, numbers, lines dividing sections, progress bar, button, icons, gems, card art, or objects. Front-facing orthographic game UI sprite, no perspective, no glossy plastic. Fully opaque paper interior, true transparent exterior, tight canvas. Design the four corners so the sprite can also be used as a nine-slice scalable frame.

### Action button

Use case: ui-mockup. Asset: one production raster sprite for the main upgrade action button. Image 1 is a style reference. Recreate only the dark button below the progress bar: a blank very dark brown worn wood and leather inset bordered by richly engraved antique gold and bronze, symmetrical compact heraldic scroll ornaments projecting from the left and right ends, small rivets, crisp tactile bevels. Horizontal button about 6:1, center kept blank and dark for a cream serif label added in code. Match the old bestiary-book style of Image 1 exactly. No text, letters, numbers, symbols, leaves, bright green accents, modern capsule shape, card art, or mockup. Straight-on flat game UI, entire silhouette visible. True transparent background outside, opaque interior, tight canvas with minimal margin.

### Progress rail

Use case: ui-mockup. Asset: one game UI sprite for the empty level-progress bar rail from Image 1. Image 1 is a visual style reference. Recreate only the narrow long progress bar frame: a very thin antique bronze outer rim, aged ivory and gold bevel, clipped angular pointed end caps, and an opaque almost-black recessed empty channel. The channel must be completely empty, without orange fill, text, ticks, icons, ornaments across the center, or symbols. Long thin horizontal rail, approximately 24:1, straight-on orthographic view, whole silhouette visible. Match the engraved bestiary-book materials of the reference. True transparent exterior, opaque black channel, minimal transparent margin. This is only the empty rail; its live progress fill will be drawn in code.
