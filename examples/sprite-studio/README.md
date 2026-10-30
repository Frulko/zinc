# Sprite Studio

A pixel-art sprite editor in three windows, the way Aseprite's or Photoshop's floating panels work. Each window does one job:

- **Canvas** (the main window, in the middle): the 32 x 32 sprite at x14 with its grid. Draw with the pencil, the eraser, the fill and the
  picker (mouse or touch), go through the frames of the animation, add, copy and delete them, show the previous frame as an onion skin,
  undo and redo, save and load.
- **Tools** (on its left, a `zinc:ui` tree in a window of its own): the tools, the brush size, the 15-colour palette (click a colour; type
  a `#rrggbb` in the field and press Enter to change it everywhere it is used), the frame thumbnails, the onion skin and the preview's play
  and speed. It owns no state: each button posts a command to the canvas over a `MessageChannel`, and it shows the state the canvas sends
  back, so both windows always agree. When it opens it asks the canvas for its state with `request`.
- **Live preview** (on its right): a worker plays the animation at the chosen speed and computes each picture, the frame at x1, x2 and x4
  and 3 x 3 copies to check that a tile is seamless, as a `Scene` it posts to the window. However heavy that picture, the canvas never waits
  for it. The worker gets the frames whenever they change.

A small character walking in four frames is there on the first run. Closing the tools or the preview keeps the app running: the canvas's
*Tools* and *Preview* buttons, or the keys T and P, open them again.

## Run

```sh
ZINC_BACKGROUND=1 build/zinc run examples/sprite-studio
```

The sprite is saved to `sprite.json` in the app's folder (Cmd/Ctrl+S, *Save*) and loaded from it (Cmd/Ctrl+O, *Load*);
`SPRITE_STUDIO_FILE` names another file.

## Keys (canvas window)

| Key | Does |
|---|---|
| B, E, G, I | pencil, eraser, fill, picker |
| Left, Right | previous, next frame |
| N | add a frame |
| Space | play or pause the preview |
| Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z (or Cmd/Ctrl+Y) | undo, redo |
| Cmd/Ctrl+S, Cmd/Ctrl+O | save, load |
| T, P | open the tools, the preview |

## Layout of `src/`

```text
src/
├── main.tsx              # mounts the canvas, places and reopens the windows, routes the keys, sends each change once a frame
├── constants.ts          # sizes, window places, colours, limits
├── state.ts              # the canvas's state and actions: sprite, tool, colour, frame, history
├── commands.ts           # what a command of the tools window does
├── protocol.ts           # the messages between the windows
├── sprite.ts             # the sprite and its pure operations (stroke, flood fill, JSON)
├── starter.ts            # the walking character of the first run
├── preview.worker.ts     # the preview's player and scenes, on the worker's thread
├── services/file.ts      # save and load
├── components/           # Chip (a button that shows the active choice), pixels (drawing a frame with zinc:gfx)
├── pages/canvas/         # the canvas window
└── windows/              # the tools window (tools.tsx) and the preview window (preview.ts)
```

## Notes

- The canvas and the thumbnails are lazy `Canvas` nodes: nothing repaints while nothing changes (the T1 test checks 300 idle frames).
- QuickJS (`--engine quickjs`) has no workers yet: the canvas and the tools work, and the preview window says why it is empty.
- The test: `tests/t1/sprite_studio.sh` (a scripted session on the three windows, their goldens, the idle check, AOT and QuickJS).
