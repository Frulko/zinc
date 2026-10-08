# Nuxt UI: look and theme reference for a non-Vue component kit

Source snapshot: `github.com/nuxt/ui`, branch `v4` default, commit `9c4e33b7e076aa6bd59b5bd99d8621d9dc1bcf60` (2026-10-08), `package.json` version **4.11.3**. It is built on Tailwind CSS v4, Reka UI and tailwind-variants. Every value below comes from that tree unless a URL says otherwise. Docs live at <https://ui.nuxt.com/docs>.

Notation used throughout:
- Tailwind v4 spacing unit is `--spacing: 0.25rem`, so `p-2.5` is 10px and `size-5` is 20px (at 16px root).
- `text-xs` is 12px with 16px line height, `text-sm` is 14/20, `text-base` is 16/24, `text-lg` is 18/28, `text-xl` is 20/28 and `text-2xl` is 24/32. `text-sm/4` means 14px with a 16px line, and `text-[10px]/3` means 10px with a 12px line.
- `font-medium` is 500 and `font-semibold` is 600.
- `ring` is a 1px inset box-shadow (`ring-inset`). `outline-3` is a 3px solid outline at offset 0. `X/25` means colour X at alpha 0.25 (Tailwind uses `color-mix(in oklab, X 25%, transparent)`).
- Semantic utility names map to CSS variables. `text-default` is `--ui-text`, `text-muted` is `--ui-text-muted`, `bg-default` is `--ui-bg`, `bg-elevated` is `--ui-bg-elevated`, `ring-accented` is `--ui-border-accented`, `bg-inverted` is `--ui-bg-inverted`, `bg-border` is `--ui-border`, and so on. See section 2.4.
- `bg-primary`, `text-primary` and similar use `--ui-primary`.

---

## 1. Licence

