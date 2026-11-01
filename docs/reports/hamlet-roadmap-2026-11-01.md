# Hamlet roadmap (2026-11-01)

Owner request: a bigger, procedural, data-driven, fast, multiplayer-ready Hamlet. Backlog freeze lifted for this decomposition (`New-task: owner <the Hamlet roadmap request>`).
Studies behind it (read them, they hold the file pointers): `hamlet-augustus-study-2026-11-01.md`, `hamlet-pixelplays-reuse-2026-11-01.md`, `hamlet-multiplayer-design-2026-11-01.md`.
Tasks: milestone M30, labels `hamlet`, ordinals 700000+ (after the whole current queue, so `tools/next-task` order of existing tasks is untouched; lower the ordinals to start earlier). Task keys `hm-*` are in `backlog/keys.json`.

## 1. Vision

A cosy iso village builder in the Pixel Plays diorama style (lit volumes, no flat sprites) that grows from "wood and game" to real production chains,
on maps several screens wide, fast on modest machines because everything animated is baked once, and built on a deterministic command-driven simulation so that
friends can later trade and fight on a self-hosted server. Scale target: 48x48 tiles, 40-200 people, 60 fps on the dev Mac, 24 poses/s on small devices.

Rules of the road: economy is data (adding a chain = editing JSON + one model); the sim never draws; everything shared is promoted (`zinc:pixel`), not copied;
the diorama look (S=10, 30 degree projection, ramps, dithers) is kept, we change what is cached, not how it looks.

## 2. Findings

### 2.1 Renderer (what constrains us)
- One 360x280 buffer, `S=10`, no camera object; the 12x12 map already fills 340 px. Projection is affine, so a baked layer can be shifted by whole pixels with a constant depth offset: **pan = composite of chunks**, not a re-render.
- Zoom: integer presentation scale and crop window exist (`PixelSurface`, `PixelGame.crop*`). Changing `S` is out (all radii and dithers are tuned for 10). Zoom out = decimated overview.
- Per-frame fixed cost is ~5 full-buffer passes; static re-bake (every build) is a full pass. A person is 17 capsules; a pine is ~130 spheres (always baked).
- `CachedModel` is sparse arrays, depth-exact when stamped; `beginModel` clobbers the live scene; it scans 100,800 px per capture (needs a bounding box before baking hundreds of frames).
- Nothing was measured yet: first task is a baseline.

### 2.2 Augustus (Caesar III port, GPL-3: ideas only, nothing copied)
Rules worth adapting at our scale (full list with source pointers in the study, section 10):
| Mechanism | For Hamlet |
|---|---|
| Buildings need an adjacent road and a road network id | already true; add "connected to store/gate" as data for hints |
| Fixed job count per building, labour share, priority | `labour` task: workers per def, player priority, no staff = no output |
| Roaming service walkers set per-house counters that decay daily | `services`: well/market coverage, cheap and gives the Caesar feel |
| Housing levels: separate evolve/devolve thresholds, requirement ladder (water, food, market), "what is missing" shown | `housing-levels` |
| Desirability rings | `desirability` (small, optional) |
| Producers emit loads to the nearest accepting store, stores reserve incoming loads | `eco-stock` porters + storehouse |
| Heavy whole-map passes are spread over the ticks of a day | all slow rules run as daily slices |
| Trade routes, fire, crime | skipped; a peddler replaces trade routes, fire later if wanted |
Licence: do not copy code, tables, constants, names, art or text; numbers are re-invented and tuned by play.

### 2.3 Settlers and Settlers Online
- Settlers: deep chains (resource -> building -> resource), carriers on roads, storage. Covered by the data schema below.
- Settlers Online: adventures, trading, progression/unlocks. Covered by `goals`, `peddler`, `adventure` (phase 3, all as data, all through commands so they replay).

### 2.4 Multiplayer (design now, seam now, no network code)
Hybrid: the client runs its own town (single owner), the server replays the command log as authority, compares state hashes and repairs by snapshot. Trade is a server mailbox with escrowed offers (works offline). War is a lockstep room on a separate battle-map sim; the defender can be scripted when offline. Server in Zinc: `zinc:net serve` (HTTP+WebSocket), `zinc:sqlite`, headless via `ZINC_HEADLESS=1`, exported as a binary + systemd unit, runs on a Pi or a VPS. Float determinism needs only `+ - * / sqrt` and integers (no fixed point), if `hypot`, sin-based hash and the variable dt are removed.
The seam (all in M1/M2): fixed tick, PRNG in state, `stateHash`, Command + `submit/advance`, command log replay, save H2 without storage.

