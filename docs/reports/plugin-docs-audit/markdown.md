# Audit: zinc:markdown (plugins/markdown)

## What it is
Parse Markdown (CommonMark + GitHub tables, task lists, strikethrough, autolinks) into a tree of blocks, spans and texts with md4c. A maker lays the tree out as they like (the e-paper reader `app/markdown` does).

## Targets and status
plugin.json: macos, linux, windows, rmpp (md4c 0.6.0, vendored with PIN). Verified on the Mac only (`tests/t0/markdown.sh`, `tests/t1/markdown_reader.sh`); the tablet is untested. No web, wasm or ESP32 build (ZN-844 line in backlog/later.md, which also wants `lib/std/markdown.ts` moved onto md4c).

## What the docs have
- [x] Overview, dialect/flags, quick start (docs/plugins/markdown.md, 27 lines)
- [x] Node kinds list (blocks, spans, texts), `textOf`, `setTask`, `version`
- [ ] Install/requirements (nothing to install, but not stated)
- [ ] API reference complete: no table of the `Node` fields, no list of the `FLAG_*` constants
- [x] Example code (inline); [x] runnable example: `app/markdown` (an app, not under examples/)
- [ ] Screenshot/GIF; [ ] tutorial; [ ] commands (`zinc run app/markdown`)
- [ ] Notes: unknown flags, `T_HTML` handling with `FLAG_NO_HTML`, offsets are bytes
- [x] Test: markdown.sh, markdown_reader.sh

## What is missing (priority order)
1. Screenshot of `app/markdown` (ZINC_SHOT=... zinc run app/markdown, fixture in `app/markdown/fixture`).
2. API table: `Node` fields (`kind, children, level, task, taskOffset, align, href, title, lang, text`), `isBlock/isSpan/isText`, every `FLAG_*` and what `GITHUB` is.
3. Document `MARK` (115), `FLAG_UNDERLINE`, `FLAG_NO_HTML`, `FLAG_PERMISSIVE_AUTOLINKS`.
4. A 5-step tutorial: "render a README in a zinc:ui app" (parse, walk blocks, map H/P/UL/CODE to `<Text>` classes, links, tables).
5. A runnable `examples/markdown-viewer` (desktop, zinc:ui) so a user has code to copy; `app/markdown` is e-ink specific.
6. Note how task toggling works end to end (`setTask` returns the new source, caller writes the file).
7. Say that images are only a node (`IMG` href), loading is the program's job.
8. (hardware) a photo of the reader on the reMarkable.

## Wrong or stale
- Spans list omits `MARK`; says "`UNDERLINE` (with their flags)" without naming the flag.
- plugin.json lists windows; the doc says "macOS, Linux (and the reMarkable's prebuilt), Windows, rmpp" (reMarkable prebuilt and rmpp are the same thing).

## Suggested pages
Markdown plugin overview; API reference (generated); Tree reference (block/span/text kinds); Dialects and flags; Tutorial: render a Markdown file as UI; Recipe: tick a task list; Example: Zinc Read (app/markdown); Notes: platforms.
