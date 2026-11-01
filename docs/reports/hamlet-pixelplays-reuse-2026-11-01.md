# Hamlet and Pixel Plays: what the shared renderer allows, what to promote

Read-only study, 2026-11-01. Sources: `examples/hamlet/` (README, `src/`), `examples/pixel-plays/` (`STYLE-BRIEF.md`, `src/native/**`),
`examples/GUIDELINES.md`, `.agents/skills/zinc-app|zinc-demo`, `src/cli_core.cpp`, `docs/reports/zinc-next-assets.md`.
Nothing here was run or measured: every cost below is a count from the code, marked "estimate" when it is a byte or time figure.

## 1. Renderer facts that constrain us (`pixel-plays/src/native/renderer.ts`)

### 1.1 Buffers, projection, camera

| Fact | Value (line) | Consequence |
|---|---|---|
| Internal resolution | `W=360, H=280` `export const` (12) | One literal for every game; `surface.ts`, `bayer`, loops all read it. Not a parameter. |
| Pixels per world unit | `S=10`; `SIN=.5`, `COS=.866` (12-13) | 30 degree orthographic. 1 unit on x or y = 7.07 px across, 3.5 px down; z = 8.7 px up. |
| Projection | `project`: `sx=OX+(x-y)/R2*S`, `sy=OY+((x+y)/R2*SIN - z*COS)*S`, `d=(x+y)/R2*COS+z*SIN` (59) | Affine: moving an object in the world = a constant screen offset and a constant depth offset. This is why `CachedModel.drawAt` is exact. |
| Camera | `OX=W/2` const, `OY` mutable only inside `configureRenderer(originY,...)` (14-15, 352) | No camera object. The "camera" is the origin; there is no pan, no zoom, no rotation. |
| Hamlet fit | map 12x12 tiles x 2 units (`constants.ts`), corners at +-12 -> +-17 units across = ~340 of 360 px | The map already fills the buffer horizontally. A bigger village does not fit, whatever the zoom. |
| Tile on screen | 28 x 14 px diamond; person (`SCALE .62`) ~14 px tall (estimate) | Fine detail is at the limit; zoom-out by `S` would lose figures. |
| Presentation | `PixelSurface.layout`: integer `scale = floor(min(w/crop, (h-150)/crop))`, `drawImageRect(... ImageFlag.Nearest)`; `PixelGame.cropX/Y/Width/Height` pick the source window (surface.ts, game.ts) | **Integer zoom of the picture and a crop window already exist**; they are presentation only. |

### 1.2 Global buffers (all module-level, 100,800 entries each)

| Buffer | Role | Set where |
|---|---|---|
| `pix` (u32), `zb` (number) | the picture and its depth, redrawn every frame | `copyInto(pix, bakedPix)` at the start of each frame (`harbor/render.ts`, `hamlet/view/frame.ts`) |
| `bakedPix`, `bakedZ` | static layer: ground + trees + buildings + static shadows + occlusion | end of `bakeHarbor` / `bakeFishing` / hamlet `rebakeStatic` |
| `ground` (0/1), `groundZ` | where terrain exists; depth of the bare ground | terrain loop: `zb[i]=(p.x+p.y)/R2*COS`, then `copyInto(groundZ, zb)` |
| `kinds` | ground material per pixel: `KIND_GRASS=3` exported; sand/water/road are **local magic numbers** (harbor `KIND_WATER=2`, hamlet 1/2/4, fishing literal 2/3) | terrain loop |
| `shadowMask`, `staticShadow` | cast shadows queued, then applied against `groundZ`/`bakedZ` | `castShadow`, `applyShadows(refZ)` |

Estimate: 9 buffers in the renderer + 3 terrain copies in hamlet (`terrainPix/Z/Kinds`) = ~1.2 M entries; at 8 bytes each (if `number[]` is f64) ~9 MB.
Doubling W and H quadruples it (~36 MB) and every full-buffer pass below.

### 1.3 CachedModel (`renderer.ts` 376-405)

