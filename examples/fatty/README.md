# Fatty — the 2013 AS3 game on Zinc

A close TypeScript port of Guillaume Dumoulin and Aldric Chimier's Flash/Starling game. The original `fatOutFood` packages, classes,
method names, authored comments, coordinates, rules, graphics, bitmap font and music are kept. Click the bad food one, two or three
times; avoid the apples and sushi. The original home, animated tutorial, game, game-over and Top 5 screens are present.

From the Zinc repository:

```sh
build/zinc run examples/fatty
```

Zinc selects **its QuickJS engine** from `zinc.json`. It opens a native graphics window; there is no browser or Flash player.
The interpreter/AOT subset is not supported by this port: retaining AS3's constructor-valued arrays, bound method closures and
reflection-style page creation is the point of this experiment. For a run started by an agent, set `ZINC_BACKGROUND=1`.

## Source choice and layout

`/Users/mowmow/Desktop/Fatty/Projet Flash` is the complete version: 27 AS3 source files, 2,114 lines. `Fatty - Unknown version` has
identical sources and assets. `Gobelins.zip` has the same game with `VITESSE_DISTANCE = 3` instead of `4`; `New Folder With Items`
is an earlier, incomplete version. The other directories contain source artwork. `source-manifest.json` records the hashes.

- `src/fatOutFood/`: the original package tree translated to TypeScript, including its unused `Test`, `Tools` and constant classes.
- `src/Gobelins.ts`, `src/PreLoader.ts`: the original unused Flash IDE source stubs.
- `src/compat/`: only the Starling/Flash operations this game uses, implemented over **`zinc:stage`**, `zinc:gfx` and `zinc:audio`.
  Zinc owns the display tree. The adapter adds transforms, hit testing, events, atlas regions, bitmap text, movie clips and the juggler.
- `src/fatOutFood/definitions.ts`: the six page constructors Flash resolved by qualified class name, shared by both original managers.
- `src/services/scores.ts`: persistent local scores through `zinc:storage`.
- `assets/`: every original project asset, unchanged, plus the original MP3 and derived `atlas-data.json`.
- `tests/data/fatty/as3/` in the repository: the original sources, kept for comparison rather than compiled.

## Necessary differences

AS3 packages/imports become TS modules, `var` becomes `let`, `int`/`Number` become `number`, and implicit members get `this` or the
class name. Original callbacks bind once, preserving AS3 method closures and listener removal. Numeric/boolean/string defaults are
explicit; the TS settings preserve AS3's nullable references. Setter-only overrides explicitly forward the inherited getter.
`GameManager._score` becomes `_gameScore` because TS rejects shadowing an inherited private name. Comments remain in their original
class/method locations and order; a test checks every authored comment.

The document keeps its 1024×768 composition and 60 Hz simulation, fitted to the window. Input is consumed once per display frame,
independently of simulation ticks. Detached pages release their pending animations/countdowns. Music uses the original MP3, looping
through Zinc's audio plugin; the sound button retains its original behavior. The school link uses a native context menu.

The old PHP leaderboard is replaced by a local Top 5, saved between launches. The original score form is retained, with its first-place
index check corrected and its invalid negative validation-button dimensions changed to 50×50. Invalid saved data is rejected rather
than overwritten. The two managers still accept every page class, including the original cross-screen navigation paths.

No artwork is redrawn or recompressed. XML (including UTF-16 atlases) and the `.fnt` are read by Python's ElementTree once to generate
`atlas-data.json`; Zinc reads that JSON and crops the original PNG sheets at runtime. Rebuild that metadata only after editing an atlas:

```sh
python3 examples/fatty/tools/prepare-assets.py
```

The Flash web download/preloader timeline and Flash IDE/build tooling are not reproduced: the native app loads its local resources
before showing the original home screen. This is a game-specific Starling adapter, not an implementation of the whole Flash API.

## Verification

```sh
node node_modules/typescript/bin/tsc -p examples/fatty
build/zinc bundle examples/fatty --check -o /tmp/fatty.js
tests/run --only fatty
tests/run --only fatty_logic
```

`zinc check` currently uses the native subset checker even for a QuickJS project; use the TS check and `bundle --check` above.
T1 covers the original pointer controls, all 60 seconds of simulation, the end countdown, name entry at variable frame rates,
score persistence, the original navigation paths and 300 idle frames. Its test copy seeds randomness and skips rendering intermediate
simulation ticks during the long middle; the shipped game keeps its original randomness and timing. Six reviewed feature captures
are in `tests/golden/fatty`. The demo test covers the target rules, event bubbling, lives, detached timers, getter semantics,
Top 5 validation/restart, every original comment, source/asset hashes and reproducible atlas metadata.

Only the development Mac was tested, headless. No cross-platform or native/AOT verification is claimed.
