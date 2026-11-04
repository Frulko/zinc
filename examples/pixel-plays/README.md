# Pixel Plays / Zinc

A native QuickJS / Canvas 2D adaptation of **Balote**, the bocce game from [Pixel Plays](https://github.com/amirmushichge/pixel-plays) by AmirMushich (MIT). It preserves the original generated scene, low-resolution software renderer, physics, bot and first-to-five rules. No browser, webview, network, image downloads or external packages are needed at runtime. The upstream music is not included: its rights differ from the code. Procedural sound effects are retained.

## Run

From the repository root:

```sh
build/zinc run examples/pixel-plays --background
```

Pull back and release with the mouse or a finger to throw. Alternatively use Left/Right to aim, Up/Down to set power and Space to throw. After a round, click/tap the scene or press Space to continue. Each team has four balls; the closest balls score, and the first team to five wins. The bot plays automatically.

P or the upper-left control pauses; M or the upper-right control toggles sound. The canvas uses whole-number enlargement without smoothing. Pausing freezes simulation and avoids updating the game's canvas until a control or the window size changes; the shared web environment still presents its surface every host frame. The original status messages are in English; the Zinc controls are in French.

This JavaScript entry selects the web compatibility environment and QuickJS. `zinc check` is the strict TypeScript checker and does not validate this entry. Interpreter/AOT execution would require a typed port; they are not claimed here. The tested desktop layout is 1000 × 760; narrow screens and physical touch devices remain unverified.

## Files and ownership

- `src/main.js`: startup and animation loop.
- `src/renderer.js`: upstream depth-buffer renderer, exported as a module; owns the 360 × 280 bitmap and cached background.
- `src/game.js`: upstream scene, rules, physics and input, with HTML HUD calls removed and pause added.
- `src/view.js`: one full-window canvas, integer nearest-neighbour enlargement, score/help and input coordinate conversion.

The renderer's scene configuration is Balote's original configuration. Presentation and input target the visible canvas; the scene bitmap is offscreen. This is an adaptation of an existing JavaScript game, following Zinc's existing JS-library compatibility lane rather than a new app UI framework.

## Verification

```sh
tests/run --only pixel_plays
tests/run --only webenv_touch
```

`pixel_plays` checks a full round, bot play, collision momentum, court rebound, friction, scoring and restart. A scripted host session exercises mouse drag/release, keyboard throws, touch drag/release, 300 paused frames and resume. One scene golden checks the diorama. The shared `webenv_touch` regression verifies stable distinct finger pointer IDs, primary identity, pressure/buttons and release. The existing web environment event golden now includes touch Pointer Events.

A background macOS window is also captured and inspected during development. These checks do not establish performance on slower hardware or audible sound quality.

## Provenance

Source commit: [`0c2a70f6809478772ac0b3976496a5147e60a43e`](https://github.com/amirmushichge/pixel-plays/tree/0c2a70f6809478772ac0b3976496a5147e60a43e), retrieved 2026-10-31. Retained copyright and permission: [LICENSE.upstream](LICENSE.upstream).

SHA-256 of the source inputs before adaptation:

- `engine.js`: `975cf9858f2bb95b14ec3ea6733b9f47e466c6c1c8d0f937354b40fe70c2e455`
- `balote/index.html`: `d7eb29e8b5dfb87fdf11402ee46d90b891f1384b9dc0bdebbb0f507b6e93b7cf`

## Original harbor art study

```sh
build/zinc run examples/pixel-plays/harbor.js --background
```

**Le dernier bateau** is an original animated composition using the same renderer: a weathered quay, boathouse, crates, tree and red boat. Water, wake, foliage, flag, chimney, cat and gull move in small stepped poses. Space or a tap rehearses the courier's parcel throw and the sailor's answering wave; P pauses. It is an art-direction study, with an authored throw arc, not the finished aiming/scoring game. There is no sound in this study.

`src/harbor/` separates palette, state, baked scenery, animation, presentation and startup. Both scenes reuse `renderer.js` and the `presentScene()` canvas helper in `view.js`; there is no cross-demo import or duplicated rendering engine. The hull is cached once as color/depth pixels. See [ART-DIRECTION.md](ART-DIRECTION.md) for palette, cadence, intent and limits.

`tests/run --only last_boat_art` verifies the scene golden, exact 2× source pixels, keyboard/mouse/simulated-touch rehearsal, cooldown, pause/resume and 300 paused frames without new scene writes. Desktop Mac / QuickJS only.

## Arrêt au stand, Odyssée and Objectif Lune (native TypeScript)

Three more native games, in `src/native/pitstop/`, `src/native/odyssey/` and `src/native/rocket/`, on the same renderer (`0`, `-` and `=` in the tab bar).

- **Arrêt au stand**: a team pit stop. Hold Space (or the pointer) to brake onto the box (ease off to feather it: the driver settles on the mark), watch the crew change the four wheels, then leave on the green light. Stopping off the mark, or leaving early, adds seconds; the best time is kept.
- **Odyssée**: a slow, floating spaceship turning above the Earth (spinning land and clouds, atmosphere, moon, sun). `S` switches between a long white explorer with a command sphere, a starship with saucer and nacelles, and a round freighter. Drag or ← → spin it, Space lights its lens, nacelles or engines.
- **Objectif Lune**: the red-and-white checkered moon rocket on its pad between two gantry towers, in the style of the *Tintin* album cover (a homage, no album artwork). Enter starts the countdown; at zero a sync needle sweeps a gauge and Space lights the engines only while it is inside the green zone (the closer to the centre, the higher the sync score; three misses or a closed window scrub the launch). `S` switches between day and night, with the pad lamps, searchlights and the glow of the exhaust.

`tests/run --only pitstop_rules` and `--only rocket_rules` check the rules; `tests/run --only pixel_plays_scenes` plays the three (the rocket by day and by night) through the native entry (golden frames, moving scenes, exact 2× pixels). Both are original homages: no film or series assets, text or music.
