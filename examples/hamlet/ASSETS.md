# Hamlet sprites: the atlas and how to replace a sprite

The Cite view (`ZINC_HAMLET_VIEW=cite`) draws trees, rocks, buildings, people, animals, smoke, water glints and grass from PNG sheets in
`assets/atlas/`. Without those files the same sprites are made by code (`src/cite/atlas.ts`) at the first frames, so the game always has art.

## Files

```
assets/atlas/index.json        the groups: name, sheet, x, y, w, h, anchor, frames, directions (1x pixels)
assets/atlas/1x/<sheet>.png    the sheets at normal size
assets/atlas/2x/<sheet>.png    the same sheets at twice the size, used when the zoom is above 2
```

Sheets: `trees-spring`, `trees-summer`, `trees-autumn`, `trees-winter`, `props` (rocks and deposits, the carried box, smoke, water glints, grass),
`buildings`, `people`, `animals`. `atlas-preview.png` (written by the export) is a labelled picture of all of them.

A **group** is a grid of `w` x `h` cells with 1 transparent pixel between cells at (`x`, `y`) of its sheet: `frames` columns, `directions` rows.
A person is 4 frames (columns) by 8 directions (rows); a tree group is 4 sway frames of one kind in one season; `fx/grass` is 4 sway frames by
4 seasons. `anchor` is the foot of the sprite inside a cell (where it stands on its tile). The 2x sheets hold every cell at twice the size, at
twice the coordinates.

## Replace a sprite

1. Open the PNG sheet (`1x/people.png`, say) in any editor and paint over the cell. Keep the cell's place and size, keep transparency, keep the
   1 pixel gap. Do the same cell in `2x/` at twice the size if you want it sharp when zoomed in (the 2x sheet is used above zoom 2; the 1x
   one is never stretched there, so an unedited 2x sheet shows the old art).
2. To move or resize a group, edit its entry in `index.json` (`x`, `y`, `w`, `h`, `anchor`). The group names and their order must stay as they
   are: when `index.json` does not match the build, the game says so on the console and uses the sprites made by code.
3. Run `zinc run examples/hamlet` with `ZINC_HAMLET_VIEW=cite`. `ZINC_HAMLET_ATLAS=code` shows the generated sprites instead, to compare.

## Export the generated sprites (the source of the shipped files)

```sh
ZINC_HEADLESS=1 ZINC_HAMLET_VIEW=cite ZINC_SIZE=2100x1250 \
ZINC_HAMLET_ATLAS_DUMP=examples/hamlet/assets/atlas ZINC_HAMLET_ATLAS_PREVIEW=atlas-preview.png zinc run examples/hamlet
```

It writes both scales (`ZINC_HAMLET_ATLAS_SCALES=1`: only 1x) and the contact sheet, then quits. The sheets are written by `src/cite/png.ts`
(no module of the engine encodes pixels with their transparency yet; `zinc:gfx` `capture` saves the opaque screen only).

## Animation, in the view

Trees and grass sway by frame (4 frames, a different phase per tile), water tiles show glints that change frame, working buildings with a
chimney smoke, and each building is mirrored and tinted a little by its tile so a row of houses is not a row of copies.
