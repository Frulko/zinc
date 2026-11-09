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

## Controls

```tsx
import { PushButton, Switch, Checkbox, PopUpButton, SegmentedControl, Slider, DatePicker, SearchField, Progress } from 'zinc:appkit';

<PushButton title="Save" onPress={save} keyEquivalent="Enter" />
<Switch value={shared} onValueChange={setShared} />
<Checkbox title="Show hidden files" value={hidden} onValueChange={setHidden} />
<PopUpButton items={['Name', 'Date', 'Size']} value={sort} onValueChange={setSort} />
<SegmentedControl items={['Icons', 'List']} selected={view} onSelect={setView} />
<Slider value={volume} onValueChange={setVolume} max={100} step={5} />
<DatePicker value={due} onValueChange={setDue} />        // 'YYYY-MM-DD'
<SearchField onChange={filter} />
<Progress value={done} />                                 // 0 to 100, below 0: indeterminate
```

| Component | Under the host | Drawn |
|---|---|---|
| `PushButton` | an NSButton (`keyEquivalent`: `Enter` the default button, `Escape`, or a letter with Command) | the kit's `Button` |
| `Switch` | an NSSwitch (a check box before macOS 10.15) | the kit's `Switch` |
| `Checkbox` | an NSButton check box with its title | a box and a label |
| `PopUpButton` | an NSPopUpButton that opens its own menu | a button that opens a list under it |
| `SegmentedControl` | an NSSegmentedControl | the kit's `Tabs` |
| `Slider` | a continuous NSSlider, snapped to `step` | the kit's `Slider` |
| `DatePicker` | an NSDatePicker (field and stepper), the date in UTC | a field that takes a typed date |
| `SearchField` | an NSSearchField, edited as any field (`onChange` on each edit, `onSubmit` on Enter) | a rounded field |
| `Progress` | an NSProgressIndicator bar | the kit's `Progress` |

The kits map to the same controls, so a program written with them gets the native ones under `render: "native"` without changing a line: the
kit's `Button` (when it is only a label), `Switch`, `Slider`, `Tabs` and `Progress`, zinc:ui/nuxt's `Button`, `Switch`, `Checkbox` and `Select`,
and zinc:react-native's `Button` and `Switch`. Each sets a native kind on its node (`nativeControl` of zinc:ui/kit); its classes are the drawn
fallback. Controls are controlled: the value shown is the program's; the person's change comes back (`onValueChange`, `onChange`...), and a value
the program does not take goes back to the program's one frame later.

## Alerts, sheets and popovers

```tsx
import { alert, sheet, popover } from 'zinc:appkit';

const b = await alert({ message: 'Delete 3 files?', detail: 'This cannot be undone.', style: 'warning', buttons: ['Delete', 'Cancel'] });   // 0, 1, or -1
const name = await sheet((close) => <NameForm onDone={close} />);      // what the content passes to close, '' on Escape
const pick = await popover(button, (close) => <Colors onPick={close} />, { edge: 'bottom' });   // '' when a click outside closed it
```

Under the host an alert is an NSAlert and a sheet a window, both run as a sheet of the window (`beginSheet`), and a popover is a transient
NSPopover pointing at the anchor node. None runs a modal loop (`runModal`), so the frames go on while they are open. Drawn, each is a zinc:ui layer:
a modal dialog, a panel at the top over a dim, a panel anchored to the node; Escape dismisses it. Inside a native sheet or popover the controls and
fields take input; presses on drawn-only views there do not reach zinc:ui yet (they have no SDL view under them).

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

## Plugin views