## 3. Data formats

### 3.1 Economy graph: `examples/hamlet/data/economy.json`
```json
{ "resources": [{"id":"log"},{"id":"plank"},{"id":"meat"},{"id":"smoked_meat"}],
  "buildings": [
    {"id":"sawmill","label":"Scierie","cost":{"log":6},"workers":2,"role":"miller",
     "inputs":{"log":2},"outputs":{"plank":1},"seconds":6,"needsRoad":true,"model":"sawmill","stockCap":8},
    {"id":"lumberhut","label":"Bucheron","cost":{"plank":2},"workers":2,"gather":"tree","outputs":{"log":1},"seconds":2.6,"model":"hut"},
    {"id":"house","cost":{"plank":3},"housing":{"capacity":2,"consumes":{"smoked_meat":1},"freeSettlers":4}} ],
  "deposits": [{"resource":"stone","placement":"near:rock","density":0.04,"model":"deposit_stone"}] }
```
Validator rejects: unknown resource, cycle without a raw source, missing model, negative numbers. A chain report lists producers/consumers per resource. Goals and adventures are separate files with the same loader style.

First chain set: 1 `lumberjack -> log -> sawmill -> plank -> construction`; 2 `hunter -> lodge -> meat+hide -> smokehouse(+log fuel) -> smoked_meat -> houses`; 3 `farm -> wheat -> mill -> flour -> bakery -> bread`; 4 `hide -> tannery -> leather`, `well`, `market`, `storehouse`.

### 3.2 Map preset: `examples/hamlet/presets/<name>.json`
```json
{ "v":1, "name":"Riverside", "w":32, "h":32, "seed":7,
  "gen":{"water_amount":0.2,"river":true,"forest_density":0.5,"rock_density":0.05},
  "terrain":null,                       // null = generated from seed+gen; or row strings "..~~..T.."
  "gate":[0,16], "stock":{"log":12,"plank":6}, "objects":[["deer",5,9]], "roads":[], "buildings":[], "goals":["tutorial"] }
```
A seeded preset is tiny; a baked preset lists tiles. Save and preset share the town block encoding (preset = save without people/timers). User presets live in the app data directory (needs `fs.appDataDir`, verified in `hm-fs-appdata`).

### 3.3 Sprite atlas (code2assets)
Header: `{format:1, season, W,H,S, rampsHash, paletteHash, defHash}`; the cache key is the hash of the header inputs. Frames: `CachedModel` packed arrays (u32 colour, packed x/y, f32 depth) keyed by `(kind, variant, yaw8, pose)`.
Frames are captured from the real draw calls (`beginModel` + `figure()` with solid capsules), so they stay lit volumes and depth-test against the ground z-buffer exactly (depth is additive); only sub-pixel position is lost (rounded to 1 px). Shadows stay dynamic (2 casts), props are separate small frames, yaw is quantised to 8 for drawing only.
Cost model: ~250 lit px per person frame, ~7 KB; 4 roles x 8 yaw x 21 poses ~ 4.7 MB (estimate). Expected win from ~10-20 figures up; **measure first, keep the live path behind a flag**.
Bake: runtime first-run bake, sliced over frames, cached at `<appdata>/atlas-<hash>.bin`, fallback memory-only. `tools/bake-pixel` runs it headless for CI/packs. No new `zinc` subcommand now; later an `assets` importer if two demos use it (decision: avoid a niche top-level command and its 5-language strings).
Audio bank: deterministic synth (envelopes, filters, 2-3 variants), 16-bit WAV in the same cache, rate jitter on play; runtime synth stays as fallback.

### 3.4 Save H2
One text line per town, versioned; whole state (tiles, stocks, buildings, people mid-job, deer, tick, PRNG, season, goals); `snapshot()/restore()` do not import storage; H1 still loads. Server stores snapshot + command log.

## 4. Architecture / modules
```
examples/hamlet/
  data/economy.json goals.json adventures.json   presets/*.json
  src/world/   state, save (H2), presets
  src/rules/   commands, validation, hints, goals
  src/engine/  tick, jobs (generic), porters, services, housing
  src/view/    camera, chunks, atlas stamps, indicators
shared (pixel-plays now, lib/std/pixel = zinc:pixel after promotion):
  renderer, surface, game, models/(trees, animals, roofs), seasons, palette, diorama, gen/, atlas, audio bank
```
Dependency direction: view -> world <- engine/rules; shared `zinc:pixel` depends on nothing of hamlet.

