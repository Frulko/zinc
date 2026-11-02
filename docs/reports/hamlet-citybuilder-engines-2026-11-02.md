# Hamlet: engines in the Caesar III line and big city-builder practice (2026-11-02)

Read-only research. Builds on `hamlet-cite-mode-2026-11-02.md` and `hamlet-augustus-study-2026-11-01.md` (not repeated). Augustus facts marked **[local]** were read in `/Users/mowmow/Lab/augustus/src` (GPL-3: mechanisms only, no code reused). External claims carry a URL. Labels: **Confirmed** (primary source read), **Reported** (forum/secondary), **Unconfirmed** (searched, not found). No code is quoted.

## 0. The engines, and what could not be found

| Project | Real repo | What the sources say | Status |
|---|---|---|---|
| Julius (Caesar III) | https://github.com/bvschaik/julius | Re-implementation keeping original logic; saves 100% compatible; original bugs kept on purpose (https://flathub.org/apps/com.github.bvschaik.julius, search summary) | Confirmed |
| Augustus | https://github.com/Keriew/augustus | Fork with gameplay changes: roadblocks, market special orders, global labour pool, partial warehouse storage, zoom, "increased game limits" (page gives no numbers) | Confirmed |
| Akhenaten (Pharaoh) | https://github.com/dalerank/Akhenaten | Fork of the Julius/Augustus line (Ozymandias lineage), C++, CMake, SDL2, Tracy profiler, embedded mujs scripts with hot reload, `.sgx` mods, Emscripten web build | Confirmed |
| Ozymandias (Pharaoh) | https://github.com/Banderi/Ozymandias | Earlier Pharaoh re-implementation, in Godot 3.6 | Confirmed (existence) |
| Zeus | https://github.com/MaurycyLiebner/eZeus | C++/Qt-project/SDL2; "new walker implementation" option; two cities at once; forks Olympus (hotkeys, smooth scroll, 240 FPS mode) and ZeusDroid (Android) | Confirmed; README has no architecture text |
| "Thyrsus" | none found | A GitHub repository search and two web searches returned nothing under that name | **Unconfirmed**; eZeus is the real Zeus project |