A plugin adds its own AppKit view the way React Native's Fabric components do: it declares the component in its spec, `zinc native-gen
--views` writes the Objective-C++ glue, and the host mounts the plugin's view wherever the component's kind shows under `render: "native"`.
`examples/native-view` (its `plugins/levels`) is a complete one, an NSLevelIndicator.

```ts
// native/levels.spec.ts
import { NativeModule, NativeComponent, requireNative } from 'zinc:native';
export interface LevelIndicator extends NativeComponent {   // the kind is the interface's name
  value: f64;                                                // props: string, boolean, number/f64, i32, u32
  style: string;
  onChange: (value: f64) => void;                            // events: onX, arguments of the same types
}
export interface Spec extends NativeModule { registered(): boolean; }
export default requireNative<Spec>('Levels');
```

The plugin's build writes `zinc_views_levels.h` beside its `zinc_native_levels.h`: a `ZincLevelIndicatorView` protocol with one setter per
prop (`updateValue:`, `updateStyle:`, and an optional `didUpdateProps` after each commit's props), a `ZincLevelIndicatorEvents` object whose
methods send the events (`[events onChange:v]`), and the class the engine hands to the host. Its `.mm` includes the header once, implements the
protocol with an NSView subclass, defines `ZincLevelIndicatorMake(events)`, and calls `zinc_views_levels_register()` in `zinc_create_Levels`.
The plugin's TS gives the component its drawn fallback and marks the node: call the module once first (it starts, and registers its views,
at its first call), then `nativeControl(node, 'LevelIndicator', () => ['value', ...], onEvent)` of `zinc:ui/kit`. An event reaches `onEvent`
as its name, then its arguments, joined by U+001F; props cross as text and the glue parses them by their declared type.

The two plugins never link to each other: the plugin registers its class with the engine (`include/zn/native_view.h`), and the host asks the
engine for the class of a kind it does not know. A kind with no class (the plugin is not there, or another platform) shows as a plain view of
its fallback. The view is a leaf: its children are the drawn fallback. Its events carry the node's handle and generation, so the event of a
view whose node went is dropped, and as with the controls a value the program refuses goes back to the program's one frame later.

## Tests

```ts
import * as appkit from 'zinc:appkit';
appkit.dump();             // the native tree: one view per line, `#ID kind x,y wxh` then its text, colours, content size
appkit.hit(x, y);          // the node AppKit's hit test picks there, -1 when a press goes through to zinc:ui
appkit.drive(h, 0, 'hi');  // types into field h through its field editor; 1: Enter; 2: scrolls scroll view h to (x, y);
                           // 3: sends field h's editor a command ('insertTab:'); 4: drags split view h's divider to x; 5: clicks toolbar item h;
                           // a Table or Outline h: 2 scrolls it, 6 sorts by column text, 7 selects rows '3,4' (an outline: an id),
                           // 8 types keys into it, 9 expands (x 1) or collapses item text;
                           // a control h: 10 clicks it (a button, a switch, a check box), 11 sets its value (an item, a segment, x, a date;
                           // a plugin's view that is an NSControl: text, else x);
                           // an overlay's panel h (appkit.overlays()): 12 ends it (an alert's button x, -1 dismissed)
appkit.snapshot('a.png');  // what the views show, drawn offscreen (for people: it changes with each macOS)
```

`tests/t0/ui_appkit.sh` runs `tests/golden/ui-appkit` headless on the interpreter (against its golden), QuickJS and the AOT;
`tests/t0/ui_appkit_chrome.sh` does the same for the window chrome and the keyboard (`tests/golden/ui-appkit-chrome`), and checks its drawn fallback;
`tests/t0/ui_appkit_table.sh` for a table of 10,000 rows and an outline (`tests/golden/ui-appkit-table`); `tests/t0/ui_appkit_controls.sh` for the
controls and the overlays (`tests/golden/ui-appkit-controls`); `tests/t0/ui_appkit_views.sh` for a plugin's view (`tests/golden/ui-appkit-views`), whose
glue `tests/t0/native_gen.sh` compares with `tests/golden/native_gen/views`. Headless, alerts, sheets and popovers are built but not presented, so a test puts
nothing on screen.

## Not yet

Cells other than text (images, checkboxes, a view per cell), rows of different heights, an outline loaded as it opens; a native control taking zinc:ui's keyboard focus (Tab skips to fields and focusable views), the kits' macOS sizes under the deterministic look of the tests; text spans with their own styles (a `Text`'s string shows in one style),
shadows and clipping, a scroll position set by the program, more windows than the main one, collapsing the sidebar, toolbar spacers and the
sidebar tracking separator.