## 5. Milestones (dependency ordered)
Ids are in section 7. Keys: `hm-<key>`.

**M1 shippable slice (labels `m1`)**: (a) data economy + 2 chains, (b) pan/zoom + chunked bigger map, (c) atlas of static models and people, (d) indicators.
1. `seam-tick` -> `eco-schema` -> `eco-engine` -> `eco-stock` -> `chain-wood`, `chain-game`, `save-h2`
2. `bench-baseline` (parallel) -> `dedupe-pixelplays` -> `model-bbox` -> `atlas-format` -> `atlas-people`, `atlas-static`
3. `dyn-size` -> `camera-pan` -> `chunk-bake`, `zoom`
4. `hints-compute` -> `hints-draw`
**M2 (labels `m2`)**: presets (`presets-format`, `presets-content`), generators (`gen-terrain`, `gen-deposits`), atlas cache + tool + deer + audio bank (`fs-appdata`, `atlas-cache`, `bake-tool`, `atlas-animals`, `audio-bake`), `seasons-shared`, promotion to `zinc:pixel` (`promote-pixel-1/2`), multiplayer seam (`cmd-queue`, `cmd-replay`, `mp-spec`).
**M3 depth (label `m3`)**: more chains (`chain-farm`, `chain-tannery`), `labour`, `services`, `housing-levels`, `desirability`, then Settlers Online ideas `goals`, `peddler`, `adventure`.
**Not planned as tasks**: network code, server, battle map, units/barracks, integer sim, delta saves (see the multiplayer study; `mp-spec` is the document that unblocks them).

## 6. Risks
| Risk | Mitigation |
|---|---|
| Atlas gain unproven below ~20 figures; capture is slow | baseline bench first, bounding box first, live path behind a flag, gain gate in the AC |
| Chunk composite breaks occlusion/shadows at chunk borders | 4 px margin, pngdiff tolerance 0 against the full bake on 12x12 and 48x48 |
| Large map multiplies fixed per-frame passes (area x4) | dirty-rect or chunk-limited passes only if the bench shows it; start with the 360x280 window |
| Float divergence across engines/CPUs | no hypot/sin in sim, integer hash, state hash test on 3 engines, snapshot repair by design; cross-CPU proof in the cross-platform pass |
| Data schema too weak for later chains (services, levels) | housing, services and deposits are separate sections of the same file, validator first; schema version field |
| Promotion to `zinc:pixel` touches pixel-plays goldens | dedupe first, promote with goldens unchanged, one change for both consumers |
| No app-data directory in `zinc:fs` | `fs-appdata` verifies and fixes the engine (no hard-coded path) |
| Scope creep (Augustus depth, multiplayer) | M1 is shippable alone; M2/M3 are ordered, each task has its own AC |
| GPL contamination | ideas only; no Augustus code, tables, names or art; study doc states it |
| Audio bake judged wrong by ear | decision recorded in the task; runtime synth stays |

## 7. Task ids

| key | task |
|---|---|
| adventure | ZN-981 |
| atlas-animals | ZN-962 |
| atlas-cache | ZN-964 |
| atlas-format | ZN-953 |
| atlas-people | ZN-954 |
| atlas-static | ZN-955 |
| audio-bake | ZN-966 |
| bake-tool | ZN-965 |
| bench-baseline | ZN-940 |
| camera-pan | ZN-948 |
| chain-farm | ZN-973 |
| chain-game | ZN-945 |
| chain-tannery | ZN-974 |
| chain-wood | ZN-944 |
| chunk-bake | ZN-949 |
| cmd-queue | ZN-970 |
| cmd-replay | ZN-971 |
| dedupe-pixelplays | ZN-951 |
| desirability | ZN-978 |
| dyn-size | ZN-947 |
| eco-engine | ZN-942 |
| eco-schema | ZN-941 |
| eco-stock | ZN-943 |
| fs-appdata | ZN-963 |
| gen-deposits | ZN-961 |
| gen-terrain | ZN-960 |
| goals | ZN-979 |
| hints-compute | ZN-956 |
| hints-draw | ZN-957 |
| housing-levels | ZN-977 |
| labour | ZN-975 |
| model-bbox | ZN-952 |
| mp-spec | ZN-972 |
| peddler | ZN-980 |
| presets-content | ZN-959 |
| presets-format | ZN-958 |
| promote-pixel-1 | ZN-968 |
| promote-pixel-2 | ZN-969 |
| save-h2 | ZN-946 |
| seam-tick | ZN-939 |
| seasons-shared | ZN-967 |
| services | ZN-976 |
| zoom | ZN-950 |
