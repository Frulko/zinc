# Writing a demo

The bar every demo of `examples/` meets, new or changed. The reference is `examples/music-tree`: read its `src/` before writing a demo.

## Choose the UI model

- **`zinc:ui` (JSX, Yoga)** for a demo that runs on a desktop, a Pi 4 or a phone of the last five years.
- **A display tree on `zinc:gfx`** (music-tree's `core/display.ts`) for old devices (HP TouchPad, Nexus 7, Pi 3) where a frame must cost
  only what it draws. It is the middle ground: AS3-style objects (`addChild`, local coordinates, `onAddedToStage`/`onRemovedFromStage`,
  `onUpdate`, `onMeasure`, `onDraw`) and a minimal row/column layout, no CSS, no reconciler.
- Never a third model: no ad-hoc immediate-mode `main.ts` of 1,500 lines, no new layout engine. Copy `core/` from the reference; when a
  second demo uses it, promote it to one shared module instead of keeping copies.

## Layout of a project

```text
src/
├── main.ts          # mounts the stage, routes input, the frame loop; no business logic
├── constants.ts     # colours, sizes, ports, ids, limits: every literal used twice
├── fonts.ts         # named fonts
├── state.ts         # the app's state and its actions (what a page calls); no drawing, no side effect at import
├── core/            # display tree, input (touch zones, scroll), pictures cache, screen power
├── services/        # one file per outside thing: config, network APIs, sockets, files
├── components/      # reusable nodes (buttons, slider, keyboard, sidebar, overlays)
└── pages/<page>/    # one node per page or slide
```

- One concern per file; a file above ~500 lines is split.
- Names say what they hold: `COLOR_TEXT_SECONDARY`, `navigateToPage`, `volumeBarLocalX`; no `TEXT2`, `sc`, `gg`.
- Config is a typed class with defaults, loaded and saved by `services/config.ts`; saving keeps the keys it does not know.
- A page loads its data in one place (`onAddedToStage`), not also in the navigation code.
- Comments, README and identifiers in English. Text shown to the user can be in its language.

## Performance rules (the display tree)

- **No frame when nothing changed.** `dirty` is set by an event (input, network answer, timer tick that changes what is shown), never
  by layout or drawing. Check: a headless run of 300 idle frames draws at most the frames of the clock.
- **Build the tree once.** `onMeasure` updates values in place (text, visibility, sizes); it never calls `addChild`/`removeChild`.
  A list whose shape changes is rebuilt only when its signature changes (ids joined), or uses a pool of rows.
- **No allocation in `onDraw`/`onUpdate`/layout**: no `new`, array or closure literals, string concatenation per row. Touch zones are
  reused, not recreated. Do not claim "zero allocation" in the README without checking it.
- **Offscreen drawing at identity**: `resetTransform()` before `beginImage`, restore after.
- **Touch zones are clipped** to the scroll viewport that holds them; a zone under a header takes no tap.
- **Spinners and animations only when visible**; an animation that ends stops the redraws.
- **Warm-up is side-effect free**: prerendering a page never mounts it in the live tree nor calls the network.
- **Searches carry a request id**: an older answer never overwrites a newer one.
- A performance claim comes with a number (`tools/zbench`, `docs/reports/zinc-next-perf.md`).

## Input everywhere

Touch, mouse and keyboard on every target the demo lists: tap, drag, fling; mouse wheel and trackpad scroll and swipe; the computer's
keyboard types in text fields (`startTextInput`, Backspace held, Enter, Escape).

## The project files

- `zinc.json` complete: `app` (name, id, version, icon, orientation), `permissions` for what the code uses, every `icons` entry drawn.
- An install script reads the id and version from `zinc.json`; two demos never share an app id.
- `config.json`, caches, `build/`, `dist/` and `node_modules/` are not committed (`.gitignore`).
- README: what it is, how to run it, the layout of `src/`, the device-specific notes.

## Proof before it is done

- `zinc check <demo>` passes.
- One T1 test (`next/tests/t1/<demo>_*.sh`): a scripted headless session (`ZINC_INPUT`, `ZINC_SHOT_FRAMES`) with one golden per feature,
  no network (point the services at `127.0.0.1:9` through env).
- The idle check above: frames drawn while nothing moves.
- A user-visible change to a demo adds a line to `CHANGELOG.md`.