Source: `LICENSE.md` at the repo root (<https://github.com/nuxt/ui/blob/v4/LICENSE.md>).

```
MIT License

Copyright (c) 2023 Nuxt
```

Keep the full MIT permission and warranty text with that copyright line in the third-party notice. Two related notices:
- The default icon set is Lucide (`i-lucide-*`, `src/theme/icons.ts`), which is ISC-licensed.
- The palettes come from Tailwind CSS (MIT, Copyright (c) Tailwind Labs, Inc.).

Copying palette values or icons brings in those notices as well.

---

## 2. Design tokens

### 2.1 Colour aliases and default palettes

Sources: `src/utils/defaults.ts` (`getDefaultConfig`, `resolveColors`) and the docs page <https://ui.nuxt.com/docs/getting-started/theme/design-system>.

| Alias | Default Tailwind palette |
|---|---|
| primary | `green` |
| secondary | `blue` |
| success | `green` |
| info | `blue` |
| warning | `yellow` |
| error | `red` |
| neutral | `slate` |

- `theme.colors` defaults to `['primary','secondary','success','info','warning','error']`. `neutral` is always present and handled separately: every component has a dedicated `neutral` branch that uses the semantic tokens instead of a palette.
- Users override the mapping through `app.config.ts` (`ui.colors.primary = 'indigo'`).
- If `neutral` is set to `'neutral'`, Nuxt UI substitutes the **Tailwind v3 hex** neutral palette (`--color-old-neutral-*`) in `src/templates.ts` and `runtime/plugins/colors.ts`. This does not apply to the default (`slate`).

**Generated alias variables** (`src/runtime/plugins/colors.ts`):
```
--ui-color-<alias>-<50..950> = the palette's shade
:root, .light { --ui-<alias>: var(--ui-color-<alias>-500); }   /* light: shade 500 */
.dark         { --ui-<alias>: var(--ui-color-<alias>-400); }   /* dark:  shade 400 */
```
This rule covers every alias except neutral. For example, `--ui-primary` is green-500 in light mode and green-400 in dark mode.

### 2.2 Tailwind v4 palettes used by default

Source: `tailwindcss@4.1.11/theme.css`. Tailwind defines them in OKLCH, and the hex values below are the sRGB conversions (they match Tailwind's published hex).

| | 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| slate | #f8fafc | #f1f5f9 | #e2e8f0 | #cad5e2 | #90a1b9 | #62748e | #45556c | #314158 | #1d293d | #0f172b | #020618 |
| green | #f0fdf4 | #dcfce7 | #b9f8cf | #7bf1a8 | #05df72 | #00c950 | #00a63e | #008236 | #016630 | #0d542b | #032e15 |
| blue | #eff6ff | #dbeafe | #bedbff | #8ec5ff | #51a2ff | #2b7fff | #155dfc | #1447e6 | #193cb8 | #1c398e | #162456 |
| yellow | #fefce8 | #fef9c2 | #fff085 | #ffdf20 | #fdc700 | #f0b100 | #d08700 | #a65f00 | #894b00 | #733e0a | #432004 |
| red | #fef2f2 | #ffe2e2 | #ffc9c9 | #ffa2a2 | #ff6467 | #fb2c36 | #e7000b | #c10007 | #9f0712 | #82181a | #460809 |

Exact OKLCH sources for the shades used most:

slate-50 `oklch(98.4% 0.003 247.858)`; slate-100 `oklch(96.8% 0.007 247.896)`; slate-200 `oklch(92.9% 0.013 255.508)`; slate-300 `oklch(86.9% 0.022 252.894)`; slate-400 `oklch(70.4% 0.04 256.788)`; slate-500 `oklch(55.4% 0.046 257.417)`; slate-600 `oklch(44.6% 0.043 257.281)`; slate-700 `oklch(37.2% 0.044 257.287)`; slate-800 `oklch(27.9% 0.041 260.031)`; slate-900 `oklch(20.8% 0.042 265.755)`; green-400 `oklch(79.2% 0.209 151.711)`; green-500 `oklch(72.3% 0.219 149.579)`; blue-400 `oklch(70.7% 0.165 254.624)`; blue-500 `oklch(62.3% 0.214 259.815)`; yellow-400 `oklch(85.2% 0.199 91.936)`; yellow-500 `oklch(79.5% 0.184 86.047)`; red-400 `oklch(70.4% 0.191 22.216)`; red-500 `oklch(63.7% 0.237 25.331)`.

### 2.3 Semantic CSS variables (light and dark)

Source: `src/runtime/index.css` (`@layer theme`). Light values apply on `:root, :host, .light`, dark values on `.dark`. Here "neutral" means `--ui-color-neutral-*`, which is **slate** by default.

| Variable | Light | Dark | Light hex | Dark hex |
|---|---|---|---|---|
| `--ui-primary` (and every alias) | primary-500 | primary-400 | #00c950 | #05df72 |
| `--ui-text-dimmed` | neutral-400 | neutral-500 | #90a1b9 | #62748e |
| `--ui-text-muted` | neutral-500 | neutral-400 | #62748e | #90a1b9 |
| `--ui-text-toned` | neutral-600 | neutral-300 | #45556c | #cad5e2 |
| `--ui-text` | neutral-700 | neutral-200 | #314158 | #e2e8f0 |
| `--ui-text-highlighted` | neutral-900 | white | #0f172b | #ffffff |
| `--ui-text-inverted` | white | neutral-900 | #ffffff | #0f172b |
| `--ui-bg` | white | neutral-900 | #ffffff | #0f172b |
| `--ui-bg-muted` | neutral-50 | neutral-800 | #f8fafc | #1d293d |
| `--ui-bg-elevated` | neutral-100 | neutral-800 | #f1f5f9 | #1d293d |
| `--ui-bg-accented` | neutral-200 | neutral-700 | #e2e8f0 | #314158 |
| `--ui-bg-inverted` | neutral-900 | white | #0f172b | #ffffff |
| `--ui-border` | neutral-200 | neutral-800 | #e2e8f0 | #1d293d |
| `--ui-border-muted` | neutral-200 | neutral-700 | #e2e8f0 | #314158 |
| `--ui-border-accented` | neutral-300 | neutral-700 | #cad5e2 | #314158 |
| `--ui-border-inverted` | neutral-900 | white | #0f172b | #ffffff |

Mode-independent variables (`:root, :host`):

| Variable | Value |
|---|---|
| `--ui-radius` | `0.25rem` (4px) |
| `--ui-container` | `80rem` (1280px). `UContainer` max width. |
| `--ui-header-height` | `4rem` (64px). Used by Modal and Slideover headers, DashboardNavbar and DashboardSidebar header. |

The body base style is `antialiased text-default bg-default scheme-light dark:scheme-dark` (`src/templates.ts`, the `ui.css` template).

### 2.4 Tailwind theme bridge and radius scale

Source: `src/templates.ts`, the `@theme default inline` block.

```
--radius-xs:  calc(var(--ui-radius) * 0.5)   = 2px
--radius-sm:  var(--ui-radius)               = 4px
--radius-md:  calc(var(--ui-radius) * 1.5)   = 6px
--radius-lg:  calc(var(--ui-radius) * 2)     = 8px
--radius-xl:  calc(var(--ui-radius) * 3)     = 12px
--radius-2xl: calc(var(--ui-radius) * 4)     = 16px
--radius-3xl: calc(var(--ui-radius) * 6)     = 24px
(rounded-full = 9999px, unchanged)
```
The pixel values assume the default `--ui-radius` of 4px.

Utility to variable mapping (same block):

| Utility | Maps to |
|---|---|
| `text-{dimmed,muted,toned,default,highlighted,inverted}` | the matching `--ui-text*` |
| `bg-{default,muted,elevated,accented,inverted}` | the matching `--ui-bg*` |
| `bg-border` | `--ui-border` |
| `border-`, `ring-`, `divide-`, `ring-offset-` + `{default,muted,accented,inverted}` | the matching `--ui-border*` |
| `border-bg`, `ring-bg`, `divide-bg`, `ring-offset-bg` | `--ui-bg` |
| `outline-default` | `--ui-border` |
| `outline-inverted` | `--ui-border-inverted` |
| `stroke-` / `fill-` + `{bg,default,inverted}` | `--ui-bg`, `--ui-border` and `--ui-border-inverted` respectively |
| `--color-<alias>` | `var(--ui-<alias>)` |

### 2.5 Motion and shadow tokens

Sources: Tailwind v4 `theme.css` and `src/runtime/keyframes.css`.

**Easing curves**

| Token | Value |
|---|---|
| `--ease-out` | `cubic-bezier(0, 0, 0.2, 1)` (almost every Nuxt UI animation) |
| `--ease-in` | `cubic-bezier(0.4, 0, 1, 1)` |
| `--ease-in-out` | `cubic-bezier(0.4, 0, 0.2, 1)` |

**Shadows**

| Token | Value |
|---|---|
| `shadow-xs` | `0 1px 2px 0 rgb(0 0 0 / 0.05)` |
| `shadow-sm` | `0 1px 3px 0 rgb(0 0 0 / .1), 0 1px 2px -1px rgb(0 0 0 / .1)` |
| `shadow-lg` | `0 10px 15px -3px rgb(0 0 0 / .1), 0 4px 6px -4px rgb(0 0 0 / .1)` |

**Keyframes**

| Keyframe | Animation |
|---|---|
| `scale-in` | opacity 0 to 1 and `scale(0.95)` to `scale(1)` |
| `scale-out` | the reverse of `scale-in` |
| `fade-in` / `fade-out` | opacity 0 to 1 / 1 to 0 |
| `slide-in-from-{top,right,bottom,left}` | translate ±100% to 0 |
| `slide-out-to-{top,right,bottom,left}` | translate 0 to ±100% |
| `accordion-down` / `accordion-up` | height 0 to/from `--reka-accordion-content-height`, overflow hidden |
| `collapsible-down` / `collapsible-up` | same as accordion, using the collapsible height variable |
| `toast-*` | toast slide, pulse and swipe animations |

Under `prefers-reduced-motion`, the scale and slide keyframes are redefined as opacity-only fades (`keyframes.css` around line 620).

**Transitions**

When `theme.transitions` is `true` (the default), interactive elements add `transition-colors`. Tailwind's default for that is 150ms with `cubic-bezier(0.4, 0, 0.2, 1)`.

**Common durations**

| Duration | Used for |
|---|---|
| 100ms | popovers, menus and tooltips |
| 200ms | modal, slideover, accordion, toast, tab indicator and switch thumb |

### 2.6 Shared focus and disabled conventions

These apply across components unless a section says otherwise.
- **Focus ring.** `outline-<c>/25 focus-visible:outline-3` gives a 3px outline at 25% alpha of the colour. For outline and subtle styles, `focus-visible:ring-<c>` also turns the 1px inset ring fully opaque. With `color=neutral`, `<c>` is the `inverted` token.
- **Disabled state.** `disabled:opacity-75 disabled:cursor-not-allowed`.
- **Field groups.** When a component sits in a `UFieldGroup`, its inner corners are squared (`rounded-e-none` and similar) and the group uses `-space-x-px` (`src/theme/field-group.ts`).

---

## 3. Components

Each section cites `src/theme/<file>.ts` for classes and `src/runtime/components/<Name>.vue` for props. The class lists are verbatim. The `<c>` placeholder stands for any non-neutral alias such as primary.

### 3.1 Button

Sources: `src/theme/button.ts` and `Button.vue`. Docs: <https://ui.nuxt.com/docs/components/button>.


**Props:** `label` (string); `color` (alias or `'neutral'`, `primary`); `variant` (`solid | outline | soft | subtle | ghost | link`, `solid`); `size` (`xs | sm | md | lg | xl`, `md`); `activeColor`, `activeVariant` (used when a link is active); `square` (boolean, false. Set automatically when there is an icon and no label.); `block` (boolean, false); `loading`, `loadingAuto` (boolean, false); `loadingIcon` (icon, `i-lucide-loader-circle`); `icon`, `leadingIcon`, `trailingIcon`, `avatar`, `leading`, `trailing`; Link props (`to`, `href`, `target`, `disabled`).

**Base classes:** `rounded-md font-medium inline-flex items-center disabled:opacity-75 transition-colors`. The radius is 6px.

**Sizes**

| Size | Padding | Text | Gap | Icon | Avatar | Square padding |
|---|---|---|---|---|---|---|
| xs | px-2 py-1 (8/4px) | text-xs | gap-1 (4px) | size-4 (16) | 3xs | p-1 |
| sm | px-2.5 py-1.5 (10/6) | text-xs | gap-1.5 | size-4 | 3xs | p-1.5 |
| md | px-2.5 py-1.5 | text-sm | gap-1.5 | size-5 (20) | 2xs | p-1.5 |
| lg | px-3 py-2 (12/8) | text-sm | gap-2 | size-5 | 2xs | p-2 |
| xl | px-3 py-2 | text-base | gap-2 | size-6 (24) | xs | p-2 |

`block` adds `w-full justify-center`, and the trailing icon gets `ms-auto`. Loading spins the leading icon (`animate-spin`), or the trailing icon when the button has only a trailing one.

Resulting heights with the default line heights:

| Size | Height |
|---|---|
| xs | 24px |
| sm | 28px |
| md | 32px |
| lg | 36px |
| xl | 40px |

**Variants, `color=<c>`** (compoundVariants, verbatim):

| Variant | Classes |
|---|---|
| solid | `text-inverted bg-<c> hover:bg-<c>/75 active:bg-<c>/75 disabled:bg-<c> outline-<c>/25 focus-visible:outline-3` |
| outline | `ring ring-inset ring-<c>/50 text-<c> hover:bg-<c>/10 active:bg-<c>/10 disabled:bg-transparent outline-<c>/25 focus-visible:outline-3 focus-visible:ring-<c>` |
| soft | `text-<c> bg-<c>/10 hover:bg-<c>/15 active:bg-<c>/15 outline-<c>/25 focus-visible:outline-3 disabled:bg-<c>/10` |
| subtle | `text-<c> ring ring-inset ring-<c>/25 bg-<c>/10 hover:bg-<c>/15 active:bg-<c>/15 disabled:bg-<c>/10 outline-<c>/25 focus-visible:outline-3 focus-visible:ring-<c>` |
| ghost | `text-<c> hover:bg-<c>/10 active:bg-<c>/10 outline-<c>/25 focus-visible:outline-3 disabled:bg-transparent` |
| link | `text-<c> hover:text-<c>/75 active:text-<c>/75 disabled:text-<c> outline-<c>/25 focus-visible:outline-3` |

**Variants, `color=neutral`:**

| Variant | Classes |
|---|---|
| solid | `text-inverted bg-inverted hover:bg-inverted/90 active:bg-inverted/90 disabled:bg-inverted outline-inverted/25 focus-visible:outline-3` |
| outline | `ring ring-inset ring-accented text-default bg-default hover:bg-elevated active:bg-elevated disabled:bg-default outline-inverted/25 focus-visible:outline-3 focus-visible:ring-inverted` |
| soft | `text-default bg-elevated hover:bg-accented/75 active:bg-accented/75 outline-inverted/25 focus-visible:outline-3 disabled:bg-elevated` |
| subtle | `ring ring-inset ring-accented text-default bg-elevated hover:bg-accented/75 active:bg-accented/75 disabled:bg-elevated outline-inverted/25 focus-visible:outline-3 focus-visible:ring-inverted` |
| ghost | `text-default hover:bg-elevated active:bg-elevated outline-inverted/25 focus-visible:outline-3` (no hover background while disabled) |
| link | `text-muted hover:text-default active:text-default disabled:text-muted outline-inverted/25 focus-visible:outline-3` |

The source also lists `aria-disabled:` and `dark:disabled:` twins of each `disabled:` class. They are omitted above because they use identical values.

### 3.2 Badge

Sources: `src/theme/badge.ts` and `Badge.vue`.


**Props:** `as` (`'span'`); `label` (string or number); `color` (alias or neutral, `primary`); `variant` (`solid | outline | soft | subtle` (no ghost or link), `solid`); `size` (xs..xl, `md`); `square` (boolean, auto when there is no label); icon and avatar props (as Button).

**Base classes:** `font-medium inline-flex items-center`.

**Sizes**

| Size | Text | Padding | Gap | Radius | Icon | Square |
|---|---|---|---|---|---|---|
| xs | `text-[8px]/3` (8px, 12px line) | px-1 py-0.5 (4/2) | gap-1 | rounded-sm (4px) | size-3 (12) | p-0.5 |
| sm | `text-[10px]/3` | px-1.5 py-1 (6/4) | gap-1 | rounded-sm | size-3 | p-1 |
| md | text-xs | px-2 py-1 (8/4) | gap-1 | rounded-md (6px) | size-4 | p-1 |
| lg | text-sm | px-2 py-1 | gap-1.5 | rounded-md | size-5 | p-1 |
| xl | text-base | px-2.5 py-1 | gap-1.5 | rounded-md | size-6 | p-1 |

**Variants**

| Variant | `color=<c>` | `color=neutral` |
|---|---|---|
| solid | `bg-<c> text-inverted` | `text-inverted bg-inverted` |
| outline | `text-<c> ring ring-inset ring-<c>/50` | `ring ring-inset ring-accented text-default bg-default` |
| soft | `bg-<c>/10 text-<c>` | `text-default bg-elevated` |
| subtle | `bg-<c>/10 text-<c> ring ring-inset ring-<c>/25` | `ring ring-inset ring-accented text-default bg-elevated` |

### 3.3 Avatar

Sources: `src/theme/avatar.ts` and `Avatar.vue`.


**Props:** `src`, `alt` (string); `icon` (icon); `text` (string. Otherwise initials come from `alt`.); `size` (`3xs..3xl`, `md`); `color` (alias or neutral, `neutral`); `chip` (boolean or ChipProps); `as` (`'span'`).

**Classes**

| Slot | Classes |
|---|---|
| root | `inline-flex items-center justify-center shrink-0 select-none rounded-full align-middle` |
| image | `h-full w-full rounded-[inherit] object-cover` |
| fallback | `font-medium truncate` |

| Colour | root | fallback and icon |
|---|---|---|
| neutral | `bg-elevated` | `text-muted` |
| `<c>` | `bg-<c>/10` | `text-<c>` |

**Sizes** (root box and font size):

| Size | Box | Font |
|---|---|---|
| 3xs | 16px | 8px |
| 2xs | 20px | 10px |
| xs | 24px | 12px |
| sm | 28px | 14px |
| md | 32px | 16px |
| lg | 36px | 18px |
| xl | 40px | 20px |
| 2xl | 44px | 22px |
| 3xl | 48px | 24px |

### 3.4 Card

Sources: `src/theme/card.ts` and `Card.vue`.


**Props:** `as` (`'div'`); `title` (string); `description` (string); `variant` (`solid | outline | soft | subtle`, `outline`).

Card has no sizes and no colour prop.

**Slots**

| Slot | Classes |
|---|---|
| root | `rounded-lg overflow-hidden` (8px) |
| header | `p-4 sm:px-6` (16px, or 24px horizontal at ≥640px) |
| body | `p-4 sm:p-6` |
| footer | `p-4 sm:px-6` |
| title | `text-highlighted font-semibold` |
| description | `mt-1 text-muted text-sm` |

**Variants**

| Variant | Classes |
|---|---|
| outline | root `bg-default ring ring-default divide-y divide-default` |
| solid | root `bg-inverted text-inverted`, title `text-inverted`, description `text-dimmed` |
| soft | root `bg-elevated/50 divide-y divide-default` |
| subtle | root `bg-elevated/50 ring ring-default divide-y divide-default` |

### 3.5 Input

Sources: `src/theme/input.ts` and `Input.vue`.


**Props:** `type` (`'text'`); `placeholder` (string); `color` (alias or neutral, `primary`); `variant` (`outline | soft | subtle | ghost | none`, `outline`); `size` (xs..xl, `md`); `highlight` (boolean, forces the coloured ring); `fixed` (boolean, false, which enables the responsive text sizes below); `autocomplete` (`'off'`); `autofocusDelay` (number, 0); `disabled`, `required`, `loading`, `icon`, `leadingIcon`, `trailingIcon`, `avatar`, `modelValue`.

**Classes**

| Slot | Classes |
|---|---|
| base | `w-full rounded-md border-0 placeholder:text-dimmed disabled:opacity-75 transition-colors` |
| leadingIcon, trailingIcon | `shrink-0 text-dimmed` |
| leading, trailing | absolutely positioned and vertically centred |

**Sizes**

| Size | Padding | Text (mobile, then md: ≥768px) | Gap | Icon | Icon inset | Padding next to an icon |
|---|---|---|---|---|---|---|
| xs | px-2 py-1 | `text-sm/4`, then `md:text-xs` | gap-1 | size-4 | ps-2/pe-2 | ps-7/pe-7 (28px) |
| sm | px-2.5 py-1.5 | `text-sm/4`, then `md:text-xs` | gap-1.5 | size-4 | ps-2.5 | ps-8 (32) |
| md | px-2.5 py-1.5 | `text-base/5`, then `md:text-sm` | gap-1.5 | size-5 | ps-2.5 | ps-9 (36) |
| lg | px-3 py-2 | `text-base/5`, then `md:text-sm` | gap-2 | size-5 | ps-3 | ps-10 (40) |
| xl | px-3 py-2 | `text-base` | gap-2 | size-6 | ps-3 | ps-11 (44) |

The larger text on mobile avoids iOS zoom. On desktop the sizes match Button: md is 14px text in a 32px-high field.

**Variants** (base, any colour):

| Variant | Classes |
|---|---|
| outline | `text-highlighted bg-default ring ring-inset ring-accented` |
| soft | `text-highlighted bg-elevated/50 hover:bg-elevated focus:bg-elevated disabled:bg-elevated/50` |
| subtle | `text-highlighted bg-elevated ring ring-inset ring-accented` |
| ghost | `text-highlighted bg-transparent hover:bg-elevated focus:bg-elevated disabled:bg-transparent` |
| none | `text-highlighted bg-transparent focus:outline-none` |

**Colour compounds**

| Applies to | `<c>` | neutral |
|---|---|---|
| outline, subtle | `outline-<c>/25 focus-visible:outline-3 focus-visible:ring-<c>` | `outline-inverted/25 focus-visible:outline-3 focus-visible:ring-inverted` |
| soft, ghost | `outline-<c>/25 focus-visible:outline-3` | the inverted equivalent |
| highlight | `ring ring-inset ring-<c>` | `ring-inverted` |

### 3.6 Textarea

Sources: `src/theme/textarea.ts` (merges in `input.ts`) and `Textarea.vue`.

**Props:** the same as Input, plus: `rows` (3); `maxrows` (0); `autoresize` (false); `autoresizeDelay` (0).

Classes, variants, colours and sizes are identical to Input. The only differences:
- Leading and trailing slots are `items-start` and pinned to the top: `inset-y-1` for xs, `inset-y-1.5` for sm and md, `inset-y-2` for lg and xl.
- `autoresize` adds `resize-none`.

### 3.7 Select

Sources: `src/theme/select.ts` (merges in `input.ts`) and `Select.vue`.


**Props:** `items`; `placeholder`; `color`, `variant`, `size` (`primary` / `outline` / `md`); `trailingIcon` (`i-lucide-chevron-down`); `selectedIcon` (`i-lucide-check`); `content` (`{ side:'bottom', sideOffset:8, collisionPadding:8, position:'popper' }`); `arrow` (false); `portal` (true); `valueKey` (`'value'`); `labelKey` (`'label'`); `descriptionKey` (`'description'`); `multiple`, `highlight`, `fixed`.

**Trigger.** Uses the Input sizes and variants with these changes:
- base becomes `relative group rounded-md inline-flex items-center`.
- outline adds `hover:bg-elevated disabled:bg-default`.
- subtle adds `hover:bg-accented/75 disabled:bg-elevated`.
- placeholder is `truncate text-dimmed`.

**Popup slots**

| Slot | Classes |
|---|---|
| content | `max-h-[min(15rem, available)] w-(trigger width) bg-default shadow-lg rounded-md ring ring-default overflow-hidden`, animated with `scale-in` / `scale-out` over 100ms (popper mode) |
| viewport | `divide-y divide-default overflow-y-auto` |
| group | `p-1` |
| item | `relative flex items-start text-default`; highlighted state `text-highlighted` and `before:bg-elevated/50` (the `before` sits at `inset-px rounded-md`) |
| itemLeadingIcon | `text-dimmed`, becoming `text-default` when highlighted |
| label | `font-semibold text-highlighted` |
| separator | `-mx-1 my-1 h-px bg-border` |
| itemDescription | `text-muted` |

**Item sizes**

| Size | Item | Label | Icon | Empty |
|---|---|---|---|---|
| xs | p-1 text-xs gap-1 | p-1 `text-[10px]/3` | 16 | p-2 text-xs |
| sm | p-1.5 text-xs gap-1.5 | p-1.5 `text-[10px]/3` | 16 | p-2.5 |
| md | p-1.5 text-sm gap-1.5 | p-1.5 text-xs | 20 | p-2.5 text-sm |
| lg | p-2 text-sm gap-2 | p-2 text-xs | 20 | p-3 |
| xl | p-2 text-base gap-2 | p-2 text-sm | 24 | p-3 text-base |

### 3.8 Checkbox

Sources: `src/theme/checkbox.ts` and `Checkbox.vue`.


**Props:** `label`, `description`; `color` (`primary`); `variant` (`list | card`, default `list`); `size` (`md`); `indicator` (`start | end | hidden`, default `start`); `highlight`; `icon` (`i-lucide-check`); `indeterminateIcon` (`i-lucide-minus`); `modelValue` (`boolean | 'indeterminate'`); `required`, `disabled`.

**Slots**

| Slot | Classes |
|---|---|
| base (the box) | `rounded-sm ring ring-inset ring-accented overflow-hidden` (4px radius, 1px border-accented) |
| indicator (checked fill) | `size-full text-inverted bg-<c>`, or `bg-inverted` for neutral |
| label | `block font-medium text-default` |
| description | `text-muted` |
| wrapper | `ms-2` with indicator `start`, `me-2` with `end` |

`required` adds a red `*` after the label (`after:text-error`). `disabled` gives the root `opacity-75`.

**Sizes**

| Size | Box | Check icon | Row height (container) | Text | Card padding |
|---|---|---|---|---|---|
| xs | 12px | 10 | h-4 | text-xs | p-2.5 |
| sm | 14 | 12 | h-4 | text-xs | p-3 |
| md | 16 | 14 | h-5 | text-sm | p-3.5 |
| lg | 18 | 16 | h-5 | text-sm | p-4 |
| xl | 20 | 18 | h-6 | text-base | p-4.5 |

**Card variant**
- Root: `border border-default rounded-lg`. Hover (not checked, not disabled): `bg-elevated/50 border-accented`.
- Checked with `<c>`: `border-<c>/50 bg-<c>/10`. Checked with neutral: `border-inverted/50 bg-elevated`.

**Focus**
- list variant: on the box, `outline-<c>/25 focus-visible:outline-3 focus-visible:ring-<c>`.
- card variant: on the card, `has-focus-visible:outline-3` and `border-<c>`.

### 3.9 Switch

Sources: `src/theme/switch.ts` and `Switch.vue`.


**Props:** `color` (`primary`); `size` (`md`); `loading`; `loadingIcon` (`i-lucide-loader-circle`); `checkedIcon`, `uncheckedIcon`; `label`, `description`; `highlight`, `required`, `disabled`.

**Slots**

| Slot | Classes |
|---|---|
| base (track) | `inline-flex items-center rounded-full border-2 border-transparent focus-visible:outline-3`; unchecked `bg-accented`; checked `bg-<c>` (neutral: `bg-inverted`); outline `<c>/25`; `transition-[background] duration-200 ease-out` |
| thumb | `rounded-full bg-default shadow-lg`, `transition-transform 200ms ease-out` |
| icon | inside the thumb, `size-10/12`; `text-dimmed` when unchecked, `text-<c>` when checked |

**Sizes**

| Size | Track width | Container height | Thumb | Checked translate | Text |
|---|---|---|---|---|---|
| xs | w-7 (28) | h-4 | 12px | 12px | text-xs |
| sm | w-8 (32) | h-4 | 14 | 14 | text-xs |
| md | w-9 (36) | h-5 | 16 | 16 | text-sm |
| lg | w-10 (40) | h-5 | 18 | 18 | text-sm |
| xl | w-11 (44) | h-6 | 20 | 20 | text-base |

The track height is the thumb plus the 2px transparent border on each side, so md is 36x20. The wrapper is `ms-2`.

### 3.10 RadioGroup

Sources: `src/theme/radio-group.ts` and `RadioGroup.vue`.


**Props:** `items`; `legend`; `valueKey` (`'value'`); `labelKey` (`'label'`); `descriptionKey` (`'description'`); `size` (`md`); `variant` (`list | card | table`, default `list`); `color` (`primary`); `orientation` (`vertical`); `indicator` (`start`); `highlight`, `disabled`, `required`, `modelValue`.

**Slots**

| Slot | Classes |
|---|---|
| base (circle) | `rounded-full ring ring-inset ring-accented` |
| indicator (checked) | `bg-<c>` (or `bg-inverted`) with a centred dot `after:bg-default after:rounded-full` |
| fieldset | `flex gap-x-2`; flex-col when vertical |
| legend | `mb-1 font-medium text-default` |

**Sizes**

| Size | Circle | Dot | Container height | Text | Fieldset gap-y | Card/table padding |
|---|---|---|---|---|---|---|
| xs | 12 | 4 | h-4 | text-xs | 2px | p-2.5 |
| sm | 14 | 4 | h-4 | text-xs | 2px | p-3 |
| md | 16 | 6 | h-5 | text-sm | 4px | p-3.5 |
| lg | 18 | 6 | h-5 | text-sm | 4px | p-4 |
| xl | 20 | 8 | h-6 | text-base | 6px | p-4.5 |

**Card and table variants**
- card: like Checkbox's card. Items are `border border-default rounded-lg`. Checked: `border-<c>/50 bg-<c>/10` (neutral: `border-inverted/50 bg-elevated`).
- table: the items are joined. Horizontal uses `-space-x-px`, `first:rounded-s-lg` and `last:rounded-e-lg`. Vertical uses `-space-y-px`, `first:rounded-t-lg` and `last:rounded-b-lg`.

### 3.11 Tabs

Sources: `src/theme/tabs.ts` and `Tabs.vue`.


**Props:** `items`; `color` (`primary`); `variant` (`pill | link`, default `pill`); `size` (`md`); `orientation` (`horizontal`); `content` (true); `defaultValue` (`'0'`); `unmountOnHide` (true); `valueKey` (`'value'`); `labelKey` (`'label'`).

**Slots**

| Slot | Classes |
|---|---|
| root | `flex items-center gap-2`; horizontal adds `flex-col` |
| list | `relative flex p-1` |
| trigger | `relative inline-flex items-center font-medium rounded-md`; inactive `text-muted`, hover `text-default`; `transition-colors`; horizontal adds `justify-center` |
| indicator | absolute, `transition-[translate,width] duration-200 ease-out`, sized and positioned from `--reka-tabs-indicator-size` and `--reka-tabs-indicator-position` |
| content | `w-full rounded-md focus-visible:outline-3 outline-<c>/25` |

**Trigger sizes**

| Size | Trigger | Icon |
|---|---|---|
| xs | px-2 py-1 text-xs gap-1 | 16 |
| sm | px-2.5 py-1.5 text-xs gap-1.5 | 16 |
| md | px-3 py-1.5 text-sm gap-1.5 | 20 |
| lg | px-3 py-2 text-sm gap-2 | 20 |
| xl | px-3 py-2 text-base gap-2 | 24 |

Trailing badges are `sm`.

**pill variant**
- list: `bg-elevated rounded-lg` (8px).
- trigger: `grow`.
- indicator: `rounded-md shadow-xs` plus `bg-<c>` (neutral `bg-inverted`). Horizontal adds `inset-y-1`; vertical adds `inset-x-1`.
- active trigger: `text-inverted`.

**link variant**
- list: `border-default`. Horizontal adds `border-b -mb-px`; vertical adds `border-s -ms-px`.
- indicator: `rounded-full bg-<c>`, 1px. Horizontal sits at `-bottom-px h-px`; vertical uses `w-px`.
- active trigger: `text-<c>` (neutral `text-highlighted`).

### 3.12 Accordion

Sources: `src/theme/accordion.ts` and `Accordion.vue`.


**Props:** `items`; `type` (`'single'`); `collapsible` (true); `unmountOnHide` (true); `trailingIcon` (`i-lucide-chevron-down`); `valueKey` (`'value'`); `labelKey` (`'label'`); `disabled`.

Accordion has no size, colour or variant.

**Slots**

| Slot | Classes |
|---|---|
| item | `border-b border-default last:border-b-0` |
| trigger | `flex-1 flex items-center gap-1.5 font-medium text-sm py-3.5 rounded-md outline-primary/25 focus-visible:outline-3` |
| leadingIcon, trailingIcon | `size-5`; the trailing icon is `ms-auto` and rotates 180° when open (`transition-transform 200ms ease-out`) |
| content | `accordion-down` / `accordion-up` over 200ms ease-out (height animation) |
| body | `text-sm pb-3.5` |

Disabled triggers get `opacity-75`.

### 3.13 Modal

Sources: `src/theme/modal.ts` and `Modal.vue`.


**Props:** `title`, `description`; `overlay` (true); `scrollable` (false); `transition` (true); `fullscreen` (false); `portal` (true); `close` (true. A ghost neutral Button with `i-lucide-x`.); `dismissible` (true); `modal` (true); `open` (v-model).

**Slots**

| Slot | Classes |
|---|---|
| overlay | `fixed inset-0 bg-elevated/75` |
| content (default) | `bg-default divide-y divide-default flex flex-col w-[calc(100vw-2rem)] max-w-lg rounded-lg shadow-lg ring ring-default` (max width 512px, 8px radius); fixed and centred (`top-1/2 left-1/2 -translate-*`) with `max-h-[calc(100dvh-2rem)]`, or `-4rem` at ≥640px |
| content (fullscreen) | `inset-0` |
| content (scrollable) | the overlay scrolls and centres the content as a grid (`p-4 sm:py-8`) |
| header | `flex items-center gap-1.5 p-4 sm:px-6 min-h-(--ui-header-height)` (64px) |
| body | `flex-1 p-4 sm:p-6` (overflow-y-auto when not scrollable) |
| footer | `flex items-center gap-1.5 p-4 sm:px-6` |
| title | `text-highlighted font-semibold` |
| description | `mt-1 text-muted text-sm` |
| close | `absolute top-4 end-4` |

**Transitions** (200ms ease-out): the overlay fades in and out; the content uses `scale-in` / `scale-out` (0.95 to 1 with opacity).

### 3.14 Slideover

Sources: `src/theme/slideover.ts` and `Slideover.vue`.

**Props:** the same as Modal, minus `scrollable` and `fullscreen`, plus: `side` (`top | right | bottom | left`, default `right`); `inset` (false).

**Slots**

| Slot | Classes |
|---|---|
| overlay | `fixed inset-0 bg-elevated/75` |
| content | `fixed bg-default divide-y divide-default sm:ring ring-default sm:shadow-lg flex flex-col` |
| body | `flex-1 overflow-y-auto p-4 sm:p-6` |

Header, footer, title, description and close are identical to Modal.

**Placement**

| Side | inset = false | inset = true |
|---|---|---|
| left or right | `w-full inset-y-0`, plus `sm:max-w-md` (448px) | `w-[calc(100%-2rem)] inset-y-4 right-4/left-4 rounded-lg` |
| top or bottom | `max-h-full inset-x-0` | `max-h-[calc(100%-2rem)] inset-x-4 top-4/bottom-4 rounded-lg` |

**Transition:** `slide-in-from-<side>` / `slide-out-to-<side>` (translate ±100%), 200ms ease-out, with an overlay fade.

### 3.15 DropdownMenu

Sources: `src/theme/dropdown-menu.ts` and `DropdownMenu.vue`.


**Props:** `items` (nested arrays form groups; item types are `label`, `separator`, `checkbox` and `link`); `size` (`md`); `content` (`{ side:'bottom', sideOffset:8, collisionPadding:8 }`); `arrow` (false); `portal` (true); `modal` (true); `checkedIcon` (`i-lucide-check`); `loadingIcon` (spinner); `externalIcon` (true (`i-lucide-arrow-up-right`)); `filter` (false); `labelKey` (`'label'`); `descriptionKey` (`'description'`); `disabled`.

Each item can also carry a per-item `color` and `kbds`.

**Slots**

| Slot | Classes |
|---|---|
| content | `min-w-32 max-h-(available height) bg-default shadow-lg rounded-md ring ring-default overflow-hidden` (128px min width), `scale-in` / `scale-out` 100ms, transform origin from Reka |
| viewport | `divide-y divide-default overflow-y-auto` |
| group | `p-1` |
| label | `font-semibold text-highlighted` |
| separator | `-mx-1 my-1 h-px bg-border` |
| item | `relative flex items-start select-none` with highlight drawn as `before:absolute before:inset-px before:rounded-md` |
| item (not active) | `text-default`, highlighted or open `text-highlighted before:bg-elevated/50`; leading icon `text-dimmed`, becoming `text-default` |
| item (active) | `text-highlighted before:bg-elevated` |
| item with `color=<c>` | `text-<c>`, highlighted `before:bg-<c>/10`; icon `text-<c>/75`, becoming `text-<c>` |
| itemTrailingKbds | `hidden lg:inline-flex` |
| itemDescription | `text-muted` |

**Sizes**

| Size | Item and label | Icon | Kbds gap / size |
|---|---|---|---|
| xs | p-1 text-xs gap-1 | 16 | 2px / sm |
| sm | p-1.5 text-xs gap-1.5 | 16 | 2px / sm |
| md | p-1.5 text-sm gap-1.5 | 20 | 2px / md |
| lg | p-2 text-sm gap-2 | 20 | 4px / md |
| xl | p-2 text-base gap-2 | 24 | 4px / lg |

### 3.16 Tooltip

Sources: `src/theme/tooltip.ts`, `Tooltip.vue` and `App.vue` (TooltipProvider).


**Props:** `text`; `kbds`; `content` (`{ side:'bottom', sideOffset:8, collisionPadding:8 }`); `arrow` (false); `portal` (true); `reference`; `delayDuration` (Reka provider default 700ms (`skipDelayDuration` 300ms). Configurable through `<UApp :tooltip>`.).

**Slots**

| Slot | Classes |
|---|---|
| content | `flex items-center gap-1 bg-default text-highlighted shadow-sm rounded-sm ring ring-default h-6 px-2.5 py-1 text-xs select-none` (24px high, 4px radius, 12px text); `scale-in` on delayed open and `scale-out` on close, both 100ms |
| arrow | `fill-bg stroke-default` |
| kbds | `hidden lg:inline-flex gap-0.5`, separated by `·`, kbd size `sm` |

### 3.17 Toast and Toaster

Sources: `src/theme/toast.ts`, `src/theme/toaster.ts`, `Toast.vue`, `Toaster.vue` and the `useToast()` composable.

**Toast props**

**Props:** `title`, `description`; `icon`; `avatar` (`avatarSize` 2xl); `color` (`primary`); `orientation` (`vertical`); `close` (true. A `link` neutral Button, `size="sm"`.); `closeIcon` (`i-lucide-x`); `actions` (Buttons rendered with `size="xs"` and the toast colour); `duration` (5000); `progress` (true. A bottom progress bar.).

**Toast slots**

| Slot | Classes |
|---|---|
| root | `relative overflow-hidden bg-default shadow-lg rounded-lg ring ring-default p-4 flex gap-2.5` (16px padding, 10px gap, 8px radius) |
| icon | `size-5 text-<c>` (neutral `text-highlighted`) |
| title | `text-sm font-medium text-highlighted` |
| description | `text-sm text-muted` (`mt-1` when there is a title) |
| actions | `flex gap-1.5`; vertical orientation adds `mt-2.5` below the text |
| progress | `absolute inset-x-0 bottom-0` |

**Toaster props**

**Props:** `position` (`bottom-right`. Six positions.); `expand` (true); `duration` (5000); `progress` (true); `max` (5); `portal` (true).

**Toaster slots**
- viewport: `fixed flex flex-col w-[calc(100%-2rem)] sm:w-96 z-[100]` (384px wide), placed at `bottom-4 right-4` and similar.
- toast: stacked absolutely using `--index`, `--transform` and `--front-height`. Non-front toasts are collapsed and their content hidden. Slide-in comes from the top or bottom edge over 200ms, and swipe-to-dismiss follows the swipe direction.

### 3.18 Table

Sources: `src/theme/table.ts` and `Table.vue`. It is built on TanStack Table.


**Props:** `data`; `columns` (TanStack `ColumnDef`); `caption` (sr-only); `sticky` (`boolean | 'header' | 'footer'`, default false); `loading`; `loadingColor` (`primary`); `loadingAnimation` (`carousel | carousel-inverse | swing | elastic`, default `carousel`); `empty` (`t('table.noData')`); `virtualize` (false (`estimateSize` 65, `overscan` 12)); `onSelect`, `onHover`; state props (sorting, selection, pinning and similar).

**Slots**

| Slot | Classes |
|---|---|
| root | `relative overflow-auto` |
| base | `min-w-full` |
| tbody | `divide-y divide-default`; selectable rows `hover:bg-elevated/50` |
| tr (selected) | `bg-elevated/50` |
| th | `px-4 py-3.5 text-sm text-highlighted text-start font-semibold` |
| td | `p-4 text-sm text-muted whitespace-nowrap` |
| separator (under thead) | `h-px bg-(--ui-border-accented)` |
| empty | `py-6 text-center text-sm text-muted` |
| sticky thead / tfoot | `bg-default/75 backdrop-blur-sm` |
| pinned cells | `sticky bg-default/75` |
| loading | a 1px bar under thead (`after:bg-<c>`) animated with `carousel` over 2s, linear |

### 3.19 Pagination

Sources: `src/theme/pagination.ts` and `Pagination.vue`. It is composed entirely of Buttons.


**Props:** `page` (v-model); `total` (0); `itemsPerPage` (10); `siblingCount` (2); `showEdges` (false); `showControls` (true); `color` (`neutral`); `variant` (`outline`); `activeColor` (`primary`); `activeVariant` (`solid`); `size` (Button default `md`); `to` (`(page) => link`); `firstIcon` (`i-lucide-chevrons-left`); `prevIcon` (`i-lucide-chevron-left`); `nextIcon` (`i-lucide-chevron-right`); `lastIcon` (`i-lucide-chevrons-right`); `ellipsisIcon` (`i-lucide-ellipsis`).

**Slots**

| Slot | Classes |
|---|---|
| list | `flex items-center gap-1` (4px) |
| label | `min-w-5 text-center` (page numbers at least 20px wide) |
| ellipsis | `pointer-events-none`; rendered as a non-interactive Button |

The look therefore comes from Button: neutral outline (section 3.1) for every page, and primary solid for the current one.

### 3.20 Breadcrumb

Sources: `src/theme/breadcrumb.ts` and `Breadcrumb.vue`.


**Props:** `items` (`{ label, icon, avatar, to, disabled }`); `separatorIcon` (`i-lucide-chevron-right`); `color` (`primary`); `labelKey` (`'label'`); `as` (`'nav'`).

**Slots**

| Slot | Classes |
|---|---|
| list | `flex items-center gap-1.5` |
| link | `relative flex items-center gap-1.5 text-sm min-w-0 rounded-md` |
| link (inactive) | `text-muted font-medium`, with `hover:text-default transition-colors` when it has a `to` |
| link (active, last item) | `font-semibold text-<c>` (neutral `text-highlighted`) |
| link (disabled) | `opacity-75` |
| leading icon | size-5 |
| avatar | 2xs |
| separatorIcon | `size-5 text-muted` |
| focus | `outline-<c>/25 focus-visible:outline-3` |

### 3.21 NavigationMenu

Sources: `src/theme/navigation-menu.ts` and `NavigationMenu.vue`.


**Props:** `items` (flat or nested arrays; children produce dropdown or collapsible content); `orientation` (`horizontal`); `contentOrientation` (`horizontal`); `variant` (`pill | link`, default `pill`); `color` (`primary`); `highlight` (false); `highlightColor` (`primary`); `collapsed` (false (vertical only)); `tooltip` (false); `popover` (false); `arrow` (false); `type` (`'multiple'`); `trailingIcon` (`i-lucide-chevron-down`); `externalIcon` (true); `delayDuration` (0); `unmountOnHide` (true); `valueKey` (`'value'`); `labelKey` (`'label'`).

**Slots**

| Slot | Classes |
|---|---|
| link | `relative w-full flex items-center gap-1.5 font-medium text-sm`; background drawn on `before:` with `before:rounded-md` |
| link icon | size-5 |
| trailing badge | `sm` |
| trailing chevron | `size-5`, rotating 180° when open |
| label (group heading) | `font-semibold text-xs/5 text-highlighted px-2.5 py-1.5` |

**Orientation**

| Orientation | Rules |
|---|---|
| horizontal | root `items-center justify-between`; list `flex`; item `py-2`; link `px-2.5 py-1.5 before:inset-x-px before:inset-y-0` |
| vertical | root `flex-col`; link `px-2.5 py-1.5 before:inset-y-px` |
| vertical, children | children nest under `ms-5 border-s border-default` with child items `ps-1.5` and animate with `collapsible-down` / `collapsible-up` over 200ms |
| vertical, collapsed | link `px-1.5`; label and trailing hidden |

**States**

| State | pill | link |
|---|---|---|
| inactive | `text-muted`, leading icon `text-dimmed`; hover `text-highlighted before:bg-elevated/50` | `text-muted`; hover `text-highlighted` |
| active `<c>` | `text-<c>` and `before:bg-elevated` (no highlight) | `text-<c>` |
| active neutral | `text-highlighted` | `text-highlighted` |

**Highlight:** draws an `after:` bar in `highlightColor`.
- horizontal: `after:-bottom-2 after:inset-x-2.5 after:h-px`.
- vertical, level: `after:-start-1.5 after:w-px`.

**Horizontal dropdown popup**
- viewport: `bg-default shadow-lg rounded-md ring ring-default`, `scale-in` over 100ms, animating width and height over 200ms.
- child list: `grid grid-cols-2 gap-2 p-2`.
- childLink: `px-3 py-2 gap-2 text-sm`, hover `before:bg-elevated/50`, active `before:bg-elevated text-highlighted`.
- childLinkDescription: `text-muted`.

### 3.22 Dashboard layout

Sources: `src/theme/dashboard-*.ts`, `Dashboard*.vue` and `src/runtime/composables/useResizable.ts`. Docs: <https://ui.nuxt.com/docs/components/dashboard-group>.

**DashboardGroup**
- Props: `storage` `'cookie' | 'local'` (default `'cookie'`), `storageKey` `'dashboard'`, `persistent` true, `unit` `'%' | 'rem' | 'px'` (default `'%'`).
- Base: `fixed inset-0 flex overflow-hidden`.
- Provides a context with `sidebarOpen`, `sidebarCollapsed` and the toggle and collapse functions.

**DashboardSidebar**

**Props:** `id`; `side` (`'left'`); `mode` (`'slideover' | 'modal' | 'drawer'`, default `'slideover'`. This is the mobile presentation.); `menu` (props passed through to that overlay); `toggle` (true); `toggleSide` (`'left'`); `autoClose` (true); `resizable` (false); `collapsible` (false); `minSize` (10); `maxSize` (20); `defaultSize` (15); `collapsedSize` (0).

`minSize`, `maxSize` and `defaultSize` are in `unit` (% by default). `open` and `collapsed` are v-models.

Slots:

| Slot | Classes |
|---|---|
| root | `relative hidden lg:flex flex-col min-h-svh min-w-16 w-(--width) shrink-0`; `side=left` adds `border-e border-default` |
| header | `h-(--ui-header-height) shrink-0 flex items-center gap-1.5 px-4` (64px) |
| body | `flex flex-col gap-4 flex-1 overflow-y-auto px-4 py-2` |
| footer | `shrink-0 flex items-center gap-1.5 px-4 py-2` |

Behaviour:
- Hidden below `lg` (1024px). There, the same content renders inside a Slideover, Modal or Drawer opened by DashboardSidebarToggle (`lg:hidden`, a Button), and the menu variant adds `sm:px-6` paddings.
- DashboardSidebarCollapse (`hidden lg:flex`) collapses it.
- The resize handle (DashboardResizeHandle) is `cursor-ew-resize` with a 12px hit zone (`before:-left-1.5 before:-right-1.5`).

**DashboardPanel**
- Props: `id`, `minSize` 15, `maxSize`, `defaultSize`, `resizable` false.
- root: `relative flex flex-col min-w-0 min-h-svh lg:not-last:border-e lg:not-last:border-default shrink-0`. With a size it becomes `w-full lg:w-(--width)`; otherwise `flex-1`.
- body: `flex flex-col gap-4 sm:gap-6 flex-1 overflow-y-auto p-4 sm:p-6`.
- The `header` and `footer` slots usually hold DashboardNavbar and DashboardToolbar.

**DashboardNavbar**

Props: `title`, `icon`, `toggle` (default true; a sidebar toggle shown below lg) and `toggleSide` (`'left'`).

| Slot | Classes |
|---|---|
| root | `h-(--ui-header-height) shrink-0 flex items-center justify-between border-b border-default px-4 sm:px-6 gap-1.5` (64px high) |
| left | `flex items-center gap-1.5 min-w-0` |
| icon | `size-5 me-1.5` |
| title | `font-semibold text-highlighted truncate` |
| center | `hidden lg:flex` |
| right | `flex items-center gap-1.5` |

**DashboardToolbar** (often used with the navbar)
- root: `shrink-0 flex items-center justify-between border-b border-default px-4 sm:px-6 gap-1.5 overflow-x-auto min-h-[49px]`.

---

## 4. Fonts and typography

Sources: `src/module.ts`, `src/templates.ts`, Tailwind v4 `theme.css` and `docs/app/assets/css/main.css`.

**Font family**

The library sets no font family of its own. Text uses Tailwind's `--font-sans`:
```
ui-sans-serif, system-ui, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji'
```
The mono stack is `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace`. It is used by Kbd and code.

**Web font loading**

The module enables `@nuxt/fonts` (option `fonts: true`) with default weights `[400, 500, 600, 700]`. Any family a user names in `--font-sans` is then auto-downloaded.

The ui.nuxt.com site itself uses `--font-sans: 'Public Sans', sans-serif` (`docs/app/assets/css/main.css`). This is the face visible in the docs screenshots, so it is the one to use to match the docs look. Public Sans is SIL OFL 1.1.

**Base styles**
- body: `antialiased text-default bg-default`. Default text is neutral-700 on white in light mode and neutral-200 on neutral-900 in dark mode.
- Root font size: browser default, 16px.

**Sizes used by the components (md defaults)**

| Element | Size and weight |
|---|---|
| Body text | 14px (`text-sm`, 20px line) for buttons, menu items, tabs, breadcrumb, nav links, table cells, accordion triggers, toast text and modal descriptions |
| Input | 14px on ≥768px, 16px on mobile |
| Small text | 12px for badge md, tooltip, menu group labels and xs/sm controls |
| Weights | labels and buttons 500 (`font-medium`); titles and headers (card, modal, table th, navbar, menu labels) 600 (`font-semibold`) |

**Colour hierarchy**

| Role | Token |
|---|---|
| Titles | `text-highlighted` |
| Body | `text-default` |
| Secondary and descriptions | `text-muted` |
| Placeholders and inactive icons | `text-dimmed` |

---

## 5. Behaviours that are hard for a non-DOM toolkit

These come from Reka UI primitives (<https://reka-ui.com>) driven by the components above.

| Component | Hard parts |
|---|---|
| Button | Link mode (router `to`, active-state matching); `loadingAuto` spins while an async `@click` promise is pending. |
| Input / Textarea | Text editing, IME, selection and caret; Textarea `autoresize` measures `scrollHeight` (with `maxrows`); responsive font size (md breakpoint). |
| Select | Portalled popup; floating positioning (side, offset 8, collision padding 8, flip and shift, width = trigger width, max height from available space); typeahead; roving highlight; scroll-into-view; focus return to the trigger; `item-aligned` mode overlays the selected item onto the trigger. |
| Checkbox / RadioGroup / Switch | Mostly easy. Arrow-key roving focus inside RadioGroup; tri-state checkbox (`indeterminate`); `sr-only` native input for form semantics. |
| Tabs | Measured animated indicator (needs each trigger's size and position: `--reka-tabs-indicator-size` and `--reka-tabs-indicator-position`); arrow-key roving focus; `unmountOnHide`. |
| Accordion | Height animation to measured content height (`--reka-accordion-content-height`); single or multiple, collapsible. |
| Modal / Slideover | Teleport to body (portal); focus trap and initial or restore focus; scroll lock on the body; outside click and Escape dismiss (`dismissible`); stacked z-order; enter/exit animations that keep the node mounted until the animation ends (Presence); `dvh` sizing. |
| DropdownMenu | Portal; floating positioning with collision handling and transform-origin; nested submenus with pointer-grace triangle; typeahead; checkbox items; keyboard shortcuts (`kbds`, `defineShortcuts`); modal mode blocks outside pointer events; optional filter input. |
| Tooltip | Portal; floating positioning; delay and skip-delay timers through a shared provider; hover and focus intent; dismiss on Escape or scroll. |
| Toast | Global queue (`useToast`), max 5; stacked-collapsed layout that expands on hover (`--index`, `--front-height`, `--transform` computed from measured heights); swipe-to-dismiss with pointer tracking; auto-dismiss timer paused on hover or focus; progress bar tied to the timer; live-region announcements; F8 hotkey focus. |
| Table | TanStack state (sorting, selection, pinning, expansion, grouping); sticky header and footer with backdrop blur; sticky pinned columns; virtualisation (TanStack Virtual); animated 1px loading bar. |
| Pagination / Breadcrumb | Trivial apart from router links. |
| NavigationMenu | Horizontal: hover-triggered portalled viewport that animates its size between items (`--reka-navigation-menu-viewport-*`) with directional content slide (`data-motion`) and a moving indicator arrow. Vertical: collapsible height animation; collapsed mode switches children to tooltip or popover. |
| Dashboard* | Responsive switch at `lg` (desktop sidebar, or Slideover/Modal/Drawer on mobile); drag-to-resize panels with persisted sizes (cookie or localStorage, unit %/rem/px); collapse to `collapsedSize`; fixed full-viewport layout with independently scrolling panel bodies; keyboard shortcut to toggle. |

Cross-cutting constructs to emulate:
- **`before:` / `after:` pseudo-element highlight layers.** Menu and nav highlights are a rounded rectangle inset 1px behind the content.
- **Alpha-mixed colours (`/10`, `/25`, `/50`, `/75`).** Blend in OKLab when matching closely; sRGB alpha is close enough in practice.
- **Focus-visible versus focus.** Outlines show only for keyboard focus.
- **Reduced motion.** Swap the scale and slide animations for opacity fades.
- **RTL.** Logical properties (`ms-`, `ps-`, `start-`) and `rtl:` translate flips on Switch and Tabs.