| Aspect | Fact |
|---|---|
| Bake | `beginModel()` = `pix.fill(0); zb.fill(-1e9)` (**clobbers the live scene**: bake before the first frame or after saving the layers); draw at world origin with `box/capsule/sphere/plot`; `captureModel()` scans all 100,800 px and keeps those with `zb > -1e8`. |
| Storage | sparse list: four parallel arrays `xs, ys, depths, colors` (x/y/colour per lit pixel, depth relative to origin). No bounding box, no rect. |
| Memory | ~28 bytes per lit pixel (estimate: 3 x f64 + 1 x u32). A house footprint ~600-900 px -> ~20 KB; hamlet bakes 10 models (house, sawmill, lodge, gate, 4 trees, 2 rocks). |
| Stamp | `drawAt(x,y,z)`: `project` once, integer offset `dx,dy=round(at.s - origin)`, per pixel: bounds test, `depth = d_k + at.d`, **depth-test against `zb`**, write `pix` and `zb`. Cost = O(lit pixels), no scan. |
| Depth correctness | exact against ground and other stamped models, because depth is additive in world translation. Only sub-pixel position is lost (rounded to a pixel). |
| Light | lit at bake time with the `COOL/WARM` ramps in force then; `setLighting` clears the ramp cache but **not** existing models, so a season change needs a re-bake of every model. |
| Dither | spheres use `bayerAt(ix,iy)` of the *bake* position (not world): fine for stamps (pattern travels with the object); `'solid'` mode has no dither, so figures/animals stamp identically. |

### 1.4 Markers and overlays available

| API | Draws | Notes |
|---|---|---|
| `drawDots(points[][], color)` | 1 px at screen coords, **no depth test**, writes `pix` only | after `shadeEdges`, so it sits above everything |
| `haloDots(points)` | white 4-neighbour halo | contrast on busy ground |
| `drawArrow(sx,sy,time)` | 13x12 bobbing arrow (INK outline, SIGNAL yellow fill, halo), tip at (sx,sy), 2 px bob at 3 Hz | `STILL` disables the bob; hamlet's `outline(tile)` and `OK/BAD` colours use `haloDots + drawDots` |
| `plot(x,y,z,color)` | 1 px **with** depth | used for smoke, flags, details |
| `waterPoint` (`models/water.ts`) | pixel only if `kinds==2 && zb==groundZ` (water not covered by an object) | magic 2; `harbor/water.ts` `waterPixel` is a duplicate |
| `tint`, `shadeEdges`, `bakeOcclusion` | post passes | see 1.5 |

Selection ring, path preview or unit marker = `haloDots/drawDots` after the edges pass; a ghost building = `model.drawAt` before `flushShadows` (hamlet does, blinking at 3 Hz).

### 1.5 Where the bake happens, and the per-frame cost

| Stage | Where | Frequency |
|---|---|---|
| Terrain (`unproject` of every pixel, superellipse border, `noise`, `hash`) | `bakeTerrain` (hamlet), `bakeHarbor`, `bakeFishing`: three copies of the same loop | once per village/game |
| Models | `buildModels` -> `CachedModel` | once per season/game |
| Static layer (roads, trees, rocks, buildings stamped, `castShadow`, `bakeOcclusion` 16 taps/px, `applyShadows`) | hamlet `rebakeStatic` | **on every build/demolish/felled tree** (full 100,800-px passes) |
| Dynamic layer | `drawVillage` | per animated pose (24/s) |

Per frame, fixed cost independent of the scene (counts): `copyInto` x2 (200 K element copies), `applyShadows` (100 K), `shadeEdges` (100 K x ~6 reads),
`PixelSurface.upload` (100 K -> 403 KB RGBA, then `updateImage`), plus tufts (`drawTufts`, ~14% of grass pixels x up to 3 px). Variable: each person = 17 `capsule`s, each
a chain of `sphere`s whose cost is the bounding square of its radius; each deer ~20 capsules; every capsule also queues a shadow (`flushShadows` stamps ~every 0.25 units).
Pine (`models/pine.ts`) is ~130 spheres + 12 shadow casts: **never draw it live**, bake it (hamlet does).
Conclusion: the fixed ~5 full-buffer passes dominate until ~20-30 figures; after that the live capsules do. Not measured; measure with `zinc bench examples/hamlet`
before and after any change.

