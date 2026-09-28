# zinc:ui/kit v2: plan (from GPUI, Zed `ui`, GPUI Kit, guise)

Research summary, 2026-09-28. Sources:
- [GPUI](https://github.com/zed-industries/zed/tree/main/crates/gpui) and Zed's
  [ui crate](https://github.com/zed-industries/zed/tree/main/crates/ui/src/components);
- [GPUI Kit](https://gpui-kit.com/) (formerly longbridge/gpui-component);
- [guise](https://wess.io/guise/).

## Ideas worth borrowing

- **Overlays, from GPUI.**
  - `deferred(child)` paints after all ancestors, with a z `priority`, while keeping its layout in the tree.
  - `anchored()` positions by a corner. It flips (`SwitchAnchor`) or snaps to the window with a margin.
  - `occlude()` blocks hits to what lies below.
  - Popover menus combine all three.
- **Keyboard, from GPUI.** Actions declared on elements, with `key_context` scopes. A keymap binds keys to actions per context, and the deepest context on the focus path wins. `keysFor(action)` gives the shortcut hints shown in tooltips and menus.
- **Focus, from GPUI.** Explicit tab stops and a `tab_index`, `focus_visible` styles, and focus restored when a menu is dismissed.
- **Zed `ui`.**
  - One button base with styles Filled / Tinted / Outlined / Subtle / Transparent and sizes from 16 to 32 px.
  - Per-corner rounding, for button groups.
  - Five elevation levels, each fixing a surface colour and a shadow.
  - A state matrix in the theme: element and ghost colours for hover, active, selected and disabled.
  - `Tooltip::for_action`, which shows the keybinding.
- **GPUI Kit.**
  - A split between `base`, the unstyled behaviour (focus, keyboard, controlled state, overlays), and the styled components.
  - A Root that mounts the dialog, sheet and notification layers, so apps call `openDialog` / `pushNotification`.
  - A focus trap in dialogs and sheets.
  - A DataTable driven by a delegate (row and column counts, `renderCell`, sort, load more) with virtual rows.
  - A Command palette with groups and keybinding hints.
- **guise.**
  - One prop vocabulary for every control: `variant`, `color`, `size` (xs–xl), `radius`, `disabled`.
  - `surface(color, variant)` derives the fill, hover and outline colours.
  - About 130 components grouped as actions, forms, feedback, data, overlays, navigation and layout.

## Engine additions (`lib/std/ui.ts`), in this order

1. **Layers.** `ui.openLayer(node, { priority, modal, backdrop })`. A layer paints after the root and is hit-tested first. It escapes `overflow` clipping. A modal layer occludes everything below it.
2. **Anchored positioning.** `ui.anchor(float, target | [x, y], placement, offset, flip, margin)`, applied at the end of layout so the float never lags a frame.
3. **Dismissal.** `ui.onOutsidePointer(h, f)`, and a dismiss stack that Escape pops (the topmost overlay closes first).
4. **Focus.**
   - `tabIndex`, `disabled`, `ui.focusScope(h, { trap, restore, autoFocus })`.
   - `focus-visible:` and `ring-*` tokens, replacing the fixed yellow focus ring.
5. **Classes.**
   - Per-corner `rounded-{t,b,l,r,tl,…}-*` and `min/max-w/h-*`.
   - `truncate` / `line-clamp` and `disabled:`.
   - `transition` on opacity and transform, and `rotate`.
6. **Keymap.** `ui.bindKeys`, a `keyContext` attribute, `ui.onAction`, `ui.keysFor`.
7. **Icons and text.** An `<Icon name>` host tag: a Lucide subset (ISC licence) flattened to strokes and baked per program, like fonts. Plus `ui.measureText`.
8. **Lists and timers.**
   - Variable-height `virtualize` and `scrollToIndex(i, 'nearest' | 'center')`; a 2-D virtual table.
   - A cancellable `ui.timer`, for tooltip delays and toast auto-hide.
   - Animating to a measured height, for accordions.

**Glue for both UI models.**
- `<Portal layer>`: open the layer on mount, close it on cleanup.
- `usePresence(open)`: keep the node mounted through its exit animation.
- `createDisclosure({ open, defaultOpen, onOpenChange })`.

## Components, in phases

1. **Foundations.**
   - Theme v2: the state matrix, status colours info / success / warning / danger, and size, radius and elevation scales.
   - Shared props on every control: `variant`, `size`, `disabled`, `class`, `tooltip`.
   - Components:
     - Actions: Icon, Button v2 (icon, loading, link and tinted variants), IconButton, ButtonGroup, Toggle / ToggleGroup / SegmentedControl.
     - Form controls: Checkbox, RadioGroup, Switch v2, Slider v2, Label / Field, TextInput (prefix, suffix, clear, reveal), Textarea.
     - Feedback and misc: Spinner, Skeleton, Kbd v2.
2. **Overlays:** Tooltip, Popover, Menu / DropdownMenu (checkable items, submenus, shortcuts), ContextMenu, Select, Dialog / AlertDialog, Sheet, Toast (imperative `toast({...})` and one `<Toaster />`), HoverCard.
3. **Navigation and data:** Collapsible, Accordion, Tabs v2, Breadcrumb, Pagination, Sidebar, Command palette, Combobox, Tree, VirtualList v2, Table, DataTable (delegate props).
4. **Advanced:** Resizable / Splitter, NumberInput, OtpInput, Calendar / DatePicker, ColorPicker, Stepper, Timeline, AvatarGroup, RingProgress, Carousel. Chart and Dock only when someone needs them.

## Layout, tests, docs

- **Code.** Put behaviour in `lib/std/kit/base/` (disclosure, roving focus, listbox, typeahead, presence) and styling in `lib/std/kit/*.tsx`.
- **Tests.** One conformance test per component, in `tests/conformance/kit_*_{solid,react}.tsx`. Each prints its layout and replays input with the test hooks; the Solid and React outputs must match.
- **Docs.**
  - `docs/ui-kit.md` is the index. Each family gets its own page, `docs/ui-kit/{actions,forms,overlays,navigation,data,feedback,layout}.md`.
  - Every component documents: an example, a props table, a keyboard table, notes for Solid / React, and limits.
- **Examples.**
  - Rebuild `examples/ui/kit-gallery`: a sidebar of the families, ⌘K to jump to a component, a theme and accent switcher, a props playground.
  - Add `examples/ui/kit-app`: a realistic settings and data-table screen.

Already covered by this pass, outside the kit: rounded overflow clipping, macOS-like scrolling, per-side borders, CSS-like text colour inheritance, and a draggable Slider.
