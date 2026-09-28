# PocketJS Hero on Zinc

The [PocketJS](https://github.com/pocket-nexus/pocketjs) `apps/hero` demo compiled to native code by Zinc, without a
JavaScript engine. `Hero.tsx` and `Hero.ts` are unmodified copies of the PocketJS sources (commit 25081f6, MIT,
© 2026 Yifeng "Evan" Wang); `app.tsx` replaces `mergeProps` with explicit defaults. The `@pocketjs/framework/*` and
`solid-js` imports resolve to Zinc's compatibility modules (`lib/compat/pocketjs`), and the assets (logo, spinner
SVGs, Inter font) are baked at build time.

```sh
zinc run examples/pocket-hero                 # macOS window, 480x272 like the PSP viewport
zinc run examples/pocket-hero --target wasm   # browser
zinc run examples/pocket-hero --target sim    # Node oracle
```

Space/Enter or a click presses the button; after four presses the "Reactive on real hardware." line appears.
