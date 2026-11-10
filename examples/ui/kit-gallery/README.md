# Kit gallery

Every component of `zinc:ui/kit` (the Quiet kit, see [docs/ui-kit.md](../../../docs/ui-kit.md)) on one
scrolling page: metric tiles, buttons in all variants and sizes, tabs, switches, a slider, a sample progress bar,
overlays (tooltip, menu, popover, dialog, toasts), badges, avatars, alerts and a list. The **Dark** switch in the
header re-themes the whole page at runtime.

![Kit gallery, light theme](../../../docs/img/kit-gallery.png)

## Run it

```sh
zinc run examples/ui/kit-gallery                 # macOS window (960x800)
zinc run examples/ui/kit-gallery --target wasm   # browser
zinc run examples/ui/kit-gallery --target sim    # Node oracle (headless)
zinc build examples/ui/kit-gallery --target rpi1 # Raspberry Pi (fbdev)
```

Controls: click or tap; arrow keys / Tab move the focus, Space or Enter presses; the wheel or a drag scrolls.

## What to look at

| File | Role |
| --- | --- |
| `src/main.tsx` | page layout: Quiet family previews, a theme switch and labelled sections in a scroll view |
| `src/state.ts` | the signals the controls read and write, the theme toggle, the static sample upload value |
| `src/sections/buttons.tsx` | `Button` variants and sizes, a `Kbd` inside a button, a live click counter |
| `src/sections/settings.tsx` | `Tabs` switching two panels with an inline `{cond ? <A/> : <B/>}`, `Switch`, `Slider`, `Progress` |
| `src/sections/overlays.tsx` | `Tooltip` with a shortcut hint, `DropdownMenu` bound to actions (`ui.bindKeys`), `Popover`, `Dialog`, `toast()` |
| `src/sections/inputs.tsx` | text, numeric, token, selection and shortcut fields with caller-owned state |
| `src/sections/display.tsx` | `Stat` tiles, `Badge`, `Avatar`, `Alert`, `List` / `ListItem` |

Live values are passed as accessors (`value={upload}`, `checked={notifications}`): the kit component subscribes to
the signal, so only the affected node updates when it changes.

![Kit gallery, dark theme](../../../docs/img/kit-gallery-dark.png)

The Actions family uses the Quiet theme. `GALLERY=actions` shows only Actions; `GALLERY=palette` opens its command
palette for documentation, and `GALLERY_DARK=1` starts dark. The copy action reports success in place, holding
Space/Enter or the pointer archives once, and Left/Right changes the segmented calendar view. `src/sections/actions.tsx`
contains the family composition. Nothing animates at rest.

`GALLERY=chrome` focuses the App chrome workspace (`src/sections/chrome.tsx`). F10 and Alt+F/V enter its menus;
document tabs select/close/reorder from the keyboard. Drag panel tabs into groups or to edges, or use “Panel actions”
to dock by keyboard; Escape cancels a drag. Dividers take pointer drags and arrow keys. Save/Restore layout use a
single gallery storage key only on request, report errors in the status bar and preserve the current layout on failure.

`GALLERY=selection` shows mixed and disabled checkboxes, whole-label switches, radio lists and cards, sliders
(horizontal, vertical, logarithmic, marked and range), filter chips, a removable chip and a clearable star rating.
The radio group skips disabled choices with arrows; slider arrows step (Shift steps ten), Home/End reach bounds,
and Delete clears the focused rating. `src/sections/selection.tsx` owns this page's local state.
`GALLERY=overlays` focuses the overlay family: hints, popovers, hover cards, confirmation, dialogs, edge sheets,
toasts and a guided tour. `OVERLAY=dialog`, `sheet`, `tour`, `hint`, `popover`, `hover`, `confirm` or `toast` opens a surface for a closer look. Hover crosses into
the rich card; Tab/Enter provides the same path. Toast hover/focus expands and pauses the stack; drag dismisses.


`GALLERY=inputs` shows the text, numeric, token, selection and shortcut fields. Their values belong to the gallery; every example is editable from the keyboard. `GALLERY_DARK=1` selects Quiet dark.

`GALLERY=navigation` shows all eight Navigation controls: a grouped sidebar, overflow breadcrumbs, scrollable tabs,
pagination, a release stepper, a document with a following contents rail, a named dock and a compact tab bar.
Collapse the sidebar, open its groups, switch pages, or choose a contents entry; Tab/Shift-Tab, arrows, Home/End and
Enter/Space reach the same actions. `GALLERY_DARK=1` starts in Quiet dark.
`GALLERY=feedback` shows the Feedback family: dismissible alerts and a banner, determinate and indeterminate progress,
a ring, storage meter, spinner and skeletons, badges, avatar statuses, empty-state action and timeline. Dismiss and
action controls support Tab/Enter/Space; the empty-state action ends the sample loading state. Nothing moves after
loading is stopped, and reduced motion freezes the loading indicators.

The Pickers family is available with `GALLERY=pickers`, or the focused views `pickers-dates`, `pickers-colors` and `pickers-values`. Add `GALLERY_DARK=1` for Quiet dark. Values are interactive; calendar keys, wheel snapping, color channels and fine numeric controls share the public kit components.

`GALLERY=data` shows cards, metrics, lists and tables, a 2,000-row recording grid, shared tree selection,
disclosures, editable paths, filters and filesystem navigation. `GALLERY_DATA=overview`, `grid`, `tree` or `files`
selects one part. The grid supports keyboard range/toggle selection, sorting, column resizing and cell editing.
`GALLERY_DIALOG=open` or `save` opens the corresponding path dialog in the files view. These examples read the
repository's gallery folder and return chosen paths; they never write a file. `GALLERY_DARK=1` starts in Quiet dark.

`GALLERY=tools` shows the Tool panels. `GALLERY_TOOLS=inspector`, `streams`, `graph`, `animation` or `binary`
focuses a page; `GALLERY_DARK=1` selects Quiet dark. `src/tools/` owns the sample data and callbacks. Edit properties,
append/filter logs, issue terminal commands, connect and move nodes, inspect time spans, edit bytes, share curve keys
with the timeline, change gradient stops or send meter peaks. The terminal supports `help`, `status`, `clear` and an
explicit unknown-command reply; it starts no process. Play requests are displayed; the editor owns no playback loop.
These examples use only public kit controls and create no background service.
