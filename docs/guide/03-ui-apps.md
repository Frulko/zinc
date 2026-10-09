# 3. UI apps

Zinc's UI is declarative JSX (`.tsx`) over a flexbox layout engine and a software rasterizer — no HTML/CSS engine, no
browser. The UI runtime is written in Zinc ([`lib/std/ui.ts`](../../lib/std/ui.ts), `solid.ts`, `react.ts`) and
compiled into your program (ADR 0008). Two reactive models ship: **Solid** (fine-grained signals) and **React**
(hooks, reconciled re-renders); both draw the same host tree.

The complete counter app (build it with `zinc run docs/guide/samples/hello-ui`):

```tsx
import { createSignal, render } from 'zinc:ui/solid';

const [count, setCount] = createSignal<i32>(0);

function App(): i32 {
  return <view class="flex-col items-center justify-center h-full gap-3 bg-slate-900">
    <text class="text-2xl text-amber-400">count: {count()}</text>
    <button class="px-4 py-2 rounded bg-slate-700 focus:bg-slate-600" onClick={() => setCount(count() + 1)}>
      <text class="text-slate-100">increment</text>
    </button>
  </view>;
}

render(App, 0x0f172a, null);   // component, background color, optional per-frame callback
```

## Host tags

`view` (flex container), `text`, `button`, `image`, `scroll`, `canvas`, `input`, `textarea`, plus PascalCase aliases
(`View`, `Text`, `Button`, `Image`, `ScrollView`, `Canvas`, `Input`, `TextArea`) for PocketJS compatibility. Text lives
only inside `text`. A `canvas` gives you an immediate-mode `zinc:gfx` draw area:

```tsx
<canvas class="grow" onDraw={(x, y, w, h) => { rect(x, y, w, h, 0x0b1220); /* zinc:gfx calls */ }} />
```

Attributes: `class` (Tailwind-like tokens), `style={{ opacity, translateX, translateY, scale, rotate }}` for
per-node transforms, `bg={0xRRGGBB}` for a dynamic background color, `onClick`, `onDraw`, `ref`.

## Solid vs React

**Solid** — signals update only the exact text/attribute that depends on them; the component function runs once:

```tsx
import { createSignal, createMemo, Show, For } from 'zinc:ui/solid';
const [items, setItems] = createSignal<string[]>(['a', 'b']);
<For each={items()}>{(it) => <text>{it}</text>}</For>;   // keyed
```

**React** — hooks and reconciled re-renders:

```tsx
import { useState, useEffect, render } from 'zinc:ui/react';
function App(): i32 {
  const [n, setN] = useState<i32>(0);
  useEffect(() => { console.log('n is', n); }, [n]);
  return <button onClick={() => setN(n + 1)}><text>{n}</text></button>;
}
render(App, 0x101010, null);
```

Compatible import specifiers work unchanged: `solid-js`, `react`, `inferno`, `@pocketjs/framework/*` — existing
PocketJS apps compile as-is (`examples/pocket-hero`).

## Classes, CSS and breakpoints

Tailwind-like utility tokens are compiled at build time: flexbox (`flex-row`/`flex-col`, `items-*`, `justify-*`,
`gap-*`, `grow`, `wrap`), spacing (`p-*`, `px-*`, `m-*`), sizing (`w-*`, `h-*`, `w-full`, `h-full`, `w-[120px]`),
colors (`bg-slate-900`, `text-amber-400`, gradients), `rounded*`, shadows, borders (all sides, or `border-t` / `border-x-2` / `border-b-[3px]` per side), typography
(`text-2xl`, `font-bold`, `text-center`), and `focus:` / `active:` variants. A text color set on any element
(`<View class="text-zinc-500">`) is inherited by the text inside it, like CSS `color`. Import a CSS file to define named classes compiled to
the same tokens:

```tsx
import './app.css';    // .card { padding: 12px; background: #1e293b; border-radius: 8px }
<view class="card">…</view>
```

**Responsive**: `sm:` `md:` `lg:` `xl:` `2xl:` prefixes (640/768/1024/1280/1536 px) are re-evaluated when the window
resizes. Use them for layouts that follow the window.

## Scrolling and virtual lists

