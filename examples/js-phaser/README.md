# js-phaser

Star catcher, a small game made with [Phaser 3](https://phaser.io) (3.90.0, unmodified) in plain JavaScript: sprites cut from a sheet, arcade physics (gravity, overlap, the edges of the world), the keyboard, and text (`this.add.text`: the title, the score and the game over line).

![the game](screenshot.png)

```sh
cd next
build/zinc run ../examples/js-phaser
```

Left and right arrows steer the boat. A star caught is a point; a rock ends the game (`GAME OVER`), and the space bar starts it again.

How it fits together:

- `main.js` is JavaScript, so `zinc run` takes the QuickJS engine by itself. `zinc.json` has `"web": true`: the program gets a `window`, a `document` and WebGL, as a page in a browser does.
- `main.js` is the page: it loads Phaser (the copy in `next/third_party/phaser`), then `game.js`, as two `<script>` tags would.
- `game.js` is the game, one scene of about fifty lines. It is Phaser as its guide writes it; nothing in it is special to Zinc.
- `assets/` holds two pictures and two sounds, all written by `assets/make-assets.mjs` from drawings made of letters (`node assets/make-assets.mjs` makes them again; change a drawing there). Pictures, sounds and script were written for this example and are public domain (CC0).

Not there yet:

- No sound: the web environment has no audio (ZN-573). The game loads and plays its two sounds as any Phaser game does, and Phaser stays silent; they will be heard without a change here.

Test: `next/tests/run --only example_js_phaser` (a scripted game that ends on `game over: 3 stars`, and frame 440 against `screenshot.png`).