### 1.6 What panning/zooming would need

| Goal | Minimum change | Cost / risk |
|---|---|---|
| Integer zoom of the whole picture (x2, x3) | none for rendering; `PixelSurface.layout` already floors the scale. Add a user-chosen scale cap. | free; pointer maths already use `sourceXAt` |
| Pan over a larger world | (a) make `W,H` parameters (today `export const` read by 8 games + hamlet) or add a second renderer instance; (b) a larger buffer + `cropX/cropY` (exists in `PixelGame`); (c) dirty-rect frame (copy only rects around actors) so the fixed passes do not scale with area | (a) touches every game; (c) is the real work. Area x4 = every full pass x4 |
| Pan by moving the origin | `OX/OY` mutable (`setOrigin`) + re-bake terrain/static (screen-space layers do not translate) -> only viable with chunking | a pan re-bakes; do it by chunk, not per frame |
| Chunked bake | bake a tile band at a time using the world->screen translation; keep `bakedPix/Z` per chunk (needs array-of-layers, not 2 globals) | moderate; occlusion (`bakeOcclusion`, 4 px taps) needs a 4 px margin between chunks |
| Real zoom (`S` change) | rewrite: radii, tuft heights, dither, edge thresholds are tuned to `S=10` | no. Integer zoom of the presentation is the answer; the "low-res pixel diorama" is the style (`STYLE-BRIEF.md`) |

Recommendation: keep 360x280 and the diorama (the brief fixes it); for a bigger hamlet, first choose a viewport (`cropX/Y`) over a 2x buffer *only after* the dirty-rect frame exists.

## 2. Reusable pieces across games

"Home" = proposed shared location (section 2.2).

