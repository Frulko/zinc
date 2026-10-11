# The museum table project file

`examples/museum-table` is a player: everything it shows comes from one JSON document, `assets/project.json`, next to the media it names. This
page is the reference of that document, version 1. The storyboard editor writes the same file.

The model follows Klynt, the interactive storytelling editor: a **media library**, **sequences** (the nodes of the story, each laying its media
out in space and time), **links** between sequences (buttons, hotspots, overlays, a sequence that follows by itself) and a **storyboard** (the
map of the sequences). What a touch table adds is in the file too: texts in several languages inside one project, the accessibility and kiosk
settings, credits and licences for every file shown.

```
project
├─ title, languages, start
├─ theme, accessibility, table, kiosk
├─ media[]          photo | model | panorama | text | audio | video, each with its texts and its credit
├─ sequences[]      items[] (a medium, where, when), links[] (to another sequence), narration, duration, next
└─ presentations[]  guided visits: sequences in order
```

## The module

`examples/museum-table/src/project.ts` is the only reader and writer; the player and the editor import it. It touches neither the screen nor
the file system.

| | |
| --- | --- |
| `parseProject(json): Project` | Reads and validates. Throws a `ProjectError` whose message names the field: `media[3].credit.licence: missing` |
| `serializeProject(project): string` | The canonical text (below): what Save writes |
| `copyProject(project): Project` | A copy that shares nothing with its source, also of a project that would not load yet (an editor's undo steps) |
| `unreachable(project): string[]` | The sequences nothing leads to from `start`: no link, no `next`, no presentation, no point of interest (`to`) of a medium shown on the way |
| `assetFiles(project): string[]` | Every file the project names, `{lang}` replaced by each language; the clips and subtitles of the audio descriptions among them |
| `spokenDescription(project, medium): Media \| null` | The audio description of a medium as something to say: an audio medium with its clip, its subtitles and the text as transcript |
| `project.medium(id)`, `project.sequence(id)`, `project.say(text, lang)` | Lookups; `say` falls back on the default language |

```sh
zinc run examples/museum-table/src/check.ts -- project.json           # one line: what it holds, or the field at fault (exit 1)
zinc run examples/museum-table/src/check.ts -- --save copy.json project.json   # also writes the canonical form
```

## Conventions

- **Texts** are objects with one string per language: `{ "fr": "La vague", "en": "The wave" }`. Only the languages listed in `languages` are
  read. A required text must have the first language (the default); the others fall back on it. A line break in a text is `\n`.
- **Positions** are in table units: the table is `table.width` by `table.height` units (1920 by 1080 unless said otherwise), the origin is the
  top-left corner seen from the main side, x to the right, y down. The player scales the table to the screen. An item's `x`, `y` is its centre;
  `rotation` is in degrees, clockwise.
- **Times** are in seconds from the start of the sequence.
- **Files** are paths inside the assets directory, with `/`: no absolute path, no `..`. In the file of an audio or a video and in `subtitles`,
  `{lang}` stands for the language code: `audio/welcome.{lang}.mp3` names `audio/welcome.fr.mp3` and `audio/welcome.en.mp3`.
- **Colours** are `"#rrggbb"`.
- **Ids** are any non-empty strings, unique among the media, among the sequences, among the presentations and among the points of a model.
- **Unknown fields are ignored** and not written back (the reader cannot list the keys of a JSON object). Optional fields have the default given
  in the tables.

## Versions and the canonical form

`version` is the version of the format the file was written for. A reader refuses a newer file (`version: 2 is newer than this player (1)`).
Within a version, fields may be added only as optional ones with a default that keeps the old behaviour; anything else is a new version.

`serializeProject` writes one layout: two spaces, the fields in the order of this page, the top-level objects always in full, optional fields of
media, items, links and sequences left out when they have their default, one line per item and per view, numbers as JavaScript prints them.
A file written by it loads and saves to the same bytes (`next/tests/t1/museum_format.sh`), so a project under version control shows only real
changes.

## The project

```json
{
  "format": "zinc-museum-table",
  "version": 1,
  "id": "floating-world",
  "title": { "fr": "Le monde flottant, d’Edo à Paris", "en": "The Floating World, from Edo to Paris" },
  "languages": ["fr", "en"],
  "start": "ukiyo-e",
  "theme": { },
  "accessibility": { },
  "table": { },
  "kiosk": { },
  "media": [ ],
  "sequences": [ ],
  "presentations": [ ]
}
```

| field | | meaning |
| --- | --- | --- |
| `format` | required | `"zinc-museum-table"` |
| `version` | required | `1` |
| `id` | required | Name of the installation (statistics and updates are filed under it) |
| `title` | required text | |
| `languages` | required | Language codes, at least one; the first is the default |
| `start` | required | The id of the sequence shown first, and after a reset |
| `theme`, `accessibility`, `table`, `kiosk` | optional | Below; each field has a default |
| `media`, `sequences` | required | Below; at least one sequence |
| `presentations` | optional | Below |

### theme

Dark and calm by default.

```json
"theme": {
  "background": "#14151a", "paper": "#f4f1ea", "ink": "#23211d", "text": "#ece8df", "muted": "#9b978d", "accent": "#d0a441",
  "font": "sans", "titleFont": "sans-bold", "logo": "logo.png"
}
```

| field | default | meaning |
| --- | --- | --- |
| `background` | `#14151a` | The table |
| `paper`, `ink` | `#f4f1ea`, `#23211d` | A card (the border of a photograph, a text panel) and what is written on it |
| `text`, `muted` | `#ece8df`, `#9b978d` | Texts on the table, and secondary ones |
| `accent` | `#d0a441` | What answers to a touch: buttons, points of interest |
| `font`, `titleFont` | `sans`, `sans-bold` | The fonts of the texts and of the titles: a family the table has (`sans`, `sans-bold`, `mono`) or a TrueType file of the assets (`fonts/house.ttf`); a file that is missing leaves the default |
| `logo` | none | The museum's logo, an image of the assets: drawn 56 units high on the table itself, under the cards, in the far right corner of the side the visitor stands at |

### accessibility

The text size and the high contrast are one touch away for the visitor, at their edge of the table: two buttons beside the languages. They
are kept for the visit and forgotten with it (`kiosk.resetAfter`).

```json
"accessibility": {
  "textSizes": [1, 1.3, 1.6],
  "highContrast": { "background": "#000000", "paper": "#ffffff", "ink": "#000000", "text": "#ffffff", "muted": "#e0e0e0", "accent": "#ffd400" },
  "descriptions": "audio/descriptions/{id}.{lang}.mp3"
}
```

| field | default | meaning |
| --- | --- | --- |
| `textSizes` | `[1, 1.3, 1.6]` | The text sizes a visitor steps through, as factors of the designed size; the first is the one at rest. Every text grows, and what holds a text with it: the buttons, the caption of a card, the panels. With one size there is no button |
| `highContrast` | black, white, yellow | The six colours of the theme in high-contrast mode, in which nothing is drawn faintly either. `next/tools/contrast-check --museum project.json` checks them: 7:1 at least between a text and what it is written on (4.5:1 for the theme) |
| `descriptions` | none | Where the spoken audio descriptions are: the clip of a medium, `{id}` standing for the id of the medium and `{lang}` for the language code. Its subtitles lie beside it, the same name ending in `.vtt`. `tools/narration.sh` makes both from the `audioDescription` texts. Without it, or for a clip that is not there, a description is shown as subtitles and not said |

Two more accessibility fields are on the media: `audioDescription`, what a visitor who cannot see a picture, an object or a panorama needs to
hear (a button on the medium once it is open says it: in the full view of a photograph, under an object, in a panorama), and `subtitles`.

### table

```json
"table": { "width": 1920, "height": 1080, "visitors": 2, "reach": 520 }
```

| field | default | meaning |
| --- | --- | --- |
| `width`, `height` | 1920, 1080 | The size the positions are written for |
| `visitors` | 2 | Visitors served at the same time: one story is shared, and the texts, the panels, the buttons, the full view and the 3D object turn toward one side of the table at a time. A tap, or a press on a button, closer to an edge than `reach` or than 15 % of the table's depth (the smaller of the two: 162 units of the default table) turns them to that edge; a mark in the middle of each other edge says so. A drag never turns anything, nor does a tap in the middle of the table: nobody turns the texts away by moving a card or reaching across. The cards stay free |
| `reach` | 520 | Every button lies within this distance of an edge (a seated visitor, a child). 520 units of a 1920-unit table are 26 cm on a 43-inch screen and 33 cm on a 55-inch one, the roll-under reach of Ideum's accessibility guidelines for touch tables. A button farther from every edge is refused. The player keeps its own buttons within it of the visitor's edge, and offers there what lies farther on a medium: "Next point" opens the points of interest of an object or a panorama in turn, and the button of an open point has its twin beside it |

### kiosk

```json
"kiosk": { "fullscreen": true, "attractAfter": 60, "resetAfter": 120, "attract": "tour", "statistics": true, "updateUrl": "https://museum.example/table/" }
```

| field | default | meaning |
| --- | --- | --- |
| `fullscreen` | true | A kiosk: Escape does nothing, no gesture leads out of the app, a sequence opened over another always has a way to close, and a fault (a project or a medium that cannot be read) is written on the error output and never shown: the table goes back to its first sequence, or shows nothing. The window itself is made fullscreen, on top and without a cursor by the engine: `ZINC_KIOSK=1`, or `"kiosk": true` for the target in `zinc.json` |
| `attractAfter` | 60 | Seconds without a touch before the attract loop starts (0: never). A presentation a visitor watches is not counted. The loop plays over the visit, which a touch finds again as it was until `resetAfter` |
| `resetAfter` | 120 | Seconds without a touch before the visit is forgotten: everything returns to `start`, the default language, the main side of the table and the designed layout, and nothing is ticked on the storyboard any more (0: never) |
| `attract` | none | The presentation played as the attract loop, again and again, with its subtitles and without sound, and an invitation to touch the table at each of its four edges; without it the table stays as it is until the reset |
| `statistics` | false | Count what each visit saw in a local file per day, with nothing that identifies a visitor: see "The statistics of a table" |
| `updateUrl` | none | Where the museum publishes a newer project. Without it the table needs no network |

## Media

The library: every picture, object, text, sound and film of the installation, once, with its texts and where it comes from. A sequence places
media; it never holds a file name.

```json
{
  "id": "great-wave",
  "kind": "photo",
  "file": "photos/great-wave.jpg",
  "title": { "fr": "Sous la vague au large de Kanagawa (La Grande Vague)", "en": "Under the Wave off Kanagawa (The Great Wave)" },
  "creator": "Katsushika Hokusai (1760–1849)",
  "date": { "fr": "vers 1830-1832", "en": "ca. 1830–32" },
  "medium": { "fr": "Estampe ; gravure sur bois, encre et couleurs sur papier", "en": "Woodblock print; ink and color on paper" },
  "description": { "fr": "Une vague immense se dresse…", "en": "A towering wave rears…" },
  "audioDescription": { "fr": "Estampe en largeur. À gauche, une grande vague bleue…", "en": "A print wider than high. On the left…" },
  "credit": {
    "institution": "The Metropolitan Museum of Art, New York",
    "accession": "JP1847",
    "line": "H. O. Havemeyer Collection, Bequest of Mrs. H. O. Havemeyer, 1929",
    "source": "https://www.metmuseum.org/art/collection/search/45434",
    "licence": "CC0 1.0",
    "licenceUrl": "https://creativecommons.org/publicdomain/zero/1.0/"
  }
}
```

Fields of every medium:

| field | | meaning |
| --- | --- | --- |
| `id` | required | |
| `kind` | required | `photo`, `model`, `panorama`, `text`, `audio` or `video` |
| `file` | required, except for a text | The file in the assets |
| `title` | required text | |
| `creator` | optional | Who made the work, as one string |
| `date`, `medium`, `description` | optional texts | The lines of a museum label, and the notice |
| `audioDescription` | optional text | What a visitor who cannot see it needs to hear. A button on the medium says it and shows it as subtitles, in place of the narration: the clip that `accessibility.descriptions` names, made by `tools/narration.sh` with the synthesised voice or recorded by the museum |
| `credit` | required, except for a text | `source` (the page of the work, or where the file was made) and `licence` are required; `institution`, `accession`, `line` (the credit line the institution asks for) and `licenceUrl` are optional |

Fields by kind:

| kind | field | default | meaning |
| --- | --- | --- | --- |
| `photo` | | | A JPEG, PNG or WebP image |
| `model` | `file` | | A 3D model: `.obj` (read today), `.glb` or `.gltf` |
| | `texture` | none | The image wrapped on an OBJ model |
| | `light` | `studio` | The lighting at rest: `studio`, `raking` (low light that shows relief) or `flat` |
| | `view` | `{ "yaw": 0, "pitch": 0, "distance": 3.2 }` | The opening view: angles in degrees around the object, distance in multiples of its radius |
| | `points` | none | Points of interest, below |
| `panorama` | `file` | | A 360-degree image in equirectangular projection (twice as wide as high) |
| | `view` | `{ "yaw": 0, "pitch": 0, "fov": 75 }` | The direction looked at first and the field of view, in degrees |
| | `points` | none | Points of interest; `at` is the direction from the centre: y up, −z the middle of the image, +x a quarter turn to the right (yaw 90) |
| `text` | `text` | required text | The body of a text panel |
| `audio` | `file` | | A narration or a sound; `{lang}` for one file per language |
| | `transcript` | optional text | What is said: `tools/narration.sh` synthesises the narration from it, and without timed subtitles its sentences are shown one after the other, at 15 characters a second |
| | `subtitles` | none | Timed subtitles, WebVTT (`mm:ss.mmm --> mm:ss.mmm` and the text; settings and styles are ignored); `{lang}` for one file per language. The last cue's end is the length of the narration: a table without sound shows the same subtitles at the same times |
| `video` | `file`, `transcript`, `subtitles` | | As for an audio (zinc:video: what FFmpeg decodes; the picture only, a film has no sound). The film plays in its card while the card is there; a touch on it pauses it and starts it again. Its subtitles are shown on its picture |
| | `poster` | none | The image of the card before the film plays, and when nothing decodes it: it gives the card its shape (16:9 without one). The first picture of the film is a good one |
| | `loop` | false | Start again at the end; else the card shows the poster again, and a touch plays the film again |

A point of interest:

```json
{
  "id": "cobalt",
  "title": { "fr": "Le bleu de cobalt", "en": "Cobalt blue" },
  "text": { "fr": "Le décor est peint à l’oxyde de cobalt…", "en": "The decoration is painted in cobalt oxide…" },
  "at": [0.086, 0.05, 0],
  "view": { "yaw": 90, "pitch": 0, "distance": 1.6 }
}
```

| field | | meaning |
| --- | --- | --- |
| `id`, `title` | required | |
| `text` | optional text | The description that opens |
| `at` | required | `[x, y, z]` in the coordinates of the model file (y up); the point stays on that place of the object at every angle. In a panorama, the direction it is seen in from the centre (any length): the point stays on that direction at every view |
| `view` | the medium's view | Where the camera goes when the point opens |
| `to` | none | A sequence the point leads to: its card offers a button to it |

## Sequences

A sequence is one moment of the visit: what lies on the table, and where one can go from there.

```json
{
  "id": "ukiyo-e",
  "title": { "fr": "Images du monde flottant", "en": "Pictures of the Floating World" },
  "text": { "fr": "Edo, 1790-1860. Gravées sur bois…", "en": "Edo, 1790–1860. Cut in wood…" },
  "storyboard": { "x": 160, "y": 300 },
  "items": [
    { "media": "great-wave", "x": 480, "y": 340, "width": 480, "rotation": -4 },
    { "media": "hokusai-words", "x": 1700, "y": 720, "width": 320, "rotation": 4, "at": 2 }
  ],
  "links": [
    { "to": "wave", "label": { "fr": "La Grande Vague, de près", "en": "The Great Wave, up close" }, "x": 0.5, "y": 0.5, "on": "great-wave", "overlay": true },
    { "to": "japonisme", "label": { "fr": "Le japonisme", "en": "Japonisme" }, "x": 660, "y": 1030 }
  ],
  "narration": "welcome",
  "duration": 45
}
```

| field | default | meaning |
| --- | --- | --- |
| `id`, `title` | required | |
| `text` | none | The introduction shown with the title |
| `storyboard` | `{ "x": 0, "y": 0 }` | Where the node of the sequence is drawn in the storyboard (the editor's map and the visitor's): the centre of the node, as for an item, in storyboard units of its own. A node is 240 by 150 units; the sample spaces its nodes 360 by 220 apart |
| `items` | required | What lies on the table, in drawing order: the last one is on top |
| `links` | none | Where one can go |
| `narration` | none | The id of an audio medium said when the sequence comes on the table, with its subtitles above the visitor's buttons: once per visit (the one of the first sequence waits for the first touch), and every time in a presentation. It stops when the sequence is left; a change of language starts it again in the new language |
| `duration` | 0 | Seconds the sequence lasts in a guided presentation, and before `next`. 0: as long as its narration, else until the visitor moves on |
| `next` | none | The sequence that follows by itself at the end, with a fade, once no hand is on the table; without it the sequence stays. In a sequence open as an overlay, a `next` that names the sequence underneath closes the overlay |

An item places one medium:

| field | default | meaning |
| --- | --- | --- |
| `media` | required | The id of the medium |
| `x`, `y` | required | The centre |
| `width` | required | The width on the table. A photograph keeps its proportions |
| `height` | from the medium | The height of a model, a panorama or a film; a text panel grows with its text |
| `rotation` | 0 | Degrees, clockwise. Photographs and text cards are then free under the fingers |
| `at`, `until` | 0, 0 | When the item appears and disappears, on the clock of the sequence, which starts when the sequence is on the table and stops while another one is open over it; `until` 0: it stays to the end. A card comes and goes in 0.4 s |

A link leads to another sequence:

| field | default | meaning |
| --- | --- | --- |
| `to` | required | The id of the sequence |
| `label` | required text | What the button says; for a hotspot, what is announced |
| `x`, `y` | required | A button: its centre on the table, within `table.reach` of an edge. Buttons that do not fit where they were designed (a longer label in another language, a larger text size, a short side of the table) are set in rows at the visitor's edge, in the order of their `x`. A hotspot (`on`): its centre on the item, as fractions (0.5, 0.5 is the middle) of the picture for a photograph or a film, of the box for a model, a panorama or a text panel |
| `on` | none | The id of a medium shown in this sequence: the link is a hotspot on that item, a ring with the label beside it. On a card it moves, turns and grows with the card, and is on its front only; when the medium lies twice in the sequence, on the first |
| `at`, `until` | 0, 0 | When the link is offered |
| `transition` | `fade` | `fade` (the table goes dark and comes back, half a second), `slide` (the new sequence pushes the old one out; an overlay comes in from the side) or `none` |
| `overlay` | false | The target opens over this sequence, which is dimmed and waits underneath as the visitor left it, its clock stopped. It comes back when a link or the `next` of the overlay leads to it. One overlay at a time: a second one takes the place of the first |

## Presentations

A guided visit plays sequences in order, each for its `duration` (without one: as long as its narration and a second, else ten seconds),
with its narration and subtitles, a fade between two sequences, and a timeline at the visitor's edge with a segment for each step. Each
presentation has its button beside the storyboard's. While it plays the links of the sequences are not offered and a touch pauses it; paused,
the visitor does what they like with the sequence, then resumes (the step starts again from its beginning) or leaves; following a link or
jumping from the storyboard leaves it too. At the end of the path the visitor stays on the last sequence. The attract loop is a presentation
(`kiosk.attract`).

```json
"presentations": [
  { "id": "tour", "title": { "fr": "La visite en cinq étapes", "en": "The visit in five stages" }, "path": ["ukiyo-e", "wave", "japonisme", "porcelain", "garden"] }
]
```

## The statistics of a table

With `kiosk.statistics` and a directory to write in (`zinc run <table> -- --statistics <directory>`; without the directory nothing is
counted), the player keeps one file per day, `<directory>/2026-10-11.csv`, which a spreadsheet opens:

```csv
what,count,seconds,id
session,2,81,
hour,2,,14
language,1,,en
language,1,,fr
sequence,4,50,ukiyo-e
sequence,1,30,wave
medium,1,,kanbara-snow
description,1,,kanbara-snow
point,1,,vase/lady
presentation,1,,tour
presentation-ended,1,,tour
```

| `what` | `count` | `seconds` | `id` |
| --- | --- | --- | --- |
| `session` | Visits: from a first touch to the reset that forgets the visit (`kiosk.resetAfter`) | Their total length, up to the last touch of each | |
| `hour` | Visits that began in that hour | | The hour of the day, `00` to `23`, in the time of the table |
| `language` | Visits that ended in that language | | The language code |
| `sequence` | Times the sequence was opened during a visit (the one a visit begins on counts once) | The time it was looked at | The sequence |
| `medium` | Times a picture was seen in full | | The medium |
| `description` | Times an audio description was asked for | | The medium |
| `point` | Times a point of interest was opened | | `<medium>/<point>` |
| `presentation`, `presentation-ended` | Times a guided visit was started, and played to its end | | The presentation |

A file holds sums, and a visit is added to the day it began on when it is forgotten. Nothing in it identifies a visitor or lets a
visit be followed: no time finer than the hour a visit began in, no touch, no position, no order of events. The seconds are whole, and
stop at the last touch (or at the end of a presentation being watched): a table left alone is not being looked at. The attract loop is
not a visit. The id comes last so that it may hold a comma. The staff see the counts of the day on the table: two fingers held three
seconds in two opposite corners; the next touch closes them, and none of those touches is counted.

## What is checked

`parseProject` stops at the first fault. Besides types and required fields: `format` and `version`; unique ids; every `kind`, `light`,
`transition` among the listed values; a model file ending in `.obj`, `.glb` or `.gltf`; every path inside the assets; every colour well formed;
sizes greater than 0, times 0 or more; `start`, `links[].to`, `next`, `presentations[].path[]` naming a sequence; `items[].media` naming a medium;
`links[].on` naming a medium shown in the same sequence; `narration` naming an audio; `kiosk.attract` naming a presentation; every button within
`table.reach` of an edge; `accessibility.descriptions` holding `{id}` and giving, for every medium that has an audio description, a path
inside the assets. Whether the files exist is checked by the player when it starts (`assetFiles`).

## What the player does with it today

| in the file | player |
| --- | --- |
| photographs and text panels as cards, 3D models (`.obj`, `.glb`, `.gltf`) and panoramas with points of interest and the links of their points | yes |
| timed items and links, buttons, hotspots, overlays, the three transitions, `next` | yes |
| a film | yes: it plays in its card with its subtitles, a touch pauses it, it stops when its sequence is left (FFmpeg's libraries on the machine; without them, the poster and the subtitles) |
| the storyboard: the map of the sequences at their `storyboard` positions, with a miniature of each table, an arrow for every link, `next` and point of interest that leads somewhere (dashed for an overlay), the sequences seen ticked and the links followed in the accent colour; a touch on a node goes there | yes |
| narration (zinc:audio: WAV, FLAC, MP3, Ogg Vorbis) and its subtitles, presentations | yes |
| the table mode: texts turned to the side of the last tap near an edge, the attract loop, the reset, the kiosk rules | yes |
| the text sizes and the high contrast, as two buttons at the visitor's edge; every button within `table.reach` of that edge (the links come there in rows when they do not fit where they were designed, and the buttons of an object or a panorama with them); the audio descriptions, said by a button on the medium, with subtitles | yes |
| statistics | yes, when the table is started with `--statistics <directory>` |
| updates | ZN-650.11 |
