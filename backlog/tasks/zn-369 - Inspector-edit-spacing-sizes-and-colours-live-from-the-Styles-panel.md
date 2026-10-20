---
id: ZN-369
title: 'Inspector: edit spacing, sizes and colours live from the Styles panel'
status: Done
assignee: []
created_date: '2026-10-08 15:16'
updated_date: '2026-10-10 22:24'
labels:
  - devtools
  - ui
  - size-M
milestone: m-20
dependencies: []
ordinal: 24000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The inspector (plugins/devtools, Chrome DevTools) shows the tree, the computed styles and edits `class`. Add the Styles panel's editing: CSS.getMatchedStylesForNode with the node's style objects and classes as rules, CSS.setStyleTexts and the box-model editor for padding, margin, gap, sizes, radius, colours, font size; changes apply live and are collected as a patch (the style object or class string to paste back), shown in the console.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 editing padding in the box model of DevTools changes the app's frame (scripted CDP test with scripts/cdp-check.mjs)
- [x] #2 the patch printed for a session lists each node's changed properties in the source form (object or class)
- [x] #3 works for components styled with classes and with StyleSheet objects
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (2026-10-11). zinc:ui: a layer of the inspector's own styles per node (ui.inspectStyle(h, keys, values), a Style applied by rebuildStyle after classes, sheets and style numbers, dropped when the node is released), ui.classStyle(tag, cls) and ui.sheetStyle(h, numbers) give what a class string, a node's sheets or its numbers declare on a scratch node. plugins/devtools: CSS.getMatchedStylesForNode shows the classes (.p-2.bg-rose-600.rounded), the StyleSheet (style={StyleSheet}) and the numbers as read-only rules and element.style as the editable inline style (styleSheetId inline:<node>, ranges); CSS.getInlineStylesForNode; CSS.setStyleTexts replaces the node's inspector declarations (padding/margin shorthands, gap, sizes, min/max, radius, border width, font size, colours #rgb/#rrggbb/rgb(), opacity; others kept in the text, parsedOk false); computed style gains the per-side longhands the box model reads; the node shows a style attribute. Each edit sends the session patch as a console message: class string for class-styled nodes (a class that sets only edited properties is replaced, p-4 stays and pl-[20px] follows), 'style, add { paddingLeft: 20, backgroundColor: "#10b981" }' for nodes with sheets or numbers. Zinc Next's devtools transport (cdp.next.ts) now answers Page.captureScreenshot through gfx.capture to a temp file (full size; screencast not shrunk). Test tests/t1/devtools_styles.sh (scripts/cdp-check.mjs --styles on tests/data/devtools_styles): rules of both boxes, padding-left 8 -> 20 moves the content 12 px and widens the box 12 px, the frame (screenshot) changes, element.style reads back, both patch lines, an empty text gives the StyleSheet box its padding back. Also pass: devtools_port, dev_mode, proto_devtools (the prototype compiles the new code), ui, ui_style, jsx_style, ui_alloc, ui_alloc_layout, ui_alloc_text, style_size, style_flex, react_native, ui_state, windows. Not verified: the real Chrome DevTools frontend (only a scripted client; the Styles pane may want more fields). usage: n/a
<!-- SECTION:NOTES:END -->
