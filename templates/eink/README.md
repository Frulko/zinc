# {{name}}

A reMarkable Paper Pro app made from the `eink` template: a to-do list you tick with the pen, and a page to sketch on. Both are kept between runs.

```sh
zinc run                          # on the desktop, half the tablet's size (the mouse is the pen; right button erases)
zinc test                         # the to-do list (tests/todo.test.ts)
zinc export --target rmpp         # the tablet build in dist/ (see Zinc's docs/targets/remarkable-paper-pro.md to install it)
```

| File | What it does |
|---|---|
| `src/main.tsx` | the two pages and the tab bar |
| `src/todo.ts` | the list: add, tick, clear the ticked ones, save / load (tested) |
| `src/store.ts` | what is saved with `zinc:storage`: the list and the sketch's strokes |

E-paper is slow to change and has no colour: the template keeps black on white, wide borders and large type, and changes the screen only
when something happens (no animation, no blinking caret).
