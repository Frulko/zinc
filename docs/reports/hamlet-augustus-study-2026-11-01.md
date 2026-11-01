# Hamlet: study of Augustus (Caesar III port), 2026-11-01

Read-only study of `/Users/mowmow/Lab/augustus/src` (C, GPL-3). Mechanisms only; no code, art or text is reused.
Paths below are relative to `src/`. "Hamlet" = village sim, 12x12 tiles (maybe 64x64), ~20-200 people.
Numbers are orders of magnitude read from the source; verify nothing here as exact.

## 0. Shape of the whole simulation

| Fact | Where | Take-away |
|---|---|---|
| 50 ticks/day, 16 days/month, 12 months/year | `game/time.h` | Fixed-step sim; render separately. |
| One tick runs figures; the heavy city passes are spread over the 50 ticks of a day (one pass per tick index: road network at 7, production 20 and 46, room 22, migration 23, labour 25, water 27-28, trade 32, culture 33, desirability 37-38, building state 40) | `game/tick.c` | Spread whole-map passes over ticks so no frame spikes. Hamlet: same idea, far fewer passes. |
| Entities are pooled arrays of fixed structs (buildings, figures), id 0 = none, per-type linked lists (`next_of_type`) | `building/building.c`, `figure/figure.c` | Flat typed arrays + type index; trivial to save. |
| Pure integer/fixed math, shared random table seeded per map | `core/random.c`, `map/random.c` | Deterministic: same save + same inputs = same city. Keep for replays/tests. |

For Hamlet: one `tick()` with a day counter; a "daily" and a "monthly" hook; whole-map passes (road network ids, desirability) run once per day, not per tick.

## 1. Roads, walkers, road network, access

| Mechanism | Where | Notes |
|---|---|---|
| Every building needs a road tile adjacent to it ("road access"); the check returns the road tile the building's walkers spawn from | `map/road_access.c` (`map_has_road_access*`) | Special cases: granary/warehouse (several entry tiles), big footprints. |
| Road network ids: flood-fill labels connected road tiles; a figure may only deliver/fetch inside its own network | `map/road_network.c`, `building/building.h` (`road_network_id`) | Recomputed when roads change (tick 7). Cheap and gives "unconnected = useless" feel. |
| Walker pathing: A*-like routing on a passability grid, path stored as a direction list per figure | `map/routing.c`, `map/routing_path.c`, `figure/route.c` | Paths live in a shared pool, freed when the figure dies. |
| Service walker = "roamer": leaves its building, walks road with random turns until `max_roam_length`, then returns home | `figure/movement.c` (`figure_movement_roam_ticks`, `roam_set_direction`), `figure/figure.h` (`max_roam_length`, `roam_length`) | Roams prefer to continue straight; at junctions choose by a rotating direction counter on the building (`figure_roam_direction`), so coverage spreads over time without randomness. |
| Walkers cannot enter dead-end granaries, can be blocked by roadblocks (permissions per figure type) | `figure/movement.c`, `building/roadblock.c` | Roadblock = gate that stops roamers but not carts. |
| A walker only spawns when the building is "staffed" and has no live walker of its own (one walker per building at a time, with a spawn delay) | `building/figure.c` | One-at-a-time keeps entity count tiny. |

For Hamlet: tiles on a 12x12 grid; BFS network id on roads; roamers do a bounded random walk (length ~ 20-40 tiles at 64x64, ~12 at 12x12) with a "keep going straight, prefer unvisited" rule; one walker per service building.

## 2. Labour and employment

| Mechanism | Where | Notes |
|---|---|---|
| Each building type has a fixed `laborers` count (0 for houses, roads, small decor; 5-30 for others) | `building/properties.c` (`laborers`) | Pure data table. |
| Workers available = a fixed share of population (about 45% of plebs, or ~60% working age x pleb ratio) | `city/labor.c` (`PLEB_PERCENTAGE`, `city_labor_calculate_workers`) | Children/elders implied by a percentage, no per-person modelling. |
| Needed workers summed per category (industry, food, engineering, water, prefecture, military, entertainment, health/education, religion/government) | `city/labor.c` (`CATEGORY_FOR_BUILDING_TYPE`, `calculate_workers_needed_per_category`) | 9 categories only. |
| If supply < demand, allocate by player priority 1..9, then round-robin chunks to the rest | `city/labor.c` (`allocate_workers_to_categories`) | Result per building: `num_workers` filled fraction. |
| A building with 0 workers does not produce, does not spawn walkers; partial staffing scales production | `building/building.c` (`num_workers` checks), `building/industry.c` | |
| Labour seeker: a walker from each understaffed building that "covers" houses so the building counts as connected to labour | `figuretype/service.c` (`figure_labor_seeker_action`), `building/figure.c` (`spawn_labor_seeker`) | Adds a road-reachability requirement for staffing. |
| Wages and unemployment % feed taxes and ratings | `city/labor.c`, `city/finance.c` | |

