# {{name}}

A 2D game made from the `game-2d` template: collect the coins before the time runs out.

```sh
zinc run      # play: arrows / WASD or a gamepad, or hold the pointer where to go; Enter, Space or a click to start
zinc test     # the rules of the game (tests/world.test.ts)
zinc build    # a native executable in build/
```

| File | What it does |
|---|---|
| `src/main.ts` | the frame loop: runs the current scene and switches to the one it names |
| `src/scenes.ts` | the title, play and game-over scenes (drawing and input) |
| `src/world.ts` | the rules without drawing: movement, coins, score, time (what the tests check) |
| `src/save.ts` | the best score, kept with `zinc:storage` |
| `assets/*.svg` | the sprites: the `sprite` rule of `zinc.json` packs them into one texture, an atlas, drawn with `zinc:sprite`: `atlas('sprites').frame('player.svg').draw(x, y)` (PNG and Aseprite files too, see docs/plugins/sprite.md) |
| `assets/coin.wav` | the sound of a collected coin, played with `zinc:audio`: `load('coin.wav').play()` (WAV, FLAC, MP3 or OGG; `loop` and `volume` for music) |
