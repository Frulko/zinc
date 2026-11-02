# A successor engine to the Sierra city builders (Caesar III, Pharaoh, Zeus) (2026-11-02)

Owner decision (2026-11-02): take everything the research found in charge, and design it so the engine pushes the limits the originals could not: more active objects, bigger cities, multiplayer. What is not built yet is recorded here as the target design. Sources and confidence notes: `hamlet-citybuilder-engines-2026-11-02.md`; mechanisms of Augustus: `hamlet-augustus-study-2026-11-01.md`, `hamlet-augustus-reference-2026-11-01.md`; multiplayer seam: `hamlet-multiplayer-design-2026-11-01.md`; plan and contract: `hamlet-cite-mode-2026-11-02.md`; scale measurements: `hamlet-scale-2026-11-02.md` (when the stress pass reports).

## 1. What the Sierra line is, and where it stops

| Trait of the line (Caesar III, Pharaoh, Zeus; Julius, Augustus, Akhenaten, eZeus keep them alive) | Its limit | Our answer |
|---|---|---|
| Fixed grid 40..160 tiles a side, typed layers | Maps are small; 1,999 buildings; "not designed above ~30,000" people | Chunked grids up to 1024x1024, chunk = 32x32 tiles, per-chunk dirty flags |
| Figure pool, ids, per-tile chain, a few thousand objects (Pharaoh capped active objects at 5,000, then 2,000) | The cap is the pacing of the whole game; objects on one tile share a simplified sim | A simulation LOD: near and important walkers are full agents, far ones are scheduled less often, crowds are aggregated; target 50,000 live entities, 5,000 full agents |
| 50 ticks a day, one whole-map pass per tick index | Whole-map passes do not scale to 1M tiles | Sliced passes (rows k..k+n per tick), double-buffered results, dirty-region recomputation |
| Road networks by flood fill, A*-like routes, roamers with turn rules | A* per trip dies with 100 walkers sharing a goal | Distance fields per store and per gate, cached by road-set version; roamers keep direction rules; A* only inside one component |
| Software draw of visible tiles every frame | Cost follows the screen, which is fine, but no GPU | GPU quads, chunk-baked static layers, atlases by page, LOD at far zoom |
| Single player, no network | | Deterministic command-driven sim, state hashes, a small server: friends build, trade and fight |

## 2. The engine, as layers (each is testable alone)

1. **World** (`src/world`): typed-array layers (terrain flags as bits, height u8, road, building id u16/u32, deco), entity pools (buildings, walkers, animals) with free-list stacks, generation counters (stale-id guard) and per-type id lists. Derived data (network ids, desirability, coverage, distance fields) is never saved: rebuilt on load.
2. **Sim** (`src/engine`, `src/rules`): a fixed tick (32/s today, 10-20 Hz is enough for walkers with render interpolation), day slots like Augustus (a table `tickInDay -> pass`), integer-or-exact float math (`+ - * /` and sqrt only), one seeded RNG saved in the state, a per-day `stateHash`. Time budget per tick with a job queue so a spike carries over instead of hitching.
3. **Paths**: road-network ids with dirty flags (merge/split only the touched component), distance fields per target class (multi-source BFS: all wells, all markets, all stores), keyed by (target, road version), LRU-evicted; run-length paths in a pooled byte array; stranded walkers have a defined end (go home, teleport home, despawn), never hang.
4. **Topography**: heights as levels, plateaus with ramps (the Augustus way) and smooth slopes by corner average; cliffs are walls; mountains are rock with ore. Done (item A).
5. **View** (`src/cite`): chunk-baked ground, sprites from a PNG atlas (or baked from the same generators), depth order by tile diagonal and height with footprint/top split, culling to the screen, LOD (far zoom draws baked chunk textures and dots), animation by frame index. Done for the first version (items B, F, art); sizes of buildings and the LOD tiers are next.
6. **Commands and network**: every player decision is a `Command` applied at a tick (the log exists: `world.log`); the client simulates; a server replays the log, compares hashes and repairs by snapshot; trade is a server mailbox with escrow; war is a lockstep room. Details and the seam: `hamlet-multiplayer-design-2026-11-01.md`.
7. **Data** (`assets/economy.json`, `assets/missions/*.json`, `assets/atlas/`): chains, services, housing levels, missions and art are data; the validator refuses a bad file by name.

## 3. Pushing the limits

| Limit | Target | How | State |
|---|---|---|---|
| Active objects | 5,000 full agents, 50,000 live entities | update LOD by distance to the camera and by importance (`id % N == tick % N`, moving `N*speed`), one per-tile "leader" sim for crowds, a walker budget with a visible "cap reached" hint, entity pools in typed arrays, grid-bucketed neighbour queries | measured 500 people at 1.4 ms; stress pass in progress |
| City size | 1024x1024 | chunks (static bake, dirty flags), sliced daily passes, generation in slices or a worker, LOD at far zoom, minimap from per-chunk summaries, save as chunk list | 256 generates in ~12 s (bounded flood fill pending); view holds 60 fps windowed at 256 |
| Multiplayer | 2-8 friends, a Pi or VPS server | command log + hash compare + snapshot repair, no float or iteration-order dependence, `zinc:net serve`, `zinc:sqlite` | seam designed; the determinism hashes already agree on three engines |
| Understandability | a new player sees why something is idle | advisors, overlays, one-sentence idle reasons, a guided start, missions with a briefing | done (item D) |
| Art | Pixel Plays look at GPU speed; replaceable | atlas export and load (`computed` or `files`), animated poses, building footprints | export and poses done; footprints pending |

## 4. Work queue (ranked by impact over effort)

1. Distance fields per store and per gate, version-keyed cache; roamer preview in the UI. (sim)
2. Sliced passes with double buffers for everything whole-map (network labels, desirability, coverage). (sim)
3. Update LOD and a walker budget; entity pools to typed arrays and the shared path pool. (sim)
4. Building footprints (`size: [w, h]`, anchors, multi-tile placement and picking). (data, rules, view)
5. Chunked world and save, generation in slices or a worker; bounded deposit placement. (world, gen)
6. View LOD tiers: baked chunk texture plus dots at far zoom; fix the checkered far levels. (view)
7. Server: commands with ticks, `stateHash` per day, snapshot and repair, a headless host (`zinc:net serve`), trade mailbox. (net)
8. Missions: balance pass, mission-aware bot, stock-hold counters in the save. (data)
9. Animated props (sails, flames, water, sleep) and roles for the chapel and theatre. (art)
10. Engine: a PNG encoder in `zinc:gfx`, typed-array bulk ops where profiles ask, GC pauses in the interpreter. (engine)

## 5. Pitfalls recorded by the community, and our rule for each

- Road networks split by decorations (gardens) or a warehouse on another network: the network id is shown on the info window and in an overlay.
- Walkers stranded after a road edit: version bump, re-plan on the next step, defined fallback.
- Walker cap starving goods: a visible hint when the budget is reached.
- Save drift from derived state, desync from iteration order or unsaved caches: never save derived data, hash the whole state per day, test replays on every engine.
- A tall building hiding a figure behind it: footprint/top split and draw each building once from its anchor.

## 6. Licence

Augustus and Julius are GPL-3: mechanisms and ideas only. No code, table, constant, name, image or text is copied; numbers are re-invented and tuned by play.