For Hamlet: skip categories; one global pool = `adults` (say 55% of people). Each building lists `jobs`. Fill in building priority order (player-reorderable list or just build order); staffing ratio = filled/jobs scales output and enables walkers. Unemployed shows in a HUD number. Skip labour seekers (use road-network connectivity as the only requirement).

## 3. Desirability, land value, housing evolution

| Mechanism | Where | Notes |
|---|---|---|
| Desirability grid (int8, -100..100): each building/terrain adds a value in rings out to a range (max 8), value stepping down every `step` tiles by `step_size` | `map/desirability.c` (`add_to_terrain`, `add_desirability_at_distance`), `map/ring.c` | Parameters per building type: base value, step, step size, range. Negative for industry/ruins/fire, positive for gardens, temples, plazas, etc. |
| House desirability = grid value at its tile + small modifiers, refreshed daily | `building/building.c` (`building_update_desirability`), tick 37-38 | |
| 20 house levels (tent, shack, hovel, casa, insula, villa, palace...) each with a model row: evolve_desirability, devolve_desirability, water, entertainment, education, religion gods, barber, bathhouse, clinic/hospital, food_types, goods (pottery/oil/furniture/wine), tax, max_people | `building/properties.c` (`houses[]`), `scenario/model_xml.c` (rows can be overridden in XML) | Table-driven. |
| Evolve check: if desirability >= evolve value AND next level's requirements are met -> upgrade; if desirability <= devolve value or current requirements lost -> downgrade after a delay (2 ticks of checks, `DEVOLVE_DELAY`) | `building/house_evolution.c` (`check_evolve_desirability`, `has_required_goods_and_services`) | Two thresholds (hysteresis) stop flicker. |
| Requirement ladder: water (none -> well -> fountain), food types (0 -> 1 -> 2...), market goods, entertainment, education, religion, health. Each failure is recorded in a `demands` struct so the UI can say "your houses lack X" | `building/house_evolution.c` (`house_demands`) | Gives the player a clear to-do. |
| Merging: 4 adjacent same-level houses merge into a bigger one with 4x capacity | `building/house_evolution.c`, `house_population.c` (`house_is_merged`) | Nice but optional. |
| Capacity from level; people arrive by migration while room exists and sentiment is good, leave when not; overcrowded houses evict | `building/house_population.c`, `city/migration.c`, `city/sentiment.c` | Migration reads city "attractiveness" (food, employment, taxes, sentiment). |

For Hamlet: 4-5 housing levels (hut, cottage, house, manor); per-level: `evolveDes`, `devolveDes`, `water` (none/well), `foodKinds`, `market`, `chapel`, `maxPeople`. Desirability grid recomputed daily: add rings with range <= 5 on a 64x64 map, <= 3 on 12x12. Keep hysteresis (devolve < evolve).

## 4. Services (coverage by walkers)

| Mechanism | Where | Notes |
|---|---|---|
| A service walker, on each step, looks at houses within 2 tiles (`map_grid_get_area(x, y, 1, 2)`) and calls a per-service callback that sets a counter on the house to a max (e.g. 96) | `figuretype/service.c`, `figure/service.c` (`provide_culture`, `figure_service_provide_coverage`) | Services are "touch" effects, not area fills. |
| Each house counter decays by 1 per tick-batch; a service is "covered" while counter > 0 | `building/house_service.c` (`house_service_decay_culture`) | Roam frequency vs decay rate = how well a service must be spread. Elegant and cheap. |
| Market: not a pure coverage; the market walker restocks houses' goods inventories from the market's stock; houses consume inventory | `figure/service.c` (`provide_market_goods`, `distribute_market_resources`), `building/market.c` | Houses hold `resources[]` (food, goods). |
| Market has a "buyer" walker fetching goods from granaries/warehouses to refill | `building/market.c`, `building/distribution.c` | See §5. |
| Well/fountain: water covers by distance via a water-supply grid, not walkers | `map/water_supply.c` | Fixed radius around well; simplest. |
| Engineers / prefects / tax collectors use `provide_service` with max-over-visited values (damage seen, happiness seen, tax multiplier) | `figure/service.c` | |

