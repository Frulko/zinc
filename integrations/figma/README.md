# Zinc UI — Figma development plugin

```sh
node integrations/figma/build.mjs
node compiler/bin/zinc.mjs ui serve ./build/figma-preview
```

Import `integrations/figma/manifest.json` from **Plugins → Development → Import plugin from manifest…** in Figma
Desktop. Select frames, then export ZIP, generate/copy TSX, or paste the pairing URL to send/preview in Zinc.

No build dependencies beyond Zinc's installed TypeScript compiler. The UI bundles the same document validator,
style rules, generator and ZIP writer as the CLI. `code.js` is the Figma sandbox; `ui.html` owns browser APIs.
Generated `dist/` is ignored by Git. This is an unpublished development plugin; the development ID must be replaced
with Figma's assigned ID before publishing, and kept stable for node annotations.

[Workflow, annotation contract, format, supported subset and checks](../../docs/figma-ui.md).
