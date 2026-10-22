# {{name}}

## Next steps

- `zinc dev`: runs it; every save shows at once.
- Change `src/main.ts` and save.
- Learn the scene style, a lesson at a time: https://frulko.github.io/zinc/docs/learn/13-a-stage-and-a-sprite/
- The four ways to write a program: https://frulko.github.io/zinc/docs/start/styles/
- `zinc tour`: a guided first walk.

An app made from the `stage` template: a scene of objects (`zinc:stage`) as ActionScript 3 (Flash) and Haxe/OpenFL write it. A `Stage`
holds sprites; each sprite is a class that draws itself in its own coordinates (`onDraw`), moves on in `onUpdate`, and registers where
it takes a tap or a drag. A column and a row place them. Nothing is drawn while nothing changes, so it stays light on a 2011 tablet.

```sh
zinc run     # tap a colour, drag the sticker
zinc test    # the tests of tests/
zinc build   # a native executable in build/
```

| File | What it does |
|---|---|
| `src/main.ts` | the scene: a header row (a title and four colour buttons) over a board that holds a sticker you drag |

Every class and function: https://frulko.github.io/zinc/docs/reference/stage/. A larger app written this way, for old tablets:
`examples/music-tree` in the Zinc repository.
