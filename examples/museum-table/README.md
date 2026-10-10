# museum-table

An app a museum puts on a multi-touch table: a collection told as linked sequences, in the manner of Klynt. Visitors handle photographs like
prints on a light table, turn an object in 3D and touch its points of interest, read the notices in French or English. The app is a player:
everything it shows comes from one project file, [`assets/project.json`](assets/project.json)
([reference](../../docs/museum-table-format.md)), which the storyboard editor in [`editor/`](editor) writes.

The sample is *The Floating World, from Edo to Paris*: twelve works from The Met and the Art Institute of Chicago, a Kangxi vase scanned by the
Smithsonian, a panorama of a Japanese garden, all CC0 ([LICENSES.md](LICENSES.md)).

![The light table: two cards moved, one turned over](../../docs/img/museum-table-table.jpg)
![The full view of a print](../../docs/img/museum-table-full.jpg)
![The vase, a point of interest open](../../docs/img/museum-table-object.jpg)

## Run it

```sh
zinc run examples/museum-table                          # a window; on a touch screen every finger counts
zinc run examples/museum-table -- --sequence porcelain  # start on another sequence (ukiyo-e, wave, japonisme, porcelain, garden)
zinc run examples/museum-table -- --lang en
zinc run examples/museum-table/src/pano.ts              # the panorama viewer, on its own for now
zinc run examples/museum-table/src/check.ts -- examples/museum-table/assets/project.json   # validate a project file
```

| on the table | touch | mouse |
| --- | --- | --- |
| a card | one finger drags; two turn and zoom; let go and it glides | drag; wheel or trackpad pinch zooms; Shift + wheel turns |
| | a touch brings it to the front; the folded corner turns it over to its notice; a double tap opens the full view | click, double click |
| the 3D object | one finger turns it; two bring it closer and move it | drag; wheel zooms |
| | a touch on a ring opens the point's description and shows it; `Lumière` changes the lighting, `Vue de départ` goes back | click |
| buttons at the edge | the other sequences; `FR EN` changes the language | click |

Several hands work at the same time: a finger belongs to what it landed on until it lifts.

## What to look at

| file | role |
| --- | --- |
| `src/project.ts` | the project format: types, `parseProject` (validates, names the field at fault), `serializeProject` (canonical form), `copyProject` |
| `src/main.ts` | the player: loads the project, routes the fingers, draws the sequence |
| `src/touch.ts` | fingers (touch points or the mouse) and `manipulate`: what one or two fingers do to what they hold |
| `src/table.ts` | the light table: cards drawn with `zinc:gfx` under a matrix, glide, soft edges, turning over, the full view |
| `src/viewer.ts`, `src/orbit.ts` | the 3D object viewer on `zinc:3d` (OBJ, glTF, GLB) and the turning it shares with the panorama |
| `src/panorama.ts`, `src/pano.ts` | 360-degree panoramas |
| `src/type.ts`, `src/words.ts` | fonts and word wrapping; the player's own few words |
| `src/check.ts`, `src/assets.ts` | command-line checks of a project file and of its media |
| `tools/` | rebuild the media from their sources (`fetch-collection.sh`, `decimate.cpp`), make a narration locally (`narration.sh`) |

Tests: `next/tests/run --tier t1 --only museum_format` (also `museum_assets`, `museum_table`, `museum_viewer`, `museum_panorama`). The sessions
are scripted touches (`ZINC_INPUT`, `touch ID X Y` and `touchup ID`): `next/tests/data/museum_table/hands.py` is two hands on two cards.

## Not there yet

Sequences are reached by their buttons only: hotspots, overlays, transitions, timed items, guided presentations and the storyboard for
visitors are the next task (ZN-650.05), with the narration. A film shows its poster and the panorama its flat image on the table until they are
embedded. Texts do not yet turn toward the side of the table a touch came from, and the text-size and high-contrast settings of the project
are read but not offered (ZN-650.06, ZN-650.10).
