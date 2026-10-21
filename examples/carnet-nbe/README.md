# Carnet (nbe)

[Carnet](https://github.com/Frulko/carnet) on Zinc, on Carnet's own code. The documents, the editing commands, the Markdown, the
collaboration and the labels are Carnet's packages, imported unchanged: when Carnet changes, this app runs the new code. Only the view
is Zinc's: `zinc:ui` components modelled on `@nbe/dom`'s. It runs on the QuickJS engine (`"engine": "quickjs"` in `zinc.json`).
`examples/carnet` is the same app written for the typed engine, with its own model.

```sh
cd examples/carnet-nbe
./link.sh                          # node_modules/@nbe/* -> ../../../notion-block-editor/packages (Carnet checked out beside zinc)
zinc run .                         # the first window serves the pages on 127.0.0.1:7311
zinc run .                         # a second one joins it: two people, the other's avatar in the top bar
CARNET_NAME=Ada zinc run .         # your name on the others' screens (else one is picked)
```

## What comes from Carnet

| Package | Used for |
|---|---|
| `@nbe/core` | the document (`Editor`, operations, undo and redo), the commands (`splitBlock`, `mergeBackward`, `turnInto`, `indent`, `moveBlocks`...), the Markdown shortcuts (`matchAutoformat`: `# `, `- `, `[] `, `> ` a toggle, `" ` a quote, `---`) |
| `@nbe/markdown` | a page to Markdown and back, its front matter |
| `@nbe/collab` | every page a Loro document (`LoroBlockStore`, `zinc:loro` in place of `loro-crdt`), the sync (`connect`, `connectToRelay`), the presence (`createPresence`) |
| `@nbe/dom` | its DOM-free files only: the labels (`i18n`) and the slash menu's list (`turnIntoTargets`) |

The app (`src/`) maps keys and clicks to those commands, shows the blocks, the slash menu and the sidebar, keeps the vault and serves
the relay. The relay speaks the protocol of Carnet's own (`nbe serve`, `packages/cli/src/relay.ts`): a room per document in
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

## Files

The vault is `vault/` beside the app (`CARNET_VAULT` moves it), seeded from `welcome/` the first time: one `.md` file per page,
written by `@nbe/markdown`, its title and icon in the front matter. A page is written 0.8 s after its last change, by every window
that has it. The window that serves reads the vault; a window that joins gets the pages from it.

| Variable | Default | What it does |
|---|---|---|
| `CARNET_NAME` | a random name | your name |
| `CARNET_VAULT` | `vault` | the folder of pages |
| `CARNET_PORT` | `7311` | the relay's port |
| `CARNET_LISTEN` | `127.0.0.1` | where the relay listens (`0.0.0.0` for other machines) |
| `CARNET_JOIN` | `ws://127.0.0.1:<port>` | the relay to join when this one cannot serve |
| `CARNET_OFFLINE` | | `1`: no relay, no joining |
| `CARNET_LANG` | `en` | the labels' language (Carnet's `i18n`) |

## `src/`

```text
src/
├── main.tsx                 # mounts the app, who I am, the page list and presence rooms, the frame tick
├── constants.ts             # colours, sizes, ports, block kinds
├── labels.ts                # Carnet's labels
├── state.ts                 # pages (a Loro store and an Editor each) and their rows as signals; every edit, as a Carnet command
├── services/
│   ├── vault.ts             # the folder of pages, through @nbe/markdown
│   └── sync.ts              # the relay: serve or join, retry; a browser WebSocket over zinc:socket
├── components/              # Block, SlashMenu, Sidebar, PageIcon, the keys of a block, the focus
└── pages/editor/PageView.tsx
```

Tests: `tests/t1/carnet_nbe.sh` (a scripted session, the page saved, the idle check) and `tests/demo/carnet_nbe_collab.sh` (two
windows); both skip when the packages are not linked.