```tsx
<scroll class="h-full">…</scroll>                          <!-- or class="overflow-y-auto" -->
```

Scroll containers behave like iOS / macOS: fingers (trackpad, touch screen, mouse drag) move the content 1:1,
releasing starts an inertia with the release velocity (iOS deceleration), past an edge the content stretches (the
UIScrollView rubber band) and springs back with the velocity it had, and mouse-wheel notches ease to their target.
Trackpad deltas are resampled at frame time by the HAL, so uneven event timing never judders (details: docs/ui.md). Scrollbars fade in while scrolling; the keyboard focus is revealed. `overflow-hidden` and
scroll views clip their children inside the border and its rounded corners (anti-aliased), so borders stay visible
while the content moves. For long lists, build only the
visible rows:

```tsx
import { VirtualList } from 'zinc:ui/solid';
<VirtualList count={10000} itemHeight={28}>{(i) => <text>row {i}</text>}</VirtualList>
```

## Animations

Engine-driven, off the reactive path. Solid: `animate(ref, prop, to, { dur, easing, delay })` returns a promise;
`after(ms)` resolves after a delay. Or set `style={{...}}` from a signal for reactive transforms. See `examples/hero`.

## Fonts, assets and images

TTF glyphs are baked at build time for the sizes your program uses (Inter and JetBrains Mono ship in `lib/fonts`).
Images: `<image src="logo.png" />` reads from the embedded `assets/` directory; `zinc:assets` reads asset bytes at
runtime; `zinc:gfx` can build runtime images (video frames, generated textures) and render-to-image. HiDPI is
automatic — resources are baked at the display scale (Retina ×2 on macOS, ×window `zoom`).

## Windows

UI apps follow the window by default (responsive, live resize redraw); games keep a fixed surface and scale it. A program
that draws with `zinc:gfx` asks to follow the window with `onResize((w, h) => ...)`, called before the next frame with each
new size (zinc:ui does it for every app). `resize` in `zinc.json` wins over that request, in `zinc run` and in the programs
`zinc build` writes: `letterbox` keeps a UI app at its fixed size. Set per target in `zinc.json` `targets.<id>`, or with
`ZINC_*` env vars:

| option | env | meaning |
| --- | --- | --- |
| `zoom` | `ZINC_ZOOM` | window points = logical size × zoom (auto ×2 below 400 px) |
| `resize` | `ZINC_RESIZE` | `fill` (surface follows the window: the default of zinc:ui apps and of `onResize`) or `letterbox` (fixed surface, scaled: the default otherwise) |
| `fullscreen` | `ZINC_FULLSCREEN` | start fullscreen; F11 / Ctrl+Cmd+F toggles, Esc leaves |
| `kiosk` | `ZINC_KIOSK` | fullscreen, no cursor, always on top, quit shortcuts ignored |

```json
{ "targets": { "macos": { "width": 1024, "height": 600, "resize": "fill", "kiosk": true } } }
```

## Per-target constraints

| target | constraint |
| --- | --- |
| `esp32` | 160 KiB heap (without PSRAM it spans several internal RAM blocks; a UI node costs ~0.5 KiB, a reactive class or text a few hundred bytes more: mount one page at a time, [ESP32-2432S022 demo](../../examples/boards/esp32-2432s022)), `f32` numbers, strict profile; small screens via display drivers (SSD1306, ST7789 SPI/i80, WS2812) |
| `ps1` | 256 KiB heap, Q20.12 fixed point, **no FPU** (the rasterizer runs in software) |
| e-ink (`rmpp`) | slow refresh; the driver manages refresh policy — avoid per-frame full redraws, prefer damage |
| LED matrices / OLED | tiny surface (e.g. 32×8); use `zinc:pixelfont` for text, expect only a handful of draw commands per frame |
| `wasm` | canvas HAL at 1× density |

Screens that aren't the default window are **display plugins** — pick one in `zinc.json` (`"display": "ssd1306"`); the
program still draws with `zinc:ui`/`zinc:gfx` and the driver converts the damaged rows. See [plugins](05-plugins.md)
and [docs/plugins/displays.md](../plugins/displays.md). Next: [headless services](04-headless-services.md).
