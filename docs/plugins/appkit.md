# zinc:appkit — the zinc:ui tree as real AppKit views (macOS)

`plugins/appkit` is the macOS native host of zinc:ui (decision D210, `docs/reports/appkit-native-ui-research.md`). The program keeps writing
zinc:ui, Solid, React or React Native code; under `"ui": { "render": "native" }` in `zinc.json` (or `ZINC_RENDER=native` for one run) the tree shows
as AppKit views instead of being drawn, the way React Native for macOS mounts its host components.

```json
{ "ui": { "render": "native" } }
```

```tsx
import 'zinc:appkit';   // installs the host; nothing else changes in the program
```

| target | status |
|---|---|
| macos | AppKit views over the SDL window's view (`native/appkit.macos.mm`, ARC); headless runs use a window that is never shown |
| everything else | the stand-in: no host starts, the program is drawn as before |

## What becomes what

| zinc:ui | AppKit | Notes |
|---|---|---|
| `View`, `Pressable`, `Button` | a flipped NSView that draws its background, radius and border | none at all when it has no background, border, opacity, hiding or focus: its children hang on the nearest real view (view flattening); a focusable one takes the first responder and shows the system focus ring when Tab puts it there |
| `Text` | a wrapping NSTextField label | system font at the node's size and weight; `labelColor` unless the text or an ancestor sets a colour |
| `Image` | NSImageView | the asset of `setImage` (the project's `assets/`), scaled to fit |
| `ScrollView` | NSScrollView with a flipped document | native scrolling and elastic edges; the offset comes back as `onScroll` |
| `TextInput` | NSTextField, NSSecureTextField for a password | placeholder, value, focus, Enter |
| `TextArea` | NSTextView in an NSScrollView | |
| `Canvas` | an empty view for now | drawn islands come with ZN-1071 and on |

The layout stays zinc:ui's: a native render lays out with Yoga (the `rn` layout) unless `ui.layout` says otherwise, and AppKit measures the text
and field leaves with the same cells that show them. The root follows the window's size and draws `windowBackgroundColor`; colours a program
writes (`bg-[#ff0000]`) stay as written, and the system colours follow the light or dark appearance live. `ZINC_APPEARANCE=dark` or `light` forces
one for a run (screenshots).

## The window chrome

`zinc:appkit` also exports typed components for what has no primitive. Under the host they are the window's own chrome; anywhere else (drawn, Linux, a
Pi, the web) the same program draws a plain equivalent.

```tsx
import { Window, Toolbar, ToolbarItem, SplitView, Sidebar } from 'zinc:appkit';

<Window title="Library" toolbarStyle="unified">
  <Toolbar>
    <ToolbarItem label="Add" symbol="plus" onPress={add} />
    <ToolbarItem label="Search"><Input className="w-[160px] h-[24px]" placeholder="Search" /></ToolbarItem>
  </Toolbar>
  <SplitView className="flex-1">
    <Sidebar width={200} minWidth={150} maxWidth={320}>...</Sidebar>
    <View className="flex-1">...</View>
  </SplitView>
</Window>
```

| component | AppKit | drawn fallback |
|---|---|---|
| `Window` (`title`, `toolbarStyle`: `unified`, `unifiedCompact`, `expanded`, `preference`, `automatic`; `fullSizeContent`) | the window's title and toolbar style; `fullSizeContent` runs the content under a transparent title bar (pad its top) | a column that fills the window; the title through the window |
| `Toolbar` | an NSToolbar: it takes no room in the content | a bar across the top |
| `ToolbarItem` (`label`, `symbol`, `onPress`, children) | a toolbar item with an SF Symbol, or the item's children at the size the layout gives them (a search field) | a button with the label, or the children |
| `SplitView` | an NSSplitView with a thin divider: panes side by side at the layout's boxes | a row |
| `Sidebar` (`width` 220, `minWidth` 150, `maxWidth` 400) | the first pane, on the system's sidebar material; it keeps its width when the window resizes | a grey column with a border |

Dragging the divider sets the sidebar's width, and zinc:ui lays the sidebar's and the other panes' subtrees out again at the next frame (the drag
does not run AppKit's tracking loop, so frames keep coming while the mouse moves). The layout stays one tree: no pane is measured by AppKit.

## Tables and outlines

```tsx
import { Table, Outline } from 'zinc:appkit';

<Outline items={folders} expanded={['home']} onSelect={openFolder} className="w-[200px]" />
<Table
  columns={[{ id: 'name', title: 'Name', sortable: true }, { id: 'size', title: 'Size', width: 80, align: 'right', sortable: true }]}
  count={() => files().length}
  cell={(row, col) => col === 0 ? files()[row].name : files()[row].size}
  onSort={(col, ascending) => setFiles(sorted(files(), col, ascending))}
  onSelect={(rows) => setPicked(rows)}
  onOpen={(row) => open(files()[row])}
  className="flex-1" />
```