| Piece | File | What it does | What blocks reuse | Proposed home |
|---|---|---|---|---|
| Renderer core (project, sphere, capsule, box, plot, shadows, edges, occlusion, `CachedModel`) | `native/renderer.ts` | the whole look | module globals for buffers; `W/H/S` const; `capture` module flag; `configureRenderer` also resets lights to summer; `kinds` values are bare numbers; `tufts`/`leaves` lists private | `lib/std/pixel/renderer.ts` (module `zinc:pixel`) |
| `figure()` (person) | `renderer.ts` 256 | 17-bone lit human: pose (`crouch, lean, stance, armR/L`), palette, returns right hand | none (pure given `addBone`); `dynamicAdd` couples to global `pendingShadows` | same, plus `Palette` helpers |
| People variants | `hamlet/view/actors.ts` `drawPerson`; `harbor/palette.ts` `COURIER`, `SAILOR`; `hamlet/palettes.ts` 4 role palettes | role palette, axe, bow, log, deer on back | tied to hamlet `Person`/state constants | keep tool/prop drawing in hamlet; move `Palette` role list + `HAIR_TONES` to `pixel/palettes.ts` |
| Seasons | `river/seasons.ts` | 4 `Season`s: water(4), grass(5), tree deep/mid/light, soil, pine, snow, cool/warm light, ambience id | names and `ambience` are river-specific (`river-spring`); no consumer outside river; `setLighting/setVegetation` do not touch water/soil | `pixel/seasons.ts` + one `applySeason(i)` that calls `setLighting`, `setVegetation`, ramps clear, signals "re-bake models" |
| Palettes | `harbor/palette.ts` (`WATER`, `STONE`, `WOOD`, `CREAM`, `BRICK`, `BLUE`, `ROPE`); `hamlet/palettes.ts` (`GRASS_TONES`, `WATER_TONES`, `SAND_TONES`, `STONE`, `WOOD_*`, `FUR*`); `fishing/scenery.ts` (`WATER_TONES`, `GRASS_TONES` again) | named colours | **duplicates**: grass/water tones copied in 3 files with slightly different values; three palettes named `STONE` | `pixel/palette.ts` as one set; per-season tones come from `seasons.ts` |
| Pine | `models/pine.ts` | 6-layer conifer, optional snow | not baked inside (hamlet bakes it); colour passed in | `pixel/models/trees.ts` |
| Birch | `hamlet/view/models.ts` `tree(3)` | trunk + 4 cluster crown | in hamlet | move beside pine as `birch()` |
| Silver-green wind tree | `renderer.ts` `growTree` + `drawLeaves` | 420-leaf crown animated by wind | writes to private `leaves`; one scene only; cannot be baked into a `CachedModel`; hard-coded `CROWN` | split: `growTree` returning a leaf list owned by the caller; low priority for hamlet |
| Water | `models/water.ts` (`waterPoint`, `ripple`) vs `harbor/water.ts` (`waterPixel`, `waterRing`) | water-only pixel and ring | two copies, `kinds===2` literal | one in `pixel/water.ts`, kind constants exported by the renderer |
| Grass wind | `renderer.ts` `growGrass/drawTufts`; **copy** `hamlet/view/frame.ts` `drawTufts` | wind-stepped tufts | renderer's list is private and bound to one `kinds` scan; hamlet re-implemented it to refresh after rebake | export `tufts` + `rebuildTufts()`; delete the hamlet copy |
| Animals | `models/animals.ts`: `cat`, `gull`, `fish` | lit animals from capsules/spheres | already pure (x,y,floor,time,awake); `harbor/animals.ts` re-declares dead colour constants and holds game hit boxes | keep; add `deer` |
| Deer | `hamlet/view/actors.ts` `drawDeer` | stag/doe, graze, flee, dead | hamlet `Deer` type; fur in hamlet palettes | move to `models/animals.ts`, parameters (x,y,yaw,state,phase,stag) |
| Terrain bake | `bakeHarbor`, `bakeFishing`, hamlet `bakeTerrain` | per-pixel `unproject`, superellipse dissolving border, tone by noise | same loop three times; game-specific classify | `pixel/diorama.ts`: `bakeDiorama(radiusX, radiusY, classify)`; ZN rule: promote after the third copy (this is the third) |
| Buildings | `fishing/scenery.ts` `cottage`, `harbor/scenery.ts` `boathouse`, hamlet `house/sawmill/lodge/gate` | roofs, walls, gables | hamlet's `gableRoof/gableWall` are good generic helpers; others are one-offs | `pixel/models/roofs.ts` (`gableRoof`, `gableWall`) |
| Smoke | `harbor/render.ts` `drawSmoke`; `hamlet/view/actors.ts` `drawSmoke` | chimney puffs | two implementations (dither vs `plot`) | one `smoke(x,y,z,time,seed)` in `pixel/effects.ts` |
| Sounds | `native/audio.ts` | 9 tones + seasonal water loops | global map, fixed kinds | section 3 |
| Surface and game base | `surface.ts`, `game.ts` | upload `pix` -> image, nearest scaling, crop | `PixelSurface` hard-wired to the global `pix` | `pixel/surface.ts` |
| Markers | `drawArrow`, `haloDots`, `drawDots` | UI over the picture | none | in renderer |

### 2.1 Rule check (AGENTS.md, `zinc-app`/`zinc-demo` skills)

| Rule | Where | Reading for this work |
|---|---|---|
| "A piece that a second demo needs is promoted to a shared module, not copied" (GUIDELINES.md) and "needs two actual consumers with the same contract" (`zinc-app` SKILL.md) | hamlet is the second consumer of pixel-plays' renderer, models, audio, surface | promotion is justified now; the three duplicates (terrain loop, `drawTufts`/`waterPixel`, palettes) are the evidence |
| "Do not start a new cross-app import as the permanent public API" (`zinc-app` SKILL.md) | `hamlet/src/pixel.ts` is the **only** cross-example import in the tree (`grep` of `examples/`): it re-exports `../../pixel-plays/src/native/*` | it is the stopgap; do not add a second consumer on top of it |
| "Put a platform-neutral primitive in std ... renderer-specific behaviour in its UI/stage module" | `lib/std/` (e.g. `react.ts`, `ui.ts`, `kit/`), `docs/reference/stage.md` (promoted from music-tree) | the pixel renderer is neither a primitive nor a UI: its precedent is `zinc:stage` (promoted from an example, documented in `docs/reference/`, registered in `src/frontend/modules.cpp` and `lib/modules.d.ts`) |
| "Migrate those consumers and their checks together" | `tests/t1/hamlet.sh`, pixel-plays tests | a promotion moves pixel-plays and hamlet in the same change |
| No `examples/_shared` exists | `ls examples` | do not invent one |

