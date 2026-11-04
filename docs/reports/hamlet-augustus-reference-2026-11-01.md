# Hamlet: Augustus reference sheet (concrete mechanics and numbers), 2026-11-01

Read-only research. Source: github.com/Keriew/augustus (shallow clone of the default branch, C). Paths are relative to `src/`.
Companion of `docs/reports/hamlet-augustus-study-2026-11-01.md` (the qualitative study: orders of magnitude, ranking of cheap rules). This sheet adds the **exact numbers** read from the code. Everything marked "(est.)" is derived by me, not stated in the source.

**Licence.** Augustus is GPL-3. The study's rule stands: ideas and orders of magnitude only; Hamlet's tables are its own numbers, tuned by play (`AGENTS.md`, roadmap section 2.2). Use the numbers below as a calibration reference (ratios, ladders, time scales), never paste tables, names or structure.

**What Hamlet already has** (`examples/hamlet/ECONOMY.md`, `assets/economy.json`, `src/rules`, `src/engine`): housing levels (2 levels above the base: capacity 2/4/6, needs `market`, `water`, foods 1/2, appeal 2) with `evolveDays 2` / `devolveDays 4` / `margin 1`; service counters (`COVER_DAYS 3`, walker `range` in road steps, well `radius 4`); appeal rings per building and terrain (`limit 8`); labour with player priority (`workers: 2` for almost everything); gather/process buildings with `seconds` per cycle; storehouse `stockCap 40`; peddler (`everyDays 5`); goals and adventures; one day = `DAY_SECONDS 20`.
**What it lacks** (so the most useful sections below): ratings and settler arrival driven by satisfaction (section 6), risks (fire, collapse, crime; section 7), efficiency by staffing, percentage production (section 5), per-house goods stock, animal AI beyond the deer (section 8).

## 0. Time base (`game/time.h`, `game/tick.c`)

| Fact | Value |
|---|---|
| Ticks per day / days per month / months per year | 50 / 16 / 12 (a year = 9600 ticks) |
| Heavy passes spread over the 50 ticks of a day | tick 7 road network, 12 labour-cover decay, 16-17 stocks, 20 and 46 production, 22 room, 23 migration, 24 evict, 25 labour, 27-28 water, 31 figure spawn, 33 culture coverage, 35 service decay, 37 desirability grid, 38 building desirability, 39 housing evolve + goods use, 40 building state, 44 fire/collapse, 45 crime |
| Monthly | food consumption, finance, culture/favour ratings (`city_ratings_update(0,1)`) |
| Yearly | prosperity and peace ratings, population update |
| Figure speed | a tile takes about 15-16 ticks (`progress_on_tile` runs to 15) so a walker crosses ~3 tiles per game day (est.) |

Hamlet map: 1 Augustus day = 1 Hamlet day (20 s). Monthly things become "every 8 days" (one season-sized step) or are dropped; yearly things become "every 32 days" or at season change (`rules/season.ts`).

## 1. Housing levels

### 1.1 The ladder (`building/properties.c`, `house_model_data`, 20 levels)

Per level: `devolve_desirability` / `evolve_desirability` (D-), water (1 well, 2 latrine or fountain, 3 fountain), entertainment points, religion (gods), education, barber, bathhouse, health, food types, goods (pottery, oil, furniture, wine), `max_people` (per tile up to medium insula, per house after), tax multiplier, prosperity points.

| # | Level | D- (devolve) | D+ (evolve) | Water | Ent. | Relig. | Educ. | Food types | Goods | max_people | Taxx | Prosp. |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 | small tent | -101 | -10 | 0 | 0 | 0 | 0 | 0 | | 5 | 1 | 5 |
| 1 | large tent | -12 | -5 | well | 0 | 0 | 0 | 0 | | 7 | 1 | 10 |
| 2 | small shack | -7 | 0 | well | 0 | 0 | 0 | 1 | | 9 | 1 | 15 |
| 3 | large shack | -2 | 4 | well | 0 | 1 | 0 | 1 | | 11 | 1 | 20 |
| 4 | small hovel | 2 | 8 | 2 | 0 | 1 | 0 | 1 | | 13 | 2 | 25 |
| 5 | large hovel | 6 | 12 | 2 | 10 | 1 | 0 | 1 | | 15 | 2 | 30 |
| 6 | small casa | 10 | 16 | 2 | 10 | 1 | 1 | 1 | | 17 | 2 | 35 |
| 7 | large casa | 14 | 20 | 3 | 10 | 1 | 1 | 1 | pottery 1, bathhouse | 19 | 2 | 45 |
| 8 | small insula | 18 | 25 | 3 | 25 | 1 | 1 | 1 | pottery, bathhouse | 19 | 3 | 50 |
| 9 | medium insula | 22 | 32 | 3 | 25 | 1 | 1 | 1 | + furniture, health 1 | 20 | 3 | 58 |
| 10 | large insula | 29 | 40 | 3 | 25 | 1 | 2 | 1 | + oil, barber | 84 | 3 | 65 |
| 11 | grand insula | 37 | 48 | 3 | 35 | 1 | 2 | 2 | same | 84 | 4 | 80 |
| 12 | small villa | 45 | 53 | 3 | 35 | 2 | 2 | 2 | + wine 1 | 40 | 9 | 150 |
| 13-19 | medium villa .. luxury palace | 50..85 | 58..100 | 3 | 40..80 | 2..4 | 2..3 | 2..3 | all + wine 2 late | 42..200 | 10..16 | 180..1750 |

