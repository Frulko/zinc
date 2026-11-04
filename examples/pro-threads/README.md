# PRO Threads / Zinc

A native WebGL 2 adaptation of [PRO Threads](https://www.kubai.design/pro-threads/) by Kubai087, MIT (2026). The original shader, A–Z sheet geometry and nine palettes are preserved in `src/upstream/`; see [LICENSE.upstream](LICENSE.upstream). Retrieved 2026-10-31. No browser, webview, remote dependency or network request is involved at runtime.

## Run

From the repository root:

```sh
build/zinc run examples/pro-threads
```

The manifest selects Zinc's JavaScript web environment and QuickJS/WebGL runtime. This is plain JavaScript, like `examples/js-three`; the strict TypeScript checker (`zinc check`) does not validate this entry. A WebGL 2 GPU is required; there is no software approximation.

The animated letters fill the window and keep their proportions when it resizes. Controls:

- Click or tap, or **Right**: next palette.
- **Up**: next lighting/motion effect.
- **Space**: pause/resume (paused frames do not redraw the shader).
- **Tab**: switch between the word and A–Z.
- Type letters to edit the word (last ten letters); **Backspace** deletes; **Enter** restores PRO.

The terminal prints the controls and selected palette/effect. The original browser settings panel, PNG exporter, embed UI and persistence are outside this adaptation.

## Sources

- `src/main.js`: WebGL setup, uniforms, resize, input and animation loop.
- `src/state.js`: original defaults and seven effect presets.
- `src/upstream/`: unmodified original shader, geometry packer and palettes.
- `assets/icon.svg`: local app icon.

## Verification

```sh
tests/run --only pro_threads
```

Verified on the development Mac: original shader compilation, nonblack thread pixels, palette/effect commands, word/alphabet switching, moving frames and 300 stable paused frames. A real background window was captured and visually inspected as well as the headless GPU capture. No engine build was needed. Android, Pi and other targets, performance, and interpreter/AOT execution are unverified; this JavaScript entry uses QuickJS.

## Upstream file checksums (SHA-256)

- `letters.js`: `7885a294423185492a8582d2fbd61875b1147da30c7fc875d08be18826b2e7d1`
- `palettes.js`: `c385b2038517975b28086a40e2fb9825f2b687d1b0bc07bc85f90179f27ede16`
- `shader.js`: `3f67a7309d54a1f1b1733684c022d7095c1a5a47b7c4843b10732873120c575a`
