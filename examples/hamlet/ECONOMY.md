# The economy file (`assets/economy.json`)

The only place a resource, a building or a production chain is added (plus one model in `src/view/models.ts`, whose id list `MODEL_IDS` follows the order of `buildings`: a building type is its index).
`loadEconomy` (`src/world/economy.ts`) checks the file and refuses to start the game on a mistake; the errors have names: `bad-json`, `bad-id`, `unknown-resource`, `negative-number`, `no-model`, `bad-gather`, `bad-role`, `bad-hall`, `bad-service`, `bad-appeal`, `bad-deposit`, `bad-goal`, `bad-trade`, `bad-adventure`, `bad-difficulty`, `bad-sim`, `bad-size`, `bad-season`, `bad-bloom`, `bad-soil`, `bad-effect`, `cycle`.

```text
version      1
resources[]  { id, label, carry, price, target, harvest } target: a stock level (in all the stores) at which a workshop that makes only goods at their target stops and keeps its inputs (plank 40: the sawmill leaves the logs alone), 0: none; carry: how a worker shows it in the hands (log, deer, fish, plank, ...); price: what the peddler's coins are measured in (the carry code on screen is the resource's index + 1, see `view/actors.ts`)
harvest      (raw resources) { time, yield, percent, chance, depletion, seasons[4], tool { resource, bonus }, variants[] { label, ...overrides } }
             see "Harvests" below; `outputs` of a raw source only name what it makes (the number is derived from the harvest)
services[]   { id, label, risk, weight }  what a house may lack: water, market (Building.cover counts the days left of its coverage); `risk` (fire | collapse | crime) makes it a safety service, `weight` scales its share of the mood (default 1), see "Risks"
start        { resource: amount }       what a sandbox village holds at the entrance when it begins (a campaign takes its difficulty's start)
sim          { labourShare, walkerReach, stopJobless, appealSlices }   the knobs of the city simulation, see "The city simulation" below; error `bad-sim`
difficulties[] { id, label, hint, start { resource: amount }, arrival, eat, risk }  the levels of the new-village form (easy, normal, hard); arrival: percent of the normal settler pace, eat: percent of what houses eat, risk: percent of how fast fire, wear and theft counters rise; the index is saved (World.difficulty, -1 in a sandbox), see `rules/difficulty.ts`; error `bad-difficulty`
hall         building id with "store": the storehouse that stands for free by the entrance (not before the stores task)
buildings[]  {
  id, label, short, order, model          order: place on the toolbar (the type number stays the index); short: the button label
  cost       { resource: amount }
  workers    jobs given to idle residents; role: their job (palette), see ROLE_NAMES in constants.ts
  gather     "tree" | "deer" | "shore" | "deposit:<resource>"   the worker goes out to fell, hunt, fish or work a deposit and brings back `outputs`
  inputs     { resource: amount }         a processing building takes these ...
  outputs    { resource: amount }         ... and makes these after `seconds` (or gathers them, with `gather`)
  seconds    time of one work cycle
  stockCap   most of each resource the building holds; store: true  = accepts every resource
  housing    { capacity, free, eats[], uses[], lamp, mealsFrom, levels[], evolveDays, devolveDays, margin }
             residents; levels[] { label, capacity, needs { services[], foods, appeal } } are the next levels; a house evolves after `evolveDays` days meeting the next
             one's needs and falls back after `devolveDays` days failing its own (appeal slackened by `margin`); it buys meals (one unit per two people, `eats`) from `mealsFrom`; `uses` are goods lit for a few days (one unit per four people, candles) that each add `lamp` to the appeal its level is judged on
  service    { id, walker, range } | { id, radius }   a walker roams `range` steps of road and covers the houses it passes, or every house within `radius` tiles is covered
  appeal     [rings]                      adds rings[d - 1] to the desirability of the tiles at distance d around the building
  needsRoad  false for a building that works without a road (the well)
  offSeasons [0..3]  seasons (0 spring to 3 winter) in which no work cycle starts: the building rests (`rules/meadow.ts`)
  bloom      { radius, per, max }         every flower tile (`world.deco` 1 or 2; none in winter) within `radius` tiles adds `per` to the work speed, at most `max` tiles; a building with a bloom and no flower gets a hint
  soil       { radius, per, max }         every tile of fertile plain (`world.biome` = plain: open, damp ground near water) within `radius` tiles adds `per` to the work speed, at most `max` tiles (the farm)
  smoke      [[x, y, z], ...]             chimney smoke over a working building (tile-local units); a fourth number 1 makes it steam (whiter, lower); view only (`view/fx.ts`)
  glow       [[x, y, z], ...]             warm lights (lantern, window, hearth) shown at night on a working building; view only; `bad-effect` on a malformed spot
  risk       { fire, collapse, crime }    what the building adds to its counters each day (`fire`: a number, or for a house a list per level); see "Risks"
  buildable  false for a leftover the player cannot place, only demolish (the ruin)
  sound      played when a work cycle starts (`buzz`, `pour`...; a name of `audio.ts`)
}
roads { dirt, bridge, clear, yield, refund }          per tile of road, per tile of bridge (on water), per tree cleared; what a tree brings; percent refunded on demolition
desirability { limit, terrain[] { kind: tree|water|rock|plaza, rings[] } }   the grid is recomputed once a day; houses read it
deposits[]   { resource, model, placement: any|rock|water|tree, density (per 100 tiles), amount, required, active }   scattered by the generator; `model` is one of DEPOSIT_MODELS (constants.ts)
goals[]      { id, title, text, requires[], when[], unlock[], give{}, final }   when: { building, count } | { stock, count } | { population } | { houses, level }; checked daily, the reward is a logged command
trade        { coin, everyDays, stayDays, offers, table[] { side: sell|buy, resource, qty } }   the peddler at the gate
adventures[] { id, title, text, days, workers, risk (percent per member), cost{}, rewards{} }
risks        { ruin, minPopulation, fireAt, collapseAt, crimeAt, burnDays, spread, slots, theft, peace { calm, moodFloor, joblessFloor, gap, theftHeat, riotHeat, fade, robberEvery, riotMood, riotPeace, riotEvery, riotDamage } }   the rules of fire, collapse, theft and public order, see "Risks" and "Public order"
```

