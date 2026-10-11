# The pinball table format

A table of `examples/pinball3d` is one JSON file, `table.json`, with the files it names beside it (models, images, sounds). Nothing about a table is in the
game's code: the game, and the editor, read this file. This page is the reference of every field. It is printed from the format's own
definition (`examples/pinball3d/src/format/table-schema.ts`) by `zinc run examples/pinball3d/tools/table.ts -- doc <table>`, with its examples
taken from the table "Tidal Lock"; a test keeps it current. Format `"zinc-pinball-table"`, version 1.

## The file

- **A folder or a package.** While one works on a table it is a folder: `table.json` and its files. To share it,
  `tools/table.ts -- pack`, or Export in the editor, writes one package file (`.zpinball`). The game opens both.
- **The package.** A `.zpinball` file is JSON: `{ "format": "zinc-pinball-package", "version": 1, "files": [...] }`. `files` holds
  `table.json` first, then every file the table names (the sounds, the images, the models), each as `{ "name": "sounds/example.wav", "base64": "..." }`,
  or `{ "name": "models/example.obj", "text": "..." }` for a file that is text (.json, .obj, .txt, .svg). A name is the path the table gives the file, from the
  table folder. Making a package fails, naming the file, when the table names a file its folder does not have.
- **Checked.** A file is checked when it is loaded, and every fault is reported at once with the path of the value:
  `flippers[1].length: must be a number from 2 to 30, not "long"`, `bumpers[0].surfce: unknown field (did you mean "surface"?)`,
  `rules.when[3].do[0].target: "lanez" is not one of the lights or light groups (lane1, lane2, lane3, lanes)`. `tools/table.ts -- check` prints them.
- **One canonical text.** The game and the editor write a table in one form: the fields in the order of this page, a field that
  holds its default left out, a row of numbers on one line. Loading that text and saving it again gives the same bytes, so a table
  edited by hand, formatted (`tools/table.ts -- format`) and edited in the editor keeps a readable history. A field that is absent
  has its default; a field this page does not list is a fault (a typo is never silently ignored).
- **Versioned.** `version` is 1. A game refuses a file of a later version and says so.

## Conventions

- **Lengths** are centimetres, **speeds** cm/s, **angles** degrees.
- **The top view.** x goes to the right and y down the table, towards the player; (0, 0) is the top left corner of the playfield.
  An angle of 0 points right, 90 points down the table, -90 up the table.
- **Heights.** z is the height above the playfield. Every element has a `z`, the level it stands on: 0 on the playfield, 5 on
  a floor whose `z` is 5. The physics is in three dimensions: a ball can climb, ride a rail above the playfield, fall, jump over a wall.
- **Paths.** A wall, a ramp or a floor follows a path drawn in the top view: a row `[x, y]` per point. A row `[x, y, bulge]` makes the
  stretch from that point to the next an arc: the bulge is the height of the arc over half its chord (0.4142 a quarter circle,
  1 a half circle), positive when the arc is to the left of the direction of travel as the top view shows it. A ramp adds a **profile**: its
  height along the path, as rows `[fraction of the length, height]`. An editor shows a path as a line with handles and a profile as a curve.
- **Names.** Elements, lights, surfaces, looks, sounds and missions have an `id`; other fields refer to them by it, and the name must exist.
  A `group` is a name several elements share. `"game"` stands for the game itself in rules.
- **Colours** are `"#rrggbb"`.
- **Roles.** The type of some fields ends with a role in brackets: what its numbers stand for in space. An editor draws, moves and turns
  any element by the roles of its fields, without knowing their names.
  *point*: a place of the top view, [x, y]; with a third number, its height z above the playfield.
  *path*: a line of the top view: rows [x, y], or [x, y, bulge] when the stretch to the next point is an arc.
  *area*: an outline of the top view, written as a path whose last point joins the first by itself: what it encloses is the thing.
  *direction*: an angle of the top view: 0 points right, 90 down the table.
  *profile*: a height along a path: rows [fraction of the length, height].
  *rotation*: a turn in space, [around x, around y, around z]; the third number turns the thing in the top view, as a direction does.
  *offset*: a step counted from the element's own place, [dx, dy] or [dx, dy, dz]: it turns and mirrors with its element, and does not move when the element moves.
  *radius*: a distance around the thing's point, a circle in the top view (how far a light's glow reaches): an editor shows the circle and lets it be pulled.
  *level*: the height of the level a thing stands on: 0 on the playfield, the `z` of an upper playfield on that one. An editor that works on one level shows and places things by it.

## table

A table file.

