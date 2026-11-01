# Hamlet (Hameau)

A small, cosy village builder in the pixel diorama style of `examples/pixel-plays`: a forest clearing, an entrance gate, a pond and a few deer.
Trace roads from the gate, place a house at the roadside and settlers arrive. They do nothing until a workplace needs them: a **sawmill**
makes lumberjacks (they fell trees and carry logs back), a **hunting lodge** makes hunters (they shoot deer and carry the game back), a **fishing hut** (on the shore of the pond, next to a road) makes fishers.
**No-limit mode** (`U`, saved with the village): below a threshold of trees or deer, new ones appear regularly; otherwise resources run out.
The village saves itself and comes back as you left it.

```sh
build/zinc run examples/hamlet --background
```

| Input | Action |
|---|---|
| `1` Road, `2` House, `3` Sawmill, `4` Hunting lodge, `5` Fishing hut (only when the map has a pond), last key Demolish (or click the toolbar) | choose the tool |
| drag (road, demolish) / click (buildings) | act on the tile under the pointer |
| `P` / `Esc`, `M`, `U`, `N` | pause, sound, no-limit mode, new village form (`G` too) |
| `F` / `O` / `F2` / `Ctrl+Z` / `[` `]` | advisors, map overlays, developer panel, undo, previous or next tool |
| right click / `Esc` | close a window, then drop the tool, then open the game menu |

Rules: buildings stand next to a road and cost wood (`constants.ts`). A house is only settled when its road reaches the gate. The first four
inhabitants come freely; later ones want one piece of game or fish each. A site employs two people from the idle residents.

## Layout

```text
src/
├── main.ts                 mounts the stage and the scene
├── HamletScene.ts          input (mouse, touch, keys), toolbar, texts, frame loop
├── hud.ts                  resource line and the one sentence that says what to try next (the top hint)
├── ui/                     the Sierra-style interface: kit.ts (stone and parchment frames, buttons, tooltips; tokens in assets/ui-theme.json), Hud.ts (top bar, control column),
│                           BuildMenu.ts, Info.ts, Advisors.ts, Messages.ts, Overlays.ts, Placement.ts, Menu.ts, prefs.ts; Panel.ts is the F2 developer panel
├── constants.ts            every shared number: map, costs, speeds, states, save key
├── palettes.ts             every colour (diorama and HUD)
├── pixel.ts                the single door to the shared Pixel Plays renderer, audio and models
├── world/                  state (world.ts: tiles, people, deer, generation) and the save (save.ts, one line of text)
├── rules/build.ts          what a tool may do on a tile, costs, placing and demolishing; rules/needs.ts (residents' needs and mood), rules/species.ts (the animal table)
├── engine/                 path.ts (cheapest path, roads first), villagers.ts (jobs and daily life), routine.ts (sleep, free time), mood.ts (contentment, newcomers and leavers), deer.ts (the wild animals), simulate.ts (one step)
└── view/                   models.ts (lit objects baked once), scenery.ts (ground and static layer), actors.ts (people, deer), frame.ts (one picture)
```

The simulation (`world`, `rules`, `engine`) never draws; the view never changes the game. Drawing is the shared renderer: every object is
lit volumes, projected and depth-tested together, with the ground, tufts and shadows of the Pixel Plays games; people and deer use the same
shapes as its figures, cat and gull. No flat sprites.

## Extending it

- A new building: a number in `constants.ts` (name, cost), a model in `view/models.ts`, and its behaviour in `engine/villagers.ts` (a job state machine like the lumberjack's).
- A new resource or a goal: `world.ts` state, `hud.ts` line; deliver it in `villagers.ts` `deliver`.
- A new season or palette: `palettes.ts` and `setLighting`/`setVegetation` of the renderer (see `pixel-plays/src/native/river/seasons.ts`).

## Proof

`tests/t1/hamlet.sh`: the rules (`tests/data/hamlet/rules.ts`: arrivals, jobs, wood, game, demolition, save round trip) on the three engines, then a scripted
mouse session with a picture. The village animates at 24 poses a second and draws nothing when paused. Not measured: performance on small devices,
touch on a real screen, sound heard in context.
- Smoothness: only what moves is redrawn each frame (people, deer, smoke, wind, the pond), and the game stands still while the camera moves or zooms (panel: "Pause si on bouge"). Zooming out shows a wider window at the same detail, so the picture grows with the zoom level.
