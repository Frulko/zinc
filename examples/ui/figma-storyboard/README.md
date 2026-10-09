# Figma storyboard example

```sh
node compiler/bin/zinc.mjs run examples/ui/figma-storyboard
node compiler/bin/zinc.mjs run examples/ui/figma-storyboard --target wasm
```

`design.zui.json` describes two screens and a reusable temperature card with a numeric input and output event.
`src/design.tsx` is generated; `src/main.tsx` connects the event to application state. Click **Set to 22**, then
**Details** and **Back**. The updated value survives navigation because its state belongs to the caller.

Regenerate: `node compiler/bin/zinc.mjs ui code examples/ui/figma-storyboard/design.zui.json > examples/ui/figma-storyboard/src/design.tsx`.
Plugin installation, format and limits: [Figma → Zinc UI](../../../docs/figma-ui.md).
