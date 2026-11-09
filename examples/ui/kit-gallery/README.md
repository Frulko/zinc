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
