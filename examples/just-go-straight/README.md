# Just go straight

The original pirate game by [Gimond](https://github.com/Gimond/just-go-straight), running in Zinc without a browser or WebView. QuickJS executes the JavaScript; Zinc provides native Canvas 2D rendering, keyboard input and audio.

```sh
build/zinc run examples/just-go-straight
```

Use the arrow keys to move. Pick up the shovel, find the treasure, and press Enter at an ending to play again.

`main.js` contains the four original CommonJS modules wrapped in a local module loader. Only the upstream debug `console.log` calls were removed. The seven PNG files are unchanged. No npm install, bundler or network connection is needed to play.

Source: Gimond/just-go-straight commit `ca9acbb8be8482d2e73f92cbc4a381b66b53d9e5`. The game and pictures are distributed under the included GPL-3.0 license; `jsfxr` retains its Apache-2.0 notice inside `main.js`.

Verified on the development Mac with `tests/run --only just_go_straight`: a scripted keyboard session picks up the shovel and reaches the treasure, checks the final picture and verifies five distinct generated sounds reach the native audio mix. The strict TypeScript checker does not accept this upstream JavaScript; run it through QuickJS, selected automatically by the `.js` entry. Other targets are unverified.
