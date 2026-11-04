# Clear

A native Zinc recreation of classic Clear, based on the supplied Mac and iPhone screenshots: heat-map priorities, blue list overview, black empty space and completed tasks in grey. No webview or additional UI dependency.

```sh
build/zinc run examples/clear
# Standalone executable:
build/zinc build examples/clear -o build/clear
build/clear
```

Type anywhere to add a task; Enter saves and Escape cancels. Click a task to edit it. Swipe right or right-click to complete, swipe left to delete. Hold a row and drag vertically to reorder. Pull down to add; pull up to clear completed tasks. Pinch closed to return to lists, or spread two touch points to insert between tasks. Click the title to return to lists. The menu offers palettes, list renaming, clearing and undo.

Keyboard: arrows select, Enter edits/opens, Space completes, Alt+Up/Down reorders, Delete removes, Cmd/Ctrl+N creates, Cmd/Ctrl+Z undoes and Shift+Cmd/Ctrl+Z redoes. Cmd/Ctrl+Backspace clears completed tasks.

Lists and palettes persist through `zinc:storage`. `ZINC_STORAGE=/tmp/clear-demo.kv` isolates a trial from normal app data. A failed save keeps the editor and draft open with an error; undo/redo history lasts for the current process.

`src/main.tsx` composes the app. `state.ts` owns document changes and undo; `services/document.ts` owns persistence; `pages/` own screens and their gestures; each reusable UI component has its own file under `components/`.

## References and scope

The supplied `clear-1.webp`, `clear-3.jpeg` and `clear-2.jpg` guided the appearance. `assets/icon.png` is the supplied icon, re-encoded as PNG to remove an invalid transparency chunk. Original files are unchanged.

Behavior references: [official gesture guide](https://club.useclear.com/t/gesture-list-how-to-guide/2588), [Clear for Mac review](https://www.macstories.net/reviews/clear-for-mac-review/) and [original Clear review](https://www.macstories.net/reviews/clear/). Clear belongs to its respective owners; this is an independent educational recreation, without affiliation. Cloud sync, reminders, purchases and sound packs are outside this demo.

## Proof

```sh
tests/run --tier t1 --only clear
tests/run --tier demo --only clear
```

The first checks types, matching initial pixels on interpreter/native/QuickJS and idle painting. The second drives actual keyboard, mouse, touch, reorder, palettes, undo, process restart and failed-save recovery. Native macOS window rendering was also captured. Scripted touch input is covered; physical touch hardware and other platforms have not been validated.