For Hamlet: services = {well (radius 2-3), market, chapel, tavern, watch}. Roamer sets `house.<svc> = 24` on houses within 2 tiles; decay 1 per day. Market walker adds food/goods to house stock. Do wells by radius, no walker.

## 5. Storage, granaries, warehouses, cart pushers, delivery

| Mechanism | Where | Notes |
|---|---|---|
| Warehouse: 8 slots x 4 units of 4 types (`FULL_WAREHOUSE` 32 per resource is the capacity unit); granary: food only, capacity 32 units | `building/warehouse.h`, `building/granary.h`, `building/storage.c` | Per-building accept/reject/get policy per resource, set by the player. |
| Producer fills a stock; when a batch (about 100 units = 1 cart load, in 4-unit increments) is ready, a cart pusher spawns carrying it | `building/industry.c` (`building_industry_update_production`), `figuretype/cartpusher.c` | Production is a progress counter; at the threshold, a cart is created. |
| Cart pusher picks a destination: workshop that needs the resource, else a warehouse/granary that accepts it, preferring close; food goes to granary; destination chosen over the road network (same id) | `figuretype/cartpusher.c` (`determine_cartpusher_destination*`), `building/distribution.c` | If none, it waits then returns and the source holds its cargo, which can stall production. |
| Reserve logic: a destination reserves the incoming load (`resource_reservations`) so two carts don't overfill | `building/storage.c`, `building/warehouse.c` | |
| Market and workshops "fetch": a warehouseman/granaryman walks from the store to the requester when the requester is short | `figuretype/cartpusher.c` (`figure_warehouseman_action`), `building/distribution.c` (`BASELINE_STOCK` 50) | Pull on top of push. |
| Cart speed depends on load (slower when loaded) | `figuretype/cartpusher.c` (`cartpusher_percentage_speed`) | |

For Hamlet: one `Store` building (barn) with per-resource capacity; producers create a visible 1-load cart per batch (load = 4-8 units); cart picks nearest accepting building reachable on the road network, else returns and production pauses. Pull walkers: only market restock from the barn. Skip reservation if only one cart per producer at a time.

## 6. Production chains (data tables)

| Mechanism | Where | Notes |
|---|---|---|
| Resource table: flags (food, inventory, storable), producing industry, `production_per_month`, default trade buy/sell price | `game/resource.c` (`resource_data[]`) | One row per resource. Wheat 160/mo, vegetables/fruit/meat 80, fish 100, clay 80 (orders of magnitude). |
| Supply chain per good: raw material -> workshop (`resource_get_supply_chain_for_good`) and which workshop makes it | `city/resource.c`, `building/industry.c` | Typical: clay -> pottery, olives -> oil, vines -> wine, iron -> weapons, timber -> furniture. 1 raw unit = 1 product at a rate. |
| Farms ramp growth over months (image = growth stage) and produce at harvest; workshops need stock of the raw good and produce when staffed | `building/industry.c` (`update_farm_image`, `building_industry_update_production`) | Efficiency = avg production / nominal, shown in UI. |
| XML-overridable data (resources, prices, buildings) | `game/resource.c`, `scenario/model_xml.c`, `empire/*_xml.c` | Data-driven mods. |

For Hamlet: a table `Recipe { building, inputs[], output, perMonth, jobs }`: Farm (none -> grain 40), Mill (grain -> flour), Bakery (flour -> bread), Woodcutter -> planks, Clay pit -> Potter. Keep chain depth <= 3. The table is Zinc data; the engine is generic.

## 7. Trade

| Mechanism | Where | Notes |
|---|---|---|
| Empire map of cities with sells/buys lists, route prices, per-route open/closed, land and sea routes, trade limits per year | `empire/city.c`, `empire/trade_route.c`, `empire/trade_prices.c` | Overkill for Hamlet. |
| Docks/gates spawn traders; a trader walks in, picks an import/export target warehouse, trades, leaves; trade problems (blocked routes) with durations | `figuretype/trader.c`, `figuretype/docker.c`, `city/trade.c`, `figure/trader.c` | `city_trade_update` = daily; "next docker import/export resource" cycles round-robin. |
| Policies: per-resource import/export on/off, stockpile limits | `city/trade_policy.c`, `building/storage.c` | |