Observations that matter for a village:
- The gap between devolve and evolve thresholds is 6 to 12 desirability points (6 early, 8 mid, 11-15 late): this is the **hysteresis band**; a house in the band stays as it is.
- Requirements arrive one at a time and in this order: well, food (1 kind), religion/chapel, better water, entertainment, school, bathhouse + pottery, health + furniture, oil + barber. Each new level adds exactly one or two new needs. Hamlet's 3 levels fit tents..shacks (well, market food) and hovel..casa (chapel/tavern, second food).
- Food kinds count as "types in stock" in the house (`house->resources[food] > 0`), not as eaten.

### 1.2 Evolution rules (`building/house_evolution.c`)

| Rule | Value |
|---|---|
| Check frequency | once per day (tick 39), all houses, by type order |
| Evolve | next level's requirements met **and** `desirability >= evolve_desirability` of the *current* level: upgrade on the first successful check, no delay |
| Devolve | current level's requirements lost **or** `desirability <= devolve_desirability`: `DEVOLVE_DELAY = 2`: the counter must reach 2 before the drop, so the **third consecutive failing daily check** downgrades; any non-failing check resets the counter |
| Single step | one level up or down per check |
| Merge | at level 1 and above, 4 adjacent same-level 1x1 houses merge into one 2x2 with `max_people * 4` (`building_house_merge`; optional config "pre-merge vacant lots") |
| Cause text | every failed requirement increments a counter in a `demands` struct (missing well, food, entertainment, ...) so the UI says "your houses lack X" (`city/houses.c`) |
| No road | after more than 4 daily checks with no road within 2 tiles, the house is removed and its people become homeless (`building_maintenance_check_rome_access`) |
| Consumption | goods are used on day 0 of each 16-day month (amount = the level's pottery/oil/furniture/wine value); 1x1 houses consume once, bigger ones twice (days 0 and 7) |

**Map to Hamlet.** Already close (evolve 2 days, devolve 4 days, margin). Take: (a) devolve counts only consecutive failures and resets on any pass (`engine/housing.ts` already does through `streak`); (b) evolve gate uses the **current** level's evolve threshold in a separate hysteresis band: Hamlet has `appeal` per level plus `margin` which is the same idea, keep; (c) add "demands" counters per category and show them in the hints panel ("3 houses lack water"): `rules/hints.ts` can aggregate `housingReport(b).missing` by id. (d) Add a "no road for N days = residents leave" rule if a road is cut. (e) Merge is optional, skip unless houses should visually grow (a 2x2 manor level is the natural place).

### 1.3 Capacity and people

| Fact | Value | File |
|---|---|---|
| Room | `max_people - house_population`; houses without road connection to the entry have `room = -pop` (evicted at tick 24) | `building/house_population.c` |
| Overcrowded on devolve | extra people evicted (become homeless walkers) | same |
| Level capacity scales | 5, 7, 9 ... 20 per tile (x4 merged); 1 level ~ +2 people for tents..casa | table above |

Hamlet capacity 2/4/6 matches a ratio of ~1 person per 1.0 to 1.5 "levels", consistent.

## 2. Desirability

### 2.1 Computation (`map/desirability.c`)

- Grid of int8 clamped to [-100, 100], rebuilt from scratch once a day (tick 37), then each house reads the **max over its tiles** (`map_desirability_get_max`).
- Each building contributes `desirability_value`, `step`, `step_size`, `range` (max range 8, `add_to_terrain`): at distance 1..range around the building the tile receives the current value; after every `step` rings the value changes by `step_size`. So `value -6, step 1, size 1, range 4` gives rings -6, -5, -4, -3 (not cumulative within a ring, rings simply add up between sources). `step_size` negative on positive sources decays them: `value 4, step 1, size -1, range 4` gives 4, 3, 2, 1.
- Terrain sources: garden +3 (step 1, -1, range 3), rubble -2 (1,1,2), marsh -3 (1,1,3), beach +1 (range 2), aqueduct -2 (1,1,2), plaza +4 (range 2, size -2).
- Houses are sources too: tents -3 (range 3: -3, -2, -1), high houses positive. A house does not add its own tile.

### 2.2 Per-building values (`building/properties.c`, `building_model_data`: value / step / size / range)

| Building | Value | Step | Size | Range | Effect over tiles at distance 1..range |
|---|---|---|---|---|---|
| well | -1 | 1 | 2 | 1 | -1 on neighbours |
| market | -2 | 1 | 1 | 6 | -2, -1, 0.. (0 from distance 3 on) |
| granary | -4 | 1 | 2 | 2 | -4, -2 |
| warehouse | -5 | 2 | 2 | 3 | -5, -5, -3 |
| wheat/vegetable/pig farm | -2 | 1 | 1 | 2 | -2, -1 |
| fruit/olive/vine farm | +2 | 1 | 1 | 2 | +2, +3 (rings grow, see quirk below) |
| timber yard | -4 | 1 | 1 | 3 | -4, -3, -2 |
| clay pit | -3 | 1 | 1 | 2 | -3, -2 |
| iron mine, marble quarry | -6 | 1 | 1 | 4 | -6, -5, -4, -3 |
| workshops (oil -4 r2, wine -1 r1, pottery/furniture) | -1..-4 | 1 | 1 | 1-3 | |
| school | -2 | 1 | 1 | 2 | |
| library / academy | +4 | 1 | -1 | 4 | 4, 3, 2, 1 |
| small temple | +4 | 2 | -1 | 6 | 4, 4, 3, 3, 2, 2 |
| large temple | +14 | 2 | -2 | 5 | 14, 14, 12, 12, 10 |
| theater | +2 | 1 | -1 | 2 | 2, 1 |
| amphitheater | +4 | 1 | -1 | 4 | 4, 3, 2, 1 |
| bathhouse | +4 | 1 | -1 | 4 | |
| barber | +2 | 1 | -1 | 2 | |
| hospital | -2 | 1 | 1 | 2 | |
| prefecture | -2 | 1 | 1 | 2 | |
| gardens | +3 | 1 | -1 | 3 | 3, 2, 1 |
| small / medium / large statue | +3 r3 / +10 r4 / +14 r5 | | | | |
| governor house/villa/palace | +12 r3 / +20 r4 / +28 r5 | 2 | -2..-4 | | |
| fort | -20 | 2 | 2 | 8 | -20, -20, -18, -18, ... |
| burning ruin | -1 | 1 | 1 | 2 | |

Quirk: `step_size` is **added** to the value each step; positive sources that use `-1` decay, negative sources that use `+1` decay toward 0. A positive source with positive step_size (fruit farm +2/+1) grows by ring: probably a data artefact; do not copy.

### 2.3 How desirability is read

- Evolve/devolve thresholds per level (table 1.1): -10 .. 100 range, top levels need 80-100 (only reachable with several large temples/statues/gardens close).
- Also feeds sentiment: `extra_desirability_bonus = clamp((desirability - 50) / 2, 0, max)` (`city/sentiment.c`).
- Animals avoid tiles with desirability != 0 near their path (herd free-tile test, section 8).

**Map to Hamlet.** Hamlet uses rings of small integers (`appeal`, limit 8) and terrain kinds (tree +1 at distance 1, water +2/+1). That is the same model. Values are 5x to 10x smaller than Caesar's; a ratio check: Caesar's smallest house threshold gap is 6, Hamlet's level gaps are 2: fine. Worth adding: **gardens/plaza/statue-like decor** (cheap +3 range 3) as the sink for stone/plank and as the only way to reach top levels; **farms negative (-2 r2), mine/quarry/timber -3..-6**, matching what `economy.json` already does for sawmill/smokehouse. Keep the daily rebuild (done in `stepDay`: `computeAppeal` first).

## 3. Labour

### 3.1 Model (`city/labor.c`, `building/properties.c` laborers column)

| Item | Value |
|---|---|
| Working people | `workers_available` = 45% of plebs (`PLEB_PERCENTAGE 45`, with the "fixed workers" setting) or 60% of working-age people x pleb share (default). Patricians (villa and up) are not workers |
| Jobs per building | fixed `laborers`: farms 10, workshops 10, mines/quarries/timber/clay 10, market 5, granary 6, warehouse 6, well 0, fountain 4, theater 8, amphitheater 12, school 10, library 20, academy 30, temple small 2 / large 5, doctor 5, hospital 30, bathhouse 10, barber 2, prefecture 6, engineer post 5, senate 30, dock 12, wharf 6 |
| Categories | 9: industry+commerce, food, engineering, water, prefectures, military, entertainment, health/education, religion/government |
| Allocation | if jobs <= workers every category is full. Else: by player priority 1..9 first (each category gets min(needed, left)), then the unprioritised categories in a default round-robin chunk order (engineering 3, water 1, prefectures 3, military 2, food 4, industry 2, entertainment 1, health/education 1, religion 1) |
| Inside a category | each building's share = category allocation x (its `houses_covered` / total houses covered of the category), capped at its laborers; leftover filled in id order |
| A labour seeker is needed | a building gets workers only if `houses_covered > 0` (a walker from the building must have passed houses): `generate_labor_seeker` if `houses_covered <= min_houses` (default 100 for engineers, 50 for entertainment, 0 elsewhere); `houses_covered` += houses served per step (cap 300), decays 1 per day (tick 12). Config "global labour" replaces the walker by "can reach the entry" |
| Staffing -> behaviour | `num_workers == 0`: no production, no walker. Walker spawn delay shrinks with staffing: >=100% 3 days, >=75% 7, >=50% 15, >=25% 29, >=1% 44 (`default_spawn_delay`, `building/figure.c`); engineers/prefects 0/1/3/7/15 |
| Production | proportional to `num_workers` (section 5): efficiency = staffing share |
| Unemployment | `unemployment_percentage` from workers_available vs needed; affects sentiment and prosperity |
| Wages | `wages` starts at 30 (denarii/10 per worker-month index); paid monthly `wages * employed / 10 / 12`; Rome's reference wage `wages_rome` 30 changes by 1-4 after at least 12 months |
| Wage sentiment | `diff * 2` if above Rome, `diff * 3` if below (`city/sentiment.c`); unemployment above 5% subtracts `(unemployment - 5)` |
| Strikes | industry buildings can strike for 48 days; ends early if sentiment > 50 (-3 days per day) or > 65 (at once) (`building/industry.c`) |

**Map to Hamlet.** `rules/labour.ts` already has a priority permutation and fixed `workers` per building. Add:
1. **Linear efficiency**: `output rate = staffed / workers`, not on/off (Hamlet is on/off if staffed at all: confirm). With `workers: 2`, a half-staffed site (1/2) runs at half speed, and the half-speed is visible (hints: "50% staffed").
2. **Spawn delay by staffing** for service walkers: a market at 100% staffing starts a new round after 3 days (3 Hamlet days is a good number because `COVER_DAYS = 3`), at 50% after 15.
3. **Employed share**: a fixed adult share (45% to 60%) of residents is a good start, rather than "idle residents". If Hamlet keeps "idle residents are workers" then unemployment = idle residents with no place; fine, expose the % in the HUD.
4. **Wages / strikes: skip.** A coin sink is optional: tavern coin output already exists. If a wage is wanted later: 1 coin per employed per 8 days.

## 4. Walker / roaming service model

### 4.1 Rules (`figure/service.c`, `figuretype/service.c`, `figure/movement.c`, `building/figure.c`)

| Item | Value |
|---|---|
| One walker per service building at a time | spawns only when none alive and the building is staffed; delay per staffing (3.1) |
| Where it spawns | road tile adjacent to the building (`map_has_road_access`) |
| Roam length | `max_roam_length` counted in ticks (every action call): 384 for market, temples, theater, school, bathhouse, barber, library, doctor; 512 for tax collector, actor, gladiator, lion tamer; 640 for engineer, prefect, watchman; 192 missionary; 1024 charioteer. At ~15 ticks per tile that is ~25 tiles for a market, ~34 for tax/actors, ~42 for engineers (est.), about 8 to 13 game days of walking |
| End of roam | goes back to a road within 2 tiles of the building and dies on arrival; if there is no road near the building, dies at once |
| Route | on every tile boundary, picks among adjacent road tiles: never straight back (`came_from_direction`); with exactly 2 options keeps its direction; at junctions takes a pseudo-random direction (`roam_random_counter + map_random_get`) but only turns when blocked (`roam_ticks_until_next_turn` counter 100); dead end: reverses; on a 2-wide road goes straight |
| Coverage footprint | on **every** tile boundary the walker looks at the 5x5 area centred on it (`map_grid_get_area(x, y, 1, 2)`, radius 2) and applies the service callback to every house in it (house with population > 0) |
| Service effect | sets a per-house counter to `MAX_COVERAGE = 96` (theater, school, library, academy, barber, clinic, bathhouse, hospital, temples, tavern, amphitheater, ...) |
| Decay | all counters -1 per **day** (tick 35, `house_service_decay_culture`): a visit keeps a house served for 96 days (6 months), so a service building only has to reach each house twice a year; tax collector coverage 50, refreshed on each pass, decays -1/day (tick 48) |
| Aggregation | `house_service_calculate_culture_aggregates` (tick 36) turns counters into entertainment points (theater 10, tavern wine 10 + food 5, amphitheater 10/15, arena 10/20, colosseum 15/25, hippodrome 30 and +5 each for a finished colosseum/hippodrome), education 0-3 (school or library 1; both 2; + academy 3), gods count, health count |
| Fire/crime walkers | same callbacks: prefect resets `fire_risk`, engineer resets `damage_risk` of every building in the 5x5 area |
| Water | no walker: well radius 2 (`WELL_RADIUS`), fountain by reservoir network (`map/water_supply.c`) marks `has_well_access` on houses within the square |
| Market | walker sets a **goods stock** in the houses (see 5.3) and also counts as coverage |

**Map to Hamlet.** `engine/services.ts` already does: counter per service, `coverAround` the 4 neighbours of each road tile, `roamFrom(range)` random walk without turning back, decay -1 per day (`COVER_DAYS = 3`). Calibration notes:
- Augustus keeps the ratio **cover days : round time ~ 12 to 1** (96 days vs ~8 days per round) so one visit is comfortably enough; Hamlet has 3 days vs `range 18` steps (~8 s at ROAD_SPEED?) which is ~0.5 day per round: ratio 6:1. Fine, but if rounds get longer (map 48x48) raise `COVER_DAYS` with the range: rule of thumb `COVER_DAYS = 6 x round days`.
- Use the **5x5** footprint (radius 2) instead of the 4 neighbours of the tile: houses two tiles from the road are still served (a market costs fewer roads); it is also what makes Caesar road layouts feel forgiving. This is one constant in `coverAround`.
- Add spawn delay by staffing (3 days at 100%) and "one walker per building".

## 5. Gathering, production, storage, delivery

### 5.1 Production model (`building/industry.c`, `game/resource.c`)

Everything is one **progress counter** per building, advanced twice a day (ticks 20 and 46) by `num_workers` (a workshop with 10 workers adds 10 per call, 20 per day):

```
max_progress = 100 * (16 days * 2 calls * laborers) / production_per_month      (calc_percentage, integer)
progress    += num_workers                                  (twice a day; x2 during a Ceres blessing for farms)
when progress >= max_progress: one load of 100 units appears, progress = 0
```
So a fully staffed building makes exactly `production_per_month / 100` loads a month, a half-staffed one half of it: **efficiency = staffing**, linear. `production_per_month` per resource (`game/resource.c`, in units; 1 load = `RESOURCE_ONE_LOAD` 100 units):

| Resource | Units / month at full staff | Days per 100-unit load | Units per worker-day (10 workers) | Raw -> good ratio | Trade price buy / sell (default) |
|---|---|---|---|---|---|
| wheat | 160 | 10 | 1.0 | | 28 / 22 |
| vegetables, fruit, meat, olives, vines | 80 | 20 | 0.5 | | 38-44 / 30-36 |
| fish | 100 | 16 | 0.63 | | 44 / 36 |
| clay, timber, iron | 80 | 20 | 0.5 | | 40-60 / 30-40 |
| stone | 80 | 20 | 0.5 | | 40 / 30 |
| sand | 120 | 13 | 0.75 | | 30 / 24 |
| marble | 40 | 40 | 0.25 | | 200 / 140 |
| pottery, furniture, oil, wine, weapons | 40 | 40 | 0.25 | 100 raw -> 100 good (`SUPPLY_CHAIN`, 1:1) | 180-250 / 140-180 |
| concrete | 120 | 13 | | 50 sand | |
| bricks | 60 | 27 | | 50 sand + 50 clay | 200 / 150 |
| denarii (mint) | 200 | | | 20 gold per coin batch | |

Rules:
- A workshop starts a new cycle only if the whole raw amount (100 per good) is in its stock (`building_industry_has_raw_materials_for_production`); it takes the raw material at the **start** of the cycle, not at the end.
- Raw producers that make **non-storable** output (food, not flagged storable) and are at progress 0 do not start a new load unless some destination accepting it with room exists (`building_has_workshop_for_raw_material_with_room`, granary space): this is the "wait" that keeps farms from piling carts.
- Efficiency shown to the player: `102 * avg_production_per_month / expected`, clamped 0-100 (`building_get_efficiency`, `calc_percentage_efficiency`), a 12-month sliding average (`RECORD_PRODUCTION_MONTHS 12`).
- Farm image tracks growth `progress / max_progress` (the growth stages are the visual of the counter).
- Raw material storage in a workshop: `MAX_STORAGE 16` loads; the workshop requests delivery by the cart destination rule below.
- Strikes, curses, blessings and random events (iron mine collapse, clay pit flood) multiply or stop the counter.

### 5.2 Carts, destinations and "wait" (`figuretype/cartpusher.c`, `building/storage.c`, `building/warehouse.c`, `building/granary.c`)

| Item | Value |
|---|---|
| Spawn | when `progress >= max`, one cart pusher carrying one load (100 units) spawns from the building and walks; at most one live cart per building |
| Initial wait | `wait_ticks > 30` at the producer before it picks a destination (0.6 day) |
| Destination priority | 1. a warehouse if the resource is stockpiled; 2. a workshop that needs it and has room (`building_get_workshop_for_raw_material_with_room`, same road network); 3. a granary for food; 4. warehouse with room; 5. fallback; the nearest accepting building wins (distance on the road network) |
| Reservations | the destination reserves the incoming load (`resource_reservations`) so two carts cannot overfill it |
| Same road network | the producer's `road_network_id` must contain the destination (network ids recomputed at tick 7) |
| Waiting | no destination: state "waiting for destination" `NON_STORABLE_RESOURCE_CARTPUSHER_MAX_WAIT_TICKS 300` (6 days); every 30 ticks it retries; after 300 ticks the cart dies and the load is lost (non-storable: food, workshop goods) |
| Reroute | walking to a destination that disappears or fills: after `FIGURE_REROUTE_DESTINATION_TICKS 120` returns to initial state and picks again |
| Unloading | `wait_ticks > 10` at the door, then the amount is added (`building_warehouse_add_resource`) or the cart reroutes if full |
| Storage sizes | warehouse 8 spaces x 4 loads of **one** resource per space = 32 loads of 100 units; granary 32 loads, food only; per-resource policy: accept, reject, "get" (pull) and stock-pile |
| Pull | market buyer and warehouse/granary "getter" walkers fetch from stores to the requester when `BASELINE_STOCK 50` or the market is short (`building/distribution.c`) |
| Speed | carts walk at the normal figure speed; slower when loaded in some builds (`cartpusher_percentage_speed` is a bonus hook, 0 by default) |

### 5.3 Market and house stocks (`figure/service.c`, `building/market.c`)

- A house holds its own inventory (`house->resources[]`): food kinds, pottery, oil, furniture, wine.
- When the market walker passes a house within 5x5: **food**: tops up **one** food kind per visit to `max_food_stocks = 4 * house_highest_population` units; **goods**: tops up to `8 * model->good` units (`12` with a Venus bonus), only goods the market accepts.
- Houses eat **monthly**: `pop * 50 / 100` units split across the food kinds they hold (`house_consume_food`): 100 people eat 50 units a month, so one wheat farm (160 units) feeds ~320 people (est.); a house with stock of 4x its population units lasts 8 months.
- A missing food type does not starve: houses without any food stock still stay (tents scavenge), they simply do not evolve and sentiment drops through the food bonus: `extra_food_bonus = (types - required) * 12` up to +24.

**Map to Hamlet.**
- Production: replace `seconds` per cycle by a **progress counter x staffing**, i.e. `rate = staffed/workers`, so a half-staffed workshop is visibly slower and there is a graded reward for labour priority. Hamlet's `seconds` stay as the full-staff cycle time. Example calibration: Augustus workshop = 40 units/month/10 workers: a 100-unit batch takes 2.5 months with 10 workers. Hamlet's sawmill takes 6 s for 1 plank with 2 workers: 0.17 plank/s: reasonable for a village at 20 s per day.
- Yield per worker-day: keep Hamlet's ratios between raw (0.5 to 1) and processed (0.25) units per worker-day: **processing is 2 to 4x slower per worker than extraction**, so chains need more workers on the late stage; `economy.json` has `seconds` 2.6-4.5 for gatherers (output 1-2) vs 6-12 for processors: same shape.
- Carts: Hamlet's porters (`engine/transport.ts`) already deliver; port the rules `reserve at destination`, `one live cart per producer`, `wait 6 days then drop only non-storable`, `retry every 0.6 day`, `same road network`. Storehouse `stockCap 40` vs 32 loads x 100 units: Hamlet counts units, not loads: keep it.
- "Wait" visible state: a producer with a full output and no destination should show a "waiting" glyph (`hints.ts`: "storehouse full or not connected").
- Market buying food into houses: Hamlet buys 1 unit per 2 people for 3 days per kind: same as Augustus' monthly 50%, scaled. The "4 x population stock" cap is the missing piece: it makes a market round fill a house for a long time and lets a house survive a supply break of several days (resilience). Suggest `FOOD_DAYS = 3` -> keep, but allow stock units `<= 2 x residents` and eat daily.

## 6. Immigration, sentiment and ratings

### 6.1 Sentiment (`city/sentiment.c`, `game/difficulty.c`) - daily, tick 36 range

Per house with people (house happiness 0..100, moves by at most **+/-2 per day** toward its target):

```
target = base(difficulty)                     very easy 80 / easy 75 / normal 70 / hard 65 / very hard 60
       + tax effect (rate vs base rate)       (not used by Hamlet)
       + wages effect (below Rome x3, above x2) - max(0, unemployment% - 5)       [only levels up to grand insula]
       + squalor: (level - city average level) x multiplier, negative only, multiplier 3 for tents, 2 shacks.., 1 casa, 0 villas
       + desirability bonus  clamp((desirability - 50) / 2, 0, max)
       + entertainment bonus clamp((points - required) * 1, 0, 24)
       + food bonus          clamp((kinds - required) * 12, 0, 24)   (none for tents)
       + games / festivals bonus (decays x0.84 monthly)
```
(Base values: column `sentiment` of `game/difficulty.c`, see Caveats.)
City sentiment = population-weighted mean of house happiness, clamped 0-100. "Squalor" uses the **average housing level** (a minimum of `population / 625` clamped to small tent..small insula) so a village of tents is not punished against itself.

### 6.2 Migration (`city/migration.c`, `building/house_population.c`)

| City sentiment | Migration percentage |
|---|---|
| > 70 | +100 |
| > 60 | +75 |
| 50 to 60 | +50 |
| > 40 | 0 |
| > 30 | -10 |
| > 20 | -25 |
| <= 20 | -50 |

- Each daily update (tick 23): immigration batch = `12 people * migration% * adjust`; the batch lasts 2 days (`immigration_duration`) and blocks emigration meanwhile, and the reverse.
- Batches below 4 people are queued until 4 (`create_migrants`); immigrants walk in from the map entry in **groups of up to 4** to houses with `room >= 8` first, then any house with room > 0 (`house_population_create_immigrants`), only to houses connected to the entry.
- Emigration only when population > 100; batch `12 * |pct|`; refused immigrants and the cause (no food, no jobs, high taxes, low wages, many tents, squalor, low mood) are recorded: `city_migration_determine_no_immigration_cause` gives the single message the HUD shows.
- Stops at the scenario population cap and while 3+ enemies are in the city.

### 6.3 Ratings (`city/ratings.c`, `scenario/criteria.c`, `city/victory.c`)

| Rating | Update | Rule |
|---|---|---|
| Culture 0-100 | monthly | coverage thresholds (30/50/70/85/100%) -> points: theatre 3/8/12/18/25, religion 3/9/14/22/30, school 1/4/6/10 (15 at 100%), academy 1/2/4/7/10, library 2/4/8/14/20; +6 per finished monument |
| Prosperity 0-100 | yearly, `change` added to the old value, capped by `prosperity_max` = mean of the houses' `prosperity` points (table 1.1) | +5 profit (-1 loss), +1 unemployment < 5% (-1 if >= 15%), +1 two or more food kinds eaten, wages +1/-1, -1 if > 30% of people in tents/shacks, +1 if > 10% in villas/palaces, -1 tribute not paid, +1 hippodrome shows |
| Peace 0-100 | yearly | +2 (first 2 years) then +5; -1 criminals, -5 rioters, -n destroyed buildings (cap 12); resets the "years of peace" counter |
| Favour 0-100 | monthly/yearly | -2 per year, salary and tribute penalties, + gifts and festivals |
| Win | monthly | all enabled criteria met (culture, prosperity, peace, favour, population thresholds), optional "survive N years" and time limit; after victory the player may continue N months (`city_victory_update_months_to_govern`) |

**Map to Hamlet.**
- **One city mood number (0-100)** is the missing piece. Use a **Hamlet sentiment** = mean house happiness with: base 60-70, + food variety bonus (+12 per extra kind over what the level asks, cap 24), + appeal bonus `(appeal - 3) * ...`, - unemployment above 5%, - squalor (level below the village average). House happiness moves by +/-2 per day (hysteresis that avoids flicker).
- **Settler arrival** (`SETTLER_INTERVAL`, `housing.free`) then follows the table: mood > 70 -> a group of up to 4 every day, > 60 -> 75%, 50-60 -> 50%, 40-50 -> none, below -> people leave. Settlers go to the house with **most room first (>= 4 free)**, capped by room: what Hamlet does now, plus the mood gate and the "why nobody comes" message (no room, no food, no jobs, low mood).
- **Prosperity-like rating** as the goal metric for campaigns: yearly (every 32 days or per season) delta from the checklist above, capped by the mean level points of houses: a village of huts cannot exceed ~15, a village of manors ~40: nice use for `goals.ts` (`{ rating: 'prosperity', value: 40 }`).
- Culture rating: a chapel/tavern/festival coverage percentage with the 30/50/70/85/100 steps; small and readable. Peace/favour: skip (no empire), unless raids are added: peace maps to "safety" with watch and crime (section 7).
- Win/lose: `goals.ts` already has population and house-level goals; add `rating` and `survive N days`.

## 7. Risks: fire, collapse, crime

### 7.1 Fire and collapse (`building/maintenance.c`, run at tick 44 every day)

```
global slot g = random 0..7 (one per day)                                         population < 10: skip everything
for each building (not fire-proof, not ruin):
    its slot s = (id + terrain random of its tile) & 7                           fixed per building
    damage_risk += 3 if s == g else 1                                            every day
    house of level <= large tent: damage_risk = 0
    damage_risk > 200  -> collapse
    if s == g: fire_risk += by kind:
        non-house building            +5
        house without people          0
        house level <= large shack    +10
        house level <= grand insula   +5
        richer houses                 +2
        (northern climate 0, desert +3)
    fire_risk > 100 -> fire (burning ruin)
```
- Mean accumulation: `damage` about 1.25 per day -> collapse after **~160 days (10 months)** with no engineer; `fire` +10 on 1/8 of days = 1.25 per day for poor houses -> fire after **~80 days**; 0.625 per day for most houses and non-houses -> **~160 days**; all slots hit on the same day for 1/8 of the buildings so it comes in waves.
- Prefect (fire) and engineer (collapse) walkers reset the counter of every building in their 5x5 footprint to 0 on each pass (`prefect_coverage`, `engineer_coverage`); roam 640 ticks, spawn delay 0 to 15 days by staffing; labour category `prefectures` is staffed with priority 3 in the default order.
- Burning ruin: desirability -1 range 2, spreads fire to neighbours (`building_maintenance_update_burning_ruins`, tick 43) until it becomes rubble; rubble -2 r2 and blocks the tile; a fire destroys the building and kills or evicts its people.
- Public wells and water do not extinguish; only prefects.

### 7.2 Crime (`figuretype/crime.c`, tick 45, daily)

- Finds the house with the lowest happiness below 50. After the global `crime_cooldown` (10 days after an incident, `COOLDOWN_AFTER_CRIME_DAYS`) an incident happens when `random_byte() >= sentiment + 20`: chance `(236 - sentiment) / 256` per eligible day, so about 65% at sentiment 70 and 65% at mood 70, 77% at mood 40 (est.): the cooldown, not the dice, rations crime.
- The chosen house's happiness gets +5 (the incident "uses up" some anger), then by min happiness: 45-49 protester (harmless, ratings), 30-44 robber(s) (steal money), 20-29 looter(s), <= 15: if >= 5% of the population below happiness 25: rioters + looters + robbers (count = unhappy/100, 1-20) who destroy buildings, else 3 looters and 3 robbers.
- Peace rating: -1 per criminal, -5 per rioter in the year.
- Strikers in industries (when sentiment low and wages low) also spawn criminal figures.

### 7.3 Other risks (`city/health.c`, `figure/service.c`, `scenario/random_event.c`)

- Sickness: `sickness_level` on houses, walkers spread it with 1/16 chance per house visited; hospitals/clinics (doctor) and bathhouses reduce it; plague kills.
- Random events: yearly table `RANDOM_EVENT_PROBABILITY[128]` (rolled with `random_byte()`): iron mine collapse, clay pit flood, contaminated water, wage change, trade disruption (48 days); earthquakes, gladiator revolts, invasions are scenario scripted.

**Map to Hamlet.** Fire is the one worth adding:
1. `fireRisk` per building, **daily** (not tick), only when population >= 10 people (the "grace period" rule is vital for a first-run experience: `AGENTS.md` users are makers and students);
2. each day a random 1/8 of buildings (slot) get +5 (wood/processing buildings that burn: sawmill, smokehouse, forge, chandlery) or +8 for the poorest houses level 0, +4 for others; fire at > 60 (Hamlet's scale is ~1/2 of 100 because a day of 20 s is short: use values that give ~12-16 game days between fires for the first house at default luck, not 80 days; tune by play);
3. a **watchman** (Hamlet `watch`) roaming 10-12 steps resets the risk in the 5x5 area; the watch house needs 1 worker;
4. a visible bar on the selected building and a "risk" overlay (coverage = counter > 0 as services), exactly like services; collapse and crime: skip in v1, crime if unemployment and mood rules exist.

## 8. Animals (`figure/formation_herd.c`, `figuretype/animal.c`, `figure/formation.c`)

| Item | Value |
|---|---|
| Spawn | per herd point of the scenario: **sheep 10** (central climate), **wolves 8** (northern), **zebras 12** (desert); one *formation* holds the group, figure 0 is the leader (the formation home follows it) |
| States | `AT_REST`, `MOVING`, `WOLF_ATTACKING`, corpse; at rest the animal waits `wait_ticks > 400` (sheep, wolf) or `> 200` (zebra) before it moves, with a per-figure phase offset `id & 0x1f` |
| Formation decision | each formation tick `wait_ticks++`; when `> roam_delay` it picks a new destination: sheep distance 8 / delay 20, zebra 20 / 4, wolf 16 / 6 (in formation update steps) |
| Destination | target direction `(formation_id + random_byte()) & 7`, distance as above; tries up to 4 directions, **turning right (+2 of 8)** each time; the target needs a free tile within a 4-tile radius: no building/soldier, and the **desirability must be 0** (wolves allow <= 1): herds stay away from the built-up area, which is the whole reason animals look "wild" |
| Layout | each animal moves to `destination + layout offset(index)` (a fixed herd pattern), moves 1 tick per step (sheep) or 2 (wolf, zebra: twice as fast) |
| Wolves | ranged targeting: `figure_combat_get_target_for_wolf(x, y, 6)` (radius 6) picks the nearest valid figure; the pack attacks together (any attacking member puts the whole formation into attack, `missile_attack_timeout`); if no target, back to rest; `infinite_wolves_spawning` config: a new wolf appears every `WOLF_SPAWN_DELAY_TICKS 32` while below `max_figures` |
| Nudge | resting sheep/zebra are **nudged** to an adjacent free tile when a building is placed on their tile (`figure_animal_try_nudge_at`) |
| Blocked tiles for animals | tree, rock, water, building, shrub, marsh (`terrain_blocked_for_animals`) |
| Sheep/zebra behaviour | harmless; no production, no hunting in Caesar (decor), animation phases 8 images at rest |

**Map to Hamlet.** `engine/deer.ts` has the deer with `DEER_SPEED`, `DEER_FLEE_SPEED`. Reuse these: (a) **herd = formation**: leader + followers with fixed offsets, one destination decision per `roam_delay` rather than per animal (O(herds), not O(animals)); (b) **stay out of appeal != 0 tiles** (they back away from the village but graze close to it at appeal 0 places: natural "hunting moves out as the village grows"); (c) rest 4-8 days between moves (`wait_ticks > 400` = 8 game days); (d) **wolves as the optional hazard**: pack of 8 with target radius 6 tiles and speed 2x, attack the nearest villager outside a watchtower radius; spawns paced at 1 per 32 ticks (0.6 day) up to the herd size; make wolves only in northern/forest presets; (e) the lodge `gather: deer` stays the use of herds (Caesar has none): hunting reduces the formation size and the leader reassigns.

## 9. Trade (not a numbered item, kept short; `city/trade.c`, `empire/trade_prices.c`, `city/trade_policy.c`)

- Trade is by route with per-resource open/closed, limit per year, prices base buy/sell in the table of 5.1 (sell is ~75-80% of buy), traders walk from the map edge to a warehouse that accepts the resource and trades up to 800 units; route problems last 48 days.
- Hamlet's peddler (`everyDays 5`, `stayDays 2`, `offers 3`) is a fine abstraction; **price ratio** buy:sell = ~1:0.75 and **raw cheaper than processed, 4-6x per step** (wheat 22-28, pottery 140-180, marble 140-200) is the bit worth copying: the peddler pays the processed good several times the raw one, so chains are worth building (Hamlet `price`: log 1, plank 2, smoked meat 4, leather 6, tools 8 already goes that way).

## 10. Short list: what to copy first (ranked by feel per line of code)

1. **Staffing as a linear efficiency** (production progress += workers); walker spawn delay by staffing (section 3, 5.1). Replaces on/off.
2. **City mood number** (house happiness moving +/-2 per day, mean) driving **settler arrival percentage** and a "why nobody comes" message (6.1, 6.2).
3. **Service footprint 5x5** around every roaming step, cover counters long compared with the round time (4.1).
4. **Per-house food stock** topped up by the market walker (4 x residents max), eaten daily: resilience to a supply break (5.3).
5. **Fire counters + watchman**, grace under 10 people, risk overlay (7.1).
6. **Producer waits when nothing accepts its goods**; one cart per producer; reserve at destination; drop only after the wait (5.2).
7. **Demands report**: aggregate "missing water / food / market" over houses for the hint panel (1.2).
8. **Herd formation AI** for deer/sheep/wolves with desirability-0 grazing rule (8).
9. **Rating-based goals** (prosperity, culture) with a cap from house levels (6.3).
10. Optional: house merge into a bigger building at the top level (1.2), gardens/statues as the pure desirability sinks (2.2).

## 11. File index

| Topic | Files |
|---|---|
| Housing levels, model data | `building/properties.c` (`houses[]`, `building_model_data`), `building/properties.h` |
| Evolution, goods use | `building/house_evolution.c`, `building/house_population.c`, `building/house.c` |
| Desirability | `map/desirability.c`, `map/ring.c`, `building/building.c` (`building_update_desirability`) |
| Labour, wages | `city/labor.c`, `city/finance.c`, `city/data.c` (wages 30), `building/figure.c` (labour seeker, spawn delays) |
| Walkers, coverage | `figure/service.c`, `figuretype/service.c`, `figure/movement.c` (`figure_movement_roam_ticks`), `figure/roamer_preview.c`, `building/house_service.c`, `map/water_supply.c` |
| Production, resources | `building/industry.c`, `game/resource.c`, `city/resource.c`, `core/calc.c` |
| Storage, delivery | `figuretype/cartpusher.c`, `building/storage.c`, `building/warehouse.c`, `building/granary.c`, `building/distribution.c`, `building/market.c` |
| Migration, mood, ratings | `city/migration.c`, `city/sentiment.c`, `city/ratings.c`, `city/victory.c`, `scenario/criteria.c`, `game/difficulty.c` |
| Risks | `building/maintenance.c`, `figuretype/crime.c`, `city/health.c`, `scenario/random_event.c` |
| Animals | `figure/formation_herd.c`, `figuretype/animal.c`, `figure/formation.c`, `figure/combat.c` |
| Tick order | `game/tick.c`, `game/time.h` |

## 12. Caveats

- The difficulty table (`game/difficulty.c`) columns were read by position: `{money, enemies, starting favour, sentiment, levies, base tax, food per soldier, favour pause, favour stop, event cooldown months, high salary punishment}`; normal difficulty is `{150, 80, 50, 70, 50, 8, ...}`, so **normal sentiment base = 70**, hard 65, very hard 60, easy 75, very easy 80 (the `very easy` row's 4th value is 80).
- "Walker speed 15-16 ticks per tile" and the derived day counts are estimates from `progress_on_tile`.
- Fire/collapse day counts are expectations of the random increments, not guarantees.
- Not extracted: tax and finance, festivals, gods and blessings, military and invasions, monuments, empire map and trade routes beyond the summary, tourism, editor-only scenario events (`scenario/event/*`, a condition/action scripting system with building count, population, money, ratings, resource stored; Hamlet's `goals` already cover the same ground).
