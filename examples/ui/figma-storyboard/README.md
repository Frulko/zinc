# Figma storyboard example

```sh
build/zinc run examples/ui/figma-storyboard
```

`design.zui.json` describes two screens and a reusable temperature card with a numeric input and output event.
`src/design.tsx` was generated from it; `src/main.tsx` connects the event to application state. Click **Set to 22**, then
**Details** and **Back**. The updated value survives navigation because its state belongs to the caller.

The generator (`zinc ui code`) and the Figma plugin were part of the prototype and were removed with it (tag `prototype-final`):
`src/design.tsx` is now edited by hand. The format: [Figma → Zinc UI](../../../docs/figma-ui.md).
