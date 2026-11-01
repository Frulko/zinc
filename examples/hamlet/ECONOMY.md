# The economy file (`assets/economy.json`)

The only place a resource, a building or a production chain is added (plus one model in `src/view/models.ts`, whose id list `MODEL_IDS` follows the order of `buildings`: a building type is its index).
`loadEconomy` (`src/world/economy.ts`) checks the file and refuses to start the game on a mistake; the errors have names: `bad-json`, `bad-id`, `unknown-resource`, `negative-number`, `no-model`, `bad-gather`, `bad-role`, `bad-hall`, `bad-service`, `bad-appeal`, `bad-deposit`, `bad-goal`, `bad-trade`, `bad-adventure`, `bad-season`, `bad-bloom`, `cycle`.

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
