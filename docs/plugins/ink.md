# ink plugin (`zinc:ink`)

A handwriting surface for pen devices and a local recogniser for what is written on it. Everything runs on the device, with no cloud and
no model download: the first stage names letters and shapes by matching them against a few hundred recorded examples.

- **Surface.** `Ink` turns pen samples into pressure strokes with a writing tool (ballpoint, fineliner, marker, pencil, calligraphy,
  highlighter), erasers, undo and redo, JSON and SVG export; `<InkCanvas ink={doc} />` draws it. `examples/remarkable/notes` is the
  worked app; `ink.overlay = true` draws the strokes as polylines over whatever is under the canvas (a game board, no opaque page image; for a few strokes); `docs/reports/ink-tools-and-annotation-formats.md` has the formats.
- **Recognition.** `recognise`, `recogniseAsync`, `StrokeGrouper`, `loadModel` (below).

## Recognition

```ts
import { Ink, StrokeGrouper, recognise, recogniseAsync } from 'zinc:ink';

const grouper = new StrokeGrouper({ debounceMs: 450, gapPx: 40 });
// when the pen lifts: grouper.add(ink.strokes[ink.strokes.length - 1], now);
// every frame:
const groups = grouper.poll(now);              // Stroke[][] | null: the marks that are finished
for (const g of groups ?? []) {
  const r = recognise(g, { classes: ['A', 'B', 'C', 'D', 'E', 'V', 'circle', 'x'], priors: placed });   // placed: a Map<string, number>, e.g. A -> 0.2
  if (r.kind === 'letter') place(r.candidates[0].label, r.circled);   // "A", circled or not
  else if (r.kind === 'shape') mark(r.candidates[0].label);            // "x", "circle", "tick" or "line"
  // 'unknown': leave the ink as it is
}
const later = await recogniseAsync(group);      // the same answer, matched on a worker thread
```

- `recognise(strokes, opts?)`: a `Recognition` with `kind` (`'letter'`, `'shape'` or `'unknown'`), `candidates` (`{ label, score }`, score 0 to 1,
  best first), `box` (the strokes' bounding box), `circled` and `ms`. `opts.classes` restricts the closed set, `opts.priors` multiplies the
  score of a label (a letter already placed: `0.2`), `opts.reference` runs the TypeScript matcher.
- The answer is `'unknown'` when the best score is under `MIN_SCORE` (0.4) or beats the second by less than `MIN_MARGIN` (0.1): the recogniser
  never guesses. A scribble, a second letter in the same group or a partial letter end up there.
- A letter with a circle around it, drawn before or after, gives `circled: true` and is read without the circle.
- `recogniseAsync(strokes, opts?)`: the matching runs on a worker thread of the plugin and the promise resolves on the UI thread; use it when a
  frame must not wait (a tablet's CPU takes tens of milliseconds where a computer takes one).
- `StrokeGrouper`: `add(stroke, nowMs)`, `poll(nowMs)`, `flush()`. A stroke whose box (grown by `gapPx`) touches the open group's joins it; one
  elsewhere closes the open group at once; a group with no new stroke for `debounceMs` is finished.
- `loadModel(path)`: replaces the built-in templates by a file of `[label, strokes]` pairs, the format `tools/ink-train/make-templates` writes
  (`false` if the file is unreadable). Classes are whatever labels the file holds, so an app can teach it other letters or digits.

Classes of the built-in set: `A B C D E V`, `circle`, `x`, `tick`, `line`.

## How it works

The strokes of a mark are resampled to 32 points by arc length (the pen-up jumps count for nothing), scaled into a unit box with the aspect
kept, and centred. The distance to a template is the greedy nearest-point match of the two clouds from several start points in both
directions (the point-cloud family `$P` and `$Q` of Vatavu, Anthony and Wobbrock), abandoned as soon as it cannot beat the best so far; a class's
distance is its closest template's, and the score is `1 / (1 + (d / 0.3)^2)`. The cloud match ignores the order and number of strokes, which
is what lets an `E` drawn in one stroke or four match the same templates.

The C++ matcher is `plugins/ink/native/ink.abi.cpp` (on the native ABI, so it runs the same under the interpreter, the AOT and QuickJS);
`plugins/ink/recog.ts` is its TypeScript twin, step for step, and `tests/t0/ink_recog.sh` checks that they agree to 1e-9.

## Templates and training data

`plugins/ink/templates.ts` is generated: `tools/ink-train/make-templates` picks examples of the train writers from
`tools/ink-train/data/ink-set.json`, which `tools/ink-train/make-dataset` writes (deterministic, synthetic, CC0, under 1 MB). The
dataset is split by writer: the test writers never contribute a template. Real handwriting joins with the notes app's record mode
(`NOTES_RECORD=<name> zinc run examples/remarkable/notes`, or the Record button), one file per writer in the notes directory, then
`make-dataset --real <dir>` and `make-templates`. Synthetic strokes are only a start; recognition on real writers is measured on the tablet.
