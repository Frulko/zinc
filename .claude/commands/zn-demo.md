---
description: Write or change a demo of examples/ to the demo bar (examples/GUIDELINES.md)
argument-hint: <demo name> <what it should do>
---

Write or change the demo `$ARGUMENTS`.

1. Read `examples/GUIDELINES.md` and the reference demo's `src/` (`examples/music-tree`). Choose the UI model as the guidelines say
   (old devices: the display tree on `zinc:gfx`, copied from the reference's `core/`) and say which in one line.
2. Lay the project out as the guidelines say; write it in English.
3. Before saying it is done, prove it: `build/zinc check <demo>`, the demo's T1 test (write it if it is missing), and the idle check
   (`ZINC_HEADLESS=1 ZINC_FRAMES=300`, count the frames drawn with no input). Every window you open runs with `ZINC_BACKGROUND=1`.
4. Report what was checked, what was not, and any rule of the guidelines you broke and why.
