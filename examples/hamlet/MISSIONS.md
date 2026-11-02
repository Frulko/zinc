# Missions and the sandbox

A mission is a data file, like the economy: `assets/missions/<id>.json`, ordered by `assets/missions/campaign.json` (`{ "missions": [ids] }`).
`loadMissions` (`src/world/missions.ts`) checks every file and refuses to start the game on a mistake; `parseMission` returns the problems, each starting with its name:
`bad-json`, `bad-id`, `bad-map`, `bad-start`, `unknown-resource`, `bad-difficulty`, `bad-sim`, `bad-building`, `bad-goal`, `bad-limit`, `bad-campaign`.

```text
id           the file name without .json
title        shown in the list, the goals window and the ending
briefing     French text, what the mission is about (the new-village form and the goals window show it)
map          { preset, seed, size, water, river, forest, rock, relief, outcrop, flowers, coast, wolves }
             preset: a label of gen/presets.ts (Vallée, Plaine, Rivière, Lac, Forêt, Montagne, Montagnes, Côte, Classique); size 12 to 256; the other keys override the preset (0..1, river true/false, wolves 0..2)
difficulty   an id of economy.json "difficulties" (default normal): arrivals, appetite, risk pace
start        { resource: amount } the start stock of the village store (default: the difficulty's)
sim          the knobs of economy.json "sim" over its values (labourShare, walkerReach, stopJobless, appealSlices); a Cité mission sets labourShare to about 60
buildings    the building ids open at the start; a goal's `unlock` opens the others. Omitted: every building that no goal unlocks
risks        true: fire, collapse and theft (the Risks of ECONOMY.md); default false
limitYears   optional time limit (a year is 12 months of 15 seconds); the mission is lost when it runs out before the final goal
lose         { peace: 1..99 } optional: lost when the peace rating falls under it (needs risks). An empty village is always lost
goals[]      the goals, in order; each is one of
               "id"                               a goal of economy.json, taken as it is (its required goals must come before it in the list)
               { "ref": "id", "final": true }     the same, made the final one
               { id, title, text, requires[], when[], unlock[], give{}, final }   a goal of its own, written as the goals of economy.json
```

Exactly one thing ends a mission well: a goal with `final: true` done. `economy.json` goals are the first mission's goals (`01-premier-village` takes `wood`, `planks`, `street`, `hunt`, `leather`, `square` and `growth`; no goal is written twice), and stay the goals of the economy for tests and the bot.

## Conditions of a goal (`when[]`)

| Key | Holds when |
|---|---|
| `{ building, count }` | that many buildings of the type stand (default 1) |
| `{ stock, count, days }` | the stores hold `count` of the resource; with `days`, for that many daily checks in a row (the count restarts when it drops; a loaded village counts again) |
| `{ population }` | that many residents |
| `{ houses, level }` | that many houses of the level or above (the top level is 2: a third needs a model) |
| `{ jobs }` | that many workplaces are held by workers (`labourStats().filled`) |
| `{ peace }` | the peace rating (0..100, Public order of ECONOMY.md) is at least that |
| `{ mood }` | the village mood is at least that |

Goals are checked once a day; the reward (`unlock`, `give`) is a logged command, as before.

## What a mission does to the game

`applyMission(id)` is called before `generate`: it replaces `economy.goals`, `economy.sim`, the start stock (`economy.startOverride`) and the open building list (`economy.openAtStart`) and sets `world.mission`; `applyMission('')` gives the economy.json ones back (the sandbox). The village save carries the mission id (the last field of the save line), so a loaded village plays its own goals and knobs; an older save has none and loads as a sandbox. The ending (`ui/Ending.ts`) shows the victory (the final goal) or the defeat (time, peace, an empty village), records the mission as won in the options storage (`hamlet:prefs`, key `missions`) and offers the next mission of the campaign.

## The sandbox

The new-village form (`N`, or *Bac à sable* in the menus) has two modes. Sandbox: seed (number or word, empty for a random one shown in the preview), size 12 to 256, landscape, lakes / forest / rock / relief steppers, river, infinite resources, risks, the start stock (free, or a difficulty), and a small preview of the map the seed makes (the generator's layers sampled to 128 cells, with the gate marked), then Enter. No goals, everything open. Missions: the list, the preview and the briefing of the selected one, *Commencer la mission*.

## The six missions

| | Map | What it teaches |
|---|---|---|
| 1 Le premier village | Vallée 32, seed 1101 | roads, houses, wood, planks, hunting, the market (economy.json goals) |
| 2 Nourrir le village | Plaine 40, seed 2202 | farms, mill, bakery, a bread stock held three days |
| 3 La montagne | Montagnes 48, seed 3303 | quarry, mine, clay, forge, stores; ore on the slopes |
| 4 Le colporteur | Rivière 40, seed 4404 | market, selling to the peddler, bees, candles, a purse kept |
| 5 La grande cité | Vallée 64, seed 5505 | labour pool 60 %, services, housing level 2, 400 people |
| 6 Survivre | Montagnes 40, seed 6606, hard | fire, crime, peace, a time limit |

Numbers (goal sizes, limits) are first estimates: only the openings are proven by tests. Open points are in the final report of the work item.
