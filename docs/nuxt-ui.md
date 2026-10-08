# zinc:ui/nuxt: Nuxt UI on zinc:ui

`zinc:ui/nuxt` is a component kit with the look of [Nuxt UI 4](https://ui.nuxt.com) (nuxt/ui 4.11.3, MIT, notice in `lib/std/nuxt/NOTICE.md`), written for
zinc:ui's style system rather than ported from Vue (decision D38). Nuxt UI's themes are Tailwind classes, and zinc:ui reads Tailwind classes, so each
component maps the classes of its theme (`src/theme/<component>.ts`) one for one. The exact values come from `docs/reports/nuxt-ui-research.md`.

```ts
import { theme, setColorMode, setColors, NuxtColors, hex, rounded } from 'zinc:ui/nuxt';
setColorMode('dark');                    // Nuxt UI's .dark
const c = new NuxtColors(); c.primary = 'blue'; setColors(c);   // app.config ui.colors
<view class={`bg-${hex(theme().bgElevated)} text-${hex(theme().text)} ${rounded('md')}`} />
```

## Tokens

| Nuxt UI | zinc:ui/nuxt | Status |
|---|---|---|
| `ui.colors` aliases primary, secondary, success, info, warning, error, neutral (green, blue, green, blue, yellow, red, slate) | `NuxtColors`, `setColors` | done |
| `--ui-<alias>`: shade 500 light, 400 dark | `theme().primary` ... `.error`, `theme().color(name)` | done |
| `--ui-color-<alias>-50..950` | `theme().scale(name, shade)` | done |
| `--ui-text-dimmed / muted / toned / (default) / highlighted / inverted` | `textDimmed`, `textMuted`, `textToned`, `text`, `textHighlighted`, `textInverted` | done |
| `--ui-bg / -muted / -elevated / -accented / -inverted` | `bg`, `bgMuted`, `bgElevated`, `bgAccented`, `bgInverted` | done |
| `--ui-border / -muted / -accented / -inverted` | `border`, `borderMuted`, `borderAccented`, `borderInverted` | done |
| `.light` / `.dark` | `setColorMode('light' \| 'dark')`, `colorMode()` | done |
| Tailwind 4 palettes (OKLCH) | `PALETTES`, `shade(palette, n)`: exact sRGB hex of slate, green, blue, yellow, red | done (other palettes on demand) |
| `--ui-radius` scale xs..3xl (2, 4, 6, 8, 12, 16, 24 px) | `radius(size)`, `rounded(size)` (`rounded-[6px]`: zinc:ui's own `rounded-sm` is 2 px) | done |
| `bg-primary/10`, `ring-primary/25` (OKLab color-mix) | `bg-${hex(c, 10)}`: sRGB alpha | partial: ZN-378 |
| `focus-visible:outline-3 outline-<c>/25` | zinc:ui's `focus-visible:` and `outline-N` (ZN-258) | done (used by the components) |
| `transition-colors` 150 ms, `--ease-out` | zinc:ui transitions | done |
| keyframes scale-in / slide-in / fade / accordion, reduced motion | | ZN-275 |
| font: system `font-sans`; the docs site uses Public Sans | zinc:ui's sans (Inter) | partial: ZN-379 |
| logical properties (`ms-`, `ps-`, `start-`), `rtl:` | | missing: ZN-377 |

## Components

The props keep Nuxt UI's names and defaults (`color`, `variant`, `size`, `label`, `icon`, `trailing-icon` as `trailingIcon`, `loading`, `disabled`,
`ui` overrides as `class` props); the slots become function props (`leading`, `trailing`, `default` as `children`).

| Nuxt UI | Variants and sizes | Task | Notes |
|---|---|---|---|
| Button (done) | solid, outline, soft, subtle, ghost, link; xs..xl; color alias or neutral | ZN-357.02 | link mode (router `to`) becomes `onPress`; `loadingAuto` awaits the handler's promise |
| Badge (done) | solid, outline, soft, subtle; xs..xl | ZN-357.02 | |
| Avatar (done) | 3xs..3xl; image, text (initials), icon; chip | ZN-357.02 | AvatarGroup with the overlap |
| Card (done) | outline, soft, subtle, solid; header, body, footer | ZN-357.02 | |
| Input (done) | outline, soft, subtle, ghost, none; xs..xl; leading / trailing icon | ZN-357.02 | 16 px text below 768 px (Nuxt UI's responsive size) |
| Textarea (done) | as Input; `rows`, `autoresize`, `maxrows` | ZN-357.02 | autoresize from the field's line count |
| Select (trigger and inline list done; a layer later) | as Input; items, placeholder | ZN-357.02 (field), ZN-357.03 (popup) | the popup on zinc:ui's anchored floats (flip and margin); typeahead |
| Checkbox (done) | xs..xl; indeterminate; label, description | ZN-357.02 | |
| Switch (done) | xs..xl (md 36 x 20, thumb 16); loading | ZN-357.02 | thumb animation 200 ms |
| RadioGroup (done) | list, card, table variants; xs..xl; orientation | ZN-357.02 | arrow keys move the choice |
| Tabs (done) | pill, link; xs..xl; horizontal / vertical | ZN-357.04 | the indicator measured from the trigger boxes (screenBox) |
| Accordion (done) | single / multiple, collapsible | ZN-357.04 | height animation to the content's measured height |
| Modal (done) | fullscreen, dismissible, overlay | ZN-357.03 | zinc:ui layers for the portal; focus kept inside; Escape and outside click |
| Slideover (done) | side top / right / bottom / left | ZN-357.03 | slide-in keyframes: ZN-275 |
| DropdownMenu (done) | items with icons, kbds, checkbox items, submenus | ZN-357.03 | anchored float; submenu pointer grace |
| Tooltip (done) | delay, side | ZN-357.03 | 24 px high, 100 ms |
| Toast / Toaster (done) | color, title, description, actions, duration, progress | ZN-357.03 | queue of 5, stacked, pause on hover; swipe through onDrag |
| Table (done) | columns, sorting, row selection, sticky header, loading bar | ZN-357.04 | large data through VirtualList |
| Pagination (done) | page, total, items-per-page, sibling-count | ZN-357.04 | outline neutral buttons, the current page a solid primary button (Nuxt UI's own composition) |
| Breadcrumb (done) | items with icons, separator | ZN-357.04 | |
| NavigationMenu (done) | horizontal, vertical, collapsed; highlight | ZN-357.04 | the horizontal viewport animation is simplified to a popover |
| Dashboard layout (done) | DashboardGroup, DashboardSidebar (collapsible, resizable), DashboardPanel, DashboardNavbar, toolbar | ZN-357.04 | sizes kept per app (zinc:ui storage); below 1024 px the sidebar is a Slideover |

The dashboard app and the gallery of every component are `examples/nuxt-ui` (ZN-357.05, screenshots in its README).
Nuxt's inset ring is a 1 px border (borders take no layout space in zinc:ui, so the boxes keep Nuxt's sizes); the kit has its own JSX helpers
(`lib/std/nuxt/host.ts`: zinc:ui/kit's, with roles and labels).

## What does not map, and the tasks

- OKLab colour mixing of tints: sRGB alpha today (ZN-378).
- Right-to-left direction and logical properties (ZN-377).
- Public Sans, the face of the Nuxt UI site (ZN-379).
- Enter / exit keyframes and reduced motion (ZN-275).
- Router links (`to`, active matching): no router in zinc:ui; components take `onPress` and an `active` flag.
- DOM-only behaviours with no zinc:ui meaning: SSR, `teleport` targets other than zinc:ui's layers, `sr-only` native form inputs.
