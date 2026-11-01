# The economy file (`assets/economy.json`)

The only place a resource, a building or a production chain is added (plus one model in `src/view/models.ts`, whose id list `MODEL_IDS` follows the order of `buildings`: a building type is its index).
`loadEconomy` (`src/world/economy.ts`) checks the file and refuses to start the game on a mistake; the errors have names: `bad-json`, `bad-id`, `unknown-resource`, `negative-number`, `no-model`, `bad-gather`, `bad-role`, `bad-hall`, `bad-service`, `bad-appeal`, `bad-deposit`, `bad-goal`, `bad-trade`, `bad-adventure`, `bad-season`, `bad-bloom`, `bad-effect`, `cycle`.

```text
version      1
resources[]  { id, label, carry, price, harvest } carry: how a worker shows it in the hands (log, deer, fish, plank, ...); price: what the peddler's coins are measured in (the carry code on screen is the resource's index + 1, see `view/actors.ts`)
harvest      (raw resources) { time, yield, percent, chance, depletion, seasons[4], tool { resource, bonus }, variants[] { label, ...overrides } }
             see "Harvests" below; `outputs` of a raw source only name what it makes (the number is derived from the harvest)
services[]   { id, label }              what a house may lack: water, market (Building.cover counts the days left of its coverage)
start        { resource: amount }       what the village holds at the entrance when it begins
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
  bloom      { radius, per, max }         every flower tile (`world.deco`) within `radius` tiles adds `per` to the work speed, at most `max` tiles; a building with a bloom and no flower gets a hint
  smoke      [[x, y, z], ...]             chimney smoke over a working building (tile-local units); a fourth number 1 makes it steam (whiter, lower); view only (`view/fx.ts`)
  glow       [[x, y, z], ...]             warm lights (lantern, window, hearth) shown at night on a working building; view only; `bad-effect` on a malformed spot
  sound      played when a work cycle starts (`buzz`, `pour`...; a name of `audio.ts`)
}
desirability { limit, terrain[] { kind: tree|water|rock, rings[] } }   the grid is recomputed once a day; houses read it
deposits[]   { resource, model, placement: any|rock|water|tree, density (per 100 tiles), amount, required, active }   scattered by the generator; `model` is one of DEPOSIT_MODELS (constants.ts)
goals[]      { id, title, text, requires[], when[], unlock[], give{}, final }   when: { building, count } | { stock, count } | { population } | { houses, level }; checked daily, the reward is a logged command
trade        { coin, everyDays, stayDays, offers, table[] { side: sell|buy, resource, qty } }   the peddler at the gate
adventures[] { id, title, text, days, workers, risk (percent per member), cost{}, rewards{} }
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