| field | type | default | |
|---|---|---|---|
| `format` | `"zinc-pinball-table"` | required | What this file is. |
| `version` | whole number | required | The version of the format the file is written in. |
| `name` | text | required | The name of the table. |
| `author` | text | `""` | Who made it. |
| `description` | text | `""` | A line about it. |
| `credits` | list of [credit](#credit) |  | The authors and licences of the files the table uses (sounds, images, models). |
| `playfield` | [playfield](#playfield) |  | The board. |
| `physics` | [physics](#physics) |  | How it plays. |
| `surfaces` | list of [surface](#surface) |  | The surfaces elements are made of. |
| `looks` | list of [look](#look) |  | The looks elements are given. |
| `sounds` | list of [sound](#sound) |  | The sounds. |
| `music` | [music](#music) |  | The music. |
| `walls` | list of [wall](#wall) |  | Walls, guides, posts. |
| `gates` | list of [gate](#gate) |  | One-way gates. |
| `flippers` | list of [flipper](#flipper) |  | Flippers. |
| `plunger` | [plunger](#plunger) | required | The plunger. |
| `bumpers` | list of [bumper](#bumper) |  | Pop bumpers. |
| `slingshots` | list of [slingshot](#slingshot) |  | Slingshots. |
| `kickers` | list of [kicker](#kicker) |  | Kickers, saucers, holes. |
| `targets` | list of [target](#target) |  | Standup and drop targets. |
| `rollovers` | list of [rollover](#rollover) |  | Rollover switches. |
| `spinners` | list of [spinner](#spinner) |  | Spinners. |
| `ramps` | list of [ramp](#ramp) |  | Ramps, rails, habitrails. |
| `floors` | list of [floor](#floor) |  | Upper playfields. |
| `lights` | list of [light](#light) |  | Lights. |
| `models` | list of [model](#model) |  | Modelled and decorative pieces. |
| `rules` | [rules](#rules) |  | The rules. |
| `lighting` | [lighting](#lighting) |  | The light of the scene. |
| `layouts` | [layouts](#layouts) |  | The screen layouts. |

A whole file: the `table.json` of "Tidal Lock", in `examples/pinball3d/assets/tables/`.

## credit

Who made some files of the table and under what licence. The game does not read it: it travels with the table, for whoever shares it or builds on it.

| field | type | default | |
|---|---|---|---|
| `files` | list of texts |  | The files of the table folder it speaks of. |
| `author` | text | required | Who made them. |
| `source` | text | `""` | Where they come from: an address, or the script that made them. |
| `licence` | text | required | Their licence, by its name. |

```json
{
  "files": ["sounds/flipper-up.mp3", "sounds/flipper-down.mp3"],
  "author": "schafferdavid (freesound.org)",
  "source": "https://freesound.org/people/schafferdavid/sounds/450270/",
  "licence": "CC0 1.0"
}
```

## playfield

The board the ball rolls on: a rectangle from (0, 0) at the top left to (width, length) at the bottom right, where the drain is. A ball that passes the bottom edge is lost.

| field | type | default | |
|---|---|---|---|
| `width` | number, cm | `51` (20 to 200) | Left to right. |
| `length` | number, cm | `107` (40 to 400) | Top to bottom. |
| `slope` | number, degrees | `6.5` (0 to 45) | The tilt of the table in degrees: how hard the ball is pulled towards the player. |
| `glass` | number, cm | `12` (3 to 100) | The height of the glass above the playfield: a ball that jumps cannot go higher. |
| `surface` | name of surfaces | none | What the ball feels: friction and bounce. Usually smooth wood. |
| `look` | name of looks | none | What it looks like. The colour or the image of the board. |

```json
"playfield": { "glass": 9.5, "surface": "wood", "look": "board" }
```

## physics

How the table plays. The numbers are real ones at first; a table tuned for arcade play raises gravity and kicks.

| field | type | default | |
|---|---|---|---|
| `rate` | whole number, steps/s | `960` (240 to 4000) | Steps of the simulation per second. Fast flippers and a small ball need many: under 480 a slow ball can end behind a flipper. |
| `gravity` | number, cm/s2 | `981` (100 to 5000) | cm/s² straight down. The slope of the playfield sends its share down the table. |
| `maxSpeed` | number, cm/s | `700` (100 to 4000) | The fastest a ball may go; kicks that would exceed it are capped. |
| `nudge` | number, cm/s | `35` (0 to 400) | The speed a bump of the table gives every ball. |
| `ball` | [ball](#ball) |  | The ball. |

```json
"physics": { "ball": { "look": "chrome", "sounds": { "roll": "ballRoll", "hit": "ballClack", "land": "ballLand", "knock": "ballKnock" } } }
```

## ball

The ball.

| field | type | default | |
|---|---|---|---|
| `radius` | number, cm | `1.35` (0.5 to 5) | A real pinball is 27 mm across. |
| `mass` | number, grams | `80` (1 to 1000) | In grams. Only its ratio to the strength of kicks and flippers matters. |
| `friction` | number | `0.25` (0 to 2) | Its grip on what it touches: more grip turns sliding into spin sooner. |
| `restitution` | number | `0.3` (0 to 1.2) | Its bounce when two balls meet. |
| `drag` | number, per second | `0.05` (0 to 5) | How fast it loses speed by itself, per second. |
| `spin` | number, per second | `0.05` (0 to 5) | How fast it loses spin by itself, per second. |
| `look` | name of looks | none | Usually chrome. |
| `sounds` | [ball sounds](#ball-sounds) |  | Its sounds. |

```json
"ball": { "look": "chrome", "sounds": { "roll": "ballRoll", "hit": "ballClack", "land": "ballLand", "knock": "ballKnock" } }
```

## ball sounds

The sound of each event of a ball (names of `sounds`); an event without a name is silent.

| field | type | default | |
|---|---|---|---|
| `roll` | name of sounds | none | While it rolls: played in a loop (give it `loop`), louder and higher as the ball goes faster. |
| `hit` | name of sounds | none | When two balls meet. |
| `land` | name of sounds | none | When it falls on the playfield or on a floor. |
| `knock` | name of sounds | none | When it hits something that names no sound of its own: a flipper, the side of a ramp, a model, the glass. |

```json
"sounds": { "roll": "ballRoll", "hit": "ballClack", "land": "ballLand", "knock": "ballKnock" }
```

## surface

A surface as the ball feels it. Elements name one in their `surface`.

| field | type | default | |
|---|---|---|---|
| `id` | text | required | Its name. |
| `friction` | number | `0.3` (0 to 2) | Grip, 0 (ice) to 1 (rubber). Of two things in contact the friction is the geometric mean. |
| `restitution` | number | `0.4` (0 to 1.2) | Bounce, 0 (dead) to 1 (loses nothing). Of two things in contact the larger counts. |

```json
{ "id": "wood", "friction": 0.2, "restitution": 0.3 }
```

## look

A material as the eye sees it. Elements name one in their `look`.

| field | type | default | |
|---|---|---|---|
| `id` | text | required | Its name. |
| `color` | colour | `"#b0b8c0"` | The base colour. |
| `shading` | `"smooth"` `"flat"` `"unlit"` | `"smooth"` | smooth: lit, rounded; flat: lit, faceted; unlit: the colour as it is (signs, glowing parts). |
| `specular` | colour | `"#000000"` | The colour of the highlights (metal, glass); black for none. |
| `shininess` | number | `30` (1 to 1000) | How tight the highlights are: 5 is satin, 200 is chrome. |
| `glow` | colour | `"#000000"` | The colour the element takes when it is lit (a bumper that fires, a target that is the next step of a mission); black: it does not light. |
| `texture` | image file | none | An image of the table folder (PNG or JPEG) laid flat over the element as the top view shows it: its corners at the corners of the box around the element (the painting of a playfield, of a floor, of a bumper's cap). A model keeps the mapping of its mesh. |
| `textureLit` | image file | none | The same image painted with the lights of the table lit. For the look of the playfield, when the painting itself must change under a light: the pool of light of each light of the playfield that is on (a light's `glow`) then shows this image instead of adding the light's colour, and two such pools should not overlap. Usually left out. |

```json
{ "id": "board", "color": "#c4c8d6", "texture": "art/playfield.jpg" }
```

## sound

A sound: a recorded file of the table folder, or a tone generated when the table loads. Elements name one per event in their `sounds`.

| field | type | default | |
|---|---|---|---|
| `id` | text | required | Its name. |
| `file` | sound file | none | A WAV, FLAC, MP3 or Ogg Vorbis file of the table folder. Empty: the sound is the generated tone below. |
| `wave` | `"sine"` `"square"` `"triangle"` `"sawtooth"` `"noise"` | `"sine"` | The shape of the generated tone. |
| `hz` | number, Hz | `440` (20 to 20000) | The pitch of the generated tone. |
| `seconds` | number, seconds | `0.1` (0.01 to 60) | The length of the generated tone. |
| `volume` | number | `1` (0 to 4) | How loud it plays, 1 as recorded. |
| `volumeVariation` | number | `0` (0 to 1) | Each play is louder or softer by up to this share (0.2: 80 % to 120 %), so that repeated hits do not sound stamped. |
| `pitch` | number | `1` (0.25 to 4) | How fast it plays: 2 is an octave up. |
| `pitchVariation` | number | `0` (0 to 1) | Each play is higher or lower by up to this share. |
| `loop` | true / false | `false` | Played again when it ends (music, the ball rolling). |

```json
{ "id": "flipperUp", "file": "sounds/flipper-up.mp3", "volume": 0.9, "volumeVariation": 0.1, "pitchVariation": 0.05 }
```

## music

The music of each state of the game (names of `sounds`, usually with `loop`).

| field | type | default | |
|---|---|---|---|
| `attract` | name of sounds | none | While the table waits for a player. |
| `play` | name of sounds | none | During a ball. |
| `multiball` | name of sounds | none | During multiball. |
| `gameOver` | name of sounds | none | After the last ball. |

```json
"music": { "attract": "musicAttract", "play": "musicPlay", "multiball": "musicMultiball", "gameOver": "musicOver" }
```

## wall

A wall, a guide or a lane divider: a path seen from above, raised to a height. Posts and rubbers are short walls with another surface.

| field | type | default | |
|---|---|---|---|
| `id` | text | required | The name of the wall: rules, the editor and the event log use it. Unique among all the elements of the table. |
| `group` | text | `""` | A name shared by several elements, so that one rule speaks of all of them ("pops", "lanes"). |
| `points` | rows of 2 or 3 numbers, cm (*path*) | required | The path: [x, y] for each point, or [x, y, bulge] when the stretch to the next point is an arc (bulge = sagitta / half chord: 0.4142 is a quarter circle, 1 a half circle; positive curves to the left of the direction of travel as seen in the top view). |
| `closed` | true / false | `false` | The last point joins the first. |
| `z` | number, cm (*level*) | `0` (0 to 100) | The height of its foot above the playfield (an upper level stands on its own floor). |
| `height` | number, cm | `2.6` (0.2 to 100) | How tall it is. A ball that jumps higher passes over. |
| `thickness` | number, cm | `0.3` (0.1 to 10) | How thick it is. |
| `surface` | name of surfaces | none | What the ball feels: friction and bounce. Metal by default. |
| `look` | name of looks | none | What it looks like. Metal by default. |
| `sounds` | [wall sounds](#wall-sounds) |  | Its sounds. |

```json
{ "id": "outer", "points": [[1, 92], [1, 27, 1], [50, 27], [50, 106]], "surface": "metal", "look": "steel", "sounds": { "hit": "steel" } }
```

## wall sounds

The sound of each event of a wall (names of `sounds`); an event without a name is silent.

| field | type | default | |
|---|---|---|---|
| `hit` | name of sounds | none | When the ball hits it. |

```json
"sounds": { "hit": "steel" }
```

## gate

A one-way gate across a lane: the ball passes when it comes from the left of the direction a to b (as seen in the top view), and is stopped from the other side.

| field | type | default | |
|---|---|---|---|
| `id` | text | required | The name of the gate: rules, the editor and the event log use it. Unique among all the elements of the table. |
| `group` | text | `""` | A name shared by several elements, so that one rule speaks of all of them ("pops", "lanes"). |
| `a` | 2 numbers, cm (*point*) | required | One end. |
| `b` | 2 numbers, cm (*point*) | required | The other end. |
| `z` | number, cm (*level*) | `0` (0 to 100) | The height of its foot. |
| `height` | number, cm | `2.6` (0.2 to 100) | How tall it is. |
| `surface` | name of surfaces | none | What the ball feels: friction and bounce.  |
| `look` | name of looks | none | What it looks like. A wire by default. |
| `sounds` | [gate sounds](#gate-sounds) |  | Its sounds. |

```json
{ "id": "laneGate", "a": [50, 28.5], "b": [46.7, 28.5], "look": "wire", "sounds": { "pass": "gateClick" } }
```

## gate sounds

The sound of each event of a gate (names of `sounds`); an event without a name is silent.

| field | type | default | |
|---|---|---|---|
| `pass` | name of sounds | none | When a ball goes through. |

```json
"sounds": { "pass": "gateClick" }
```

## flipper

A flipper: a tapered bat that turns around its pivot while its button is held.

| field | type | default | |
|---|---|---|---|
| `id` | text | required | The name of the flipper: rules, the editor and the event log use it. Unique among all the elements of the table. |
| `group` | text | `""` | A name shared by several elements, so that one rule speaks of all of them ("pops", "lanes"). |
| `pivot` | 2 numbers, cm (*point*) | required | Where it turns. |
| `z` | number, cm (*level*) | `0` (0 to 100) | The height of its foot (a flipper of an upper level stands on that level). |
| `length` | number, cm | `7.6` (2 to 30) | From the pivot to the tip. |
| `baseRadius` | number, cm | `0.9` (0.2 to 5) | Its radius at the pivot. |
| `tipRadius` | number, cm | `0.45` (0.1 to 5) | Its radius at the tip. |
| `height` | number, cm | `1.6` (0.5 to 10) | How tall it is. |
| `rest` | number, degrees (*direction*) | `25` (-360 to 360) | The angle of the bat at rest: 0 points right, 90 down the table. A left flipper rests near 25, a right one near 155. |
| `stroke` | number, degrees | `-50` (-180 to 180) | How far it swings when the button is pressed, in degrees: negative turns up for a left flipper, positive for a right one. |
| `speed` | number, degrees/s | `2300` (100 to 10000) | How fast it swings, degrees per second. This is the strength of the flipper: the ball leaves with the speed of the spot that hits it. |
| `returnSpeed` | number, degrees/s | `1100` (100 to 10000) | How fast it falls back when the button is released. |
| `button` | `"left"` `"right"` | `"left"` | The flipper button that drives it. |
| `surface` | name of surfaces | none | What the ball feels: friction and bounce. Rubber by default. |
| `look` | name of looks | none | What it looks like.  |
| `sounds` | [flipper sounds](#flipper-sounds) |  | Its sounds. |

```json
{ "id": "left", "group": "flippers", "pivot": [14.4, 94], "surface": "bat", "look": "bat", "sounds": { "up": "flipperUp", "down": "flipperDown" } }
```

## flipper sounds

The sound of each event of a flipper (names of `sounds`); an event without a name is silent.

| field | type | default | |
|---|---|---|---|
| `up` | name of sounds | none | When it swings. |
| `down` | name of sounds | none | When it falls back. |

```json
"sounds": { "up": "flipperUp", "down": "flipperDown" }
```

## plunger

The plunger: it is pulled back while its button is held, and released it strikes the ball that waits in front of it.

| field | type | default | |
|---|---|---|---|
| `at` | 2 numbers, cm (*point*) | required | The centre of its tip at rest. A new ball is put just in front of it. |
| `z` | number, cm (*level*) | `0` (0 to 100) | The height of its foot. |
| `angle` | number, degrees (*direction*) | `-90` (-360 to 360) | The direction it shoots: -90 is up the table. |
| `travel` | number, cm | `5` (0.5 to 30) | How far it can be pulled back. |
| `pullTime` | number, seconds | `0.9` (0.05 to 10) | Seconds to pull it all the way. |
| `speed` | number, cm/s | `450` (50 to 4000) | The speed of the tip when released from a full pull; a shorter pull gives less. |
| `width` | number, cm | `2.2` (0.5 to 20) | The width of its tip. |
| `height` | number, cm | `2.2` (0.5 to 20) | The height of its tip. |
| `surface` | name of surfaces | none | What the ball feels: friction and bounce.  |
| `look` | name of looks | none | What it looks like.  |
| `sounds` | [plunger sounds](#plunger-sounds) |  | Its sounds. |

```json
"plunger": { "at": [48.35, 100], "speed": 480, "surface": "metal", "look": "steel", "sounds": { "pull": "plungerPull", "release": "plungerShot" } }
```

## plunger sounds

The sound of each event of a plunger (names of `sounds`); an event without a name is silent.

| field | type | default | |
|---|---|---|---|
| `pull` | name of sounds | none | While it is pulled. |
| `release` | name of sounds | none | When it is released. |

```json
"sounds": { "pull": "plungerPull", "release": "plungerShot" }
```

## bumper

A pop bumper: a round post that kicks the ball away when it is touched.

| field | type | default | |
|---|---|---|---|
| `id` | text | required | The name of the bumper: rules, the editor and the event log use it. Unique among all the elements of the table. |
| `group` | text | `""` | A name shared by several elements, so that one rule speaks of all of them ("pops", "lanes"). |
| `at` | 2 numbers, cm (*point*) | required | Its centre. |
| `z` | number, cm (*level*) | `0` (0 to 100) | The height of its foot. |
| `radius` | number, cm | `2.6` (0.5 to 20) | The radius of its body. |
| `height` | number, cm | `3.2` (0.5 to 50) | How tall it is. |
| `kick` | number, cm/s | `140` (0 to 2000) | The speed it adds to the ball, away from its centre. |
| `threshold` | number, cm/s | `15` (0 to 1000) | The ball must arrive at least this fast to set it off. |
| `surface` | name of surfaces | none | What the ball feels: friction and bounce.  |
| `look` | name of looks | none | What it looks like. The body; its `glow` shows when it fires. |
| `cap` | name of looks | none | The look of its cap. |
| `light` | name of lights | none | A light that lights its body: its look's `glow` also shows while that light is lit. |
| `sounds` | [bumper sounds](#bumper-sounds) |  | Its sounds. |

```json
{
  "id": "pop1",
  "group": "pops",
  "at": [17.5, 31],
  "surface": "rubber",
  "look": "pop",
  "cap": "popCap",
  "light": "popsLight",
  "sounds": { "hit": "bumper" }
}
```

## bumper sounds

The sound of each event of a bumper (names of `sounds`); an event without a name is silent.

| field | type | default | |
|---|---|---|---|
| `hit` | name of sounds | none | When it fires. |

```json
"sounds": { "hit": "bumper" }
```

## slingshot

A slingshot: a rubber band stretched from a to b that kicks the ball away, to the left of the direction a to b (as seen in the top view).

| field | type | default | |
|---|---|---|---|
| `id` | text | required | The name of the slingshot: rules, the editor and the event log use it. Unique among all the elements of the table. |
| `group` | text | `""` | A name shared by several elements, so that one rule speaks of all of them ("pops", "lanes"). |
| `a` | 2 numbers, cm (*point*) | required | One end of the band. |
| `b` | 2 numbers, cm (*point*) | required | The other end. |
| `z` | number, cm (*level*) | `0` (0 to 100) | The height of its foot. |
| `height` | number, cm | `2.2` (0.2 to 50) | How tall the band is. |
| `thickness` | number, cm | `0.5` (0.1 to 10) | How thick the band is. |
| `kick` | number, cm/s | `120` (0 to 2000) | The speed it adds to the ball. |
| `threshold` | number, cm/s | `25` (0 to 1000) | The ball must arrive at least this fast to set it off. |
| `surface` | name of surfaces | none | What the ball feels: friction and bounce. Rubber by default. |
| `look` | name of looks | none | What it looks like. Its `glow` shows when it fires. |
| `light` | name of lights | none | A light that lights it: its look's `glow` also shows while that light is lit. |
| `sounds` | [slingshot sounds](#slingshot-sounds) |  | Its sounds. |

```json
{ "id": "slingLeft", "group": "slings", "a": [8.9, 71.6], "b": [13.3, 84], "surface": "rubber", "look": "band", "sounds": { "hit": "slingshot" } }
```

## slingshot sounds

The sound of each event of a slingshot (names of `sounds`); an event without a name is silent.

| field | type | default | |
|---|---|---|---|
| `hit` | name of sounds | none | When it fires. |

```json
"sounds": { "hit": "slingshot" }
```

## kicker

A hole that catches the ball, holds it, then throws it out: a saucer (same place), a subway (it comes out elsewhere), or a launcher that throws it in the air.

| field | type | default | |
|---|---|---|---|
| `id` | text | required | The name of the kicker: rules, the editor and the event log use it. Unique among all the elements of the table. |
| `group` | text | `""` | A name shared by several elements, so that one rule speaks of all of them ("pops", "lanes"). |
| `at` | 2 numbers, cm (*point*) | required | Its centre. |
| `z` | number, cm (*level*) | `0` (0 to 100) | The height of the level it is in. |
| `radius` | number, cm | `1.7` (0.5 to 20) | The radius of the hole. |
| `captureSpeed` | number, cm/s | `220` (10 to 4000) | A ball faster than this rolls over the hole. |
| `hold` | number, seconds | `1.2` (0 to 60) | Seconds it keeps the ball (rules may keep it longer: a lock). |
| `exit` | 3 numbers, cm (*offset*) | `[0, 0, 0]` | Where the ball comes out, counted from the hole: [0, 0, 0] is the hole itself, [0, 0, 6] the same place on a level 6 cm higher. |
| `speed` | number, cm/s | `180` (0 to 4000) | The speed it throws the ball at. |
| `angle` | number, degrees (*direction*) | `90` (-360 to 360) | The direction it throws the ball in, in the top view. |
| `elevation` | number, degrees | `0` (0 to 90) | How steeply upwards it throws the ball, in degrees: 0 rolls it out, 45 throws it in an arc. |
| `look` | name of looks | none | The look of its rim. |
| `light` | name of lights | none | A light that the kicker turns on while it holds a ball. |
| `sounds` | [kicker sounds](#kicker-sounds) |  | Its sounds. |

```json
{
  "id": "dock",
  "at": [40.5, 24.5],
  "captureSpeed": 230,
  "hold": 1,
  "exit": [-2.4, -18.3, 5.5],
  "speed": 40,
  "look": "dock",
  "light": "dockLight",
  "sounds": { "capture": "dockClamp", "eject": "dockThrow" }
}
```

## kicker sounds

The sound of each event of a kicker (names of `sounds`); an event without a name is silent.

| field | type | default | |
|---|---|---|---|
| `capture` | name of sounds | none | When it catches a ball. |
| `eject` | name of sounds | none | When it throws it out. |

```json
"sounds": { "capture": "dockClamp", "eject": "dockThrow" }
```

## target

A target: a small plate the ball hits. A standup stays; a drop target goes down when hit and stays down until a rule raises it.

| field | type | default | |
|---|---|---|---|
| `id` | text | required | The name of the target: rules, the editor and the event log use it. Unique among all the elements of the table. |
| `group` | text | `""` | A name shared by several elements, so that one rule speaks of all of them ("pops", "lanes"). |
| `kind` | `"standup"` `"drop"` | `"standup"` | standup or drop. |
| `at` | 2 numbers, cm (*point*) | required | The centre of its face. |
| `z` | number, cm (*level*) | `0` (0 to 100) | The height of its foot. |
| `angle` | number, degrees (*direction*) | `90` (-360 to 360) | The direction its face looks at: 90 faces down the table. |
| `width` | number, cm | `2.4` (0.5 to 20) | How wide it is. |
| `height` | number, cm | `2.4` (0.5 to 20) | How tall it is. |
| `thickness` | number, cm | `0.5` (0.1 to 5) | How thick it is. |
| `surface` | name of surfaces | none | What the ball feels: friction and bounce. Plastic by default. |
| `look` | name of looks | none | What it looks like. Its `glow` shows when it is lit. |
| `light` | name of lights | none | A light on the playfield that goes with it (rules light it by this name or by the target's); the target's `glow` also shows while it is lit. |
| `sounds` | [target sounds](#target-sounds) |  | Its sounds. |

```json
{
  "id": "drop1",
  "group": "bank",
  "kind": "drop",
  "at": [3, 48],
  "angle": 0,
  "width": 2.8,
  "surface": "plastic",
  "look": "amber",
  "sounds": { "hit": "shieldDown", "reset": "shieldUp" }
}
```

## target sounds

The sound of each event of a target (names of `sounds`); an event without a name is silent.

| field | type | default | |
|---|---|---|---|
| `hit` | name of sounds | none | When the ball hits it. |
| `reset` | name of sounds | none | When it is raised again. |

```json
"sounds": { "hit": "shieldDown", "reset": "shieldUp" }
```

## rollover

A switch in the playfield that a ball rolling over it closes: the line from a to b across a lane.

| field | type | default | |
|---|---|---|---|
| `id` | text | required | The name of the rollover: rules, the editor and the event log use it. Unique among all the elements of the table. |
| `group` | text | `""` | A name shared by several elements, so that one rule speaks of all of them ("pops", "lanes"). |
| `a` | 2 numbers, cm (*point*) | required | One end of the line. |
| `b` | 2 numbers, cm (*point*) | required | The other end. |
| `z` | number, cm (*level*) | `0` (0 to 100) | The height of the level it is in. |
| `light` | name of lights | none | A light that goes with it. |
| `sounds` | [rollover sounds](#rollover-sounds) |  | Its sounds. |

```json
{ "id": "lane1", "group": "lanes", "a": [17.4, 16], "b": [21.1, 16], "light": "laneLight1", "sounds": { "roll": "laneChime" } }
```

## rollover sounds

The sound of each event of a rollover (names of `sounds`); an event without a name is silent.

| field | type | default | |
|---|---|---|---|
| `roll` | name of sounds | none | When a ball rolls over it. |

```json
"sounds": { "roll": "laneChime" }
```

## spinner

A spinner: a plate hung across a lane that a ball passing under sets spinning; every half turn is an event.

| field | type | default | |
|---|---|---|---|
| `id` | text | required | The name of the spinner: rules, the editor and the event log use it. Unique among all the elements of the table. |
| `group` | text | `""` | A name shared by several elements, so that one rule speaks of all of them ("pops", "lanes"). |
| `a` | 2 numbers, cm (*point*) | required | One end of its axle. |
| `b` | 2 numbers, cm (*point*) | required | The other end. |
| `z` | number, cm (*level*) | `0` (0 to 100) | The height of the level it is in. |
| `height` | number, cm | `3` (1 to 20) | The height of the plate. |
| `turns` | number | `0.02` (0 to 1) | Half turns per second it gains for each cm/s of the ball that passes. |
| `damping` | number, per second | `1.1` (0.05 to 20) | How fast it slows, per second. |
| `look` | name of looks | none | The look of its plate. |
| `sounds` | [spinner sounds](#spinner-sounds) |  | Its sounds. |

```json
{ "id": "spinner", "a": [41.3, 42], "b": [46.4, 42], "look": "steel", "sounds": { "spin": "spinTick" } }
```

## spinner sounds

The sound of each event of a spinner (names of `sounds`); an event without a name is silent.

| field | type | default | |
|---|---|---|---|
| `spin` | name of sounds | none | At every half turn. |

```json
"sounds": { "spin": "spinTick" }
```

## ramp

A ramp, a rail or a habitrail: a track that follows a path seen from above while its height follows a profile. The ball climbs it, rides it above the playfield and leaves it where it ends, or flies off its lip.

| field | type | default | |
|---|---|---|---|
| `id` | text | required | The name of the ramp: rules, the editor and the event log use it. Unique among all the elements of the table. |
| `group` | text | `""` | A name shared by several elements, so that one rule speaks of all of them ("pops", "lanes"). |
| `points` | rows of 2 or 3 numbers, cm (*path*) | required | The centre line seen from above, as for a wall (arcs by bulge). |
| `profile` | rows of 2 numbers (*profile*) | required | The height along the path: [fraction of the length, height] from [0, ...] to [1, ...], straight between the rows. [[0, 0], [0.3, 5], [1, 5]] climbs to 5 cm over the first third, then stays level. |
| `width` | number, cm | `3.6` (1 to 50) | The width of the track between its side walls. |
| `wall` | number, cm | `1.6` (0 to 20) | The height of the side walls above the track; 0 for none (a jump ramp). |
| `thickness` | number, cm | `0.2` (0.05 to 5) | How thick the track is. |
| `style` | `"solid"` `"wire"` | `"solid"` | solid: a plastic or metal ramp; wire: a habitrail, drawn as wires. |
| `skirt` | true / false | `true` | A solid ramp is closed underneath wherever it is too low for a ball to pass: its sides go down to the playfield and a lip closes the gap, so that no ball wedges under it. false leaves it open (a ramp that starts from an upper level). |
| `surface` | name of surfaces | none | What the ball feels: friction and bounce. Plastic by default. |
| `look` | name of looks | none | What it looks like.  |
| `sounds` | [ramp sounds](#ramp-sounds) |  | Its sounds. |

```json
{
  "id": "ramp",
  "points": [[36, 64], [36, 34, -1], [7.4, 34], [7.4, 40]],
  "profile": [[0, 0], [0.28, 4.3], [0.36, 5.2], [0.44, 5.5], [1, 5.5]],
  "wall": 2.6,
  "surface": "plastic",
  "look": "ramp",
  "sounds": { "enter": "rampWhoosh", "exit": "gateClick" }
}
```

## ramp sounds

The sound of each event of a ramp (names of `sounds`); an event without a name is silent.

| field | type | default | |
|---|---|---|---|
| `enter` | name of sounds | none | When a ball enters at its first point. |
| `exit` | name of sounds | none | When a ball leaves at its last point. |

```json
"sounds": { "enter": "rampWhoosh", "exit": "gateClick" }
```

## floor

A level above the playfield: an upper playfield or a platform, whose outline is a closed path and whose top is at height z. Walls, flippers, targets and the rest stand on it by their own z.

| field | type | default | |
|---|---|---|---|
| `id` | text | required | The name of the floor: rules, the editor and the event log use it. Unique among all the elements of the table. |
| `group` | text | `""` | A name shared by several elements, so that one rule speaks of all of them ("pops", "lanes"). |
| `points` | rows of 2 or 3 numbers, cm (*area*) | required | The outline seen from above (closed by itself), as for a wall. |
| `z` | number, cm | `5` (0.5 to 100) | The height of its top. |
| `thickness` | number, cm | `0.4` (0.1 to 10) | How thick it is. |
| `surface` | name of surfaces | none | What the ball feels: friction and bounce.  |
| `look` | name of looks | none | What it looks like.  |

```json
{ "id": "deck", "points": [[36, 3.2], [50.2, 3.2], [50.2, 24], [36, 24]], "z": 5.5, "surface": "wood", "look": "deckBoard" }
```

## light

A lamp under the playfield or on an element, that the rules turn on, off or blink.

| field | type | default | |
|---|---|---|---|
| `id` | text | required | Its name. |
| `group` | text | `""` | A name shared by several lights ("lanes", "mission"). |
| `at` | 2 numbers, cm (*point*) | required | Its centre. |
| `z` | number, cm (*level*) | `0` (0 to 100) | The height of the level it is in. |
| `shape` | `"round"` `"arrow"` `"bar"` | `"round"` | The shape of the insert. |
| `size` | number, cm | `1.1` (0.2 to 20) | Its radius, or half its length. |
| `angle` | number, degrees (*direction*) | `-90` (-360 to 360) | Where an arrow points, or how a bar lies. |
| `color` | colour | `"#ffcc33"` | Its colour when on; off, it shows a dark shade of it. |
| `glow` | number, cm (*radius*) | `0` (0 to 30) | How far around it its light falls when it is on: the radius of its pool of light on the level it is in (the playfield, or the upper playfield at its `z`), where its colour is added to what is under it, strongest at the light and nothing at this distance. Pools add up where they overlap. 0: only the insert lights up. |

```json
{ "id": "laneLight1", "group": "lanes", "at": [19.25, 22.2], "color": "#66f0ff", "glow": 3 }
```

## model

A modelled or decorative piece: a mesh file, or a simple solid.

| field | type | default | |
|---|---|---|---|
| `id` | text | required | The name of the model: rules, the editor and the event log use it. Unique among all the elements of the table. |
| `group` | text | `""` | A name shared by several elements, so that one rule speaks of all of them ("pops", "lanes"). |
| `mesh` | model file | none | An OBJ file of the table folder. Empty: the solid named by `shape`. |
| `shape` | `"box"` `"cylinder"` `"sphere"` `"cone"` | `"box"` | The solid, 1 cm in size before `scale`. |
| `at` | 3 numbers, cm (*point*) | required | Where its origin is: [x, y, z]. |
| `rotation` | 3 numbers, degrees (*rotation*) | `[0, 0, 0]` | Its turn in degrees around x, y (down the table) and z (up). |
| `scale` | 3 numbers | `[1, 1, 1]` | Its size along x, y and z. |
| `collide` | `"none"` `"box"` `"hull"` | `"none"` | none: the ball goes through (decoration); box: it meets its bounding box; hull: its convex hull. |
| `surface` | name of surfaces | none | What the ball feels: friction and bounce.  |
| `look` | name of looks | none | What it looks like.  |
| `sounds` | [model sounds](#model-sounds) |  | Its sounds. |

```json
{ "id": "giant", "shape": "sphere", "at": [5.2, 5.6, 0], "scale": [8.6, 8.6, 5], "look": "giant" }
```

## model sounds

The sound of each event of a model (names of `sounds`); an event without a name is silent.

| field | type | default | |
|---|---|---|---|
| `hit` | name of sounds | none | When the ball hits it (a model that collides); without a name, the ball's `knock`. |

```json
"sounds": { "hit": "steel" }
```

## rules

How the table is played and scored. Everything here is data: the game has no rule of its own.

| field | type | default | |
|---|---|---|---|
| `balls` | whole number | `3` (1 to 10) | Balls per game. |
| `ballSave` | number, seconds | `8` (0 to 120) | Seconds after a launch during which a drained ball comes back. |
| `extraBalls` | whole number | `3` (0 to 10) | Extra balls one game can hold. |
| `multiplierMax` | whole number | `5` (1 to 100) | The highest bonus multiplier. |
| `tilt` | [tilt](#tilt) |  | Bumps and tilt. |
| `ranks` | list of texts |  | The ranks, from the first: finishing a mission promotes to the next. |
| `rankLights` | name of light groups | none | A group of lights that shows the rank: one more is lit at each promotion. |
| `ballSaveLight` | name of lights | none | A light that blinks while a drained ball would come back, and stays on while an extra ball is held ("shoot again"). |
| `counters` | list of texts |  | The names of the counters the rules use (a rule can only count what is declared here). |
| `missions` | list of [mission](#mission) |  | The missions. |
| `multiball` | [multiball](#multiball) |  | Multiball. |
| `when` | list of [rule](#rule) |  | The rules. |
| `highScores` | list of [high score](#high-score) |  | The high scores the table ships with. |

```json
"rules": {
  "ranks": ["Deckhand", "Rigger", "Tug Pilot", "Dock Master", "Station Chief", "Orbit Marshal", "Tide Warden"],
  "rankLights": "ranks",
  "ballSaveLight": "shootAgain",
  "counters": ["laps", "served"],
  "missions": [
    { "id": "cargo", "name": "Cargo Run", "steps": [{ "text": "Shoot the ramp", "on": "rail", "event": "exit", "count": 2, "light": "rampArrow" }] },
    {
      "id": "sweep",
      "name": "Asteroid Sweep",
      "award": 30000,
      "steps": [{ "text": "Clear the rocks: hit the bumpers", "on": "pops", "event": "hit", "count": 12, "light": "popsLight" }]
    },
    {
      "id": "berth",
      "name": "Night Berth",
      "award": 40000,
      "steps": [
        { "text": "Open the lanes", "on": "lanes", "event": "roll", "count": 3, "light": "lanes" },
        { "text": "Bring her into the dock", "on": "dock", "event": "capture", "light": "dockLight" }
      ]
    },
    {
      "id": "flare",
      "name": "Solar Flare",
      "award": 40000,
      "steps": [{ "text": "Drop the three shields", "on": "bank", "event": "down", "count": 3, "light": "bankArrow" }]
    },
    {
      "id": "burn",
      "name": "Slingshot Burn",
      "award": 30000,
      "steps": [{ "text": "Bounce off the slingshots", "on": "slings", "event": "hit", "count": 6, "light": "slingLight" }]
    },
    {
      "id": "spin",
      "name": "Spin Up",
      "award": 35000,
      "steps": [
        { "text": "Spin the turbine", "on": "spinner", "event": "spin", "count": 20, "light": "spinArrow" },
        { "text": "Ride the ramp home", "on": "rail", "event": "exit", "light": "rampArrow" }
      ]
    }
  ],
  "multiball": { "lockLights": "locks", "jackpotOn": "rail", "jackpotEvent": "exit" },
  "when": [
    { "on": "pops", "event": "hit", "do": [{ "do": "score", "value": 500 }, { "do": "bonus", "value": 100 }] },
    { "on": "slings", "event": "hit", "do": [{ "do": "score", "value": 110 }] },
    {
      "on": "lanes",
      "event": "roll",
      "if": [{ "test": "lights", "target": "self", "is": "off" }],
      "do": [{ "do": "light", "target": "self", "mode": "on" }, { "do": "score", "value": 1000 }]
    },
    { "on": "lanes", "event": "roll", "do": [{ "do": "score", "value": 300 }, { "do": "bonus", "value": 250 }] },
    {
      "on": "lanes",
      "event": "roll",
      "if": [{ "test": "lights", "target": "lanes", "is": "on" }],
      "do": [
        { "do": "multiplier", "value": 1 },
        { "do": "light", "target": "lanes", "mode": "off" },
        { "do": "score", "value": 5000 },
        { "do": "say", "target": "LANES OPEN: BONUS UP" }
      ]
    },
    { "on": "left", "event": "flip", "do": [{ "do": "rotate", "target": "lanes", "value": -1 }] },
    { "on": "right", "event": "flip", "do": [{ "do": "rotate", "target": "lanes", "value": 1 }] },
    { "on": "bank", "event": "down", "do": [{ "do": "score", "value": 2000 }, { "do": "bonus", "value": 500 }] },
    {
      "on": "bank",
      "event": "down",
      "if": [{ "test": "targets", "target": "bank", "is": "down" }],
      "do": [{ "do": "score", "value": 10000 }, { "do": "reset", "target": "bank" }, { "do": "say", "target": "SHIELDS DOWN" }]
    },
    { "on": "stand", "event": "hit", "do": [{ "do": "score", "value": 1500 }, { "do": "bonus", "value": 200 }] },
    { "on": "spinner", "event": "spin", "do": [{ "do": "score", "value": 250 }] },
    { "on": "ramp", "event": "enter", "do": [{ "do": "score", "value": 500 }] },
    {
      "on": "rail",
      "event": "exit",
      "do": [{ "do": "score", "value": 5000 }, { "do": "bonus", "value": 1000 }, { "do": "count", "target": "laps", "value": 1 }]
    },
    {
      "on": "rail",
      "event": "exit",
      "if": [{ "test": "counter", "target": "laps", "value": 5 }],
      "do": [
        { "do": "count", "target": "laps", "mode": "set" },
        { "do": "award", "mode": "ballSave", "seconds": 15 },
        { "do": "say", "target": "FIVE LAPS: BALL SAVED" }
      ]
    },
    { "on": "inlanes", "event": "roll", "do": [{ "do": "score", "value": 400 }] },
    { "on": "outlanes", "event": "roll", "do": [{ "do": "score", "value": 2500 }] },
    {
      "on": "dock",
      "event": "capture",
      "if": [{ "test": "lights", "target": "extra", "is": "on" }],
      "do": [{ "do": "award", "mode": "extraBall" }, { "do": "light", "target": "extra", "mode": "off" }]
    },
    {
      "on": "dock",
      "event": "capture",
      "if": [{ "test": "mode", "target": "normal" }],
      "do": [{ "do": "score", "value": 3000 }, { "do": "award", "mode": "lock" }]
    },
    { "on": "dock", "event": "capture", "if": [{ "test": "mode", "target": "multiball" }], "do": [{ "do": "score", "value": 7500 }] },
    {
      "on": "game",
      "event": "rankUp",
      "if": [{ "test": "rank", "is": "equal", "value": 3 }],
      "do": [{ "do": "light", "target": "extra", "mode": "blink" }, { "do": "say", "target": "EXTRA BALL AT THE DOCK" }]
    },
    {
      "on": "game",
      "event": "rankUp",
      "if": [{ "test": "rank", "is": "equal", "value": 6 }],
      "do": [{ "do": "light", "target": "extra", "mode": "blink" }, { "do": "say", "target": "EXTRA BALL AT THE DOCK" }]
    },
    { "on": "game", "event": "multiballStart", "do": [{ "do": "say", "target": "TIDAL LOCK: MULTIBALL" }] },
    { "on": "game", "event": "jackpot", "do": [{ "do": "say", "target": "JACKPOT" }] },
    { "on": "game", "event": "tilt", "do": [{ "do": "say", "target": "TILT" }] },
    { "on": "game", "event": "start", "do": [{ "do": "sound", "target": "jingleStart" }] },
    { "on": "game", "event": "drain", "do": [{ "do": "sound", "target": "trough" }] },
    { "on": "game", "event": "ballSaved", "do": [{ "do": "sound", "target": "jingleSaved" }] },
    { "on": "game", "event": "tilt", "do": [{ "do": "sound", "target": "jingleTilt" }] },
    { "on": "game", "event": "missionDone", "do": [{ "do": "sound", "target": "jingleMission" }] },
    { "on": "game", "event": "rankUp", "do": [{ "do": "sound", "target": "jingleRank" }] },
    { "on": "game", "event": "multiballStart", "do": [{ "do": "sound", "target": "jingleMultiball" }] },
    { "on": "game", "event": "multiballEnd", "do": [{ "do": "sound", "target": "jingleCalm" }] },
    { "on": "game", "event": "jackpot", "do": [{ "do": "sound", "target": "jingleJackpot" }] },
    { "on": "game", "event": "extraBall", "do": [{ "do": "sound", "target": "jingleExtra" }] },
    { "on": "game", "event": "gameOver", "do": [{ "do": "sound", "target": "jingleOver" }] },
    { "on": "game", "event": "bump", "do": [{ "do": "sound", "target": "cabinetKnock" }] },
    { "on": "game", "event": "letter", "do": [{ "do": "sound", "target": "letterKey" }] },
    {
      "on": "game",
      "event": "ballStart",
      "if": [{ "test": "counter", "target": "served", "value": 1 }],
      "do": [{ "do": "sound", "target": "jingleBall" }]
    },
    { "on": "game", "event": "ballStart", "do": [{ "do": "count", "target": "served", "value": 1 }] },
    { "on": "game", "event": "start", "do": [{ "do": "light", "target": "gi", "mode": "on" }] },
    { "on": "game", "event": "ballStart", "do": [{ "do": "light", "target": "gi", "mode": "on" }] },
    { "on": "game", "event": "tilt", "do": [{ "do": "light", "target": "gi", "mode": "off" }] },
    { "on": "game", "event": "gameOver", "do": [{ "do": "light", "target": "gi", "mode": "off" }] },
    {
      "on": "beacons",
      "event": "hit",
      "if": [{ "test": "lights", "target": "self", "is": "off" }],
      "do": [{ "do": "light", "target": "self", "mode": "on" }, { "do": "score", "value": 2500 }]
    },
    { "on": "beacons", "event": "hit", "do": [{ "do": "score", "value": 500 }, { "do": "bonus", "value": 250 }] },
    {
      "on": "beacons",
      "event": "hit",
      "if": [{ "test": "lights", "target": "beaconLights", "is": "on" }],
      "do": [
        { "do": "score", "value": 15000 },
        { "do": "light", "target": "beaconLights", "mode": "off" },
        { "do": "multiplier", "value": 1 },
        { "do": "say", "target": "BEACONS LIT: BONUS UP" }
      ]
    },
    { "on": "tower", "event": "hit", "do": [{ "do": "score", "value": 750 }] }
  ],
  "highScores": [
    { "name": "TID", "score": 400000 },
    { "name": "ALK", "score": 300000 },
    { "name": "ZNC", "score": 200000 },
    { "name": "TUG", "score": 120000 },
    { "name": "ORE", "score": 60000 }
  ]
}
```

## tilt

Bumping the table: every bump fills a meter that empties with time; too full, the table tilts.

| field | type | default | |
|---|---|---|---|
| `warnings` | whole number | `2` (0 to 20) | Bumps in a row that only warn; the next one tilts. |
| `recovery` | number, seconds | `2.5` (0.1 to 60) | Seconds for one bump to be forgotten. |
| `penalty` | `"bonus"` `"ball"` `"none"` | `"bonus"` | bonus: the flippers die until the ball drains and its bonus is lost; ball: the same, and no ball save; none: only a warning. |

```json
"tilt": { "warnings": 1, "recovery": 4, "penalty": "ball" }
```

## mission

A mission: steps to do in order. One mission runs at a time, in the order of the list; finishing it pays its award times the rank and promotes the player.

| field | type | default | |
|---|---|---|---|
| `id` | text | required | Its name for rules. |
| `name` | text | required | Its name on the panel. |
| `award` | number | `25000` (0 to 1000000000) | Points for finishing it, multiplied by the rank number. |
| `steps` | list of [step](#step) |  | Its steps. |

```json
{ "id": "cargo", "name": "Cargo Run", "steps": [{ "text": "Shoot the ramp", "on": "rail", "event": "exit", "count": 2, "light": "rampArrow" }] }
```

## step

One step of a mission: an event to get a number of times.

| field | type | default | |
|---|---|---|---|
| `text` | text | required | What the panel asks for ("Light the three lanes"). |
| `on` | name of elements / groups / game | required | Where the event comes from. |
| `event` | `"hit"` `"down"` `"roll"` `"spin"` `"capture"` `"eject"` `"enter"` `"exit"` `"pass"` `"flip"` `"launch"` `"start"` `"ballStart"` `"drain"` `"ballSaved"` `"bump"` `"tilt"` `"missionDone"` `"rankUp"` `"multiballStart"` `"multiballEnd"` `"jackpot"` `"extraBall"` `"gameOver"` `"letter"` | required | The event. |
| `count` | whole number | `1` (1 to 1000) | How many times. |
| `light` | name of lights / light groups | none | A light, or a group, that blinks while this step is the one to do. |

```json
{ "text": "Shoot the ramp", "on": "rail", "event": "exit", "count": 2, "light": "rampArrow" }
```

## multiball

Multiball: balls locked in a kicker start it; while it lasts a shot scores the jackpot, which grows.

| field | type | default | |
|---|---|---|---|
| `balls` | whole number | `3` (2 to 8) | Balls in play when it starts. |
| `locks` | whole number | `3` (0 to 20) | Locks (award "lock") needed to start it; 0: only a rule starts it. |
| `lockLights` | name of light groups | none | A group of lights that shows the locks: one more is lit at each lock. |
| `ballSave` | number, seconds | `12` (0 to 120) | Seconds a drained ball comes back after it starts. |
| `scoreMultiplier` | number | `2` (1 to 100) | Scores are multiplied by this while it lasts. |
| `jackpotOn` | name of elements / groups / game | none | Where the jackpot shot is. |
| `jackpotEvent` | `"hit"` `"down"` `"roll"` `"spin"` `"capture"` `"eject"` `"enter"` `"exit"` `"pass"` `"flip"` `"launch"` `"start"` `"ballStart"` `"drain"` `"ballSaved"` `"bump"` `"tilt"` `"missionDone"` `"rankUp"` `"multiballStart"` `"multiballEnd"` `"jackpot"` `"extraBall"` `"gameOver"` `"letter"` | `"hit"` | The event of the jackpot shot. |
| `jackpot` | number | `20000` (0 to 1000000000) | The first jackpot. |
| `jackpotStep` | number | `5000` (0 to 1000000000) | What each jackpot adds to the next. |

```json
"multiball": { "lockLights": "locks", "jackpotOn": "rail", "jackpotEvent": "exit" }
```

## rule

When something happens, and some things hold, do some things. Rules are read in order; all that match act.

| field | type | default | |
|---|---|---|---|
| `on` | name of elements / groups / game | required | The element, or the group of elements, that the event comes from; "game" for the events of the game itself. |
| `event` | `"hit"` `"down"` `"roll"` `"spin"` `"capture"` `"eject"` `"enter"` `"exit"` `"pass"` `"flip"` `"launch"` `"start"` `"ballStart"` `"drain"` `"ballSaved"` `"bump"` `"tilt"` `"missionDone"` `"rankUp"` `"multiballStart"` `"multiballEnd"` `"jackpot"` `"extraBall"` `"gameOver"` `"letter"` | required | hit: a bumper, slingshot, target, wall or model was hit; down: a drop target went down; roll: a rollover; spin: half a turn of a spinner; capture, eject: a kicker; enter, exit: a ramp; pass: a gate; flip: a flipper; launch: the plunger. From "game": start, ballStart, drain, ballSaved, bump (the player bumps the table), tilt, missionDone, rankUp, multiballStart, multiballEnd, jackpot, extraBall, gameOver, letter (the player takes a letter of the initials that sign a high score). |
| `if` | list of [condition](#condition) |  | Every one must hold. |
| `do` | list of [action](#action) |  | What happens. |

```json
{ "on": "pops", "event": "hit", "do": [{ "do": "score", "value": 500 }, { "do": "bonus", "value": 100 }] }
```

## condition

One thing that must hold for a rule to act.

| field | type | default | |
|---|---|---|---|
| `test` | `"counter"` `"lights"` `"targets"` `"mode"` `"rank"` `"mission"` `"balls"` | required | counter: a counter against `value`; lights: every light of a name or group is on or off; targets: every drop target of a name or group is down or up; mode: the game is in normal or multiball; rank: the rank number against `value`; mission: the current mission is `target`; balls: the balls in play against `value`. |
| `target` | text | `""` | What is tested: a counter, a light or group ("self": the light of the element the event came from), a target or group, a mission, or a mode ("normal", "multiball"). |
| `is` | `"atLeast"` `"below"` `"equal"` `"on"` `"off"` `"down"` `"up"` | `"atLeast"` | The comparison. |
| `value` | number | `0` | The number compared with. |

What each `test` reads; the other fields are ignored for it:

| `test` | `target` | `is` | numbers |
|---|---|---|---|
| `counter` | one of the counters | atLeast, below, equal | `value` |
| `lights` | one of the lights or light groups, "self" | on, off |  |
| `targets` | one of the elements or groups (of `targets`) | down, up |  |
| `mode` | "normal", "multiball" |  |  |
| `rank` |  | atLeast, below, equal | `value` |
| `mission` | one of the missions |  |  |
| `balls` |  | atLeast, below, equal | `value` |

```json
{ "test": "lights", "target": "self", "is": "off" }
```

## action

One thing a rule does.

| field | type | default | |
|---|---|---|---|
| `do` | `"score"` `"bonus"` `"multiplier"` `"light"` `"count"` `"reset"` `"say"` `"sound"` `"award"` `"rotate"` | required | score: add `value` points (times the playfield multiplier during multiball); bonus: add `value` to the end-of-ball bonus; multiplier: raise the bonus multiplier by `value`; light: set the lights of `target` to `mode`; count: add `value` to the counter `target`, or set it with mode "set"; reset: raise the drop targets of `target`; say: show the text `target` on the panel; sound: play the sound `target`; award: give what `mode` names; rotate: move the lit lights of the group `target` by `value` places (lane change). |
| `target` | text | `""` | What it acts on. For light, "self" is the light of the element the event came from. |
| `value` | number | `0` | How much. |
| `mode` | `""` `"on"` `"off"` `"blink"` `"flash"` `"toggle"` `"set"` `"extraBall"` `"ballSave"` `"lock"` `"multiball"` `"mission"` | `""` | For light: on, off, blink, flash (on for `seconds`) or toggle. For count: set. For award: extraBall, ballSave (for `seconds`), lock (keep the ball in the kicker that caught it), multiball (start it), mission (count one step of the current mission, whatever it listens to). |
| `seconds` | number, seconds | `0` (0 to 600) | How long, for a flash or a ball save. |

What each `do` reads; the other fields are ignored for it:

| `do` | `target` | `mode` | numbers |
|---|---|---|---|
| `score` |  |  | `value`, not 0 |
| `bonus` |  |  | `value`, not 0 |
| `multiplier` |  |  | `value`, not 0 |
| `light` | one of the lights or light groups, "self" | on, off, blink, flash, toggle | `seconds` with flash |
| `count` | one of the counters | (none), set | `value` |
| `reset` | one of the elements or groups (of `targets`) |  |  |
| `say` | a text |  |  |
| `sound` | one of the sounds |  |  |
| `award` |  | extraBall, ballSave, lock, multiball, mission | `seconds` with ballSave |
| `rotate` | one of the light groups |  | `value` |

```json
{ "do": "score", "value": 500 }
```

## high score

A line of the high score table as the table ships; the scores players make are kept apart, by the game.

| field | type | default | |
|---|---|---|---|
| `name` | text | required | Three letters. |
| `score` | number | required | The score. |

```json
{ "name": "TID", "score": 400000 }
```

## lighting

The light of the scene.

| field | type | default | |
|---|---|---|---|
| `background` | colour | `"#05060c"` | What is seen around the table. |
| `ambient` | colour | `"#5a5f70"` | The light that reaches everything. |
| `lamps` | list of [lamp](#lamp) |  | Up to 4 lamps. |
| `general` | name of lights / light groups | none | The lights that are the general illumination of the table: the lamps and the ambient light shine in full while they are lit, and fall to `dimmed` while they are off (a tilt, a game that is over). None: the scene is always fully lit. |
| `dimmed` | number | `0.35` (0 to 1) | How much of the light of the scene is left when the general illumination is off, 0 (dark) to 1. |

```json
"lighting": {
  "background": "#04050b",
  "ambient": "#4a5068",
  "lamps": [{ "direction": [0.2, 0.35, -1], "color": "#b8bcd0" }, { "direction": [-0.6, -0.3, -0.5], "color": "#2a3c66" }],
  "general": "gi",
  "dimmed": 0.3
}
```

## lamp

A light that shines on the whole table from far away.

| field | type | default | |
|---|---|---|---|
| `direction` | 3 numbers | `[0.3, 0.5, -1]` | The way the light travels: [x, y, z] (z negative: downwards). |
| `color` | colour | `"#ffffff"` | Its colour. |

```json
{ "direction": [0.2, 0.35, -1], "color": "#b8bcd0" }
```

## layouts

The two layouts. The game takes portrait when its window is taller than wide, landscape otherwise, unless a launch option forces one.

| field | type | default | |
|---|---|---|---|
| `landscape` | [layout](#layout) |  | The table upright at the left, the panel at the right. |
| `portrait` | [layout](#layout) |  | The whole table on a vertical screen, the score in the backglass area above it. |

```json
"layouts": {
  "landscape": {
    "view": [0, 0, 600, 800],
    "camera": { "position": [25.5, 190, 176], "target": [25.5, 57, 0] },
    "panel": {
      "box": [600, 0, 680, 800],
      "image": "art/backglass.jpg",
      "items": [
        { "show": "title", "box": [640, 40, 600, 60], "size": 44, "color": "#7fd8ff" },
        { "show": "score", "box": [640, 150, 600, 90], "size": 72, "label": "SCORE" },
        { "show": "ball", "box": [640, 290, 280, 50], "size": 30, "label": "BALL" },
        { "show": "rank", "box": [940, 290, 300, 50], "size": 30, "color": "#9f8cff", "label": "RANK" },
        { "show": "mission", "box": [640, 400, 600, 44], "size": 30, "color": "#ffd866", "label": "MISSION" },
        { "show": "step", "box": [640, 470, 600, 36], "size": 24 },
        { "show": "message", "box": [640, 560, 600, 50], "size": 28, "color": "#ff7a33" },
        { "show": "bonus", "box": [640, 650, 600, 30], "size": 22, "label": "BONUS" },
        { "show": "highScores", "box": [640, 350, 600, 180], "size": 24, "color": "#c8d4f0", "label": "BEST CREWS" },
        { "show": "hint", "box": [640, 740, 600, 24], "size": 16, "color": "#7080a0" }
      ]
    }
  },
  "portrait": {
    "window": [800, 1280],
    "view": [0, 200, 800, 1080],
    "camera": { "position": [25.5, 180, 194], "target": [25.5, 56, 0], "fov": 27 },
    "panel": {
      "box": [0, 0, 800, 200],
      "image": "art/backglass-wide.jpg",
      "items": [
        { "show": "title", "box": [20, 12, 380, 40], "size": 30, "color": "#7fd8ff" },
        { "show": "score", "box": [400, 8, 380, 70], "size": 56, "align": "right" },
        { "show": "ball", "box": [20, 70, 180, 34], "size": 22, "label": "BALL" },
        { "show": "rank", "box": [210, 70, 190, 34], "size": 22, "color": "#9f8cff", "label": "RANK" },
        { "show": "message", "box": [400, 84, 380, 30], "size": 22, "color": "#ff7a33", "align": "right" },
        { "show": "mission", "box": [20, 124, 760, 30], "size": 24, "color": "#ffd866" },
        { "show": "step", "box": [20, 158, 760, 26] },
        { "show": "highScores", "box": [20, 66, 380, 130], "color": "#c8d4f0" }
      ]
    }
  }
}
```

## layout

One way to put the table and the panel in a window.

| field | type | default | |
|---|---|---|---|
| `window` | 2 numbers, px | `[1280, 800]` | The size the layout is drawn for; another window is letterboxed. |
| `view` | 4 numbers, px | `[0, 0, 640, 800]` | Where the table is drawn: [x, y, width, height] in the window. |
| `camera` | [camera](#camera) |  | The eye. |
| `panel` | [panel](#panel) |  | The panel. |

```json
"landscape": {
  "view": [0, 0, 600, 800],
  "camera": { "position": [25.5, 190, 176], "target": [25.5, 57, 0] },
  "panel": {
    "box": [600, 0, 680, 800],
    "image": "art/backglass.jpg",
    "items": [
      { "show": "title", "box": [640, 40, 600, 60], "size": 44, "color": "#7fd8ff" },
      { "show": "score", "box": [640, 150, 600, 90], "size": 72, "label": "SCORE" },
      { "show": "ball", "box": [640, 290, 280, 50], "size": 30, "label": "BALL" },
      { "show": "rank", "box": [940, 290, 300, 50], "size": 30, "color": "#9f8cff", "label": "RANK" },
      { "show": "mission", "box": [640, 400, 600, 44], "size": 30, "color": "#ffd866", "label": "MISSION" },
      { "show": "step", "box": [640, 470, 600, 36], "size": 24 },
      { "show": "message", "box": [640, 560, 600, 50], "size": 28, "color": "#ff7a33" },
      { "show": "bonus", "box": [640, 650, 600, 30], "size": 22, "label": "BONUS" },
      { "show": "highScores", "box": [640, 350, 600, 180], "size": 24, "color": "#c8d4f0", "label": "BEST CREWS" },
      { "show": "hint", "box": [640, 740, 600, 24], "size": 16, "color": "#7080a0" }
    ]
  }
}
```

## camera

The fixed eye that looks at the table, in table coordinates.

| field | type | default | |
|---|---|---|---|
| `position` | 3 numbers, cm | `[25.5, 200, 150]` | Where it is: [x, y, z]. |
| `target` | 3 numbers, cm | `[25.5, 55, 0]` | What it looks at. |
| `fov` | number, degrees | `28` (5 to 120) | The vertical field of view, in degrees. |

```json
"camera": { "position": [25.5, 190, 176], "target": [25.5, 57, 0] }
```

## panel

The score panel.

| field | type | default | |
|---|---|---|---|
| `box` | 4 numbers, px | `[0, 0, 0, 0]` | Its background: [x, y, width, height] in the window; all zeros for none (items drawn over the table). |
| `color` | colour | `"#0a0e1c"` | The colour of its background. |
| `image` | image file | none | An image of the table folder drawn over the background, filling the box (the backglass); the part that does not fit the box is cut. |
| `items` | list of [panel item](#panel-item) |  | What it shows. |

```json
"panel": {
  "box": [600, 0, 680, 800],
  "image": "art/backglass.jpg",
  "items": [
    { "show": "title", "box": [640, 40, 600, 60], "size": 44, "color": "#7fd8ff" },
    { "show": "score", "box": [640, 150, 600, 90], "size": 72, "label": "SCORE" },
    { "show": "ball", "box": [640, 290, 280, 50], "size": 30, "label": "BALL" },
    { "show": "rank", "box": [940, 290, 300, 50], "size": 30, "color": "#9f8cff", "label": "RANK" },
    { "show": "mission", "box": [640, 400, 600, 44], "size": 30, "color": "#ffd866", "label": "MISSION" },
    { "show": "step", "box": [640, 470, 600, 36], "size": 24 },
    { "show": "message", "box": [640, 560, 600, 50], "size": 28, "color": "#ff7a33" },
    { "show": "bonus", "box": [640, 650, 600, 30], "size": 22, "label": "BONUS" },
    { "show": "highScores", "box": [640, 350, 600, 180], "size": 24, "color": "#c8d4f0", "label": "BEST CREWS" },
    { "show": "hint", "box": [640, 740, 600, 24], "size": 16, "color": "#7080a0" }
  ]
}
```

## panel item

One thing the panel shows, in a box of the window.

| field | type | default | |
|---|---|---|---|
| `show` | `"title"` `"score"` `"ball"` `"rank"` `"mission"` `"step"` `"message"` `"bonus"` `"highScores"` `"hint"` | required | title: the name of the table; score; ball: the ball number and the extra balls; rank; mission: the name of the mission; step: what to do next; message: what the rules say; bonus: the bonus and its multiplier; highScores; hint: the keys. |
| `box` | 4 numbers, px | required | Where: [x, y, width, height] in the window. |
| `size` | number, px | `20` (6 to 400) | The height of the text. |
| `color` | colour | `"#e8f0ff"` | The colour of the text. |
| `align` | `"left"` `"center"` `"right"` | `"left"` | How the text sits in its box. |
| `label` | text | `""` | A small caption above it. |

```json
{ "show": "title", "box": [640, 40, 600, 60], "size": 44, "color": "#7fd8ff" }
```