### 2.2 Proposed shared home

1. Now (no API commitment): leave code in `examples/pixel-plays/src/native/`, hamlet keeps `pixel.ts` as its only door. Fix the duplicates *inside* pixel-plays first (palette, water, tufts, deer, birch, roofs, kinds enum) so there is one version.
2. Then promote `renderer.ts`, `surface.ts`, `game.ts`, `models/`, `seasons.ts`, `palette.ts`, `diorama.ts`, `effects.ts`, `audio.ts` to **`lib/std/pixel/`** exposed as `zinc:pixel` (same path as `zinc:stage`: module registration, `.d.ts`, `docs/reference/pixel.md`, a T0 test). Both demos import `zinc:pixel`; `hamlet/src/pixel.ts` then disappears or becomes a one-line re-export.
3. Keep game rules, `Person`/`Deer` state and tool props (axe, bow, log) in each demo.

## 3. Audio: how it is generated, what baking needs

| Fact | Source |
|---|---|
| Fully procedural, no sample files | `native/audio.ts` |
| Effects: 9 one-shot `tone(hz, seconds, 'triangle'|'noise')` Sounds at start (`wood 190Hz .09s`, `throw 330`, `splash 120 noise .35s`, `soft 170 noise`, `point 660`, `bird 1400`, `reel 320`, `line 280`, `fish 880`), volume 0.014-0.09 | `ensureAudio` |
| `sound(kind, amount)` maps ~20 game words to those 9 sounds and plays `effect.voice(volume*amount, 1, 0, false)` | `sound()` |
| Ambiences: `makeWater(kind)` = 3 s, 24 kHz mono, LCG noise (`seed 84293`) through a one-pole low-pass (cut-off per season/river), slow swell (`sin`), faint trickle sine, 1200-sample crossfade of tail into head for a seamless loop; `fromSamples(samples,1,24000)`, `loop=true`, volume .24; built **in script on first use** (72,000 loop iterations per kind), cached in `waterLoops` | `makeWater`, `setAmbience` |
| State is global (`muted`, `sounds`, `ambience`); `toggleSound`, `pauseSound(paused)`, `disposeAudio` | audio.ts |
| API available | `plugins/audio/index.ts`: `tone`, `fromSamples`, `decode(bytes)`, `load(name)`, `Sound.voice(...)`, `stream`, `mix` |

Hamlet needs sounds the bank lacks: axe thunk, log drop, bow twang, arrow hit, footstep on road/grass, door, deer snort, building placed, gate bell. A single oscillator per effect cannot give an attack/decay envelope or a filtered noise burst, which is what wood and cloth need.

What baking to sample banks requires:

| Step | Detail |
|---|---|
| 1. Render once | a deterministic synth function `(seed, name) -> number[]` (already deterministic: LCG), with envelope, one-pole/biquad filters and 2-3 variants per effect (chop 1/2/3) |
| 2. Write | 16-bit PCM WAV (44-byte header + `Int16`) via `zinc:fs.writeBytes`; or hand to the asset pipeline as audio entries (`zinc-next-assets.md`: "the audio codecs come with their importers") to get packs and codecs per target profile |
| 3. Load | `load(name)` (pack) or `decode(readBytes(path))`; play with `voice(volume, rate, pan)`; randomise `rate` +-5% and pick a variant to avoid repetition |
| 4. Cache key | hash of the synth sources + parameters (same rule as the asset importers: "a pure function of id, version, options, source bytes") |
| 5. Gain | no first-use stall (the 72 K-iteration loops), the same bytes on interpreter/AOT/QuickJS, room for richer sounds. Cost: ~72 KB per 3 s mono 24 kHz loop, ~10-30 KB per effect |
| Keep | runtime synthesis as the fallback when the cache is missing (read-only media), as for the sprite atlas below |

