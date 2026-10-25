# Zinc Read

Markdown documents and Notion pages on the reMarkable Paper Pro. md4c (`zinc:markdown`, `plugins/markdown`) parses each `.md`; the
reader lays it out on fixed pages the size of the screen. Black on white, large targets, page turns instead of scrolling: one e-ink
refresh per gesture.

- **Library**: every `.md` in `~/zinc-docs` and its sub-folders (`ZINC_DOCS_DIR`); copy files there (`scp *.md root@10.11.99.1:zinc-docs/`)
  and tap **Rescan**. Notion pages land in `~/zinc-docs/notion/`.
- **Reading**: swipe up or left for the next page, down or right for the previous one; **Previous** and **Next** do the same (the wheel
  on a desktop). **A−** and **A+** change the text size (26 to 54 px) and lay the document out again at about the same place.
- **Contents**: the headings with their pages; tap one to go there.
- **Links**: a tap on a link to another `.md` (relative to the document) opens it, `#heading` and `other.md#heading` jump to that
  heading; **‹ Back** returns. Web links cannot open here: the status line names them.
- **Tasks**: a tap on a task box (`- [ ]`) ticks it and writes `[x]` into the file (only that character changes); a second tap unticks it.
- **Pen**: writes over the page. The notes are kept per document and per text size (a new size moves the words), in document pixels,
  saved on every page turn, on **Accueil** and **Quitter**. **Undo** removes the last stroke; the Marker's eraser end erases. On a desktop
  **Pen** makes the mouse write.
- **Pictures**: `![alt](figure.png)` with a path relative to the document (PNG); a web picture shows as its alt text.
- **Refresh**: a full refresh of the display, to clear the ghosting. The last document and page come back at the next start (zinc:storage).

## Notion

1. On https://www.notion.so/profile/integrations create an **internal integration** (read content is enough) and copy its secret.
2. In Notion open the page, then **…** > **Connections** and add the integration: it sees that page and its sub-blocks only.
3. In **Settings** paste the secret and the page's link (or its 32-digit id), then **Save and sync**. The page is fetched through the
   official API (`https://api.notion.com/v1`, `Notion-Version: 2026-03-11`: the page's title, then its blocks, every page of results and
   the nested blocks), turned into Markdown and saved as `notion/<title>-<id>.md`: it reads offline. **Sync** fetches every saved page again.

Converted: paragraphs, headings, bulleted, numbered and to-do lists (nested), toggles (as list items), quotes, callouts, code, dividers,
tables, equations (as code), bookmarks and embeds (as links), pictures (as links: Notion's file links expire after an hour), columns and
synced blocks (their content). Sub-pages are named, not fetched; databases are skipped. The tablet reaches Notion over HTTPS
(zinc:net, mbedTLS) and needs Wi-Fi with internet: without it the status line says so.

## Run it

```sh
ZINC_DOCS_DIR=app/markdown/fixture zinc run app/markdown     # the e-ink emulator at 1620x2160, on the test documents
zinc pack app/markdown -o markdown.zapp                     # the package for the tablet
```

On the tablet (the engine of ZN-841 in `/home/root/zinc`): through the hub (`app/hub`, Install) once the app is published, or by hand:
`scp markdown.zapp root@10.11.99.1:/home/root/zinc-apps/`, then `/home/root/zinc/bin/zinc-tile /home/root/zinc-apps/markdown.zapp`
and reload AppLoad. The engine's `markdown` plugin must be in its bundle (`tools/rmpp-engine` prebuilds every plugin).

## Files

| Path | What |
| --- | --- |
| `~/zinc-docs/**/*.md` (`ZINC_DOCS_DIR`) | the library; `notion/` holds the imported pages |
| `~/.zinc/markdown/read.conf` (`ZINC_READ_DIR`) | the Notion secret (mode 600), the last page link, the pages Sync fetches |
| `~/.zinc/markdown/ink/<hash>.json`, `.txt` | the notes of a document at one text size (zinc:ink strokes) and its path |

`src/`: `main.tsx` (the shell), `state.ts` (library, open, turn, contents, links, tasks, ink, Notion sync), `layout.ts` (the paged
layout of the md4c tree), `pageview.ts` (drawing and gestures), `notion.ts` (the API and the Markdown it becomes), `conf.ts`, `script.ts`
(`ZINC_READ_SCRIPT`, the test mode of `tests/t1/markdown_reader.sh`). `fixture/`: the test documents. `icon.svg` (zinc.json `app.icon`) is
Lucide's `book-open` (lucide-static 1.47.0, ISC licence, https://lucide.dev/license).
