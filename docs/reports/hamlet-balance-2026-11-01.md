# Hamlet balance pass (2026-11-01)

Owner report: the campaign could not be played through. This report holds the research, the bot that measures the game, what blocked a player, the changes and the before/after timeline.

## 1. Research: what the reference games do

Sources read: `hamlet-augustus-reference-2026-11-01.md`, `hamlet-augustus-study-2026-11-01.md`, `examples/hamlet/ECONOMY.md`, and a web search on Caesar III, Banished and Anno 1800 (forums and guides; no official figure was found for exact starting stocks, so the numbers below are the ones the Augustus source gives and the common advice).

| Topic | What the references do | Target for Hamlet |
|---|---|---|
| Start | Banished: 4 families on Hard (little food, no seeds) up to 6 on Easy with a large stock; Anno: difficulty changes starting money and refunds; Caesar III: a treasury big enough for ~15 houses and basic services | One stock per difficulty, enough for 4 houses + a lumber hut + a sawmill + a first food building; nothing locked that the first 10 minutes need |
| First houses | Immigration starts as soon as a connected house exists (Caesar III); stray roads that do not reach the gate stop it | First house at minute 0-2, the people arrive in 12-24 s |
| Migration gate | Augustus: sentiment above 50-60 brings people, 40-50 nobody, below leave; normal base sentiment 70 (hard 65, easy 75) | Houses start at 60 (was 52); nobody comes under 45 (was 50); leaving under 35 (was 40) |
| Food | Augustus: a house eats pop x 50 % a month, a missing food type does not starve, it only blocks evolution and lowers sentiment; Banished: food stock before the first winter | A starting bread stock; the first 8 people (was 4) need no food; fish needs no workshop |
| Wood | Banished: firewood and wood are the tight resource and forests regrow slowly; Settlers: 1 log makes 1 plank | Sawmill 1 log -> 1 plank; the forest regrows slowly in normal mode |
| Fires and crime | Caesar III: fire and collapse start with real population, a prefecture is a unlockable goal | Risks from 16 people (was 10), fire at 100 (was 60), spread 10 (was 25) |
| Pacing | Anno campaigns are long tutorials: one need at a time, goals follow the economy. Guides: expand only once the next need is stable | A goal every 3-6 minutes of play, 90-120 minutes for a human (see section 5) |
| Difficulty | Easy / Normal / Hard change the start, immigration and risk, not the rules | `difficulties` in `economy.json`: start, arrival, eating, risk |
| Fail states | Soft: people leave, houses fall back a level, fires burn; no instant defeat | Kept as is |

Targets used for tuning (the bot plays far faster than a person: it never hesitates, so its times are a floor; a person is 2 to 3 times slower):

- first house in the first 2 minutes, 20 people by minute 10 (bot: earlier);
- a goal every 3-6 minutes, the goal list reads as a to-do (each text names the next building);
- first fire not before the village has 16 people and the fire post is unlocked;
- wood must never end (a forest that regrows), and the opening must never dead-end.

## 2. The bot

`tests/data/hamlet/bot.ts` (run: `ZINC_HEADLESS=1 build/zinc run tests/data/hamlet/bot.ts`). It plays through the rules API (`applyTool`, the daily goal rewards), deterministic, at full speed, no rendering. Settings by environment: `BOT_SEEDS`, `BOT_SIZES`, `BOT_PRESETS`, `BOT_DAYS`, `BOT_LEVEL` (0 easy, 1 normal, 2 hard), `BOT_MODE=sandbox`, `BOT_VERBOSE=1` (the day-by-day timeline, fires, goals, the best house and what it lacks).

Its strategy: a plan of buildings in the order a person would take (houses, lumber hut, sawmill, fishery, lodge, smokehouse, market, well, tannery, farm chain, fire post, mine/forge/quarry, bees, candles, mead, tavern...), a road laid by breadth-first search to the best tile of each building, houses only while jobs are open, no workshop while the ones built wait for hands, saving for a building whose goal is not reached yet, demolishing rubble. It prints one line per run: the day of victory (or why not), the maximum population, the lowest mood, who left, fires, collapses, thefts, and the minute of every goal.

## 3. What blocked a human (found with the bot, before the changes)