The brief's rule applies: judge the mix by listening in the scene; generating samples without error proves nothing (`STYLE-BRIEF.md`).

## 4. A sprite atlas of pre-lit frames that still depth-tests

The pieces exist: `figure()`, `beginModel()`, `captureModel()`, `CachedModel.drawAt`.

```text
for role in palettes, yaw in 8 directions, pose in frames (walk 8, chop 6, aim 3, pick 3, idle 1):
  beginModel()
  figure(0, 0, yaw, pose, palette, capsule-based addBone)   // pass capsule(...,'solid'), NOT dynamicAdd
  atlas[role][yaw][pose] = captureModel()
frame draw: atlas[...].drawAt(p.x, p.y, 0) + castShadow(p.x, p.y, ...)
```

| Question | Answer |
|---|---|
| Does depth testing survive? | Yes. `drawAt` adds `at.d` (depth of the stamp position) to each baked depth and compares with `zb` which holds `groundZ` and stamped models. Same maths as the houses and trees. |
| Pre-lit? | Yes: `'solid'` mode = flat ramp bands, no screen-space dither, so the baked frame equals the live render except for sub-pixel position (rounded to 1 px; the live path uses float centres). Check by diffing a stamp against `figure()` at integer-aligned positions. |
| Shadows | keep dynamic: `castShadow` per frame from the footprint (feet + torso), or bake a list of `(dx,dy)` shadow pixels. `dynamicAdd` queues them per bone; the atlas path must queue only 2-3 casts. |
| Edges | `shadeEdges` runs after stamping, from `zb`/`groundZ`: outlines work unchanged. |
| Lights/seasons | atlas depends on `COOL/WARM` ramps: key the atlas by season; re-bake on `setLighting`. |
| Props | axe, bow, log, deer on back: separate small `CachedModel`s stamped on the hand/back position per frame, or extra atlas axes (carry 0/1/2). Bow string and arrow stay live (few pixels). |
| Capture cost | `captureModel` scans 100,800 px per frame and `beginModel` fills two buffers: 4 roles x 8 yaws x 21 poses = 672 captures x ~200 K element touches = ~135 M (estimate: seconds in the interpreter). Fix first: track the dirty bounding box in `sphere/plot` and give `CachedModel` a bounded scan (an additive change to the renderer). |
| Memory | ~250 lit px per figure frame x 28 B = ~7 KB; 672 frames = ~4.7 MB (estimate). Pack to one u32 (`x<<8|y`-relative + colour) + f32 depth per pixel to cut it by ~2x. |
| Gain | a person drops from 17 capsules with chains of spheres (and 17 queued shadows) to ~250 pixel stamps. Equal or better than live up to ~100 figures; below ~10 it is not worth it. Measure first. |
| Deer | same: 8 yaws x (walk 8, graze 4, flee 6, dead 1). |

Directions are 8 only if movement snaps to 8 headings; hamlet's `p.yaw` is continuous (`path.ts` follows tiles), so quantise `yaw` to 8 for drawing and keep it continuous in the simulation.

## 5. CLI extension points, cache dirs, first-run bake

### 5.1 `zinc` command table (`src/cli_core.cpp`)