| component | AppKit | drawn fallback |
|---|---|---|
| `Table` (`columns`: `id`, `title`, `width`, `sortable`, `align`; `count`, `cell`, `rowHeight` 24, `multiple`, `onSelect`, `onSort`, `onOpen`) | an NSTableView: header sorting with its indicator, column resizing, multiple selection, type-select, double-click, alternating rows | a header over zinc:ui's virtual list: a click sorts or selects (shift and cmd extend), arrows, Enter and letters |
| `Outline` (`items`: `id`, `label`, `children`; `expanded`, `rowHeight` 22, `onSelect`, `onToggle`, `onOpen`) | a source-list NSOutlineView that expands, collapses and type-selects by itself | the rows of the open items with a disclosure; arrows, Left and Right fold, letters |

Only the rows in view (and a few more) are built, whatever `count` says: the table is zinc:ui's virtual list, and the host answers AppKit's questions
from those rows, pushed with each commit, without calling the program. AppKit recycles the cells; when it scrolls, the list builds the rows it shows
and the next frame fills them. `count` is read in an effect: change the signals it reads (a sorted copy of the data) and the rows are built again.
Type-select on a table searches the program's rows (`cell(row, 0)`), so it finds a row that was never built. An Outline gets its whole tree (sidebars
are small), keeps one AppKit item per `id`, and reports each expand or collapse as `onToggle`.

## Keyboard

The focus is zinc:ui's: Tab and Shift-Tab walk the focusable nodes in tree order (`tabIndex`, focus scopes), as in the drawn UI, and the host moves
AppKit's first responder after it, to a field, or to a focusable view when the keyboard put the focus there (the system focus ring). A native field
does its own editing and leaves Tab to zinc:ui; the other keys pressed in it reach the program's key handlers (`onKeyDown`, `onKey`, the keymap). A
focused view swallows the keys AppKit would beep at: SDL already reported them to zinc:ui.

## Events

Presses, hover and drags are not taken by the views: they go through to SDL's view, and zinc:ui hit-tests its own tree with the same boxes, so
`onClick`, `onPress`, the pressed look and gestures work as in the drawn UI. The views that take input themselves report through the functions the
web's DOM host uses: typing (`ui.domEdit`, so `onInput` and `onChangeText`), the end of editing (`onChange`), Enter (`onSubmit`), focus and blur,
scrolling (`ui.domScroll`, so `onScroll` and virtual lists). Each event carries the handle and the generation its view was made under: an event
of a view deleted since, or of a handle that holds another node now, is dropped. Keys pressed in a native field reach only the program's key
handlers (`onKeyDown`, `onKey`, the keymap); the field does the editing.

## Tests

```ts
import * as appkit from 'zinc:appkit';
appkit.dump();             // the native tree: one view per line, `#ID kind x,y wxh` then its text, colours, content size
appkit.hit(x, y);          // the node AppKit's hit test picks there, -1 when a press goes through to zinc:ui
appkit.drive(h, 0, 'hi');  // types into field h through its field editor; 1: Enter; 2: scrolls scroll view h to (x, y);
                           // 3: sends field h's editor a command ('insertTab:'); 4: drags split view h's divider to x; 5: clicks toolbar item h;
                           // a Table or Outline h: 2 scrolls it, 6 sorts by column text, 7 selects rows '3,4' (an outline: an id),
                           // 8 types keys into it, 9 expands (x 1) or collapses item text
appkit.snapshot('a.png');  // what the views show, drawn offscreen (for people: it changes with each macOS)
```

`tests/t0/ui_appkit.sh` runs `tests/golden/ui-appkit` headless on the interpreter (against its golden), QuickJS and the AOT;
`tests/t0/ui_appkit_chrome.sh` does the same for the window chrome and the keyboard (`tests/golden/ui-appkit-chrome`), and checks its drawn fallback;
`tests/t0/ui_appkit_table.sh` for a table of 10,000 rows and an outline (`tests/golden/ui-appkit-table`).

## Not yet

Cells other than text (images, checkboxes, a view per cell), rows of different heights, an outline loaded as it opens; controls, popovers and sheets (ZN-1073); text spans with their own styles (a `Text`'s string shows in one style),
shadows and clipping, a scroll position set by the program, more windows than the main one, collapsing the sidebar, toolbar spacers and the
sidebar tracking separator.
