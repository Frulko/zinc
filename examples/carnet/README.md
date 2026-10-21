# Carnet

A Notion-style block editor, after [Carnet](https://github.com/Frulko/carnet), written for `zinc:ui` (JSX, Yoga, Solid
signals) and compiled natively: no browser, no JavaScript engine. Its pages are Markdown files in a folder, and every window that
opens it is another person editing the same pages live.

```sh
zinc run examples/carnet                       # the first window serves the pages on 127.0.0.1:7311
zinc run examples/carnet                       # a second one joins it: two people, their carets on each other's screen
CARNET_NAME=Ada zinc run examples/carnet       # your name on the others' screens (else one is picked)
zinc check examples/carnet
```

What it does:

- Blocks: text, three headings, bulleted, numbered and to-do lists, quote, callout, code and divider; nesting with Tab.
- The slash menu (`/`, filtered as you type) and the Markdown shortcuts (`# `, `- `, `1. `, `[] `, `> `, `---`).
- Enter splits a block, Backspace at its start turns it into text then joins it to the one above, arrows cross blocks,
  Cmd+Shift+↑/↓ moves a block, Cmd+D duplicates it, Cmd+Alt+0..8 changes its type, Cmd+N makes a page.
- Drag a block by its grip (`zinc:ui/dnd`), the page scrolls near its edges.
- Fields grow with their text (`rows={0}`); the others' carets and selections show in their colour with their name.

## Files

The vault is `vault/` beside the app (`CARNET_VAULT` moves it), seeded from `welcome/` the first time: one `.md` file per page,
its icon and order in the front matter, its title as the first `# ` line, blocks separated by blank lines (list items stay a tight
list). Open it in any editor or in Obsidian; a page is written 0.8 s after its last change.

## Collaboration

The first window serves a WebSocket relay (`zinc:socket`) and the next ones join it, retrying when it goes away. Every block and
page is a record with a Lamport stamp; the newest write wins, deletions are tombstones and blocks are ordered by a fractional
position, so two windows that saw the same changes show the same page. Presence messages carry each person's page, block, caret
and selection.

| Variable | Default | What it does |
|---|---|---|
| `CARNET_NAME` | a random name | your name |
| `CARNET_VAULT` | `vault` | the folder of pages |
| `CARNET_PORT` | `7311` | the relay's port |
| `CARNET_LISTEN` | `127.0.0.1` | where the relay listens (`0.0.0.0` for other machines) |
| `CARNET_JOIN` | `ws://127.0.0.1:<port>` | the relay to join when this one cannot serve |
| `CARNET_OFFLINE` | | `1`: no relay, no joining |

The merge is per record (the last edit of a block wins as a whole): two people typing in the same block at the same moment keep
one of the two texts. A character-level CRDT (Loro, `zinc:loro`) replaces it once the original's `@nbe/core` compiles on Zinc.

## `src/`

```text
src/
├── main.tsx                 # mounts the app, who I am, the sync hooks, the frame tick
├── constants.ts             # colours, sizes, ports, block types and the slash menu's entries
├── state.ts                 # pages, blocks and peers as signals; every edit, as a record sent to the others
├── wire.ts                  # the messages between windows (JSON)
├── markdown.ts              # a page to Markdown and back
├── services/
│   ├── vault.ts             # the folder of pages: load, write after a change
│   └── sync.ts              # the relay: serve or join, retry, relay
├── components/
│   ├── Block.tsx            # one block: marker, field, grip, others' carets, drag and drop
│   ├── block-keys.ts        # what keys and typed text do in a block
│   ├── SlashMenu.tsx        # the menu of block types
│   ├── Sidebar.tsx          # pages, new page, who is here
│   ├── PageIcon.tsx         # a page's Lucide icon
│   ├── focus.ts             # which field has the caret, where
│   └── root.ts              # the app's root node
└── pages/editor/PageView.tsx  # the page: top bar, icon, title, blocks, drop line
```

## Notes

- Desktop only (macOS, Linux): the UI is `zinc:ui`, which the guidelines keep off the old devices.
- Emoji do not draw in `zinc:ui` text yet: page icons are Lucide icons, changed by clicking the page's icon (the next one of a list).
- Inline marks (bold, links) are kept as Markdown text, not shown styled.