1. **A dead end in the first minute.** The sawmill was locked until the first goal; the start had 10 planks. Two houses + a lumber hut + a second hut left no plank for the sawmill: wood piled up (40 logs), planks 0, nothing could ever be built. Same for a person.
2. **Population stuck at 4.** Beyond 4 people a settler costs one food item, food needs workers, and the 4 people were the lumberjacks and the sawyers. "Waiting for food" for ever.
3. **The sawmill ate the wood** (2 logs for 1 plank, 2 sawyers) and was staffed before the lumber hut (jobs go in the order of the file, which listed the sawmill first): logs at 0 for the whole game, planks piling up.
4. **The trees ran out by minute 7** on a 24 x 24 map (66 trees, 45 felled by day 20) and never grew back in normal mode.
5. **Fires from the first 10 people**: a house burns after ~40 days, the fire spreads to every neighbour (25 per day), the fire post only unlocks at 10 people. A chain of fires emptied the village by day 90; thefts from day 14.
6. **Mood under 50 stops arrivals** and the base mood was 52 with every uncovered service costing 7: a village with a fire post but no market sat at 45.
7. **Hidden chain for the well.** The well (needed for the final house level) was unlocked by the quarry goal, the quarry needs a tool, the tool needs the forge, the forge needs clay and iron: 7 buildings no goal text mentioned. The market was unlocked at the same time, behind the tannery.
8. **The campaign was short and abrupt** (final goal: 14 people and one level 3 house).

## 4. Changes

Data (`assets/economy.json`): sawmill 1 log -> 1 plank, 5 s; `housing.free` 4 -> 8; start stock; the sawmill is no longer locked; risks (`minPopulation` 16, `fireAt` 100, `crimeAt` 60, `spread` 10) and the fire goal at 16 people; well unlocked by the market goal, quarry by the tools goal, the stone goal after it, the market by the tannery goal; two goals added after the village is founded (`town`: 30 people and four level 3 houses; `feast`, final: 45 people, eight level 3 houses and a tavern); `difficulties` (easy, normal, hard) and a generous sandbox `start`.
Rules: house base mood 60, arrivals from mood 45, leaving under 35 (`rules/needs.ts`); the jobs order of a new village follows the toolbar order, raw trades first (`rules/labour.ts`); the forest regrows in normal mode (a tree every 14 s up to 1.5 times the no-limit threshold: `engine/nature.ts`, `constants.ts`); difficulty read in `rules/difficulty.ts` (start, arrival, eating, risk), saved with the village, chosen in the new-village form.

## 5. Timelines

Minutes are game minutes (a day is 20 s) of the bot, which acts every 5 s without hesitation; a person is 2 to 3 times slower. 200 days (66 minutes) per run.

**Before** (commit `3b3692971`, normal rules, seeds 1 and 2 on the default map, seed 3 on the lake): the village never leaves 4 people. `wood@0`, nothing after: no plank, no sawmill, no goal. The campaign could not be played through, as the owner said.

**After** (normal difficulty):

| Seed, size, landscape | Result | Goals reached (minute of the bot) |
|---|---|---|
| 2, 24, default | won at 17 min | planks 3, street 3, leather 6, square 6, growth 7, prosperity 7, town 8, feast 17 |
| 2, 40, lake | won at 53 min | street 3, growth 8, prosperity 8, town 9, feast 53 |
| 4, 24, default | won at 43 min | street 2, growth 7, prosperity 8, town 8, feast 43 |
| 1, 40, default | won at 61 min | town 59, feast 61 (fires 10, collapses 7: the bot never rebuilds well) |
| 1, 24, default | not won (town at 22) | 100 people, level 3 houses held back by the second food kind and services |
| 3, 24, lake | not won (prosperity at 52) | wood and food short early, collapses without repairs |
| 5, 24, river | not won (town at 13) | same limit as seed 1 |
| 6, 24, forest | stuck at 6 people | the lumber hut shows "output full" with the hall empty of logs: an engine defect found by the bot (later.md) |

Difficulties (seed 2, 24): easy won at 14 min, normal 17, hard not won in 66 minutes (town at 54, 6 fires, 36 collapses: the bot has no repair post). Sandbox (everything open, no risks): 112 people at day 150, no collapse.

The human pace: first house in the first minute (4 houses, a hut and a sawmill are paid by the start stock), 20 people by minute 3-4 of bot time (so about 10 for a person), a goal every 1-8 minutes in the first half hour, the final goal after 40 to 60 minutes for the bot: 90-120 minutes for a person who reads the goals, which is the target.
