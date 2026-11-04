# Le dernier bateau — art direction study

An original scene in the visual language of [Pixel Plays](https://github.com/amirmushichge/pixel-plays/tree/0c2a70f6809478772ac0b3976496a5147e60a43e). The first deliverable is a running animated composition, not a game with scoring. Reuse the existing renderer inside this collection; do not copy it to another demo or substitute generated concept images for runtime proof.

## The picture

A small working quay at the edge of a village: warm limestone, an old terracotta-roofed boathouse, a timber landing, parcels, a bench and an olive-green tree. A faded red boat waits just off the landing. Its sailor looks toward a courier. A cat rests by the crates and a gull perches on a bollard. The place feels inhabited before the player acts.

The original renderer supplies the same 360 × 280 pixel grid, fixed 30-degree orthographic projection, depth-tested silhouettes, warm highlights, violet shadows and Bayer shading as Balote. The scene stays on white, with a rough dissolving boundary and no thick card or frame. Integer enlargement is performed without smoothing, including the final native Retina presentation (`image-rendering: pixelated`). Native text remains restrained and outside the scene; the eventual game should put parcel count and result feedback into the scene where possible.

| Material | Direction | Key colors |
|---|---|---|
| Water | Quiet jade, small close-value steps | `#31686c`, `#3a7877`, `#468980`, `#5b9988` |
| Quay | Warm weathered limestone | `#b1a48b`, `#bfb49a`, `#cfc4aa`, `#dbd1b7` |
| Boat / roof | Faded brick red, a readable focal accent | Base `#a44c39` |
| Timber | Worn honey brown | Base `#8e6541` |
| Cabin / clothes | Cream and dark sea blue | `#e0d7ba`, `#314c53` |
| Vegetation | Olive greens inherited from the renderer | Warm tops, deep cool interiors |

Keep broad surfaces quiet. The water and stone use four close base tones; wood grain, joints and small objects supply local texture. Figures use the original undithered shade bands and clear silhouettes so they remain readable against the ground. Pattern phase is fixed in material/scene coordinates; the terrain never receives fresh random noise on each frame.

## How it feels alive

| Motion | Rhythm | Purpose |
|---|---|---|
| Leaves / grass / fanion | Stepped at 8 poses/s, small whole-pixel changes | Air moving through one consistent place |
| Water streaks | Slow directional drift | A readable current, not a flashing noise field |
| Wake / post rings | Sparse broken rings | Connect the boat and landing to the water |
| Boat | Slow lateral drift and about one source-pixel vertical bob | A floating hull with weight |
| Cat / gull | Occasional tail twitch or wing stretch | Inhabitation without constant distraction |
| Chimney | A few fading, drifting pixels | Warmth in the boathouse |
| Courier / parcel / sailor | One authored throw arc, then a short answering wave | A cause, an action and a reaction |

The harbor clock drives the motions; the main loop redraws at most 24 scene poses per simulated second. P freezes the clock and the scene, with no new game-canvas writes until a control or resize changes presentation. Zinc's shared web surface still presents each host frame. This is a cadence policy, not a performance measurement.

The boat geometry is rasterized once into a color/depth sprite. Each frame moves those cached pixels through the existing depth test rather than rebuilding the hull. The quay, boathouse and props are baked once. Animated details and figures draw over that stable background.

## The gesture and the future game

Press Space or tap the scene to rehearse the courier's throw. The parcel follows an authored arc into the passing boat and the sailor answers with a wave. This proves scale, overlap, animation and emotional feedback. It does not implement player aim, physics, collision, parcel inventory, difficulty or scoring.

For the actual game, retain the single pull-and-release gesture. The source of difficulty should be the moving boat and the time of arrival; the wake/current must explain the motion. An impact should have a short physical reaction: parcel settling and sailor acknowledging a catch; a missed parcel making a small splash, brief rings and a disappointed glance. Those reactions are the next playable stage, not claims about this study.

## Proof and limits

Run the composition:

```sh
build/zinc run examples/pixel-plays/harbor.js --background
```

Targeted check:

```sh
tests/run --only last_boat_art
```

The `webenv_pixelated` regression checks exact pixelated/crisp-edges colors at Retina 2× while preserving linear filtering for `auto`. The host-input session exercises keyboard, mouse and simulated touch rehearsal, cooldown, pause and resume. Captures check the static composition, moving pixels and 300 unchanged paused frames. The Balote test protects its presentation when the shared canvas helper changes. The source renderer and its copyright remain in this collection's `LICENSE.upstream`; the harbor geometry, palette and composition are new.

Desktop Mac / QuickJS only. No claim about physical touch devices, interpreter/AOT, reduced-motion OS integration, narrow-screen layout, measured performance or a finished game.
