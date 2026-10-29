# Audit: zinc:ink (plugins/ink)

## What it is
A handwriting surface for pen or mouse: pressure strokes with six writing tools, erasers, undo/redo, JSON and SVG export, and an `<InkCanvas>`.

## Targets and status
plugin.json: macos, linux, windows, rpi1, wasm, rmpp. Pure Zinc (no native dir). Proven headless on the Mac by `tests/t1/ink_tools.sh`, `pdf_reader.sh`, `web_relay.sh`; not tried with the Marker on a real tablet (docs/targets/remarkable-paper-pro.md). Pressure curves are marked "tune on hardware".

## What the docs have
- [ ] docs/plugins/ink.md (none). Content is spread over docs/targets/remarkable-paper-pro.md, docs/templates.md (eink, remarkable), docs/reports/ink-tools-and-annotation-formats.md (research), the header comment of index.ts
- [ ] Overview for a maker, [ ] install, [ ] quick start in a plugin doc
- [ ] API reference: `Ink` (feed, draw, drawOver, paint, undo/redo, clear, setStrokes, toJSON, toSVG), `Stroke`, `TOOLS`, `ERASERS`, `parseStrokes`, `InkCanvas`
- [x] Runnable: `examples/remarkable/notes`, `dashboard`, `templates/eink`, `templates/remarkable`, `app/pdf`, `app/markdown`
- [ ] Screenshot/GIF; [ ] tutorial; [ ] JSON file format spec
- [x] Test: ink_tools.sh with golden

## What is missing
1. docs/plugins/ink.md: quick start (`const doc = new Ink(); <InkCanvas ink={doc} className="grow"/>`), tool/colour/width setters, undo/redo, save/load.
2. Screenshots: `zinc run examples/remarkable/notes` (e-ink emulator 1620x2160, ZINC_SHOT) with each of the six tools.
3. Tool table: name, width rule (`segWidth`), alpha, pencil colour rule; picture of the six strokes (golden under tests/golden/ink-tools can be reused).
4. JSON schema (`version:1`, points x,y,pressure, optional tool) and SVG notes (`data-tool`), plus `parseStrokes` limits ("reads only toJSON output").
5. Tutorial: "a notebook page with pen, eraser, undo and autosave (zinc:storage)".
6. Reader overlay recipe: `drawOver` and `feed` in ink coordinates (what app/pdf does).
7. Latency design note (pen queue, damage rect, baked image) for e-ink fast waveforms.
8. (hardware) Marker test on the rMPP; pressure tuning values.
9. Mention InkML/.xopp export idea only in later.md (already there).

## Wrong or stale
- plugin.json description: "pressure strokes, eraser, undo, JSON/SVG export" omits the writing tools and area eraser.
- docs/guide/05-plugins.md line 138 says zinc:ink is JSX like host tags; it exports a function component `InkCanvas`, not a host tag.

## Suggested pages
Ink overview; API reference (generated); Writing tools; Tutorial: a notebook page; Recipe: ink over a PDF/Markdown page; File formats (JSON, SVG); Example: reMarkable notes; Notes: pen input and latency.
