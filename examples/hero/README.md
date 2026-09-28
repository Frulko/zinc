# hero

A complete app in the Solid model, meant to show what `zinc:ui` does in one place: an animated intro, a shell
with five screens and transitions between them, a gallery whose artworks grow into a detail page
(shared-element transition), physics, animated lists, live charts, theming, toasts, a modal and a command
palette. Everything is drawn by the Zinc engine (no JavaScript engine, no GPU required).

![hero](../../docs/img/hero.png)

## Run it

```sh
zinc run examples/hero                  # macOS window (1100x700, Retina)
zinc run examples/hero --target wasm    # browser
zinc build examples/hero --target rpi1  # Raspberry Pi (fbdev)
ZINC_DEMO=gallery zinc run examples/hero   # scripted start: home gallery detail playground tasks settings palette dialog dark
```

## Try

| Where | What to do |
| --- | --- |
| Intro | move the pointer (the glow follows it), Enter or **Get started** |
| Sidebar | click a screen or press 1–5 / `[` `]`: the highlight slides on a spring, screens slide in the direction of travel |
| Home | numbers count up on each visit, hover the chart (crosshair and value), click an activity row (toast) |
| Gallery | hover a card (it lifts, the artwork follows the pointer), click it: the artwork grows into the detail page; ← → browse, heart = Lottie like, Esc goes back |
| Playground | grab a ball and throw it, click empty space for sparks and a new ball, switch gravity, **Shake** (or S) |
| Tasks | type and press Enter, check a task (the box pops), × removes it (the row collapses), filter, clear completed |
| Settings | dark mode (or D), accent colour, **animation speed** (slow motion for every transition), reduce motion, name, reset (confirmation dialog) |
| Anywhere | ⌘K or `/` command palette (type to filter, ↑↓, Enter), `?` shortcuts, bell for a toast |

## How it is built

| File | Role |
| --- | --- |
| `src/main.tsx` | composition (shell, screens, detail, intro, overlays), keyboard shortcuts, the frame `tick` |
| `src/app/motion.ts` | `Tween` (duration + easing), `Spring` (interruptible), `Entrance` (staggered screen entrances), global speed / reduce motion |
| `src/app/router.ts` | tabs, the slide transition (`screenX` / `screenOpacity`), the intro and the detail transition state |
| `src/app/overlays.ts` | toasts, the modal dialog and the command palette state |
| `src/app/prefs.ts` | name, dark mode, accent (rebuilds the kit theme), motion settings |
| `src/app/tasks.ts`, `physics.ts`, `art.ts`, `commands.ts` | task store, ball physics (fixed 240 Hz steps), the eight generative artworks, palette commands |
| `src/components/` | `Shell` (sidebar, top bar, stage), `Overlays`, charts, stroke icons |
| `src/screens/` | `Intro`, `Home`, `Gallery`, `Detail`, `Playground`, `Tasks`, `Settings` |

Every screen stays mounted; transitions only change paint-time styles (`opacity`, `translateX/Y`, `scale`), so a
transition never re-runs layout except for the detail artwork, whose box is interpolated from its card. Values are
signals moved by tweens and springs in one frame callback, so only the nodes that read a moving value update. The
canvases (backdrop, charts, artworks, physics) draw with `zinc:gfx` every frame.

`assets/heart.json` is the TwitterHeart Lottie sample from lottie-ios (Apache-2.0), `assets/spinner.json` is CC0
(see docs/licenses.md).
