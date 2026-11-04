# Interactive booster preview

Local route: `http://localhost:5173/lab/booster`. The route and renderer are
development-only (`import.meta.env.DEV`) and use the authenticated `AppShell`.

## Existing artwork

The wrapper reuses `/assets/ui/shop/stall/pack-noseal-v2.webp` and
`pack-seal-v2.webp`. The existing `.shop-pack-foil--<rarity>` vellum colour and
`.shop-pack-seal--<rarity>` filter are read from the shop CSS at runtime and
composited in memory. Changing a shop rarity style updates the preview too.
There are no new generated textures or duplicated rarity palettes.

The reverse of the card uses `/assets/guild/card-back-v1.webp`, already used by
the arena and screen loader. Its front uses the existing Bright-Cut frame and
art resolver. Cards come from the authenticated workshop catalog, which
provides one real card of each rarity. Their actual rarity and element are
preserved; catalog entries have no instance power, so no power is invented.
The selector can pin a rarity or cycle through all six on each new wrapper.
The wrapper follows the chosen card's rarity. No crafting request is made.

## Gesture and animation

Open the pack with one continuous mouse/touch stroke across its wrapper.
Horizontal, diagonal, vertical and curved cuts work; entry and exit may be on
the same edge. Near-edge touch input snaps within a small tolerance. An
unfinished stroke, a self-intersecting loop or a tiny corner sliver keeps the
pack sealed and displays a retry hint.

The stroke is clipped to the wrapper, simplified with a bounded point budget,
and joined to its boundary to form two polygons. Ear clipping triangulates
both polygons; subdivision maps the triangles onto the curved 3D wrapper.
The two physical pieces curl, separate along their centroids and fall away.
Original perimeter seams join front and back; cut edges expose separate thin
paper rims around a hollow interior. Front/back surfaces cannot cross at
wrinkles. Paper uses opaque alpha cutouts with depth writing, never opacity
fades. Fragments leave the camera view physically before being removed.
This is one completed cut, not a cloth simulation or a multi-cut shredder.

The card waits until the wrapper has separated, follows an upward arc, turns
from back to front, and settles. In the development preview, horizontal
dragging rotates it through 360 degrees and vertical dragging tilts it. The
existing reverse artwork and thin edge remain visible. Rotation eases toward
the pointer target without per-frame React updates. In the shop, the reward
details appear automatically when the reveal animation ends; reduced-motion
users continue through the existing standard reward flow.

No purchases, rewards, currency updates or inventory writes are performed.
GPU resources, observers, pointer state and animation frames are cleaned up on
retry/unmount; the animation pauses while the tab is hidden.

## Targeted verification

`node --import tsx --test client/tests/boosterCut.test.ts` covers orientation,
curves, same-side entry/exit, touch tolerance, incomplete strokes, loops,
polygon coverage, triangulation area, WebGL 1 buffer limits, non-intersecting
wrapper surfaces, closed seams, hollow cut rims, and delayed card motion.

Single-card rewards in the shop use this 3D opening before automatically
showing the card's reward details. The purchased state is shown before the
animation. If the 3D module or WebGL renderer fails, the same reward falls
back to the existing 2D pack opening. Reduced-motion users also use that path.
Ten-card bundles keep their quick 2D reveal; forging keeps its anvil animation.
The development preview remains available at `/lab/booster`, and the model
does not export a GLB.