For Hamlet: one "peddler" every N days arrives at the village gate, buys surplus above a threshold (price from a table) and sells 1-2 goods the village lacks. No routes, no map. A "trading post" building sets which goods are bought/sold.

## 8. Fire, damage, crime (cheap parts)

| Mechanism | Where | Notes |
|---|---|---|
| Per-building `fire_risk` and `damage_risk` counters; each day a pseudo-random 1/8 subset gets increments; risk > threshold -> fire (100) or collapse (200); fire-proof flag | `building/maintenance.c` (`building_maintenance_check_fire_collapse`) | Increments larger for crowded/low-level houses and industry; skipped when population < 10 (early-game mercy). Climate modifies. |
| Prefect/engineer walkers reset risk when passing (service callback) | `figure/service.c` (`prefect_coverage`, `engineer_coverage`) | Same mechanism as services. |
| Burning ruins spread fire to neighbours; prefect extinguishes | `building/maintenance.c` (`building_maintenance_update_burning_ruins`) | |
| Crime: low house happiness spawns a criminal/protester walker, counted for ratings | `figuretype/crime.c`, `city/sentiment.c` | Skip first version. |

For Hamlet: fire only: a `fireRisk` counter per building, +1..3 per day for a random 1/8, burn at 100, "watchman" roamer resets risk to 0 within 2 tiles. No collapse, no crime v1.

## 9. Save format ideas

| Idea | Where | For Hamlet |
|---|---|---|
| Binary buffers per subsystem, written in fixed order with a version number; each added field bumps the version and reads are `if (version > X)` | `game/file_io.c`, `game/save_version.h`, `core/buffer.c` | Use a versioned JSON or compact binary chunk list: `{version, tick, rng, tiles, buildings[], walkers[], stocks, labor, trade}`. |
| Whole entity pools are dumped (including free slots) | `building/building.c`, `figure/figure.c` | Dump only live entities with ids; rebuild indexes (road network, desirability, type lists) on load: they are derived. |
| Derived grids (desirability, network ids, coverage) recomputed after load | `game/file.c`, `game/tick.c` | Do not save derived data. |
| Deterministic RNG state is saved | `core/random.c` | Save seed + counter; same city continues the same way. |

## 10. Cheap rules that give most of the feel (ranked)

1. Houses need a road + service touches that decay: roaming walkers set a counter, counter decays daily. (§1, §4)
2. Two-threshold housing evolution on a desirability grid + requirement ladder (water -> food -> market -> chapel). (§3)
3. Buildings need workers from one global pool; 0 staff = silent building. (§2)
4. One cart per producer batch, visible, to the nearest accepting store on the same road network; stalls are visible. (§5)
5. Houses hold small food/goods stock; a market walker refills them; houses eat daily. (§4, §5)
6. Migration follows "room + food + jobs"; houses empty when food runs out. (§3)
7. Fire counters with a watchman walker; none below 10 people. (§8)
8. Water via wells by radius. (§4)
9. Small data tables for recipes, house levels, building footprints and jobs; all tunables in data. (§6)
10. Deterministic sim with daily passes; save only entities, recompute grids. (§0, §9)

Scale note: Caesar's 40x40-to-160x160 maps hold thousands of walkers; Hamlet's 20-200 people means at most ~30 walkers at once, so no spatial index and no path pool optimisation are needed: BFS/A* per walker on spawn is fine.

## License note

Augustus is GPL-3 (Caesar III data and art are Sierra/Impressions property and are not part of this study).
- Allowed: the ideas above, the order of magnitude of numbers, the general shape of the algorithms.
- Not allowed in Hamlet: any code (even translated), identifiers or struct layouts copied one-to-one, art/sound/text/strings, the exact `houses[]` and `resource_data[]` tables, the XML schemas, the exact savegame layout.
- Must be re-invented for Hamlet (own names, own numbers, own tuning):
  - building, resource, housing-level tables and their values;
  - the desirability ring function and its constants;
  - roamer movement rule and cart destination selection;
  - labour allocation order and the staffing-to-output curve;
  - fire-risk numbers and migration formula;
  - the save format and all UI wording and art.
- Do not copy this report's tables into the game as data; set Hamlet's numbers by playtesting.
