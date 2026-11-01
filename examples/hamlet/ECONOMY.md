# The economy file (`assets/economy.json`)

The only place a resource, a building or a production chain is added (plus one model in `src/view/models.ts`, whose id list `MODEL_IDS` follows the order of `buildings`: a building type is its index).
`loadEconomy` (`src/world/economy.ts`) checks the file and refuses to start the game on a mistake; the errors have names: `bad-json`, `bad-id`, `unknown-resource`, `negative-number`, `no-model`, `bad-gather`, `bad-role`, `bad-hall`, `bad-service`, `bad-appeal`, `bad-deposit`, `bad-goal`, `bad-trade`, `bad-adventure`, `cycle`.

```text
version      1
resources[]  { id, label, carry, price } carry: how a worker shows it in the hands (log, deer, fish, plank, ...); price: what the peddler's coins are measured in (the carry code on screen is the resource's index + 1, see `view/actors.ts`)
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
  housing    { capacity, free, eats[], mealsFrom, levels[], evolveDays, devolveDays, margin }
             residents; levels[] { label, capacity, needs { services[], foods, appeal } } are the next levels; a house evolves after `evolveDays` days meeting the next
             one's needs and falls back after `devolveDays` days failing its own (appeal slackened by `margin`); it buys meals (one unit per two people, `eats`) from `mealsFrom`
  service    { id, walker, range } | { id, radius }   a walker roams `range` steps of road and covers the houses it passes, or every house within `radius` tiles is covered
  appeal     [rings]                      adds rings[d - 1] to the desirability of the tiles at distance d around the building
  needsRoad  false for a building that works without a road (the well)
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

`tools` are made only by the forge and are needed by the quarry. In the campaign the goals `iron` (mine built, opens the forge) and `tools` (forge built, two tools made) follow `street`, which also opens the clay pit, the forager and the mine, so the quarry's `tools` are never out of reach. The roles `forager` and `smith` are new (palettes in `palettes.ts`); the clay pit and the mine use `quarryman`. Saves are `H16`: older saves start a new village.
