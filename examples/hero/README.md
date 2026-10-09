# hero

A complete app in the Solid model, meant to show what `zinc:ui` does in one place: an animated intro, a shell
with nine screens and transitions between them, a gallery whose artworks grow into a detail page
(shared-element transition), physics, animated lists, live charts, theming, toasts, a modal and a command
palette. Everything is drawn by the Zinc engine (no JavaScript engine, no GPU required).

![hero](../../docs/img/hero.png)

## Run it

```sh
zinc run examples/hero                  # macOS window (1100x700, Retina)
zinc export examples/hero --target linux   # Raspberry Pi 3/4 on a 64-bit OS: 800x480 fbdev, needs the ffmpeg libraries (libavformat61)
zinc build examples/hero --target rpi1     # Raspberry Pi 32-bit (ARMv6 static build, but zinc:video needs Alpine there)
ZINC_DEMO=gallery zinc run examples/hero   # scripted start: home gallery detail playground tasks settings palette dialog dark
zinc bench examples/hero                  # ZINC_DEMO=bench: a scripted tour with the profiler, budget in zinc.json
```

## The video file

`media/bbb.mp4` is not in the repository (`examples/hero/media/` is ignored). Fetch and shrink it (about 23 MB, no audio),
then keep it in a `media/` folder next to the program:

```sh
curl -LO https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_640x360.m4v.zip && unzip BigBuckBunny_640x360.m4v.zip
mkdir -p examples/hero/media
ffmpeg -i BigBuckBunny_640x360.m4v -an -vf scale=640:360 -c:v libx264 -profile:v main -crf 27 -pix_fmt yuv420p -movflags +faststart examples/hero/media/bbb.mp4
```

`zinc:video` is not available on `wasm`, so hero has no wasm target any more. The `linux` target is 800x480 on the
framebuffer (`"display": "fbdev"`); the navigation tab needs `assets/city.bin` (a link to the navigation example's map)
and its `citymap` plugin (`pluginDirs` in `zinc.json`).

## Try

| Where | What to do |
| --- | --- |
| Intro | move the pointer (the glow follows it), Enter or **Get started** |
| Sidebar | click a screen or press 1–9 / `[` `]`: the highlight slides on a spring, screens slide in the direction of travel |
| Home | numbers count up on each visit, hover the chart (crosshair and value), click an activity row (toast) |
| Gallery | hover a card (it lifts, the artwork follows the pointer), click it: the artwork grows into the detail page; ← → browse, heart = Lottie like, Esc goes back |
| Playground | grab a ball and throw it, click empty space for sparks and a new ball, switch gravity, **Shake** (or S) |
| Tasks | type and press Enter, check a task (the box pops), × removes it (the row collapses), filter, clear completed |
| Settings | dark mode (or D), accent colour, **animation speed** (slow motion for every transition), reduce motion, name, reset (confirmation dialog) |
| Kit | every `zinc:ui/kit` component (the sections of `examples/ui/kit-gallery`) |
| Forms | text, email, tel, url, numeric PIN, decimal, search, multiline, switch, slider, tabs; the on-screen keyboard opens with each field's layout (Settings turns it and the auto-scroll off) |
| Video | Big Buck Bunny through `zinc:video` (FFmpeg, V4L2 hardware decode on the Pi); the file is an asset read at runtime from `media/bbb.mp4`, not embedded |
| Navigation | the turn-by-turn GPS demo of `examples/maps/navigation` (Space pause, S speed, L steps, C recenter, P report; D or the moon button switches the app to dark and the map to night) |
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
