# Zinc Atelier (ZN-050)

The desktop app of Zinc, written in Zinc on `zinc:ui` (Solid signals, JSX) and run by the engine it drives:

```
zinc run app/atelier/main.tsx -- <project dir>
```

| Piece | What it does |
|---|---|
| Project browser | the `.ts`/`.tsx` files of the project, three levels deep (`model.ts: projectFiles`) |
| Editor | a `<TextArea>`; **Save** writes the file |
| Check | `zinc check --check <file>`; the diagnostics fill the **Problems** tab (`parseDiagnostics`) |
| Run / Stop | `zinc run <file>` as a child process (a window for a graphics app); its output streams into **Output** |
| ESP32 (emulated) | `zinc run <file> --target esp32 --qemu`: the same program on the emulated board (needs the emulator, downloaded on first use) |
| Profile | `zinc profile <file> --folded ...`; the **Profile** tab lists the functions with the most self samples |
| Frames | `ZINC_ATELIER_TRACE=<file>` loads a `ZINC_TRACE` file (Chrome trace events); the tab shows the time per phase |

The app starts `zinc` through `zinc:process` (new host module: `spawn`, `read`, `status`, `kill` over `sh -c`, stdout and stderr merged, non-blocking
reads polled once per frame). `ZINC_BIN` (set by `zinc` itself to its own path) tells the app which binary to start; `ZINC_SIZE=WxH` sets the window
size.

## The project card (ZN-736)

A sketch is a folder of code; a project is a folder with a `zinc.json`. The pill of the header says which: the folder's name for a sketch,
the app's name, version and icon for a project. A press opens the card under it (`components/Project.tsx`, state in `app/project.ts`):

| In the card | From |
|---|---|
| name, id, version, icon | `app.name` (else `name`), `app.id`, `app.version`, `app.icon` |
| entry | `entry` (else the main file Atelier found) |
| window on this machine, other targets | `targets.<macos or linux>.width / height`; the others with their size and display |
| requires | `requires` |
| plugins | the modules the code imports that `zinc plugins` lists |
| assets | the `assets` folder (or the one zinc.json names): files and size |
| permissions | `permissions`, each with one line on what it allows (`docs/guide/08-security.md`) |

The name, the version, the window's size and the permissions are edited there (a field is taken when it is left or on Enter; a permission
is allowed by its id and removed by its cross). An edit replaces one value of the text of zinc.json, or adds one key: the other keys,
their order and the layout stay as they were (`model.ts: jsonSet`). It goes through the tab of zinc.json when that tab is open, and
`zinc check` runs again: what the engine refuses in zinc.json (`zinc.json: line 4: app.id is required…`) is on the status line. Open
zinc.json makes it a tab, Show Folder opens the folder in the Finder, Build App runs `zinc export .` with its steps in the console and
says where the app is. A plain sketch's card offers Make it a Project: a zinc.json with its name, an id, a version and its entry.

zinc.json is read as text in the app: the CLI has no command that prints a parsed project (a line of `backlog/later.md` asks for one).

## Limits and lessons

- A program that uses `any` or `JSON.parse` cannot use `zinc:ui` (Dyn's `undefined` differs from null, and the std library uses `undefined` as null), so the
  trace view scans the text instead of parsing JSON.
- The kit's props (`<Button label=... variant=...>`) are read once; importing `Button` from `zinc:ui/kit` also hides the host `<Button>`. The app uses the host
  elements for everything that follows a signal (tabs, file rows, status).
- Not yet: a flame graph (the Profile tab is a table of bars), serial ports and flashing a real board (the CLI has `zinc flash`), settings.

## Tests

`tests/t0/atelier.sh` (model), `tests/t1/atelier.sh` (pixel goldens of the check, run and frames flows, and edit + save), `tests/t2/atelier_esp32.sh`.