| Existing entry | Relevance |
|---|---|
| `assets build\|info` (line 115): importers by rule (`as`: image, sprite, tilemap, texture, model...), ZPK packs in `build/assets/<target>`, content-keyed artifacts in `~/.zinc/cache/assets`, `report.json` | the natural home for a baked pixel atlas/audio bank: a new importer `"as": "pixel-atlas"` would give cache keys, packs, `--release` and per-target profiles for free. Importers are C++ and "built in, not a Zinc script" (`zinc-next-assets.md` 113): a baker that *runs* Zinc code is new. |
| Font baker (`src/res`): "its inputs are the program's sources" (`zinc-next-assets.md` 211) | the one precedent of a source-driven bake; study it for the "run the program headless to produce data" step |
| `capture`, `bench`, `pack` (lines 114, 128, 129) | `capture --frames` and `bench` are how to prove the atlas matches live; `pack` already bakes fonts and images |
| New subcommand `zinc bake` | one more top-level command for a niche need; every command carries i18n strings (`cli.cmd.*` keys, 5 languages). Not recommended first. |

Recommendation, in order: (1) first-run bake at runtime + cache (5.2), which needs no CLI change; (2) a `tools/bake-pixel` script (precedent: `tools/scene-texts`, `tools/regen-run-goldens`) that runs the demo headless (`ZINC_HEADLESS=1 zinc run ... -- --bake out.bin`) for tests and CI goldens; (3) only when two demos use it, an `assets` importer with a headless-run step, so `zinc pack` ships the bank. A top-level `zinc bake` only if (3) does not fit.

### 5.2 Cache locations and first-run bake

| Place | Use | Note |
|---|---|---|
| `$ZINC_HOME` (default `~/.zinc`; `src/tc/tc.cpp` 262) with `cache/assets` | engine/toolchain artifacts, owned by the CLI | an app at runtime should not write here; it is the dev machine's tree |
| `build/` of the project (git-ignored, `.gitignore` `build/`) | `zinc build`/`pack` outputs, `build/assets/<target>` | right place for the *build-time* bake (3) |
| `zinc:storage` (`get/set/remove/keys`, strings) | hamlet's save is already one text line (`hamlet:save`) | a binary atlas would need base64/hex: 5 MB of text is the wrong tool; fine for a version stamp |
| `zinc:fs` (`readBytes/writeBytes/exists/mkdir`) | binary files | `lib/modules.d.ts` lists no "app data directory" function: **gap to verify** (where is a writable per-app path on each target?). Fix it in the engine rather than hard-code a path, per AGENTS.md "Fill the engine's gaps". |

Runtime first-run bake design (no CLI change):

1. At start: read `<appdata>/pixel-atlas-<season>-<hash>.bin` (`fs.exists`, `readBytes`). Hit: unpack into `CachedModel`s (constructor accepting arrays).
2. Miss: bake in slices over several frames (e.g. 24 captures per frame) behind a 1-line "preparing the village" screen; write the file; set `storage` key `hamlet:atlas` = the hash.
3. The hash covers: renderer source version, palette/lighting, `S/W/H`, and the atlas definition; a changed hash re-bakes.
4. Fallback: if the cache cannot be written (read-only media, web), keep the atlas in memory only; if the bake budget is too high on small devices, use live `figure()`.
5. Proof: a T1 session that compares a frame drawn with the atlas to the live one (`pngdiff`, tolerance 0 at integer positions) and one that checks the second start loads from the cache without baking.

## 6. Order of work (smallest steps that remove risk)

| # | Step | Why first |
|---|---|---|
| 1 | Measure `zinc bench examples/hamlet` at 20 and 60 figures, and the time of `rebakeStatic` | every claim above is a count, not a time |
| 2 | Remove duplicates inside pixel-plays (palettes, water, tufts, kinds enum, birch, deer, roofs, smoke) | prerequisite of any promotion |
| 3 | `CachedModel` with bounding box; export `tufts`/`rebuildTufts`; `setOrigin`/viewport only when a larger map is decided | additive, enables atlas and pan |
| 4 | Promote to `lib/std/pixel/` (`zinc:pixel`), migrate pixel-plays and hamlet with their tests | the second consumer exists |
| 5 | Atlas for people and deer, in memory first; add the file cache after the gain is measured | avoids building a cache layer for an unproven win |
| 6 | Sample bank for the missing sounds (synth to WAV, packs through assets) | independent of the renderer |
