# zinc:loader — loading screens

`zinc.json` `loading` makes the engine run a **loader stage** before the program (ZN-447; design: 7.5 of
`docs/reports/games/toolchain-assets-loading.md`; the stage itself: `docs/reports/zinc-next-assets.md`, "The loader stage"): it loads the
asset groups, draws a screen every frame with the progress, then the program's own modules start, with those groups resident.
`plugins/loader` (pure Zinc) holds the screens it draws by default, and a zinc:ui component for loading screens of your own.

```json
"assets":  { "groups": { "boot": { "include": ["ui/**", "fonts/**"] }, "level1": { "include": ["levels/1/**"] } } },
"loading": { "screen": "default", "groups": ["boot"], "minMs": 0, "fadeMs": 150 }
```

| Key | |
|---|---|
| `screen` | `"bar"`: a bar in the middle, in the colours of the splash background (a dark grey without a splash); `"default"`: the splash image placed as the engine splash places it, with a thin bar near the bottom (the bar when the splash has no image); or a module of the project (`"src/loading.ts"`) whose default export draws one frame: `(progress: number, dt: number) => void` |
| `groups` | the groups to make resident before the program starts; none named: `boot` when `assets.groups` has it, else every group of the packs |
| `minMs` | the screen stays at least this long (a logo that should be seen); 0 by default |
| `fadeMs` | the last frame of the screen fades out over the program's first frames (a cross-fade) |

- **Progress** is the bytes loaded over the bytes of every group, from the packs' tables: it never goes back, and reaches 1 only when the last
  entry is resident.
- **No flash.** Groups already resident skip the stage; a load done within a frame shows nothing (a real run waits up to 16 ms for the first
  jobs; a deterministic run decodes its first turn before deciding), unless `minMs` asks for the screen.
- **Frames.** The stage's frames count in `ZINC_FRAMES` and in the frame numbers of `ZINC_SHOT_FRAMES` and `ZINC_FRAMEHASH`; closing the window
  during the stage ends the program.
- **Engines.** The same stage runs in the interpreter, in a built executable and with `--engine quickjs`.

```ts
// src/loading.ts: "screen": "src/loading.ts"
import { clear, rect, width, height } from 'zinc:gfx';
export default function screen(progress: number, dt: number): void {
  clear(0x101418);
  rect(0, height() - 4, width() * progress, 4, 0xf9c74f);
}
```

| API | |
|---|---|
| `bar(background, color)` (`zinc:loader`) | the `"bar"` screen |
| `splash(background, fit, scale, color)` (`zinc:loader`) | the `"default"` screen: `image('.splash')`, the splash entry of the packs, fitted (0 contain, 1 cover, 2 center at `scale` texels a pixel) |
| `<Loader progress={p} />` (`zinc:loader/ui`) | a zinc:ui progress bar on the theme's background, `p` an accessor (a signal): for a level loaded in game with `assets.loadGroup(name, onProgress)` |
| `screen()` (`zinc:loader/ui`) | a stage screen drawn with zinc:ui: `export default screen();` from a `.tsx` screen module (typed engines) |

The template `game-2d` declares `"loading": { "screen": "bar", "groups": ["default"], "fadeMs": 150 }`.
