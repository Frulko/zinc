# museum-table

An app a museum puts on a multi-touch table: a collection told as linked sequences, in the manner of Klynt. Visitors handle photographs like
prints on a light table, turn an object in 3D and touch its points of interest, look around a panorama, follow links from one sequence to the
next, find their way on the storyboard, or let a guided visit play with its narration and subtitles, in French or English. The app is a
player: everything it shows comes from one project file, [`assets/project.json`](assets/project.json)
([reference](../../docs/museum-table-format.md)), which the storyboard editor in [`editor/`](editor) writes.

The sample is *The Floating World, from Edo to Paris*: twelve works from The Met and the Art Institute of Chicago, a Kangxi vase scanned by the
Smithsonian, a panorama of a Japanese garden, all CC0, and a narration by two open synthetic voices ([LICENSES.md](LICENSES.md)).

![The light table: two cards moved, one turned over](../../docs/img/museum-table-table.jpg)
![The storyboard: five sequences seen, the links followed](../../docs/img/museum-table-storyboard.jpg)
![A guided visit playing, with its subtitle and its timeline](../../docs/img/museum-table-tour.jpg)
![The panorama, the panel of a point of interest and its link](../../docs/img/museum-table-panorama.jpg)
![The vase, a point of interest open](../../docs/img/museum-table-object.jpg)
![The full view of a print](../../docs/img/museum-table-full.jpg)

## Run it

```sh
zinc run examples/museum-table                          # a window; on a touch screen every finger counts
zinc run examples/museum-table -- --sequence porcelain  # start on another sequence (ukiyo-e, wave, japonisme, porcelain, garden)
zinc run examples/museum-table -- --lang en
zinc run examples/museum-table -- --story               # print what happens to the story: sequences, links, narration clips, subtitles
zinc run examples/museum-table/src/pano.ts              # the panorama alone, full screen
zinc run examples/museum-table/src/check.ts -- examples/museum-table/assets/project.json   # validate a project file
```

| on the table | touch | mouse |
| --- | --- | --- |
| a card | one finger drags; two turn and zoom; let go and it glides | drag; wheel or trackpad pinch zooms; Shift + wheel turns |
| | a touch brings it to the front; the folded corner turns it over to its notice; a double tap opens the full view | click, double click |
| a ring on a card, with its label | a hotspot: it opens another sequence, here over the current one, which waits underneath | click |
| the 3D object | one finger turns it; two bring it closer and move it | drag; wheel zooms |
| | a touch on a ring opens the point's panel and shows it; `Lumière` changes the lighting, `Vue de départ` goes back | click |
| the panorama | one finger looks around; two change the field of view; a ring opens its panel, whose button leads to a sequence | drag; wheel zooms |
| buttons at the visitor's edge | the links of the sequence; `Plan`: the storyboard, where a touch on a node goes there; the guided visit; `FR EN` | click |
| a guided visit | a touch pauses it; then `Reprendre la visite` or `Quitter la visite` | click |

Several hands work at the same time: a finger belongs to what it landed on until it lifts. A sequence with a `next` gives way by itself at
its end; a card or a link comes and goes at the time the project gives it.

## On a table

![The table turned to its right side: the vase stands for the visitor there](../../docs/img/museum-table-side.jpg)

One or two visitors stand around the table and share one story. The texts, the buttons, the panels, the full view and the 3D object turn to
one side at a time: a tap or a press near an edge turns them to that edge (each other edge has a mark that says so), a drag never does, and
the cards stay free. At a short side the texts are laid out again for a table deeper than wide. After 60 seconds without a touch the attract
loop plays, silently, with an invitation at the four edges; a touch finds the visit as it was, until after 120 seconds it is forgotten and a
touch starts a new one (both times are in the project file). As a kiosk:

```sh
ZINC_KIOSK=1 zinc run examples/museum-table      # fullscreen, on top, no cursor, quit shortcuts ignored
```

Escape does nothing, no gesture leads out, and a fault is written on the error output, never on the table.

## What to look at

| file | role |
| --- | --- |
| `src/project.ts` | the project format: types, `parseProject` (validates, names the field at fault), `serializeProject` (canonical form), `copyProject` |
| `src/main.ts` | the player: the story (links, overlays, transitions, `next`, presentations, the narration), the fingers, the controls at the edge |
| `src/stage.ts` | one sequence on the table: its clock, its cards, its object or panorama, its links |
| `src/storyboard.ts` | the map of the story for the visitor, with the visited trail |
| `src/narration.ts` | a narration: the clip through `zinc:audio`, the subtitles from WebVTT or from the transcript |
| `src/touch.ts` | fingers (touch points or the mouse) and `manipulate`: what one or two fingers do to what they hold |
| `src/table.ts` | the light table: cards drawn with `zinc:gfx` under a matrix, glide, soft edges, turning over, hotspots, timed cards |
| `src/viewer.ts`, `src/orbit.ts`, `src/panel.ts` | the 3D object viewer on `zinc:3d` (OBJ, glTF, GLB), the turning it shares with the panorama, the panel of a point |
| `src/lookout.ts`, `src/panorama.ts`, `src/pano.ts` | 360-degree panoramas: on the table, the view itself, and alone |
| `src/frame.ts` | the table as the visitor at one of its sides sees it: where texts and buttons are laid out, and the matrix that turns them |
| `src/type.ts`, `src/words.ts` | fonts and word wrapping; the player's own few words |
| `src/check.ts`, `src/assets.ts` | command-line checks of a project file and of its media |
| `tools/` | rebuild the media from their sources (`fetch-collection.sh`, `decimate.cpp`); synthesise the narration and its subtitles from the transcripts of the project with Piper and two open voices (`narration.sh`) |

Tests: `next/tests/run --tier t1 --only museum_visit` (also `museum_mode`, `museum_format`, `museum_assets`, `museum_table`,
`museum_viewer`, `museum_panorama`). The sessions are scripted touches (`ZINC_INPUT`, `touch ID X Y` and `touchup ID`): `next/tests/data/museum_visit/visit.py`
is a whole visit, `next/tests/data/museum_table/hands.py` two hands on two cards. A headless run plays no sound: the story log says which clip
is asked for and when.

## Not there yet

A film shows its poster on a card (ZN-650.08). A presentation that is paused starts its step again when it resumes, because `zinc:audio`
cannot pause a clip. The panorama does not turn with the visitor (its texts do), and the text-size and high-contrast settings of the project
are read but not offered (ZN-650.10). The narration was checked by its durations and its decoding, not by ear, and the table mode by scripted
touches, not on a touch table.
