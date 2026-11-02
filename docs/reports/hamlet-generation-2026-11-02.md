# Hamlet generation: noise for the masses, Wave Function Collapse for local consistency, clusters for things (2026-11-02)

Owner request: a mixed generator (noise for the large masses, WFC for local tile consistency) and resources, animals and objects in clusters instead of isolated scatter. This report holds the research, the decisions and the measured result. Code: `examples/hamlet/src/gen/{wfc,cover,clusters,deposits,terrain}.ts`, `world/world.ts` (`placeLodes`, `spawnHerds`, `spawnPacks`). Test: `tests/t0/hamlet_generation.sh`.

## 1. Research

Confidence labels: **[confirmed]** read in a primary source during this session, **[recalled]** from prior knowledge of the literature, not re-read (treat as unconfirmed).

### (a) Wave Function Collapse

- **Licence of mxgmn/WaveFunctionCollapse [confirmed]**: the repository's `LICENSE` file (raw.githubusercontent.com/mxgmn/WaveFunctionCollapse/master/LICENSE) is the **MIT licence, "Copyright (c) 2016 Maxim Gumin"** (GitHub's sidebar shows no recognised licence, but the file text is plain MIT; the sample images and tiles are explicitly not covered). MIT would allow embedding with the notice. **Decision: clean reimplementation anyway** from the published algorithm description, about 200 lines in TypeScript, because the original is C# over bitmaps and Hamlet needs integer bitmask domains, chunking and the integer hash; no code was copied, so no notice is owed. Credit goes in the file header.
- **Model synthesis (Paul Merrell) [confirmed via Wikipedia, https://en.wikipedia.org/wiki/Model_synthesis]**: the 2007 i3D paper and 2009 thesis are the ancestor; Gumin's algorithm gave it the popular name; Merrell's version does **not** pick the lowest-entropy cell and argues this lowers the failure rate. It also ran in blocks ("modify in blocks" for large outputs) **[recalled]**. Used here: the block idea (chunks) and the failure-recovery view.
- **Simple tiled vs overlapping model [recalled]**: overlapping learns N x N patterns from a sample image (heavy, needs a sample); simple tiled takes a tile list, adjacency rules and weights. Hamlet has rules, not samples: **simple tiled**.
- **Backtracking vs restart [recalled]**: Gumin's reference restarts the whole run on contradiction; DeBroglie (Boris the Brave, https://www.boristhebrave.com/2018/10/06/debroglie-v0-1, **confirmed to exist**, its features beyond that page recalled) offers backtracking and non-local constraints. For a 65k-cell map a whole restart is unacceptable and full backtracking stores state per step; **a local restart** (reset a window around the contradiction, growing radius, re-propagate from its border) is the cheap middle. Boris the Brave's "WFC explained" (https://www.boristhebrave.com/2020/04 **confirmed**) frames WFC as constraint propagation with a variable-ordering heuristic, which is what justifies swapping the heuristic.
- **Chunked / infinite WFC [recalled, the specific Townscaper / Bad North / Qud writeups were not found by search; unconfirmed]**: the known technique is to solve a chunk with the already-solved neighbouring cells as fixed constraints and to guarantee that a solution always exists (e.g. every cell set keeps a glue tile compatible with everything). Implemented here, see below.
- **Speed and determinism [own analysis]**: the naive "scan for the minimum entropy" is O(n^2); bucket queues by set size make it O(n) with lazy deletion. Determinism needs: no `Math.random`, ties broken by the integer hash, weighted draws from the integer hash, a fixed iteration order. All of that is integers and `+ - *` (and one division for the draw): the same result on interpreter, AOT and QuickJS.

### (b) Clustered point processes and resources

- **Neyman-Scott / Thomas cluster process [confirmed, spatstat `rThomas` docs and the NScluster vignette via search]**: parents from a Poisson process, each with a random number of offspring scattered round it by an isotropic Gaussian kernel; only the offspring are seen; intensity = kappa x mu. This is the model of a deposit patch: parent = patch centre, offspring = deposit tiles, kernel = a smooth bowl (`falloff`).
- **Poisson-disk / blue noise [recalled]**: dart throwing with a minimum distance gives well-spaced parents; used for the patch centres (min separation, kind-specific habitat acceptance).
- **Clark-Evans index [recalled; the search found Thomas-process nearest-neighbour distance papers, arXiv:1609.08137, but not Clark & Evans 1954 itself]**: R = mean nearest-neighbour distance / (0.5 / sqrt(density)); about 1 random, below 1 clustered, 2.15 regular. Used as the test statistic (`clarkEvans` in `gen/clusters.ts`).
- **Worley / Voronoi regions [recalled]**: nearest of jittered feature points per grid cell; the region id is a stable dice. Used for one tree-species mix per grove (`MIX_CELL` = 14 tiles). Integer hash, squared distances only (no sqrt).
- **Lloyd relaxation [recalled]**: evens out Voronoi cells; not needed (dart throwing already spaces the centres), skipped.
- **Cellular automata for groves [recalled]**: smoothing by neighbour counts; the WFC cover already gives the same coherence with explicit rules, so no CA.
- **Ore veins and resource patches in games [recalled, unconfirmed details]**: Factorio places patches (a centre, a radius, richness falling off from the centre, larger and richer with distance from the start); Minecraft uses blobs/veins per height band; Dwarf Fortress uses clusters in layers; the city builders (Caesar, Anno, Settlers) put iron in mountains, clay on shores, fertile land by water. All reduce to: habitat rule for the centre, a falloff for the amount, a distance scaling. That is exactly what was built.
- **Herds [recalled]**: animals spawn in groups on habitat suitability fields with a leader; the engine already has leaders (`Deer.leader`) and a species table.

### (c) What fits a small deterministic tile engine

Only the integer hash `hash(x, y)` of `world/noise.ts`, value noise, `+ - * /`, `Math.sqrt` (exact in IEEE) and comparisons; no `sin`. Bitmask domains (tile sets up to 30 tiles). Chunks of 64 x 64. The game's `random()` (an LCG in the world state) for runtime spawning of animals, as before.

## 2. Decisions

1. **Mixed generation = noise macro + WFC cover.** The macro fields stay noise (heights, water, biome fields, mountain ranges, `heightPass`). A new **cover layer** (`gen/cover.ts`) is solved by WFC: six tile classes (open, bloom, edge, wood, scree, reed), symmetric adjacency (a dense wood never touches open ground, flowers or scree: a ring of sparse trees (edge) lies between; reeds are never beside wood). The macro fields restrict each cell's *set* (patch noise decides wood / fringe / open, the hills biome allows scree, the shore allows reeds) and weight the draw. The cover then becomes trees, rocks and flowers; **tree species come from a Worley region per grove** (pine grove, birch grove or mixed) instead of a dice per tile.
2. **`EDGE` is the glue tile and sits in every cell's set**, so a chunk seam can always be completed: this is what makes chunked solving contradiction-free. Measured: 0 repairs and 0 forced cells over every test map (24 to 256) and over 10 random stress fields including holes and 100 x 70 grids. The repair path (window reset, growing radius, redraw with another salt, last-resort `forced`) exists and is bounded.
3. **Cliff / slope / ramp pairing stays in `heightPass`.** Below `MOUNTAIN_LEVEL` the relaxation already guarantees steps of at most one level (that relaxation is the one-dimensional analogue of WFC propagation); cliffs exist only in mountain rock, where nothing walks. A WFC over heights would add cost for no new guarantee. Snow bands are a render matter of the Cité view (by height), not a tile class. Both noted as not done on purpose.
4. **Deposits: Thomas-like patches.** Per rule: habitat score (rock on hills / high ground, clay on the wet shore, berries on tiles beside trees), patch centres by dart throwing with a minimum separation (same kind further apart), the number of patches from the economy's density (mean 5 deposits per patch), tiles filled ring by ring with a falling probability; **richness** = 40 % to 120 % of the nominal amount by distance from the centre, times up to 1.6 farther from the gate; `world.lode` follows it. A `required` kind gets its first patch inside `LODE_REACH`, and the old relaxation fallback (nearest reachable tile, felling a tree if need be) still runs, so the guarantee holds. Patch tiles must pass the old `opens()` test (never wall off a part of the map) and stand below the mountain rock.
5. **Animals: herds.** Same head counts and the same `ANIMAL_CAP` thinning, split into herds of the species' `group` size (at most 6), a centre by dart throwing over a habitat score (deer on meadows beside woods, rabbits on flowery open ground, boar inside woods), at least 6 tiles between centres, members within 3 tiles with `leader` set at spawn. Wolf packs den deep in a wood (8+ trees in the 5 x 5).
6. **`genStyle`**: `GEN_SCATTER = 0` (old behaviour, byte for byte: pinned hash 426146974 measured on the previous commit and on this one) and `GEN_CLUSTERED = 1`. Presets default to clustered, **Classique** stays scatter; missions take their preset's style; saves store it as a twelfth number and a save without it loads as scatter, so old villages keep the world they had.

7. **Start guarantee (`gen/start.ts`, both styles, added on the coordinator's request after the mission bot stalled).** Within 12 tiles (Manhattan) of the gate there are at least `startNeed` flat, tree- and rock-free buildable tiles connected to the gate over bare ground of its level (60, a little more on big maps, at most 45 % of the land in range on a tiny map), a grove (10 trees, a third of the width on a tiny map) within 16, and water within 24 or 6 fertile tiles within 16. `ensureStart` runs last in `terrain()` and repairs rather than rejects: it clears trees and rocks in growing radii, then flattens a terrace (the disc goes to the gate's level, the foothill rule lowers the ground around it, mountain rock stays a wall), then plants a grove just outside the radius or makes fertile ground; it aims 60 % above the need because the deposits and the hall take tiles afterwards. The deposits respect it: no patch within 8 tiles of the gate (scaled on tiny maps), the fallback deposit of a required kind too, every deposit inside the radius is refused when it would cut the walkable ground (`cutsStart`) and the last trim removes the surplus. Clustered woods also leave the gate surroundings open (no dense wood within 4 tiles of the gate). Test: every preset x sizes 12 to 128 x 3 seeds x both styles, plus the six missions. Montagnes, 40 maps of 24 to 64: the guarantee failed **before the repair on 27/40 (scatter) and 24/40 (clustered)**, 26 and 27 of them needing the terrace; **after: 0 failures** (the test fails otherwise). The scatter style's pinned villages changed because their start was short (pin 426146974 became 1626371057).

## 3. Numbers

Hash lines change by design: every clustered preset draws different trees, rocks, deposits and animals (so `hamlet_bounds` hash changes, same on three engines); the scatter style's hash does not change (pinned).

Test `hamlet_generation` (default, `--interp`, `--engine quickjs`: identical hash line):

| Measure | scatter | clustered |
|---|---|---|
| Clark-Evans R of deposits (mean per kind and map) | 1.01 | 0.30 |
| deposits in a patch of 3 or more | 2 % | 89 % |
| animals with two herd mates within 4 tiles | 75 % | 98 % |
| patch richness, centre tiles vs rim tiles (share of nominal) | n/a | 1.53 vs 1.07 |

WFC validity: 0 adjacency violations over 6 sizes (12 to 256, chunk seams, holes), 0 forced cells, 0 repairs on real maps.

Generation time (default engine, M1 Pro, `tests/data/hamlet/gen_bench.ts`, preset Montagnes):

| Size | `generate()` scatter | `generate()` clustered | `terrain()` scatter | `terrain()` clustered |
|---|---|---|---|---|
| 64 | 58 ms | 63 ms | 28 ms | 40 ms |
| 128 | 351 ms | 345 ms | 116 ms | 160 ms |
| 256 | 903 ms | 2249 ms | 469 ms | 652 ms |
| 1024 | n/a (game max 256) | n/a | 6.9 s | 9.9 s |

The WFC alone on 1024 x 1024: 256 chunks, worst slice 158 ms, total 3.3 s (slices are independent calls: `Wfc.solveChunk`). The macro pass is not sliced, so 1024 as a whole is not under 1 s per slice; the game's maps stop at 256. At 256 the extra 1.3 s of `generate()` is the deposit patches (the reachability flood fills around dense patches); memory: no measurement tool in headless, the extra arrays are six `number[]` of n cells (about 3 MB at 256, 50 MB at 1024).

## 4. Screenshots (headless, Cité view, `docs/reports/hamlet-generation/`)

- `c1.png` / `s1.png`: seed 3, 64 x 64, Vallée, clustered / scatter, July. Clustered: pine and birch groves with clearings and a ring of sparse trees, a stone patch by the gate, a herd of deer in a meadow. Scatter: trees and rocks spread evenly, deer alone.
- `c2.png` / `s2.png`: seed 5, 128 x 128, Montagnes, clustered / scatter: scree and ore patches at the foot of the range, wood and meadow bands; scatter has a uniform field of grey rocks.
- `c3.png`: seed 9, 128 x 128, Rivière, a birch grove country, a river with sand banks, herds at the water.

Iteration done: the first mountain shot had scree everywhere (weight 3, half the tiles) which hid the deposit patches; scree weight lowered to 1.4 and probability to .32.

## 5. Engine gap found

`array.length = 0` on an array that is a class field or an indexed element (`this.changed.length = 0`, `this.buckets[k].length = 0`) fails with `internal error: invalid IR after reference counting: field access on a non-ref` (a local array works). Not fixed (this task builds no engine): `wfc.ts` assigns a new `[]` instead, with no other workaround. Needs a task: `New-task: blocks` is not claimed, it is in the final report.

## 6. Not done / later

- Heights through WFC, snow bands, forest-density macro slices for 1024 (see decision 3 and the table).
- Missions cannot choose the style yet by key (they inherit the preset's); the `style` key of the map is one line in `missions.ts` when wanted.
- The Menu preview and the minimap read the same layers: no change was needed.
