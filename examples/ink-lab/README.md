# Ink Lab

A writing rectangle with, beside it, what `zinc:ink` recognised. Write with the pen (a mouse is the pen on the Mac and in the e-ink emulator).

- The big letter is the live answer: a guess every 120 ms while the pen is down and one at once at pen-up, so the answer is there before the mark is finished.
  Under it the five best candidates with their scores, the kind (letter, shape, circled, or "not sure"), the matching time and the time from pen to answer.
- A mark that has had no new stroke for 250 ms settles: it gets a black box and its label on the rectangle and a chip in the list. A dotted grey box is the mark still open.
- **letters / shapes / all** restrict the classes (`A B C D E V`; `circle x tick line`; every class of the model) and read the marks again. There is no digit set
  yet: the model has no digit class (`docs/reports/handwriting-research-2026-11.md`).
- **Undo** takes the last stroke back and reads what is left of its mark again. **Restart** clears everything.

```sh
zinc run examples/ink-lab --background          # Mac window, 1320x900
ZINC_EINK=1 zinc run examples/ink-lab --background   # the e-ink skin as on the reMarkable Paper Pro (810x1080 surface at 2x)
tests/run --only ink_lab                         # scripted pen session against tests/golden/ink-lab/session.txt
```

Code: `src/lab.ts` (when to ask, what to keep), `src/main.tsx` (the screen), `src/replay.ts` (`INK_LAB_REPLAY=<file>`: replays strokes through the real pen path).
