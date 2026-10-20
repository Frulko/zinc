# Pinball table editor

The editor of the tables of [`examples/pinball3d`](../pinball3d/README.md). A table is data, not code: a folder with a
`table.json` and the images, sounds and models it names. The editor draws that file, lets you place, shape, name and tune
everything in it, write its rules as sentences, and play the table as you build it. It is written in Zinc with `zinc:ui`,
and it reads the format's own definition (`examples/pinball3d/src/format/`): a field added to the format shows in its
forms without a line of editor code.

```sh
zinc run examples/pinball3d-editor -- my-table           # a table folder; a new table when the folder has none
zinc run examples/pinball3d-editor -- friend.zpinball    # a package someone sent
```

The interface is in English or in French (the system's language; the switch is at the bottom right), the help line of
every field too.

## Make a table

1. **Start.** `zinc run examples/pinball3d-editor -- my-table` opens a new table: a board, a ball and a plunger.
   The list at the left is everything the file holds, the palette beside it everything that can be put on the board,
   the form at the right the properties of what is selected. Point at a field to read what it does.
2. **Place.** Pick an entry of the palette and click the top view; the line at the bottom says what the entry
   asks for (a wall or a ramp takes a click per point, Enter ends it). Drag to move, drag the round handle to turn,
   **M** adds the mirror image, the arrows nudge by a millimetre.
3. **Bring the files.** The editor does not paint or record. Put images, sounds and models in the folder, or use
   **Import…** in a file list, or drop a file on the window: it is copied into the table's folder.
4. **Write the rules.** Scores are a grid (what each thing is worth), rules and missions are sentences with choices:
   "When the ball hits *pops*: add *500* points".
5. **Play it.** **V** shows the table in 3D, **P** plays it with the game's own code, **B** drops a ball where you
   click. Change a number, play again.
6. **Save** (`⌘S`) writes `table.json` in the folder, in the one canonical form the game and the tools write.
   **Save as** (`⇧⌘S`) writes the table and its files in another folder and goes on there.

[`docs/pinball-make-a-table.md`](../../docs/pinball-make-a-table.md) follows the making of a whole table, Twilight Fair,
step by step with pictures; [`docs/pinball-table-format.md`](../../docs/pinball-table-format.md) is the reference of
every field.

## Share a table

**Export** (`⇧⌘E`) saves the table, then writes it and every file it names as one file, `my-table.zpinball`. Send that
file. A table that names a file its folder does not have is not exported: the message names the file.

Whoever receives it can:

- **play it**: `zinc run examples/pinball3d -- --table=my-table.zpinball`, or put the file in the game's
  `assets/tables/`: it is in the list of tables at the next start;
- **open it in the editor**: `⇧⌘O`, or drop the file on the window, or name it on the command line. The package is
  unpacked into a new folder beside it (`my-table`, or `my-table 2` when that folder exists: nothing is written over
  a folder that is there), and that folder is the table to work on. To share the changes, export again.

A package is whole or refused. It is a pack of the engine ([`docs/zpk.md`](../../docs/zpk.md)) that keeps a checksum
of every file; the game and the editor read all of them before anything else. A package that a bad copy or an edit
changed, or that lacks a file its table names, is not opened, and the message names the file:
`Cannot open my-table.zpinball: the file "sounds/bell.wav" was altered after the package was made`.

Before sharing, fill the **credits** of the table (who made which files, under what licence): they travel with it.

## Keys

`⌘` is Ctrl on Linux and Windows.

| | |
|---|---|
| `⌘N` `⌘O` `⇧⌘O` | new table, open a folder, open a package |
| `⌘S` `⇧⌘S` `⇧⌘E` | save, save as, export |
| `⌘Z` `⇧⌘Z` | undo, redo |
| `⌘0` `⌘=` `⌘-` | the whole table, zoom in, zoom out |
| `⌘F` `⌘G` `⌘K` | find a field, go to a thing by its name, find a score |
| `⌘D` `M` `R` `⇧R` | duplicate, mirror, turn by 15 degrees one way or the other |
| arrows, `⇧` arrows | move by a millimetre, by a centimetre |
| `Delete` | the point last pressed, else the selection (what would go with it is said first) |
| `⌘I` `⌘R` | import a file, read the folder's files again |
| `⌘E` `⌘J` | the advanced mode (the keys of the file, exact numbers), the selection as the file has it |
| `V` `P` `B` `O` | the 3D pane, play or pause, drop a ball, one frame of a paused game |
| `W` `C` `L` `Esc` | the game's own window, use this view for the layout, the next level, end the game |

## Tests

`tests/t1/pinball3d_editor*.sh` replay recorded sessions (what was clicked and typed) and compare the file written
and a few frames with `tests/golden/pinball3d-editor/`; `src/selftest.ts` checks the document without a window
(undo and redo byte for byte, every text and every help line in both languages).
