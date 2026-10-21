# Carnet (nbe)

[Carnet](https://github.com/Frulko/carnet) on Zinc, on Carnet's own code. The documents, the editing commands, the Markdown, the
collaboration and the labels are Carnet's packages, imported unchanged: when Carnet changes, this app runs the new code. Only the view
is Zinc's: `zinc:ui` components modelled on `@nbe/dom`'s. It runs on the QuickJS engine (`"engine": "quickjs"` in `zinc.json`).
`examples/carnet` is the same app written for the typed engine, with its own model.

The files are kept as Obsidian keeps them, the way Carnet's Obsidian plugin (`apps/obsidian`) treats a note: a vault is a folder of
Markdown files, and a note's name is its title.

```sh
cd examples/carnet-nbe
./link.sh                          # node_modules/@nbe/* -> ../../../notion-block-editor/packages (Carnet checked out beside zinc)
zinc run .                         # the first window serves the vault on 127.0.0.1:7311
zinc run .                         # a second one joins it: two people, the other's avatar in the top bar
CARNET_NAME=Ada zinc run .         # your name on the others' screens (else one is picked)
```

## What comes from Carnet

| Package | Used for |
|---|---|
| `@nbe/core` | the document (`Editor`, operations, undo and redo), the commands (`splitBlock`, `mergeBackward`, `turnInto`, `indent`, `moveBlocks`...), the Markdown shortcuts (`matchAutoformat`: `# `, `- `, `[] `, `> ` a toggle, `" ` a quote, `---`) |
| `@nbe/markdown` | a note to Markdown and back, its front matter (unknown keys kept), `[[wikilinks]]` (mentions and link lines), `slugify` for file names |
| `@nbe/collab` | every note a Loro document (`LoroBlockStore`, `zinc:loro` in place of `loro-crdt`), the sync (`connect`, `connectToRelay`), the presence (`createPresence`) |
| `@nbe/dom` | its DOM-free files only: the labels (`i18n`) and the slash menu's list (`turnIntoTargets`) |

The app (`src/`) maps keys and clicks to those commands, shows the blocks, the slash menu, the file explorer and the search, keeps the
vault and serves the relay. The relay speaks the protocol of Carnet's own (`nbe serve`, `packages/cli/src/relay.ts`): a room per document in
`?room=`, binary frames forwarded to the room's other members, a members signal when someone joins or leaves.

## Until Zinc reads all of Carnet's syntax

Three forms of Carnet's packages do not run on Zinc yet: a generic method with a default type parameter, a computed key with a rest
element in a destructuring, and an inline `type` in an export list. Until they do, link a patched copy (`nbe-syntax.patch`, five
files, the behaviour unchanged):

```sh
mkdir -p .nbe-dev && cp -R ../../../notion-block-editor/packages .nbe-dev/
patch -d .nbe-dev -p1 < nbe-syntax.patch
./link.sh .nbe-dev/packages
```

## The vault

The vault is a folder, `vault/` beside the app (`CARNET_VAULT` moves it), seeded from `welcome/` the first time:

- **A note is a `.md` file.** Its name is the note's title. Renaming the title renames the file when the field is left or Enter is
  pressed. A title a file name cannot hold ("Meeting: 2026/07") is kept in the front matter's `title`. The front matter is kept as
  read, so keys this app does not know survive a save. The note's icon is the `icon` key.
- **Folders are folders.** Drag a note onto a folder in the explorer to move it.
- **`[[Name]]` is a link.** Type it in a block and it becomes one. Follow it with Cmd+click or Alt+Enter. It finds the note of
  that name in the same folder first, then anywhere; `[[Folder/Name]]` and `[[Name|shown text]]` work too.
- **Unresolved links.** A link to a note that does not exist is faded; following it makes the note.
- **Renaming updates links.** The links of other notes follow a renamed note, as Obsidian's "update internal links" does.
- **Linked mentions.** The notes that link to the open note are listed under it.
- **Deleting moves to `.trash/`.**
- **The vault follows other programs.** It is looked at every second: a note changed in another editor is replaced, and a file
  added or removed adds or removes its note.
- **`.carnet/` is the app's own folder**, like Obsidian's `.obsidian/`. `workspace.json` holds the open note and the folded
  folders. `index.sqlite` is the search index (SQLite FTS5, `zinc:sqlite`), which other programs can query too.
- **Only the window that serves the vault writes it.** Each note is written atomically 0.8 s after its last change, whoever made
  it. A window that joins has the notes in memory and no files of its own.

| Key | What it does |
|---|---|
| Cmd+N | a new note ("Untitled", its title selected) |
| Cmd+O | the quick switcher: a note by the letters of its name, Enter on a new name makes it |
| Cmd+Shift+F | search the vault (every word, as a prefix) |

| Variable | Default | What it does |
|---|---|---|
| `CARNET_NAME` | a random name | your name |
| `CARNET_VAULT` | `vault` | the vault's folder |
| `CARNET_PORT` | `7311` | the relay's port |
| `CARNET_LISTEN` | `127.0.0.1` | where the relay listens (`0.0.0.0` for other machines) |
| `CARNET_JOIN` | `ws://127.0.0.1:<port>` | the relay to join when this one cannot serve |
| `CARNET_OFFLINE` | | `1`: no relay, no joining |
| `CARNET_LANG` | `en` | the labels' language (Carnet's `i18n`) |

## `src/`

```text
src/
├── main.tsx                 # mounts the app, who I am, the shared list of notes and folders, presence, the keys, the frame tick
├── constants.ts             # colours, sizes, ports, block kinds
├── labels.ts                # Carnet's labels
├── state.ts                 # notes (a path, a Loro store and an Editor each), folders, links; every edit, as a Carnet command
├── services/
│   ├── vault.ts             # the vault's files: read, written, moved, trashed, watched, through @nbe/markdown
│   ├── search.ts            # the FTS5 index (zinc:sqlite)
│   └── sync.ts              # the relay: serve or join, retry; a browser WebSocket over zinc:socket
├── components/              # Block, SlashMenu, Sidebar (files, search), Prompt (quick switcher), PageIcon, the keys, the focus
└── pages/editor/PageView.tsx
```

Tests: `tests/t1/carnet_nbe.sh` (a scripted session, the notes saved, a link typed in a new note, the idle check) and
`tests/demo/carnet_nbe_collab.sh` (two windows: the joiner edits a note and makes one, the host writes both); both skip when the
packages are not linked.