Consequence: for Pharaoh and Zeus internals there is almost no written documentation. The only deep, readable source is the Augustus code (local) plus forum experiments. Do not plan around Pharaoh/Zeus tile-height formats: **Unconfirmed**. The only height fact found: a Caesar III write-up describes a per-tile height byte array (0 = land, 1 = 15 px, 2 = 30 px...) (https://www.moddb.com/games/ozymandias/news/the-making-of-pharaoh surfaced it via search; page itself returned 403 to fetch, so **Reported**). Augustus confirms the same idea **[local]**: `map/elevation.c` holds a u8 grid, with a clean-up pass that lowers a tile when a neighbour is two or more lower ("elevation is max 5, so we need 4 passes"); `TERRAIN_ELEVATION` and `TERRAIN_ACCESS_RAMP` are terrain flags; ramps are the only way onto raised ground (`map/road_network.c` lets networks cross `TERRAIN_ACCESS_RAMP`). Caesar-line elevation is thus "plateaus with ramps", not smooth slopes.

Pharaoh facts from the Akhenaten devblog (https://dalerank.github.io/Akhenaten/devblog/story-of-pharaoh-game.html, **Confirmed** as the author's account, retold from interviews): active-object limit per frame fell from 5,000 in Caesar to 2,000 in Pharaoh to keep frame rate steady; objects sharing a tile use simplified simulation (one acts, others copy); player edits after a route is computed can strand a walker with no path back; Pharaoh walkers go between destinations where Caesar's wandered; Caesar had to fit in 32 MB. RA 0.27 notes (https://dalerank.github.io/Akhenaten/devblog/ra-027-release-notes.html): building, overlay and mission logic moved to scripts with data blocks; saves now persist previously dropped state (invasion points, depletion grids); several fixes were "placement checks not chaining to the base", i.e. data-driven rules need a defined inheritance order.

## 1. Data layout

### What Augustus does **[local]**

| Item | Fact | Where |
|---|---|---|
| Grid | One flat square of 162 x 162 cells (`GRID_SIZE`), every layer a typed array of that size: u8, i8, u16, i16, u32 variants; the playable map sits inside a border | `map/grid.h` |
| Layers | terrain flags (24 bits: tree, rock, water, building, road, garden, elevation, ramp, meadow, rubble, wall, gatehouse, shallow water, marsh, beach, highway quarters), building id (u16), figure id (u16), elevation (u8), road network (u8), desirability (i8), routing distance (u16) and more | `map/terrain.h`, `map/figure.c`, `map/elevation.c`, `map/road_network.c` |
| Figures | Array grown in steps of 1000, slot 0 = none, an "active" predicate for reuse of free slots; ids not pointers; a `created_sequence` counter guards a target id that was reused (stale-id check) | `figure/figure.c` |
| Figures per tile | A tile stores the first figure id; each figure stores the next id on the same tile (intrusive list); the stack index is capped at 20 | `map/figure.c` |
| Paths | Separate pool of per-figure direction lists, run-length packed (direction in the high bits, repeat count in the low bits of one byte); freed when the owning figure is dead; grown in steps of 500 | `figure/route.c`, `map/routing_path.c` |
| Save | Every grid and pool written as raw buffers in fixed order; entity pool saved including free slots | `map/grid.c`, `figure/figure.c` |

Julius keeps the original format (saves compatible with Caesar 3), so the layout is frozen by history, not by design. Augustus loads Caesar saves but Caesar cannot load Augustus saves (https://gog.com/forum/caesar_series/save_game_file via search summary, **Reported**).

### Recommendations for Hamlet (maps to 1000 x 1000, thousands of walkers)

| Topic | Advice | Basis |
|---|---|---|
| Grids | One `Uint8Array`/`Uint16Array` per layer, row-major, index = y*W+x, no border cell if you clamp in neighbour helpers (or a 1-tile border to drop bounds checks). A 1000x1000 u16 layer is 2 MB: fine. Keep terrain flags as bits, not many bool arrays | Augustus `map/grid.h` **[local]** |
| Ids | Entity references are integer ids, slot 0 = none; keep a `generation` or `createdSeq` per slot so a stored target id can be checked after a reuse | Augustus `figure/figure.c` `created_sequence` **[local]** |
| Free list | Grow by chunks, reuse the lowest free slot (Augustus) or keep a stack of free ids (better at thousands: O(1)); iterate dense by `count` high-water mark | **[local]** + judgement |
| Per-type indices | One `Int32Array` list of live ids per type, rebuilt lazily or maintained on create/kill; helps "all stores", "all houses" passes | Augustus keeps per-type links **[local]** per the earlier study; judgement for the array form |
| Tile occupancy | Keep "who stands here" as a head id plus an intrusive next-on-tile chain, cap the draw stack (20 in Augustus) | `map/figure.c` **[local]** |
| Paths | Share one pooled `Uint8Array` of run-length directions rather than `number[]` per walker; free on death | `figure/route.c` **[local]**; Hamlet now stores `number[]` per mover (`engine/path.ts`), fine at 200 walkers, not at thousands |
| Derived data | Never save derived grids (road network, desirability, distance fields, coverage); rebuild on load | Augustus saves some derived state, which is why old saves carry drift; OpenTTD lists "savegame does not describe the complete state" and cached values not revalidated as the main desync causes (https://sources.debian.org/src/openttd/15.1-1/docs/desync.md) |
| Save format | Versioned chunk list, one chunk per subsystem, each field addition bumps version, readers tolerate old versions; Augustus does this with per-version branches **[local]** `game/file_io.c`, `game/save_version.h` (named in earlier study). Add a checksum of the sim state (RNG state is a cheap proxy) | OpenTTD desync doc above |
| Determinism | Integer math only in the sim, one seeded RNG whose state is saved, no dependence on iteration order of hash maps, no wall clock in the sim. A per-day state hash in tests catches divergence early; OpenTTD notes an RNG-checksum can miss a desync for years (one case caught after 20 game years) so hash more than the RNG | https://sources.debian.org/src/openttd/15.1-1/docs/desync.md. Floating point as desync cause: **Unconfirmed** by that source |
| Scale of old games | Caesar-class: maps 40 to 160 per side, 1,999 building limit, population messages up to 25,000, "not designed above 30,000" (https://www.teoalida.com/games/caesar3/, **Reported** by a player guide). Hamlet's 1000x1000 and thousands of walkers is far beyond the lineage: only the scheduling ideas transfer |

## 2. Simulation scheduling

**[local] `game/time.h`, `game/tick.c`**: 50 ticks per day, 16 days per month, 12 months. One tick does figure actions every tick (`figure_action_handle` loops all figures); a `switch` on the tick number (1..49) runs one heavy whole-city pass per tick index: road networks (7), granary stocks (8), warehouse and food stocks (16, 17), production (20 and 46), room/migration/evict (22-24), labour (25), water supply (27, 28), figure spawning (31), trade (32), culture coverage (33), desirability grid (37) then per-building desirability (38), house evolve and consume goods (39), building state (40), fire (43, 44), criminals (45). Day-level hooks at day 0, 7, 8 etc.; month hook for finance and tutorials. Several ticks are explicit no-ops. This is the "spread whole-map passes over the day" pattern.

| Technique | How, for Hamlet | Basis |
|---|---|---|
| Slotted daily passes | Keep Augustus's idea: a table `tickInDay -> pass`. At 1000x1000 a single pass (desirability, network labelling) is ~1M cells: too big for one tick, so slice by rows (`rows k..k+n` per tick) with a "double buffer" swap when the last slice finishes, so readers never see a half-new grid | **[local]** `game/tick.c` for the table; slicing is judgement |
| Incremental invalidation | Recompute road network ids when the road set changes (a dirty flag), not every day. Augustus recomputes every day at tick 7 **[local]** `map/road_network.c`; at 1000x1000 flood-fill-all is ~1M cells, so only redo the touched component (split/merge) or just flag dirty | judgement |
| Per-figure staggering | Update far or idle walkers every N ticks by `id % N == tick % N`; near-camera walkers every tick. Keep movement deterministic by moving a distance of `N*speed` on their slot, not by skipping | judgement; the cap on active objects in Pharaoh confirms the problem (https://dalerank.github.io/Akhenaten/devblog/story-of-pharaoh-game.html) |
| Simplified simulation per tile | Pharaoh: objects that share a tile use simplified sim, one acts and the others copy | same Akhenaten page, **Reported** retelling |
| Hard cap with queue | Cities: Skylines caps concurrent travellers; extra citizens wait in a queue with no penalty to the player; traffic sim runs 4 Hz and rendering interpolates (https://www.gamedeveloper.com/design/how-traffic-works-in-cities-skylines). For Hamlet: sim at a fixed 10-20 Hz, render at screen rate with interpolation between the last two positions | Confirmed (article) |
| Spawn throttle | One walker per service building at a time with a spawn delay keeps counts bounded **[local]** `building/figure.c` (earlier study). A global walker budget with "spawn when below budget" prevents cliffs; some players report a 999-walker cap in Caesar (https://www.teoalida.com/games/caesar3/, **Reported**, unverified) and note that goods stop flowing when the cap is reached: a budget needs a visible "walker cap reached" hint |
| Job queue | A priority queue of "recompute path for X", "assign worker", budgeted by microseconds per tick, so a spike carries over to the next tick instead of a frame hitch. Not in Augustus (it computes route on spawn); common practice, judgement |
| Time budget testing | Add a perf test that runs 1 game year on a stress map and records worst-tick time. Chip away at the max, not the mean |

## 3. Pathfinding at scale

### What Augustus does **[local]**

| Fact | Where |
|---|---|
| Two search shapes: `route_queue_from_to` is A*-like: an ordered (heap) queue keyed on cost so far plus a remaining-distance estimate, stops at the goal, optional `max_tiles` cut-off; `route_queue_all_from` is a plain FIFO flood fill ("distance grid") from one source, with a `GUARD` limit of 50,000 steps | `map/routing.c` |
| Step cost is 2 for a move in the from-to search and 1 in the flood fill; a "highway" bonus reduces a step by 1 | `map/routing.c` |
| Callbacks per terrain class decide passability: citizen-on-land, citizen-on-road-or-garden, road-garden-highway (with fallback to land), non-citizen (enemies), walls, boats | `map/routing.c`, `figure/route.c` (`TERRAIN_USAGE_*`) |
| Result is converted to a run-length path in the figure's path slot; 4 directions for citizens, 8 for others (diagonals only off-road) | `figure/route.c`, `map/routing_path.c` |
| Road networks: one flood-fill of road tiles gives each connected set an id (u8 grid); each building remembers its network id; delivery and fetch walkers only target buildings on the same id. Sizes of the largest networks are tracked (used to show "your main network") | `map/road_network.c`, `city/map.c` |
| "Distance grid" is also saved and reloaded | `map/routing.c` `map_routing_save_state` |
| Roamers do not path: they walk with direction rules and a maximum roam length, then switch to a return path with the A*-like search | `figure/movement.c` (`roam_length`, `max_roam_length`) |

The roam rule as reported by players (experiments; **Reported**, https://caesar3.heavengames.com/cgi-bin/caeforumscgi/display.cgi?action=ct&f=2,3458,,all): roamer trips come in two modes. Patrol mode turns at corners, changes direction at random, walks gardens about half the time and never passes gatehouses; return mode skips corners, never changes direction and takes the shortest way. Measured patrol lengths 52, 43, 35 or 26 tiles by walker type; most non-school walkers reach 26 tiles; loops of 52 tiles or less should cover housing (claims of different forum users, partly disputed in the same thread). Dead ends waste a roamer's distance. A second source says random walkers do not pass gatehouses while destination walkers do (https://www.teoalida.com/games/caesar3/). A player-guide search result adds: closed loops under ~52 tiles; "forced" walkers (https://caesar3.heavengames.com/cgi-bin/caeforumscgi/display.cgi?action=st&fn=2&tn=4454) are a documented technique, so the community treats roamer rules as a design surface.

### Flow fields and distance maps

Red Blob Games describes one BFS from the goal giving a distance map and a "came from" field that all agents read; it solves all-sources-to-one-goal in one pass but cannot stop early, and weights turn it into Dijkstra (https://www.redblobgames.com/pathfinding/tower-defense/, **Confirmed**). Flow field tiles for crowds (Emerson, in Game AI Pro 360, ch. 7 per the publisher listing; text not read, **Unconfirmed content**: https://www.routledge.com/products/9780367151133) is the chunked version: per-sector cost and integration fields, cached, rebuilt only for changed sectors. Hierarchical A* (HPA*): clusters, entrances as abstract nodes, intra-cluster costs precomputed; the paper reports up to 10x faster than optimised A* with paths within 1% of optimal (https://webdocs.cs.ualberta.ca/~mmueller/ps/hpastar.pdf, via search summary, **Reported**). Cities: Skylines routes on a node/segment road graph (not a grid), precalculates routes and only recomputes when the path becomes invalid or the network changes a lot, which causes stuck vehicles instead of rerouting; stuck vehicles teleport back to origin (https://www.gamedeveloper.com/design/how-traffic-works-in-cities-skylines, **Confirmed**; the algorithm itself is not disclosed there).

### When to use what (Hamlet)

| Need | Tool | Why |
|---|---|---|
| "Which store accepts my cart?" many producers, few stores | Per-store distance field (BFS over roads, cached, invalidated by road change), then the cart reads the minimum over stores | One BFS per store serves all producers, stable under many walkers; same idea as Augustus's flood-fill grid **[local]** |
| "Nearest water/market/exit" for many walkers | Distance map from the target class (multi-source BFS: seed with all wells, markets) | Red Blob page above |
| Roamer | No path: direction rule + max length + return by distance field of home building (or A*) | Augustus roamer **[local]** |
| One-off long trip (immigrant from gate to house) | A* on road tiles with cost cap, or the gate's distance field (one field per gate, reused by every immigrant) | A* wrong when 100 walkers share the target: use the field |
| Roads on 1000x1000 | Label road components (network id); reject unreachable goals in O(1) before searching; A* only inside one component | Augustus `map/road_network.c` **[local]** |
| Open land (animals, builders off-road) | Chunked flow fields or HPA* with 16x16 or 32x32 chunks | Botea paper, Emerson chapter |
| A* is wrong when | the goal is "any of many", agents share a goal, costs are changing every tick (traffic), or the map is huge and goals are near the start with a heavy open set (use a distance cap like Augustus `max_tiles`) | judgement |
| Caching | Key a distance field by (target id, road-set version); evict least recently used; Hamlet's `fieldFrom(start, limit)` in `engine/path.ts` is already a BFS with a limit, add a version-keyed cache | local file `examples/hamlet/src/engine/path.ts` |
| Walker stuck after a map edit | On road removal, bump the version; walkers re-plan on next step if their next tile is no longer passable; a stranded walker must have a defined outcome (return home, teleport home, despawn), never hang | Akhenaten page above; Cities: Skylines teleport-to-origin |

## 4. Rendering at scale

### What Augustus does **[local]**

| Fact | Where |
|---|---|
| The view is a lookup from view-tile to grid offset; the loop walks the visible rows of the diamond: row index from camera, odd rows offset by half a tile, a margin of several tiles around the viewport so tall buildings partly off-screen still draw | `city/view.c` (`city_view_foreach_valid_map_tile_row`) |
| Draw order per frame: (1) one pass of ground "footprints" over all visible tiles; (2) a second pass by rows of three layers in one row-major sweep: tile "top" (tall parts, the building sprite drawn on its anchor tile), figures on that tile (the intrusive chain), animations; (3) overlay layer; (4) building ghost; (5) a final row sweep for "elevated" figures (bridges, ramps) | `widget/city/draw.c` |
| Footprint/top split: an isometric footprint draws the flat diamond, the "top" draws what rises above it, so painter's order by row is enough: a multi-tile building is drawn once from its anchor tile row, and figures are drawn after the top of their own tile | `graphics/image.c` (`image_draw_isometric_footprint`, `image_draw_isometric_top`) |
| Atlases: images carry an atlas id in the high bits and an x/y offset; atlas kinds: main, enemy, font, extra assets, custom (clouds), "main aux"; the software renderer keeps a different path ("unpacked extra assets") for bitmaps outside the atlas | `graphics/renderer.h`, `graphics/image.c` |
| Zoom is a percentage scale (100 default); the camera viewport in tiles is recomputed from the scale | `city/view.c` |
| Rotation: four orientations via direction tables (x/y multipliers), a lookup recomputed on rotate | `city/view.c` |
| Elevation: sprites for raised tiles are authored; at runtime the only elevation grid is the u8 height | `map/elevation.c` |

The Caesar-line approach is a full per-frame redraw of visible tiles (software draw originally); there is no baked chunk layer in the code read. Hamlet's Cité plan (GPU quads) is a different regime, so the advice below comes from other sources and judgement.

### Practices

| Topic | Advice | Basis |
|---|---|---|
| Static layer baking | Bake ground, water, cliffs per chunk (e.g. 32x32 tiles) into one mesh/texture; rebuild only dirty chunks (build/demolish/season change). Sprites such as buildings stay dynamic (they animate and change) unless static and numerous (trees: bake per chunk) | judgement; Factorio's trees as whole sprites vs chunk grid is a player-side suggestion (https://forums.factorio.com/viewtopic.php?p=382495, **Reported**) |
| Batching | Sort draw calls by atlas page then by depth if you can; one draw call per atlas per layer. Factorio batches sprites that share texture and state, 4 vertices (80 bytes) per sprite with a static index buffer for two triangles, and queues batch ranges inside one streamed vertex buffer to avoid mapping per batch (https://factorio.com/blog/post/fff-251, **Confirmed**) | |
| Logical atlases | Group sprites by what is drawn together (terrain, shadows, objects, GUI) rather than one giant atlas: large atlases hurt the GPU texture cache, mostly when zoomed out (https://direct.factorio.com/blog/post/fff-227, **Confirmed**) | |
| Zoom-out LOD | Pre-downsized textures (mipmaps) help: Factorio shipped them for trees and later terrain, at a cost in VRAM and atlas padding (same FFF-227 page). For Hamlet: at far zoom draw only baked chunk textures plus dots for people | Confirmed |
| Culling | The Augustus margin approach (visible rows + a few tiles) is enough; compute tile range from the camera corners, clamp to map, never loop over 1M tiles | `city/view.c` **[local]** |
| Painter's order | Row-major by (x+y) diagonal; draw each building once at its anchor (the tile nearest the viewer for a multi-tile footprint) and treat footprint and "top" separately, so a figure in front of a footprint but behind the roof sorts correctly. General sorting advice: sort tiles and entities with one key (x+y plus a height term), anchor depth at the ground footprint, split tall multi-cell objects into per-row slices (**Reported**, non-authoritative: https://bugnet.io/blog/how-to-fix-isometric-tilemap-sprite-depth-sort-overlap) | Augustus **[local]** is the proven option |
| Occlusion of tall objects | Cheap and standard: when the cursor/selection is behind a tall building, draw it with reduced alpha or provide a "hide tall" toggle; Augustus handles it by camera adjustment from an obstruction (`city_view_adjust_camera_from_obstruction`, `city/view.c` **[local]**) rather than see-through | |
| Animation | A frame index from time and a per-entity phase; Augustus stores per-image animation metadata in the image table and chooses the frame by a global counter and `draw_animation` pass **[local]** `widget/city/draw.c`; no per-entity buffers to redraw (matches Cité decision 2) | |
| Elevation and cliffs (2.5D) | Two proven approaches: (a) Caesar-line plateaus: tile heights in whole steps, sprites authored per slope/cliff variant, access by ramps only; (b) corner heights per tile with bilinear shading (OpenTTD-style slopes, 15 slope shapes). For Hamlet the contract's `height[t]` plus `isSlope/isCliff` fits (b) on the ground mesh. Source for (a) **[local]** `map/elevation.c`, `map/terrain.h`. OpenTTD slope shapes: not fetched, **Unconfirmed** here | |
| Water | Flat quad layer at sea level with animated UV or two-frame shore sprites; Augustus marks shallow water, marsh and beach as separate terrain flags with their own sprites **[local]** `map/terrain.h`; and boats use their own distance grid with a "drag" at map edge **[local]** `map/routing.c` | |
| Depth cost | Pharaoh's monuments can cover half of a 1024x768 screen (https://dalerank.github.io/Akhenaten/devblog/story-of-pharaoh-game.html): large sprites hurt fill rate; split a big building into chunks so culling still works |

## 5. UI and UX that make these games understandable

| Principle | How the lineage does it | Source |
|---|---|---|
| Right-click is the explainer | The original readme tells players that right-click on a building is the main source of information | https://discmaster.textfiles.com/file/23924/PC%20Gamer%20IT%20CD%2036%201-2.iso/CAESAR3/caesar3.exe/readme.doc/readme.pdf (via search summary, **Reported**) |
| Rules are discoverable from failures | Road access: a building needs one road tile touching one side to recruit or send workers; far housing means no recruits even with unemployment (https://www.caesar3augustus.com/book/engineeringtransport/roads, via search summary, **Reported**). The classic pain is that the cause is not shown: Julius/Augustus added hints (tooltips for unemployment and needed workers, fountain placement shows red when invalid, cart status in the granary window) | https://github.com/bvschaik/julius/wiki/Improvements-from-Caesar-3 **Confirmed** |
| "Why idle?" list | Augustus records a `house_demands` struct of unmet requirements per house to drive the advisor text **[local]** `building/house_evolution.c` (earlier study). Do the same per building: a short ordered list of reasons: no road, wrong network, no workers, no input, store full, no store accepts | |
| Advisors | Aggregate screens per concern with the numbers that matter (labour: needed/available/unemployed, priorities by category; ratings; trade); Augustus keeps priorities as a 1..9 list **[local]** `city/labor.c` | |
| Jump to problem | Messages with a button that goes to the relevant advisor or the place of the problem | Julius improvements page above |
| Overlays | Each overlay colours buildings by one value and filters figures shown; Augustus has an `overlay` table with `show_figure`, per-overlay draw hooks and tooltips **[local]** `widget/city/overlay/` and `draw.c` (`draw_context.overlay->show_figure`). Roamer preview: when placing a service building, the ghost shows where its roamer will walk and how often (`figure_roamer_preview_*`, `widget/city/city.c` **[local]**): this directly answers "will it cover my houses" before spending money |
| Range of influence | Players ask for it as a missing feature (https://gog.com/forum/caesar_series/range_of_influence_indicator_is_there_an_easy_way, **Reported**), so show service radius (wells, fountains cover 9x9 per a guide: https://www.teoalida.com/games/caesar3/) on placement |
| Desirability visualisation | The grid is int8 -100..100 per the earlier study; render it as a two-colour overlay (negative red, positive green) and show the building's contribution on the placement ghost | |
| Build menu | Cost and a one-line need in the tooltip; invalid placement explained in red text; a drag tool for roads that previews the real tile sprites (Akhenaten does preview with temporary tiles: RA 0.27 notes) | RA 0.27 page above |
| Housing evolution | A 20-level table (tent to luxury palace) with explicit requirements per level (https://www.teoalida.com/games/caesar3/) gives the player a ladder to climb; show "next level needs X" on the house panel | Confirmed (player guide) |
| Scenario/mission data | Akhenaten moved missions, building and overlay logic to scripts with data blocks and tests that run missions headless (`--integraltests`), and Augustus reads XML for model tables **[local]** `scenario/model_xml.c`, `empire/*_xml.c`. For Hamlet: mission = JSON (already planned), plus a headless "play the mission for N days with a scripted build list and assert the goal" test | RA 0.27 page |
| Editor | Original editors were separate tools (Pharaoh's editor shipped later as an enhancement pack, **Reported**: https://caesar3.heavengames.com/cgi-bin/caeforumscgi/display.cgi?action=st&fn=26&tn=6480). Build the map editor in-game (same view, extra tools) | |

## 6. Pitfalls the community documents

| Pitfall | Evidence | Lesson for Hamlet |
|---|---|---|
| A warehouse or granary on a different road network is invisible to a walker; gardens split networks; market traders ignore other-network storage | Official Julius list of original bugs (https://github.com/bvschaik/julius/wiki/Caesar-3-bugs, **Confirmed**) | Make network membership visible (overlay), and decide one rule: a store adjacent to two networks belongs to both |
| Market trader takes food only from granaries, not warehouses | same page | Don't hide asymmetries; list in the building info |
| Trade ships overpay/underbuy with two cities on one dock | same page | Track trade limits per (route, resource, year) not per dock |
| Original bugs preserved for save compatibility | Julius README summary above | Decide early: compatibility or correctness; Hamlet saves are versioned so fix and migrate |
| A route computed once can strand a walker after the player removes a road | Akhenaten story page | Re-validate path on edit; define the stranded outcome |
| Dead-end roads starve roamers; large loops make the return trip retrace the path; coverage depends on layout | Heavengames walker thread; Teoalida | The roamer rule is gameplay: document it in the manual and show it via a roamer preview; consider "keep going, avoid immediate reverse, prefer least-recently-visited" to reduce luck |
| Walker cap hit: warehouses and workshops stop receiving goods (a commenter's claim) | Teoalida (**Reported**, unverified) | A global cap needs a visible indicator and a graceful degradation order |
| Labour pool: "no one is living nearby" even with houses around; recruiter walks a limited distance; aging causes worker shortages 30-40 years in; unemployment above 20% triggers emigration, above 5% crime (high tax) | Teoalida, caesar3augustus.com manual summary (**Reported**) | Augustus's global labour pool option fixes the distance problem (it lists "global labour pool" as a feature); for Hamlet prefer the global pool and show a clear "unemployed/needed" number |
| Houses with an unreachable road patch stop all immigration | GOG forum (**Reported**, one post) | Check the entry-to-house path as part of the immigration rule and show why it fails |
| Savegame state drift | OpenTTD desync causes: saves not describing the complete state, state changed outside commands, caches not validated | https://sources.debian.org/src/openttd/15.1-1/docs/desync.md. Add a dev mode that recomputes every derived cache each tick and compares |
| Performance cliffs | Pharaoh lowered active objects 5,000 to 2,000 for frame rate; pottery problems above ~20,000 people (Teoalida, **Reported**); Banished's author said performance was spread across AI, rendering, animation and pathfinding and not fixable by GPU compute (comment, https://shiningrocksoftware.com/?p=1234 via search, **Reported**) | Profile per subsystem every release; keep a "worst tick" metric |
| Gridlock | Cities: Skylines vehicles do not reroute around congestion, sit idle at junctions when the path ahead is blocked, and teleport to origin when stuck | If you add vehicles with collisions, add a timeout rule early; Caesar-style carts without collision avoid this |
| Combined stacks | Augustus caps the draw stack at 20 per tile **[local]** | Cap and also cap simulation interactions per tile |

## 7. Recommendations for Hamlet, ranked (impact / effort)

Effort: S under a day, M a few days, L a week or more. Confidence: H read in source, M reported or judgement with support, L judgement only.

| # | Do | Impact | Effort | Basis | Conf. |
|---|---|---|---|---|---|
| 1 | Road network ids on a `Uint16Array`/`Uint32Array` (u8 overflows beyond 255 components on a big map; Augustus u8 is enough only for small maps), computed by flood fill, dirty-flagged on road edit; every building stores its network; unreachable = idle with a hint | High | S | `map/road_network.c` **[local]**; Julius bugs page | H |
| 2 | "Why idle" per building: ordered reason list (no road, other network, no workers, no input, no store, output blocked) shown in the info panel and the advisor; plus a "jobs/workers/unemployed" top-bar number | High | S | Julius improvements; `house_evolution.c` demands **[local]** | H |
| 3 | Distance-field cache keyed by (target set, road version) for stores, gates, wells; replace per-walker A* for shared goals; keep `fieldFrom` with a limit and add multi-source seeding | High | M | Red Blob page; Augustus flood fill **[local]** | H |
| 4 | Roamer rule in data: keep going straight, never immediate reverse, prefer least-recently-visited, max roam length per service type, return by field. Show a roamer preview on the placement ghost | High | M | Augustus `figure/movement.c`, `widget/city/city.c` **[local]**; walker thread | M |
| 5 | Chunked baked ground (32x32 tiles) with dirty-chunk rebuild; dynamic layer for buildings, people, animals; culling by camera tile range with a margin of a few tiles; frame index animation | High | M-L | Cité decision 2; Augustus view loop **[local]**; Factorio FFF-251/227 | M |
| 6 | Painter's order: draw footprints first, then rows of (top, figures, animation) as Augustus does; buildings once at an anchor tile; elevated figures (bridges/ramps) in a last pass | High | M | `widget/city/draw.c` **[local]** | H |
| 7 | Sim as slotted daily passes with a tick table; whole-map passes sliced by rows over several ticks with double buffering; far-LOD walkers updated every N ticks by id modulo | High | M | `game/tick.c` **[local]** | H (table), L (slicing) |
| 8 | Pools: entity arrays with ids, generation counters, free stack, per-type index arrays, intrusive per-tile chain; one pooled `Uint8Array` for run-length paths | Medium-High | M | `figure/figure.c`, `route.c` **[local]** | H |
| 9 | Determinism harness: per-day state hash, headless "play mission N days" test, dev mode that recomputes caches every tick and compares | Medium-High | S-M | OpenTTD desync doc | M |
| 10 | Save: versioned chunks; save entities and base grids only; rebuild road network, desirability and fields on load; checksum field | Medium | S | Augustus `file_io`; OpenTTD doc | M |
| 11 | Labour: one global pool with priority list (Augustus's `global labour pool` feature), staffing ratio scales output, no labour-seeker walker | Medium | S | Augustus README; `city/labor.c` **[local]** | H |
| 12 | Heights: u8 per tile with plateaus and ramps first (Caesar line), smooth slopes later; clean-up pass lowering lone cliff tiles; roads need ramps to enter raised ground | Medium | M | `map/elevation.c`, `map/terrain.h` **[local]**; Cité contract already stores levels | M |
| 13 | Overlays as a table `{id, value(tile), showFigure(type), tooltip}`; desirability, coverage per service, jobs, water, network id | Medium | S-M | `widget/city/overlay/` **[local]** | H |
| 14 | Data tables for buildings, recipes, house levels, missions in JSON, with a defined override order; mission test per file | Medium | S | Akhenaten scripts; Augustus XML **[local]** | M |
| 15 | HPA* or flow-field tiles for off-road animals only when profiling shows `fieldFrom` is the cost | Low now | L | Botea paper, Emerson chapter | L (not read in full) |
| 16 | Tall-object occlusion: alpha fade when a placement/selection is hidden, plus a "hide trees/tall" toggle | Low-Medium | S | judgement; Augustus camera obstruction **[local]** | L |

Things not to do yet: vehicle-style collision traffic (gridlock class of bug), hierarchical paths for roads (flow fields per store are simpler), a scripting VM (data tables first; Akhenaten went to mujs only after years of C++ rules).

## 8. What to do next in Hamlet

1. Widen the road network id to 16 bits, make it dirty-flag driven, and use it as the single reachability test (rec. 1).
2. Add the idle-reason list and the unemployed/needed counters to the building panel and top bar (rec. 2, 11).
3. Cache distance fields per store and gate, keyed by road version, and move cart and immigrant routing to them (rec. 3).
4. Rewrite roamers with the straight-ahead / no-reverse / least-recent rule and show a roamer preview on placement (rec. 4).
5. In Cité, split the view into baked ground chunks plus dynamic rows drawn in footprint-then-top order (rec. 5, 6).
6. Introduce the tick table with sliced whole-map passes and a worst-tick perf test at 256 and 512 maps (rec. 7).
7. Move entity storage to id pools with generations, per-type arrays and pooled path bytes before pushing past ~2,000 walkers (rec. 8).
8. Add the determinism harness: day-hash, mission replay test, cache-validate mode (rec. 9).
9. Version the save format and save only entities and base grids (rec. 10).
10. Treat heights as plateaus + ramps first; defer smooth slope shading until the ground chunks work (rec. 12).

## Appendix: sources not fully read or not reachable

- ModDB "Reverse engineering Caesar 3 (How to draw city)" returned 403; the height-byte fact is from a search summary.
- Game AI Pro chapter on flow field tiles and the HPA* paper were not read in full; only summaries.
- Inside GlassBox slides (https://www.andrewwillmott.com/talks/inside-glassbox) were not read; the page only lists the talk.
- Banished's pathfinding write-up was not found.
- "Thyrsus", Pharaoh/Zeus tile-height format, and Zeus rendering internals: **Unconfirmed**.
- Heavengames walker figures are player experiments from 2001-2013 on original game versions, not source reading.