Day-length things (service counters, evolution, goals, trade, adventures) run in the daily slice, `engine/day.ts` (a day is DAY_SECONDS of simulation).

A `cycle` error means a resource someone needs cannot be made from a building that takes nothing in (a raw source: a gatherer).

## The deposit chains

A deposit is worked by a building with `gather: "deposit:<resource>"` standing next to it (the quarry's way); it is scattered only when `active` is not false, and `required: true` guarantees one within reach of the gate.

| Deposit | Placement | Worked by | Used for |
|---|---|---|---|
| stone | rock, required | quarry (needs 1 `tools`) | wells |
| clay | water, required | clay pit (`claypit`) | the forge costs 4 clay; the peddler sells it |
| iron_ore | rock, required | mine (`mine`) | the forge turns 2 ore + 1 log into 1 `tools` |
| berries | tree | forager (`forager`) | a fourth food of the houses (`eats`), more variety for level 2 and 3; the peddler sells it |

`tools` are made only by the forge and are needed by the quarry. In the campaign the goals `iron` (mine built, opens the forge) and `tools` (forge built, two tools made) follow `street`, which also opens the clay pit, the forager and the mine, so the quarry's `tools` are never out of reach. The roles `forager` and `smith` are new (palettes in `palettes.ts`); the clay pit and the mine use `quarryman`. Saves are `H17`: older saves start a new village.

## The bee chain

```text
flowers (tile deco) ---> apiary (`apiary`, beekeeper) --- honey --+--> houses eat it (a fifth food), the peddler trades it
 within 4 tiles: faster      no work in winter                    +--> meadery (`meadery`, brewer): 2 honey + 2 wheat -> 2 mead --> tavern (`tavern`, innkeeper): 1 mead -> 4 coins, appeal +2/+1
                                                       --- wax ---> chandlery (`chandlery`, chandler): 2 wax -> 2 candles --> houses light them (+1 appeal for a few days), the peddler buys them
```

The apiary has `bloom` (flowers speed it, up to +60% with six flower tiles) and `offSeasons: [3]` (it sleeps in winter, the bees stay in the hive: no bee on screen, no buzz). The bees (`view/bees.ts`) and the `buzz` sound (ambient volume) are view only; `pour` plays when the meadery or the tavern starts a cycle. The campaign goals `bees` (forager built, opens the apiary), `honey` (opens the chandlery and the meadery), `light` and `mead` (opens the tavern) follow `street`. Flowers are the generator's (`deco`), a road or a building on their tile removes them.

## Harvests

Every raw resource (log, meat, hide, fish, wheat, stone, clay, iron_ore, berries, honey, wax) has a `harvest` block in `resources[]`, and the job engine (`engine/villagers.ts`, numbers in `rules/harvest.ts`) reads nothing else for a gathering cycle. Processors (sawmill, mill...) keep `seconds`, `inputs` and `outputs`.

| Key | Meaning |
|---|---|
| `time` | game seconds of one cycle (a felling, a catch, a butchering, a dig, a harvest); 0 or absent: the building's `seconds`. A bloom (`bloom`) still shortens it |
| `yield` | units of a successful cycle at 100 % |
| `percent` | efficiency: units = yield x percent / 100 x the season's percent x (1 + tool bonus). The fraction is rolled with the sim's generator (1.2 units = 1 unit, plus one 20 % of the time) |
| `chance` | percent of the cycles that succeed (a fish bites, an arrow hits); 100 when absent. A failed cycle brings nothing |
| `depletion` | percent of the cycles that use up one load of the deposit (`deposits[].amount`); a tree is always felled |
| `seasons` | percent for spring, summer, autumn, winter |
| `tool` | `{ resource, bonus }`: while one unit of that resource stands in the stores, +bonus % |
| `variants` | one entry per source variant, each overriding the fields above: trees by species (`world.tree - 1`: small pine, pine, tall pine, broad-leaved), game by `doe` (0) and `stag` (1) |

The by-product of a gatherer (hides with the game) is rolled with its own block and the same variant when the load is delivered. The swing is derived from the time: a cycle holds `round(time / 0.55 s)` blows, evenly spread (`blowsOf`, `swingRate`), so the effects of `view/fx.ts` (leaves, chips, sound) follow the time without any table. Info windows, building tooltips and the Tree window show the cycle, the yield and the percent.

Calibration, from the Augustus study (mechanics and orders of magnitude only): output is nominal x efficiency, wheat is about twice the rate of wood, clay, iron and stone, fish sits between them, and staffing is linear (a hut with one of its two workers works at half rate, since each worker runs his own cycles). Experience of a worker is not modelled yet.

Errors: `bad-harvest` (a yield of 0, a percent above 500, a chance outside 1 to 100, a depletion above 100, a season list that is not four percents, a gatherer with no time and no `seconds`), `unknown-resource` (a tool that is not a resource).

## Residents: needs, mood, the daily round

`rules/needs.ts` holds the numbers, `engine/mood.ts` applies them once a day, `engine/routine.ts` lives the round. Mechanics follow the Augustus study (house contentment moving at most 2 a day, village average deciding who comes and who leaves); the numbers are Hamlet's own.

- **A house** has `happy` 0..100 (new houses start at 60) and moves it by at most 2 a day toward a target: base 52, minus 22 when the village has a market and the house ate nothing lately (plus 8 for any food, plus 7 per kind beyond what its level asks), plus 3 per level, the appeal of the tile (x2, from -8 to +14), plus 5 for each offered service that reaches it and minus 7 for each that does not, minus the village's unemployment above 8 % (x0.4, at most 12).
- **A person** (`world.people`) has `mood` (the house's contentment plus 3 with a job, minus 8 jobless when the village has workplaces, minus 8 when tired, plus 6 for a day or two after a visit to the market, well or tavern; moves at most 4 a day), `fatigue` 0..100 and a plain state `feel` (worst first): angry (mood below 25), homeless (no road to the house), hungry, tired (fatigue 80), jobless, content (mood 55 and over) or so-so.
- **The round**: awake people tire (5 a second at work, 1.5 idle); at night (the last 28 % of the day) anyone between two tasks walks home and sleeps (not drawn), recovering 15 a second, and wakes at dawn; a worker finishes the cycle in hand first. By day an idle resident sometimes walks to the nearest market, well or tavern (`FREE_PLACES`) and back.
- **Consequences**: a discontented person works slower (x0.85 under 50, x0.65 under 30, x0.85 more when tired); newcomers come every `SETTLER_INTERVAL` x 0.6 above 70, x0.85 above 60, x1 above 50 and not at all below 50; below 40, once a day, the unhappiest people leave (8 % of the population, 15 % under 30, 25 % under 20, at least one, never in a village of 6 or fewer), and the Messages say so.
- **Shown**: the mood chip in the top bar, the *Humeur* tab of the advisors (states, gaps weighing on houses, newcomers or leavers), the person window (mood, fatigue, thought in French), the bubbles over heads (Options, `settings.thoughts`), and two hints: `jobless` (a quarter of the people without work) and `unhappy` (mood under 45, naming the worst gap).
- The save shape is unchanged: people are recreated from their houses and recompute their mood at the next daily slice.

## Wild animals

`rules/species.ts` is a table (one row per species: speeds, `alert` and `fear` radii, population cap per 144 tiles, adult age and life span in days, breeding seasons, drinking, herd gap); `engine/deer.ts` is the one state machine: graze, walk (a hop, to the water when thirsty, toward the herd leader when it strayed), rest (a long rest every few moves, all night), alert (a person within `alert` freezes it), flee (within `fear`; the herd runs with it), drink, dead and gone. A hunter's quarry stands still until the shot (dead or running, as before). Once a day `dailyAnimals` ages the animals, lets old ones die, joins loose animals to a herd (the nearest older one) and lets adult does breed in the breeding seasons (a stag within 14 units, then a cooldown) while the herd is under the cap of the area. No-limit mode still brings deer back below `settings.deerMin`.

## Public order

Robbers and rioters walk the roads (`engine/crime.ts`; `world.crime.outlaws`, not in `world.people`: not villagers, not counted, not saved; drawn by `view/frame.ts` with their own palettes). Only in a village with risks, and every chance is scaled by the difficulty's `risk` pace (easy 50, normal 100, hard 150).

- **Peace rating** (0..100, daily, `world.crime.peace`; shown in the *Humeur* advisor tab and the F3 *Simulation* tab): `100 - unrest`, with `unrest = 1.5 x (moodFloor - mood)+ + 0.7 x (jobless % - joblessFloor)+ + gap x (share of occupied houses no watchman passed lately; 1 with no guard post, counted from `minPopulation` people on) + heat`. `heat` is what recent crimes added (`theftHeat` per robbery that gets away, `riotHeat` per riot), it fades by `fade` percent a day and an arrest takes 5 off. The line also names the reasons (*humeur basse*, *chômage*, *aucun guet* / *guet trop rare*, *crimes récents*).
- **Robbers**: a building whose theft counter passes `crimeAt` sends one (the old instant theft is the fallback when no road leads there); below `calm` (70) peace a robber may come each day (chance `(calm - peace) / 100 x pace`, at most one every `robberEvery` days, never more than 1 + people / 40 at once) for the richest building that is not the hall. He enters by the gate, takes `theft` units of the dearest free goods, and runs back; at the gate he is gone (heat up). A watchman within 2.5 tiles arrests him: the goods go back, heat down. So the watch post's round is what keeps the peace.
- **Riots**: only with a mood under `riotMood` (35) *and* a peace under `riotPeace` (40), at most one every `riotEvery` days: a rioter marches on a random workplace, smashes it for 5 s (its wear counter jumps by `riotDamage` percent of `collapseAt`; the next daily check may bring it down) and leaves. A watchman disperses them too.
- **Overlay**: the *Risques* calque tints each building by its dearest counter (fire, wear, theft; a ruin) and the robbers' tiles; `view/overlay.ts` `riskTiles()`.

## Risks

Fire, collapse and petty theft, modelled on the Augustus study (`docs/reports/hamlet-augustus-reference-2026-11-01.md` section 7; its numbers are a calibration only, tuned here by play). They exist only in a village created with *Risques* (on with the campaign, off in free mode, saved with the village as `world.risks`): a sandbox, a test or an old habit sees nothing of them, and `dailyRisks` then draws no random number.

- **Counters** (`Building.fire`, `damage`, `crime`, `burn`), raised once a day by `engine/risk.ts` from the building's `risk` weights, only from `risks.minPopulation` (16) people on (the first houses are safe) and never for the hall or an empty house. Each building has a fixed *slot* (one day in `risks.slots`, 8) and the day's slot is the only random draw: on its slot a building adds its `fire` weight (a house by level: a hut 10, then 6, 3; a forge 16, a bakery 14, a smokehouse 12, a sawmill 8...), wear grows `collapse` a day (x3 on its slot; a level-0 house never wears), theft grows by `crime` a day (x2 when the village mood is under 50, nothing at 75 or more).
- **Events** past a threshold: `fire` above `fireAt` (60) turns the building into the ruin type (`risks.ruin`, `buildable: false`) *burning* for `burnDays` days: its people flee (a house loses its residents), its goods are lost, and each day the fire adds `spread` to every neighbour in the 8 tiles, which may catch in turn; when `burn` reaches 0 the rubble stays and the player demolishes it (it blocks the tile). `damage` above `collapseAt` (160) is a collapse: rubble at once, people gone. `crime` above `crimeAt` (30) is a theft: `theft` units (2) of the dearest goods the building holds free (not promised to a porter), at most; a building with no stock just resets.
- **Services**: `fire` (*firehouse*, firewarden), `repair` (*works*, repairman), `watch` (*watchpost*, watchman) are services with `risk: fire | collapse | crime` and a walker. Each tile the walker enters resets that counter of every building within two tiles (`engine/services.ts`, `guard`), and a fire walker also puts out a burning ruin (no spread, the rubble stays). They unlock through the goals `fire` (ten people) and `watch` (a firehouse and twelve people) and appear in the Tree window with the other buildings.
- **Mood and hints**: in a village with risks a house covered by a safety service gains 5 x `weight`, an uncovered one loses 7 x `weight` (the same term as water and the market, `houseNeeds`), and the `no_service:fire` hint names the gap. `fire_risk` points at the building with the highest fire counter when it is past a quarter of `fireAt` and no fire post exists (`fire_risk:none`) or past 70 % with one that passes too rarely (`fire_risk:rare`). The info window of a building says its level of risk; a ruin says *En flammes* or *Décombres*.
- **Messages and sound** (French, from `world.alerts`, drained by `ui/Messages.ts`): `Incendie : ...` and `Effondrement : ...` are urgent (banner, alarm, then the `fire` roar or `collapse` crash of `audio.ts`), a theft is a warning, rubble and a fire put out are plain lines. A `crackle` ambience plays while a ruin burns; flames and smoke are drawn by `view/fire.ts` (view only, nothing saved).
- **Gatherers with nothing in reach**: a lumber hut, quarry, fishery or lodge whose worker finds no tree, deposit, shore or game within `WORK_RADIUS` shows the state `BS_NO_SOURCE` (*Plus d'arbre à portée*) and a `no_source` hint, instead of the stale *Plein*: its own houses or rock can wall the road in, and the way out is the gomme (trees can be razed, they bring nothing), a longer road or another site. A gatherer clears a stale *full* as soon as it finds work.
- **Save**: `H18` adds `fire|damage|crime|burn` to each building and the `risks` flag at the end of the line; an older save is not loaded and starts a new village.

## Tuning notes (2026-11-01)

- Start stock (Normal): 28 logs, 20 planks, 2 leather; Difficile 20 logs, 14 planks; roads cost planks, so the opening needs a plank reserve.
- `TREE_REGROW_SLOW` is 4 s: a forest recovers within a game. The campaign's start (a Vallee with about 35 trees) needs it: at 12 s the bot's village runs out of wood on day 20 and the growth goal is lost. Felling is not slowed by regrowth on a normal map; on a sparse one a short session sees more trees grow than fall, so tests count felled tiles, not the total.
- The honey, mead, light and leather goals ask for the building only: houses eat those goods, so a stock count was unreachable.
- The bot (`tests/data/hamlet/bot.ts`) wins Normal on some seeds of every size 24 preset it was tried on; size 40 and some seeds still fail (see `backlog/later.md`).

## The city simulation (2026-11-02)

The mechanics follow Augustus (mechanisms only, `docs/reports/hamlet-augustus-study-2026-11-01.md`); the numbers are Hamlet's own. `sim` in `economy.json` holds the knobs, everything else is the data above.

- **Road networks** (`engine/network.ts`). Every connected piece of road has an id, a flood fill redone when `world.netRev` changes (a road or a building placed, demolished, burnt, a save loaded). A building belongs to the network of the road at its door. A building that needs a road and is not on the network of the gate is *off the network*: state `BS_OFF_NET`, it gets no worker (those it had go back to the pool), makes nothing, sends no walker, and its window says *Inactif : sa route ne mène pas à l'entrée du hameau*. Goods move only inside a network that holds a store (`exportsOk`).
- **Walkers keep to the roads.** `planPath` searches on the road network (A* on shared buffers): over open ground a walker goes only to reach a road (`ESCAPE`, the work radius) and then stays on roads. Gatherers in their work radius, strolls beside the house, hunters and animals cross the land. A unit appears at the road tile at its door.
- **Labour** (`rules/labour.ts`). Every workplace has a fixed number of jobs (`workers`); the pool is `labourShare` percent of the residents (100 keeps the opening of the campaign: the first villages have too few people to leave anyone out; a city mission sets about 60); the pool is handed out in the order of the player's priority; output follows staffing (each worker runs his own cycles), an unstaffed building makes nothing and sends no walker. `labourStats()` gives the numbers for the HUD: `pool`, `jobs`, `filled`, `unemployed` (pool without a place) and `shortage` (places nobody takes).
- **Roamers** (`engine/services.ts`). A service building sends one walker at a time; it goes straight on where the road does and at a junction takes the way the building's own turn counter points at (`Building.turn`, rotating: the next walker takes another street), no dice; its round is `service.range` steps. Every tile it enters sets the coverage counter of the houses within `walkerReach` tiles to `COVER_DAYS`; the counter loses a day each day. A service with a `radius` and no walker covers the houses within it.
- **Carts and storage orders** (`engine/transport.ts`, `rules/storage.ts`). A producer with output sends a worker carrying a batch to the nearest store with room (reservations `reserved`/`incoming` keep a load from being taken or promised twice). Each store has an order per resource: `accept`, `refuse` (carts bring none; what it holds is still handed out) or `get` (it takes it, keeps it, and its porters fetch it from the other stores). `setOrder(storeId, resource, order)`; saved since H21 (with the roamer turn counter).
- **Markets and goods** (`engine/transport.ts` `restock`, `engine/services.ts`). A building with `market: true` keeps a stock (`stockCap` per kind) of the goods houses eat or burn. Its vendor, between two rounds, fetches a kind held under half the cap from the nearest store that gives it (a `restock` transport), and on its round hands the goods to every house it covers (`rules/housing.ts` `feed`: the kinds the next level asks, a meal lasts `FOOD_DAYS` and is bought again with one day left). A market with nothing to hand out covers nothing and sends no round. Houses in a rules file with no `mealsFrom` still buy at the stores each day.
- **Religion and entertainment**: the services `religion` and `entertainment` (weight 0.5) are given by the chapel (walker, unlocked by the light goal) and the festival ground `theatre` (walker, unlocked with the tavern; the tavern itself covers entertainment within 4 tiles). Level 4 of the house, the Manoir (capacity 8), asks market, water, religion, entertainment, three foods and appeal 4; levels up to the Demeure are unchanged. Their roles reuse the chandler and innkeeper palettes.
- **Labour spread and joblessness**: while the player has not moved a type in the priority list, a scarce pool gives one hand to each workshop before a second to any; an order he sets is strict. A person is jobless only if idle and inside the pool (pool minus employed, idle people in turn): the village figure and each mood read that.
- **Housing** (`engine/housing.ts`, `rules/housing.ts`): levels climb after `evolveDays` days meeting the next level's needs (services, food kinds, desirability) and fall after `devolveDays` days failing their own with the desirability slackened by `margin`; `housingReport(house)` lists what is missing, in words, for the UI.
- **Migration** (`engine/villagers.ts`): settlers come through the gate and walk in; they come when the village is content (`arrivalFactor`), there is food past the first free settlers, the jobless share is under `stopJobless`, and a shortage of hands draws them faster; they leave when the mood is low (`leavingToday`). Nobody appears in a house.
- **Slices.** The whole-map desirability pass is spread over the last `appealSlices` ticks of each day (`appealSlice`) and installed just before the day's slice reads it; the other daily passes (services, housing, mood, risks) are loops over buildings and people. No tick loops over the map.
- **Cost.** `tests/data/hamlet/perf.ts` steps a village of 500 people and 300 animals (`HAMLET_SIZE`, `HAMLET_PEOPLE`, `HAMLET_ANIMALS`, `HAMLET_SPLIT=1` for the split by part): 1.6 ms a tick on a 128 map and 1.4 ms on 256 on this Mac (it was 58 ms).

`sim` keys: `labourShare` (1 to 100), `walkerReach` (1 to 4 tiles), `stopJobless` (1 to 100 percent), `appealSlices` (1 to 600 ticks). Errors: `bad-sim`.

## Footprints (`size`)

A building may carry `"size": [w, h]` (whole numbers 1 to 4; default 1 x 1; error `bad-size`). Its tile is the top-left corner (the anchor, saved); `world.build` points to it from every tile.
Placement needs every tile open (no tree, rock, deposit, road, building, water), on one flat level and on the map, and a road on any edge tile. The door (`doorOf`, `goalOf` in `engine/network.ts`)
is the lowest road tile beside the footprint; services reach houses by the distance from the footprint edge. A house level may carry `size` too (a level without one keeps the previous level's):
the Manoir is 2 x 2 and a house grows into free flat ground (`growSpot`), waiting with the requirement `space` otherwise; it gives the tiles back when it falls. Saves from before H22 load a building
as 1 x 1 when something stands where its footprint would go.
