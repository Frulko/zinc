# AppKit Tour

A Finder-like file browser, the milestone app of `zinc:appkit` ([docs/plugins/appkit.md](../../docs/plugins/appkit.md)). On macOS, with
`"ui": { "render": "native" }` in `zinc.json`, every part is a real AppKit view:

- the window's unified toolbar: New Folder, Move to Trash and an `NSSearchField`;
- the sidebar: an `NSOutlineView` source list of places;
- a table of 10,000 made-up files: an `NSTableView` you sort by its headers, select (shift, cmd), type-select;
- the inspector: a name field, a switch, a pop-up button, a slider, a date picker and Save (Return);
- an `NSAlert` before moving files to the Trash, a sheet that asks a new folder's name;
- the menu bar (`zinc:system/menu`): File has New Folder (Shift-Cmd-N) and Move to Trash; Edit acts on the field you type in;
- dark mode: the views follow the system appearance as it changes;
- VoiceOver: the table is read as a table, the sidebar as a list, each control by its name.

The same program runs drawn (`ZINC_RENDER=drawn`, or any other platform): `zinc:appkit`'s components draw their fallbacks.

## Run it

```sh
zinc run examples/appkit-tour                       # native AppKit views (macOS)
ZINC_RENDER=drawn zinc run examples/appkit-tour     # the drawn UI, for comparison
ZINC_APPEARANCE=dark zinc run examples/appkit-tour  # force dark mode for one run
```

## Layout of `src/`

```text
src/
├── main.tsx              # the window: toolbar, sidebar, table and inspector in a split view; the menu bar
├── state.ts              # the files, place, search, sort and selection (kept as file ids), and their actions
├── places.ts             # the sidebar's places
├── actions.ts            # what the toolbar and the menus do: the Trash alert, the New Folder sheet
├── menus.ts              # the menu bar
├── services/files.ts     # the 10,000 files, made up the same way on every run
└── components/           # BrowserToolbar, PlacesSidebar, FileTable, Inspector, FormRow, NewFolderSheet
```

## Notes

- The files are made up (`services/files.ts`): the demo never reads the disk.
- Only the table rows in view are built, whatever the file count; the selection is kept as file ids and given back to the table
  (`selection`), so a sort or a search keeps the same files selected.
- The drawn fallbacks of `zinc:appkit` keep their light colours in dark mode.
