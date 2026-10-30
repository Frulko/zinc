# The web: a Zinc app as a normal web page

`zinc export --target web` turns a Zinc app into a static folder (`index.html`, a few hashed `.js` files, its assets) that any web host serves. The app's TypeScript runs on the
browser's own JavaScript engine, the way a React or Vue app does; nothing of the Zinc engine is shipped, no WebAssembly is needed for an ordinary app, and no server is needed
beyond static hosting.

This is not the `wasm` target ([wasm.md](wasm.md)), which runs the bytecode interpreter of the engine compiled to WebAssembly in a worker (for small console-style programs, and it needs
COOP/COEP headers). The web target is faster (the browser's JIT), smaller (a dashboard app is 100 to 120 KB of Brotli-compressed JavaScript) and behaves like a page.

```sh
zinc export examples/hero --target web            # dist/hero-web/
zinc export . --target web --render dom           # semantic HTML and CSS instead of a canvas
zinc export . --target web --render dom --prerender   # and the first screen already in index.html
zinc dev    . --target web                        # a dev server on http://127.0.0.1:8000/ with hot reload
python3 dist/hero-web/serve.py                    # look at an export (any static host works the same)
zinc export . --target web --check                # only what these browsers cannot run
```

## What the export is

```
dist/hero-web/
  index.html            the page: title, theme colour, import map, config, a splash with a progress bar
  zinc.<hash>.js        the web host (targets/web/runtime.js): canvas painter, input, storage, assets, the frame loop (about 30 KB, 10 KB Brotli)
  app.<hash>.js         the app: its TypeScript and TSX, zinc:ui, the kits and the plugins it imports, linked, tree-shaken and minified by esbuild
  native.<hash>.js      the browser backends of the plugins the app uses (a few hundred bytes without any)
  dom.<hash>.js         only with --render dom: the semantic DOM host (40 KB, 13 KB Brotli)
  lottie-*.<hash>.js    only for an app that imports zinc:lottie: lottie-web, loaded when the first animation is drawn
  assets/...<hash>.ext  the project's assets, named by their content
  <plugin>.<hash>.wasm  only for a plugin whose native code is C or C++ (sqlite: 690 KB, 240 KB Brotli)
  sw.js, manifest.webmanifest   offline cache and installable web app (--no-pwa leaves them out)
  *.br, *.gz            precompressed copies of what compresses (a host that serves them skips its own compression)
  _headers              cache headers for Netlify and Cloudflare Pages; serve.py, README.txt
```

- **Hashed names**: every file but `index.html` and `sw.js` can be cached for a year (`_headers` says so); a new build has new names.
- **Offline**: `sw.js` caches the files on the first visit and the app starts without a network after it. The page itself is fetched fresh when there is one. It registers only on https and on localhost.
- **No COOP/COEP**: a page needs them only for `SharedArrayBuffer` and WebAssembly threads. No part of the web target needs them today. A plugin that does declares `"crossOriginIsolated"` in its
  `web.needs`; the export then writes the headers into `_headers` and `sw.js` adds them where the host cannot (GitHub Pages).
- **The browser's JavaScript, not Zinc's**: `URL`, `fetch`, `Event`, `TextEncoder`, `crypto`, `MediaStream`, `navigator` are the browser's own. `import { URL } from 'zinc:web'` gives the same object
  (`lib/std/web.browser.ts`), and no import is added for the globals, so nothing replaces them with the Zinc polyfills.

### Settings: `zinc.json` `targets.web` and the options

```json
{ "targets": { "web": {
    "render": "canvas",                                  "comment": "canvas (default) or dom",
    "browsers": "chrome >= 111, firefox >= 115, safari >= 16.4",
    "title": "My app", "description": "For the search results and the share card",
    "themeColor": "#111827", "backgroundColor": "#ffffff", "lang": "en",
    "icon": "assets/icon.png", "pwa": true,   "comment2": "scroll: \"app\" (a window-sized stage) or \"page\" (the document scrolls, dom render)",
    "width": 960, "height": 600,                         "comment": "a fixed surface; without them the app fills the window and follows its size",
    "strict": false } } }
```

`--render canvas|dom`, `--prerender`, `--browsers '<set>'`, `--check`, `--werror`, `--no-pwa`, `--sourcemap` and `-o dir` override or add to it. (The key `web` of `zinc.json` itself is something else: it turns on the window / document
environment of the QuickJS engine for JavaScript game libraries.)

## Two ways to draw

The app's UI (`zinc:ui`, its classic layout engine, the UI kits, React Native components) is JavaScript in both modes. They differ in who lays out and who draws.

| | `canvas` (default) | `dom` ("the semantic DOM") |
|---|---|---|
| What the page holds | one `<canvas>` | the app as semantic HTML: `nav`, `main`, `h1`..`h6`, `ul`/`li`, `a`, `button`, `form`, `input`, `textarea`, `img`, `dialog`... |
| Layout | Zinc's classic engine, as on a desktop | **the browser's CSS** (flexbox): Zinc's styles become CSS classes; Zinc's own layout only keeps answering the program's geometry calls underneath |
| Look | what the desktop engine draws, as Canvas2D draws it | the same design in CSS; within about 1% of the pixels of the canvas picture on the demos (see "Differences") |
| Text | pixels | real text: selectable, found with Ctrl+F, translated, read by screen readers |
| Scrolling | Zinc's physics (rubber band, inertia) on the canvas | the browser's: `overflow: auto` containers, momentum, scrollbars, scroll anchoring, Page Up/Down, focus into view |
| Keyboard and focus | Zinc's focus walk, a hidden `<textarea>` while a field is edited | the browser's: Tab order, focus rings (`:focus-visible`), Enter and Space on buttons and links, real `<input>`s, IME, soft keyboards, autofill, spellcheck |
| Forms | none | a real `<form>` when the app has a `<Form>` (docs/ui.md, "Semantic hints and Form") |
| Window size | the canvas follows the window and the pixel ratio; Zinc lays out again | CSS lays out at the resize event; zinc:ui follows a frame later (breakpoints, `useWindowDimensions`) |
| Cost per frame (hero home, headless Chrome) | 1.2 ms of the main thread, 22 elements | 1.1 ms, 331 elements; a list of 10 000 rows and 1 200 boxes: 1.6 ms either way, 1 338 elements ([report](../reports/zinc-web-export.md)) |
| Needs | Canvas2D with `roundRect` (Chrome 99, Firefox 112, Safari 16) | DOM and CSS (flexbox, custom properties, `:focus-visible`, `<dialog>`: Chrome 102, Firefox 111, Safari 15.4) |
| Fits | games, drawing, charts, anything pixel-exact | forms, content, dashboards, tools: apps that should behave like a page |

Everything a program draws with `zinc:gfx` works in both. In DOM mode what Zinc draws itself is a real canvas placed where its node sits (see "What Zinc still draws"). `drawShader` (runtime GLSL) renders on a WebGL canvas and is drawn as an image in paint order, in both modes (see "WebGL, shaders and three.js").

## The semantic DOM

`--render dom` (or `targets.web.render: "dom"`) turns the tree of `zinc:ui` into real elements and keeps them in step with it.

```html
<div id="zinc-root">
  <div class="z _0 _1">                                   <!-- the root: width and height 100% of the window -->
    <header class="z _a _b _c _d">
      <h1 class="zt _e _f _g">Orders</h1>
      <nav class="z _a _h" aria-label="Main"><a class="zt _i" href="/orders">All</a></nav>
    </header>
    <main class="z zs _j _k" tabindex="0" aria-label="Content">
      <form class="z _l" name="login">
        <input class="zr zi _m _n" name="email" type="email" autocomplete="email" required placeholder="Email" aria-label="Email">
        <button class="z zk _o _p" type="submit"><span class="zt _q">Sign in</span></button>
```

**Elements.** A node becomes the element its hints and roles name (docs/ui.md, "Semantic hints and Form"), else `button` when it takes clicks, `img` for an `Image`, `input` and `textarea` for fields, `span` for text, `div`
otherwise. ARIA comes from the same tree as the desktop's screen reader bridges (`ui.inspect()`): `role`, `aria-label`, `aria-hidden`, `aria-disabled`, every `aria-*` and `data-*` attribute, `alt`, `disabled`,
`tabindex`. A node with `opacity` 0 (a tab bar keeps its other screens mounted) is `visibility: hidden`: neither Tab nor a screen reader reaches it. Chrome builds the accessibility tree from this; `tests/t1/web_dom.sh`
reads it (a heading, a navigation, links and buttons with names, textboxes labelled).

**Styles are CSS classes.** `className` tokens, `style` objects and `StyleSheet.create` all end as numbers on the node (that is how Zinc resolves them); the host writes each node's numbers as CSS declarations
into **one generated, deduplicated and minified style sheet** (`<style id="zinc-css">`): one rule per distinct `property: value` (`._a{flex-direction:row}`), named by a counter in base 36, so a screen of 330 elements
uses about 170 classes and 200 rules, and a page of 10 000 rows the same. A fixed set of base rules (`.z`, `.zt`, `.zr`...) makes CSS flexbox behave like React Native's: every box is `display:flex;
flex-direction:column; flex-shrink:0; position:relative; box-sizing:border-box`, text is `display:block`, and so on. Hover, focus, active, disabled, `group-hover:`, `peer-focus:` and `aria-checked:` variants are CSS
pseudo-class and attribute selectors (`._x:hover{...}`), so the browser does them without a frame of Zinc; `transition-*` classes are CSS `transition`.
**A value that changes after its element exists** (an animation, a computed width, a drag) is not a new class per step: from its first change on, the property is a **CSS custom property of the element**
(`style="--width:84px"`) read by one shared class (`._w{width:var(--width)}`), and each frame writes one number. Inline `style` is only that, the two spacers of a virtual list and the page's own viewport probe:
the test of `tests/t1/web_dom.sh` allows 6 elements with one in its fixture (in the 10 000 row list with 20 moving bars: those 20 and the 2 spacers, of 1 338 elements).

**Layout is the browser's.** Zinc's classic engine has its own rules (children never shrink, borders take no room, centres are floored...); the host translates the style so CSS gives the same picture, and lists
what it cannot ("Differences"). The most visible translations:

| Zinc | CSS |
|---|---|
| a box: column, align stretch, children never shrink | `.z{display:flex;flex-direction:column;align-items:stretch;flex:0 0 auto;min-width:auto}` plus `flex-direction:row`, `justify-content`, `align-items`, `gap`, `flex-wrap`... where the node says so |
| `w-full` in a row / in a column | `flex-grow:1; flex-basis:0` / `align-self:stretch` |
| `flex-1`, `grow`, `basis`, `shrink`, `order`, margins, `ml-auto` | the same properties; an item that starts from nothing (`flex-basis: 0`) also gets `min-width: 0` |
| a row item with no size of its own (zinc:ui measures it for the room it is offered, so text wraps) | `flex-shrink: 1`; an item with `w-*` or a basis keeps `flex-shrink: 0` |
| a border (drawn inside the padding, no room of its own) | a real `border` with the padding that is left, so the content stays where zinc:ui puts it; where the padding is smaller than the border, an inset `box-shadow` band |
| `absolute` + `top`/`left`/`right`/`bottom` | `position:absolute` with the offsets corrected by the parent's border (CSS measures from the padding edge) |
| `scroll`, `overflow-y-auto`, `ScrollView` | `overflow-y:auto` (native scroller, `flex-shrink: 1` so it takes the room left), `scroll-snap-type`, `scroll-padding` |
| a plain box over other boxes | `pointer-events:none` (zinc:ui hits only nodes with a handler); a box with one, a button, a scroller or a field gets `pointer-events:auto` |
| gradients, shadows, rings, outlines, radii per corner, opacity, `translate`/`rotate`/`scale`/`skew` | `linear-gradient`/`radial-gradient`/`conic-gradient`, `box-shadow`, `outline`, `border-*-radius`, `opacity`, `transform` |
| text: size, weight, family, leading, tracking, alignment, transform, decoration, `truncate`, `line-clamp-n`, `whitespace-*`, `break-*` | `font-size`, `font-weight`, `font-family`, `line-height`, `letter-spacing`, `text-align`, `text-transform`, `text-decoration`, `text-overflow`, `-webkit-line-clamp`, `white-space`, `overflow-wrap` |

**Updates are a retained, keyed diff.** Zinc commits a frame only when the tree changed (an idle app costs nothing). A commit walks the tree once and, per node (keyed by its handle, which is stable while the
node lives), compares its declarations with the last ones: only a changed class list, attribute or text is written; children are reconciled in place (an insertion before a focused sibling does not move it). A
list that grows by one row adds one `li`; typing in a field patches nothing of the field (the browser owns the value; the host writes it only when the program changed it, and keeps the caret).
`tests/t1/web_dom.sh` marks every element, runs a form submit and a list update, and checks that no element that was there was replaced, that the focused input stayed focused and its caret stayed where it was.

**Scrolling.** A `ScrollView` is a native scroller; the host tells zinc:ui its offsets on `scroll` (`onScroll`, `scrollTop`, virtual lists, the RefreshControl, `onEndReached`) and applies the offsets the program sets
(`scrollTo`, scroll into view) to the element. `VirtualList` and `FlatList` keep their contract (only the rows in view exist, 12 spare above and below since the browser scrolls a frame before zinc:ui sees it): the
rows are ordinary children of the scroller between two spacer elements that stand for the rows above and below, so the scrollbar, `scrollHeight`, Page Down, End and find-in-page-less selection behave. A list of
10 000 rows of 32 px is a scroller 320 000 px tall with about 35 rows. `targets.web.scroll: "page"` makes the document scroll instead of a window-sized stage (an app whose root is a column that grows with its content).

**Keyboard and focus are the browser's.** Tab, Shift+Tab, the focus ring (`:focus-visible`), Enter and Space on `<button>` and `<a>`, Escape on a `<dialog>`, arrows in fields, Page Up/Down on a scroller, all
native. A box that takes clicks and is not a button (a `ListItem`) is focusable (`tabindex`) and answers Enter and Space. The page forwards **only the keys the app registered**: a key reaches `onKeyDown` of
the focused node, the `bindKeys` keymap and the global `onKey` handlers only when the program has some, and `preventDefault` is called only for a key one of them took, so the browser's shortcuts (reload,
find, copy, zoom, dev tools) are never stolen. Pointer events (`onPointerDown`, `onDrag`, `onLongPress`, `onWheel`, `onPointerEnter`...) are handed to the nodes' handlers from the page's own events, with
coordinates local to the node; a drag keeps the pointer (`setPointerCapture`) and the element gets `touch-action: none`.

**Fields are real.** `Input` and `TextArea` are `<input>` and `<textarea>`; `value`, `placeholder`, `readOnly`, `password` (`type=password`), `inputMode`, `maxLength`, `autoComplete`, `autoCapitalize`,
`enterKeyHint`, `name`, `required`, `pattern`, `min`, `max`, `step` reach the element, so the browser's selection, copy and paste, undo, IME, dead keys, spellcheck, autofill and password manager, soft keyboard
and validation all work. `onInput` is the `input` event, `onChange` fires when the field loses the focus or Enter is pressed. Not in the page: the code-editor extensions of `TextArea` (`highlight`,
`lineNumbers`, `setMarks`, `setEditColors`): the page shows a plain textarea.

**Viewport.** `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`, `<meta name="color-scheme">`, `lang` and `dir` on `<html>`. The stage fills the window (`position: fixed;
inset: 0; height: 100dvh`: no fixed 1200 x 900 box). The app learns of the browser as zinc:ui learns of a phone: the window size (a resize observer), `safearea` (CSS `env(safe-area-inset-*)`), `keyboard`
(the `visualViewport` the soft keyboard covers), `theme` (`prefers-color-scheme`, and the page's `color-scheme` follows the scheme zinc:ui is in, so scrollbars and form controls match), `reducemotion`, and
`fontscale` (the browser's text size setting: text sizes and `rem` follow it, as the desktop's text size setting does). A rotation or a resize is laid out by CSS at once; zinc:ui sees the new size at its next frame.

**Layers.** A modal layer (`ui.openLayer(..., { modal: true })`: the kit's `Dialog`, React Native's `Modal`) is a real `<dialog>` opened with `showModal()`: the rest of the page is inert, focus is trapped, Escape asks the
layer to close (`onDismiss`), the scrim is `::backdrop`. A non-modal layer (a menu, a popover, a toast) is a `div` in a fixed portal above the page. Layers keep the positions zinc:ui's floating placement gives them
(`ui.anchor`: flip, margin); pressing outside them still reaches `onOutsidePointer`.

**What Zinc still draws.** Anything a program paints itself with `zinc:gfx` in a `Canvas` node (or `onDraw`) is a **real `<canvas>`** placed where the node sits, sized by CSS, drawn at the device pixel ratio,
redrawn when the tree is committed and only while it is on screen (`IntersectionObserver`; a `lazy` canvas, such as an icon, only when its size changed or something else did). A node that draws exactly one SVG
document, which is what an icon is, becomes an inline `<svg>` instead (no canvas, scalable, themeable). A `zinc:video` player in such a node is the browser's `<video>`, a `zinc:lottie` animation an `<svg>` of lottie-web
(see "Video" and "Lottie"); an `Image` is an `<img>` with `object-fit` and `object-position` (or a canvas for an image the program fills: a camera, a WebGL present).

**Prerendering.** `zinc export --target web --render dom --prerender` runs the app once in headless Chrome (Chrome must be installed; `CHROME=...` names it), takes the elements and the style sheet of its first
screen (at 1280 x 800) and writes them into `index.html`: the page is readable by a crawler, a reader and a slow phone, and painted before any script runs. When the script starts it **adopts** those elements
(each carries the number of its node) instead of building them again, and drops the prerendered style sheet once its own is in place. An app whose first screen waits for data prerenders its loading state. A
screen laid out differently at another width (breakpoints: `md:`) is restyled by the first commit, which may show as a jump.

**Addresses.** A real link is `<Text as="a" href="/orders">` (or `role="link"`). A `Stack` of `zinc:ui/navigation` with a `path` prop (`path={(r) => '/' + r.name}`) keeps the address bar and the history in step with its
screens: a push is a history entry, `replace` replaces the address, and the browser's Back button pops the screen (it arrives as the app's back key). The address is output only: a reload starts at `initial`,
and a deep link needs the app to read `location` itself.

### Differences from the canvas picture

Measured with `tools/web-compare` (`tests/t1/web_dom_visual.sh`: the same app exported both ways, the same clicks, headless Chrome, pixel by pixel; mean difference of the biggest channel, and the share of
pixels that differ by more than 16 of 255):

| Screen | Mean | Pixels over 16 |
|---|---|---|
| hero: the intro | 0.9 | 1.1% |
| hero: home (live numbers and charts masked) | 1.3 | 1.7% |
| desktop-app template: home, notes, settings | 0.3 to 1.3 | 0.4% to 1.2% |
| nuxt-ui example: the dashboard | 4.5 | 3.0% |

What differs, and cannot be made not to:

- **Text.** Both modes use the system fonts for `sans`, so widths agree with themselves; glyph placement inside the line box differs by a pixel in places, and CSS wraps with the browser's rules (balanced, hyphen and word
  break rules, `text-wrap: balance`) where Zinc's wrapper is greedy.
- **Half pixels.** Zinc floors a centre and rounds every box to a whole pixel; CSS keeps halves and snaps when it paints. A centred box 15 px freer than its container is 7 px from the edge in Zinc and 7.5 in CSS.
- **Shadows and blurs** are CSS's (`box-shadow` blur is a Gaussian with a different radius than Zinc's box blur); the Tailwind levels use Zinc's offsets and radii.
- **Overflow that Zinc clips.** Items that do not fit overflow a row in both; the DOM shows them (`overflow: visible`) wherever the node did not say `overflow-hidden`.
- **`scale` zooms around the centre** (Tailwind, CSS); Zinc's style scale zooms around the top-left corner.
- **Percentages** are CSS's: of the parent's content box; Zinc's of the room the parent offers.
- **Hairlines and transitions.** A one-pixel border is a real border (browsers snap it); `transition-*` runs in CSS on hover and focus, and Zinc's animators (`animate`, `Animated`) run per frame as they do on a desktop (their values are written to custom properties).
- **Selection.** Text is selectable everywhere (Zinc: only `select-text` nodes); buttons are not.
- **Scroll physics.** The browser's (momentum, overscroll, scrollbars) replace Zinc's; `scrollTo` is instant, scrollbars are the platform's.
- **Press feedback.** `:active` dims a pressed clickable box to 60% as Zinc does; the in-and-out easing is CSS's.
- **The classic layout still runs** under the page (about 0.5 ms a frame on the hero demo) because `screenBox`, `onLayout`-style calls and virtual lists read it; its numbers are not what the page shows. A virtual list
  takes its viewport from the browser, and a scroller is never clamped by Zinc's own content size.

Not proven here: Firefox and Safari (including iOS Safari's dynamic toolbar and the soft keyboard), a screen reader (the accessibility tree was checked in Chrome through the DevTools protocol, not heard), an IME
composition, a touch device, a high-density display, and right-to-left text beyond `dir`.

### Which parts work in which mode

| | canvas | dom |
|---|---|---|
| `zinc:ui` (View, Text, Button, Image, ScrollView, Input, TextArea, Canvas): the hero demo, the call demo, the desktop-app template | yes | yes |
| UI kits: nuxt-ui and the icons (Lucide through `zinc:svg`) run in the desktop-app template; the shadcn-style kit and the React Native components are not tried yet | yes | yes |
| `zinc:ui/solid`, `zinc:ui/react`, state, effects, animations, transitions | yes | yes |
| Text selection and copy | the app's own (fields, `selectable` text) | the browser's, on any text and in fields |
| Find in page, translation, screen readers, Tab order, forms and autofill | no | yes |
| IME and the soft keyboard in fields | yes (a `<textarea>` follows the field) | yes |
| `zinc:gfx` drawing, `drawImageRect` (sprites), off-screen images | yes | yes (in a canvas element where the node sits) |
| `zinc:video` (the browser's `<video>`), `zinc:lottie` (lottie-web) | yes | yes |
| `drawShader` (runtime shaders) | yes (WebGL) | yes (the picture is a `<canvas>` element where the box is) |
| `zinc:gl`, three.js | yes, in the browser's own WebGL | yes (a `<canvas>` element where the component sits) |
| Layout `rn` (Yoga) | no engine: `"layout": "rn"` and the React Native preset run the classic layout with React Native's style semantics (flex shares, text defaults); the example rn-showcase lays out the same boxes as on the desktop | the same boxes, then CSS paints them (no Yoga either; the browser never lays out the app) |
| Web fonts: `assets/*.ttf`, `.otf`, `.woff`, `.woff2` | yes (loaded before the app starts, named by file) | yes |

## WebGL, shaders and three.js

No part of this is WebAssembly: the browser's own WebGL does the drawing, and the result reaches the Zinc surface as an image, so it keeps its place in the paint order (what the app draws
after it lands over it, a clip, a transform and a fade apply) and works the same in canvas and DOM mode: in DOM mode, drawn by a `Canvas` node or its `onDraw`, it is a `<canvas>` element where the node sits (tests/fixtures/web-canvas: a zinc:gl node and a three.js node in one
zinc:ui app). A program that draws with `zinc:gfx` alone (or with three.js), without a `zinc:ui` tree, has no node to turn into elements: in DOM mode the page gives it one window-sized `<canvas>` and it draws and takes input as in canvas mode.

- **`zinc:gl`** (WebGL 1 and 2 for Zinc code): `examples/gl-cube` runs unchanged. The host rows `__host_gl*` are answered by `targets/web/rows-gl.js`, generated from the table of `tools/gen-zinc-gl`
  by `tools/gen-web-gl` (`--check` in the test): a context is a canvas the page makes, objects keep the engine's ids, a GLArray becomes a typed array, `present(image)` draws the canvas into the
  image (resized to it, without alpha as on the desktop). Version 1 asks for a WebGL 1 context and reaches VAOs, instancing and draw buffers through their extensions. A frame of the cube at the
  same frame number as the native interpreter's: SSIM 1.0000, 9 pixels one level apart in 172 800.
- **Context loss**: `loseContext` / `restoreContext` and the browser's own events work; a restored context has no objects, as in any browser (the program creates them again). three.js handles it itself.
- **`drawShader`** (D124): the fragment `main()` is compiled behind the same head (`v_uv`, `u_size`, `u_p[8]`) on one shared WebGL context at 1 / `scale` of the physical resolution and drawn as an
  image of the box. `shaderAvailable()` is true where the browser has WebGL. The shader fixture's frame differs from the CPU path of the native engine by at most 16 levels.
- **three.js**: the real library (r186, `third_party/three`, unmodified) runs on a WebGL2 canvas created by the page. `plugins/three/web/index.ts` re-exports it and replaces three things: `WebGLRenderer`
  (its `render` copies the canvas into the surface at the end of each call; `setAnimationLoop` runs in Zinc's frame, before the app's own `onFrame`; `setViewport(x, y, w, h)` is the screen box the picture is drawn at, as on the desktop), `window` / `CanvasElement` (the Zinc surface size and pixel
  ratio) and `TextureLoader`, `CanvasTexture`, `GLTFLoader`, `OrbitControls` (assets of the app and zinc:canvas images work; the controls listen on the page). `examples/three/cubes` and
  `examples/three/gltf-viewer` (model, orbit, picking, a zinc:ui overlay) run unchanged. The subset of `index.ts` is not used on the web: the whole of three.js is.
  Not done: the frame of `cubes` is not compared with the desktop (the desktop draws with the Zinc subset, a different renderer; the real library on the desktop's WebGL is `--engine quickjs`,
  `docs/reports/three-on-zinc.md`); a worker renderer on `OffscreenCanvas` (the copy needs the canvas on the main thread); pixel ratio above 1 is the renderer's drawing buffer scaled into the box.
- **`zinc:canvas`** is the browser's Canvas2D: a canvas that draws into an image is the image's own 2D context, a screen context draws into a canvas of its box and shows it at `end()`.
- **`zinc:map`**: MapLibre GL JS (BSD-3, `third_party/maplibre`, 5.24, loaded as a classic script: a minifier breaks its inline worker) behind the plugin's own `MapView`. Tiles come from the app's
  `assets/tiles/z/x/y.pbf` or from `url` through `fetch` (CORS; gzip is handled); labels use the glyph server `demotiles.maplibre.org` unless the style names one. Not in `zinc dev` (unbundled modules).
  The desktop engine's `stats()` are zeros.

## Capabilities and honest limits

Three layers tell a program, and its author, what the browser gives.

1. **At build time**, `zinc export --target web` checks the browsers of the target set (`targets.web.browsers`, or `--browsers`; `chrome >= 111, edge >= 111, firefox >= 115, safari >= 16.4` by default) against what the
   app uses: the web host itself, and the `needs` of every plugin the app imports (their `plugin.json` `web` entry). `--check` prints the report and writes nothing; `--werror` makes a warning fail the export.
   The query is a list of `browser >= version`; `ios` means Safari, `chromium`, `opera` and `samsung` mean Chrome. The table is `targets/web/browsers.json` (MDN browser-compat-data, read 2026-10-17).

   ```
   warning W0601: webusb (plugin gphoto2) is not available in firefox (never shipped), safari (never shipped); Chromium browsers only, secure context
   warning W0602: the native side 'Process' has no browser backend (a plugin's web entry): its calls throw ZnUnsupported (docs/targets/web.md, "The dev bridge")
   warning W0603: the program calls processes and signals: it throws ZnUnsupported in the browser
   ```

   `zinc explain W0601` (and `W0602`, `W0603`) say what each means and how to fix it. The row list of W0603 comes from the code the bundle really reaches, after tree shaking.

2. **At run time**, `import { supports, requireFeature, browserInfo, browserFeatures, shippedBy, banner, ZnUnsupported, isBrowser } from 'zinc:browser'`. `supports('webusb')` asks the browser; `requireFeature` throws
   `ZnUnsupported` naming the feature and the browsers that ship it; `browserInfo()` gives name, version, engine and whether it is a phone. Outside a browser the module exists and answers false, so one source
   runs everywhere. The `web` row of `targets/capabilities.json` is the baseline the `requires` checks use (camera, microphone and notifications are `optional`: the browser asks the person).

3. **When a call cannot be served**, it throws `ZnUnsupported` (`error.code === 'ZN_UNSUPPORTED'`, `error.feature`) instead of crashing. An exception nobody catches shows as a bar at the bottom of the page in an
   export and as an overlay in `zinc dev`; the app's frame loop goes on.

### Support matrix

First version that ships each part; `–` means never shipped. Tested here: **Chrome (headless, with its fake camera and microphone) only.** Firefox and Safari are not tested by the project: their columns
are research from MDN, not a run, and Safari in particular deserves a pass on a Mac before a release.

| Part | Chrome / Edge | Firefox | Safari / iOS | Used by |
|---|---|---|---|---|
| ES modules, import maps | 89 | 108 | 16.4 | the page itself |
| Canvas2D `roundRect` | 99 | 112 | 16 | canvas mode |
| Conic gradients | 99 | 112 | 16.4 | canvas mode, `conic-gradient()` |
| Canvas `letterSpacing` | 99 | 115 | 18.4 | text tracking in canvas mode (without it: no tracking) |
| `getUserMedia` (https or localhost) | 53 | 36 | 11 | `zinc:camera`, `zinc:microphone`, `zinc:webrtc` |
| Web Audio, `AudioWorklet` | 35, 66 | 25, 76 | 14.1 | `zinc:audio`, `zinc:microphone` |
| WebRTC | 56 | 44 | 11 | `zinc:webrtc` |
| WebSocket | 4 | 11 | 5 | `zinc:socket` |
| WebAssembly | 57 | 52 | 11 | `zinc:sqlite` and other native plugins |
| WebGL2 (WebGL1 for GLSL ES 1.00 shaders) | 56 | 51 | 15 | `zinc:gl`, `three`, `zinc:map` |
| WebGPU | 113 | 141 (Windows) | 26 | not used yet (three.js's WebGPU renderer would need it) |
| OffscreenCanvas | 69 | 105 | 16.4 | not used yet (a worker renderer is a later step) |
| Web Serial | 89 | – | – | `zinc:serial` |
| WebUSB | 61 | – | – | `zinc:gphoto2` |
| Web Bluetooth | 56 | – | – | planned |
| Web MIDI | 43 | 108 | – | `zinc:midi` |
| File System Access | 86 | – | – | planned (`showOpenFilePicker`) |
| Async clipboard | 66 | 63 | 13.1 | copy and paste |
| Notifications | 22 | 22 | 16 (iOS: installed web app, 16.4) | `zinc:system/notification` |
| Wake lock | 84 | 126 | 16.4 | `zinc:system/power` |
| Web Share | 89 | – | 12.1 | `zinc:system/share` |
| Service worker | 45 | 44 | 11.1 | the offline cache (the app runs without it) |
| Gamepad | 21 | 29 | 10.1 | `zinc:gfx` gamepads |
| `<dialog>`, `:focus-visible`, `dvh` | 102 | 111 | 15.4 | the DOM render |
| WebM / VP9 | 6 / 29 | 4 / 28 | 14.1 | `zinc:video` |
| AV1 | 70 (Edge 121) | 67 | 17, on hardware that decodes it | `zinc:video`, W0604 |
| H.265 / HEVC | 107, where the machine decodes it | 134, on hardware | 11 | `zinc:video`, W0604 |
| `MediaCapabilities` | 66 | 63 | 13 | `canDecode`-style checks of `zinc:video` |

Known differences of fonts: the web host uses the system fonts (`system-ui`, `ui-monospace`, `ui-serif`) for the families Zinc ships (`sans`, `mono`), so widths differ a little from a desktop build and
Zinc's layout measures with them (it measures with the same canvas metrics the text is then drawn with). Fonts in `assets/` are loaded and used by file name.

## Plugins

A plugin declares its browser version in `plugin.json`:

```json
"web": { "entry": "web/index.ts", "needs": ["getUserMedia"] }
"web": { "native": "Audio", "impl": "web/audio.js", "needs": ["audio"] }
"web": { "native": "Sqlite", "impl": "web/sqlite.js", "needs": ["wasm"], "wasm": { "name": "sqlite", "sources": [...], "flags": [...], "exports": [...] } }
```

- **`entry`**: a module written for the page, used instead of `index.ts` by the web build (`zinc:camera`, `zinc:microphone`, `zinc:webrtc`, `zinc:socket`, `zinc:browser`). The API is the one of `index.ts`, so
  programs do not change.
- **`native` + `impl`**: the plugin's own `index.ts` runs unchanged; `impl` is the JavaScript that answers the calls of its native spec (`native/<x>.spec.ts`) with browser APIs (`zinc:audio`, `zinc:svg`,
  `zinc:system`). It registers with `__zincWeb.registerNative(name, functions, needs)`; the export concatenates the backends of the plugins the app uses into `native.<hash>.js`.
- **`wasm`**: native code in C or C++ built to WebAssembly by the pinned zig when the app is exported (`zig cc -target wasm32-wasi`, cached under `~/.zinc/cache/web-wasm`), compiled by the page before the
  app starts, and instantiated synchronously by the backend (`__zincWeb.wasmInstance`), so the calls stay synchronous as on a desktop. Only for code that has no browser equivalent.
- **`needs`**: feature names of `targets/web/browsers.json`; the export reports the browsers of the target set that lack them (W0601). A program that uses `zinc:gl` is checked for `webgl2` too.
- **`entry` and `native` + `impl` together** (zinc:map): the entry replaces the module and the impl still answers the native spec its code uses. **`modules`** under `web` replaces the plugin's module
  aliases on the web (three's addons). **`scripts`** lists vendored libraries the export publishes byte for byte and the page loads as classic scripts before the app.
- **Host rows in their own file**: `targets/web/rows-*.js` answer groups of `__host_*` rows (zinc:gl, shaders); the export loads one only when the program calls one of its rows.

| Plugin | Web | How | Tested |
|---|---|---|---|
| `zinc:camera` | yes | `getUserMedia` and a `<video>`; frames drawn into a gfx image (`cam.image`), snapshots, PNG, stills; every video track gets `.camera` | Chrome |
| `zinc:microphone` | yes | `getUserMedia`, Web Audio `AudioWorklet` blocks of 20 ms, level; every audio track gets `.microphone` | Chrome |
| `zinc:webrtc` | yes | the browser's `RTCPeerConnection` and friends under the same names; `examples/webrtc-call` runs unchanged | Chrome (a loopback call: VP8, Opus, stats) |
| `zinc:audio` | yes | Web Audio: decoded sounds, 32 voices with gain and pan, tones, PCM, streams; starts at the first click or key | Chrome |
| `zinc:socket` | partly | `WebSocket` and its events (the browser's own); TCP, UDP, Unix sockets, DNS and the WebSocket server throw `ZnUnsupported` | loads (the call demo imports it); no socket traffic tried |
| `zinc:svg` | yes | the SVG parsed with `DOMParser`, drawn with `Path2D` (canvas) or as a real `<svg>` (DOM); icons of the kits | Chrome |
| `zinc:system` | partly | notifications, clipboard (rich), opener, share, wake lock, dock badge, appearance, dialog messages; menus, tray, window geometry are accepted and do nothing; global shortcuts, autostart, updates answer `unsupported` | Chrome (the desktop-app template runs) |
| `zinc:sqlite` | yes | the amalgamation as WebAssembly, in memory, saved to `localStorage` per path (about 3 MB at most) | Chrome |
| `zinc:browser` | new | the queries above | Chrome |
| `zinc:gestures`, `loader`, `pixelfont`, `sprite`, `tilemap`, `gsap`, `ink` | expected | pure Zinc over `zinc:gfx`, no native side | not tried |
| `zinc:gl` (a module of the standard library, not a plugin) | yes | the browser's WebGL, rows in `targets/web/rows-gl.js` | Chrome (examples/gl-cube against the native frame; DOM mode; context loss) |
| `zinc:gfx` `drawShader` | yes | WebGL canvas drawn as an image | Chrome (against the native CPU path) |
| `zinc:three` | yes | the real three.js on a WebGL2 canvas (`web.entry`, `web.modules` for the addons) | Chrome (examples/three/cubes, gltf-viewer, a pixel-checked scene, context loss) |
| `zinc:canvas` (canvas2d) | yes | the browser's Canvas2D (`web.entry`) | Chrome (gltf-viewer's floor texture) |
| `zinc:physics2d` | yes | Box2D 3.1 to WebAssembly with a C shim (`web.wasm`, as sqlite) | Chrome (a drop scene: the same line as the native engine) |
| `zinc:serial` | yes, Chromium | Web Serial (`web.native` + `impl`): list from granted ports, the browser's chooser opens on a click, queued writes | **mock** `navigator.serial` (an echo port); no real device |
| `zinc:midi` | yes, Chromium and Firefox | Web MIDI (`impl`): ports after the first call (the person is asked), notes, control, sysex; no virtual ports | **mock** `requestMIDIAccess`; no real device |
| `zinc:gphoto2` | yes, Chromium | WebUSB and PTP written for the page (`impl`): detect, open, summary, standard settings (ISO, white balance, f-number, exposure, battery), capture, trigger, download, thumbnail, file events. No live view and no vendor widgets: those need libgphoto2, which exists for the web as `web-gphoto2` (LGPL, Emscripten + Asyncify, about 5 MB) and is the next step for them | **mock** `navigator.usb` with a PTP responder (real containers); no real camera |
| `zinc:osc/full` | yes, with a relay | the protocol is unchanged; a browser has no UDP, so `open(port, 'ws://relay')` speaks it over a WebSocket (binary frames, the osc-js bridge format); without a URL it throws ZnUnsupported | **mock** WebSocket that echoes; no relay was run |
| `zinc:map` | yes | MapLibre GL JS behind `MapView` (see above) | Chrome (six offline tiles of Paris, drawn; labels not checked) |
| `zinc:video` | yes | `entry`: the browser's `<video>` (streamed from its url, never preloaded), the whole `Player` API, plus `controls`, `volume`, `rate`, `seek`, `poster`, `fit`, `fullscreen()`, `pictureInPicture()`, `on(event)`; `player.draw` in a node is the element itself in the DOM render, its current frame on a canvas render; `player.image` follows the frames; a file the browser cannot decode shows a message and a download link (`player.error`); W0604 at export | Chrome (VP9 and AV1 WebM, the API, the fallback; HEVC and H.264 depend on the build) |
| `zinc:lottie` | yes | `native` + `impl` over lottie-web 5.13 (MIT, vendored in `plugins/lottie/web/vendor` with its licence), loaded the first time an animation is drawn: the SVG build in the DOM render (an `<svg>` in the node's box), the canvas build on a canvas render; `Player` and `<Lottie/>` unchanged. `cacheBg` (render to an image) is not supported | Chrome |
| `zinc:3d`, `zinc:physics3d` | not yet | `zinc:3d` is the Zinc renderer's own scene API (use `three` on the web); physics3d would be a second Box2D-style shim | – |
| `zinc:mapping`, `zinc:sonos`, `zinc:spotify` | not yet | fetch and WebSocket over a proxy where the service has no CORS | – |
| `zinc:process`, `zinc:ffi`, `zinc:script`, `zinc:wasm`, displays, boards, `zinc:remote`, `zinc:webos`... | no | no equivalent on a page (the browser runs WebAssembly and `eval` itself) | – |

## npm packages

A Zinc app for the web imports packages from `node_modules` as any web app does (`import { createStore } from 'zustand/vanilla'`, `import dayjs from 'dayjs'`). Zinc stays the UI layer: React, Preact and
`react-dom` are not needed (state, utility, data, format, validation and canvas libraries are what this is for; what was run is listed in [web-libraries.md](web-libraries.md)).

```sh
zinc add npm:zustand npm:dayjs     # the project's package manager adds them (package.json, its lockfile, node_modules)
zinc install                       # all of package.json; the plugins of zinc.json after it
zinc dev . --target web            # the packages are bundled once, the app's own code is served module by module
zinc export . --target web         # the packages are linked into app.<hash>.js, tree-shaken and minified
```

**One resolver.** Dev and export resolve packages with the same esbuild flags (`webResolveFlags` in `src/qjs/bundle.cpp`): platform `browser`, so package.json `exports` with the `browser`, `import` and
`default` conditions, sub-paths (`pkg/sub`), `imports` (`#internal`), the `browser` field (and its file replacements), then `module` and `main`; symlinks (pnpm's store, workspaces) are followed to the real
file. CommonJS packages work with default, named and `import * as ns` imports; `process.env.NODE_ENV` is `"development"` in dev and `"production"` in the export; `global` is `globalThis`.
`tests/t1/web_npm.sh` runs one fixture (conditions, a browser-field map, CommonJS, a pnpm-style link) through both and requires the same answers.

**Dev pre-bundles, as Vite does.** The bare imports of the app are bundled once with the pinned esbuild into ES modules (`/__deps/<id>.js`), kept in `<project>/.zinc/web-deps/<key>/`, where the key is the hash of
the lockfile (searched upward, so a workspace root counts), the project's `package.json`, the `package.json` of each imported package and the names imported from it. A save of your own code never bundles them
again (the dev log says `pre-bundled` only when it did); an install (the lockfile or a package changes) or a new import bundles again and reloads the page. `import { a } from 'cjs-package'` works because the
pre-bundle exports exactly the names your code imports. The first start takes one esbuild run (tens of milliseconds for a few small packages).

**Package managers.** `zinc add npm:<pkg>[@version]... [-D] [dir]`, `zinc remove npm:<pkg>` and `zinc install [--frozen] [--offline] [dir]` run the manager the project already uses. It is found from the `packageManager`
field of the nearest package.json (`pnpm@10.0.0`), else from the lockfile found upward from the project (`pnpm-lock.yaml`, `bun.lock` / `bun.lockb`, `yarn.lock` (classic or berry), `package-lock.json`), else it is npm. `--frozen`
becomes `npm ci`, `--frozen-lockfile` or, for yarn berry, `--immutable`. Zinc never installs a manager and never ships one: when it is missing, `error P0001` says which one the project uses and why, and prints the command to run
(`corepack enable pnpm`...). npm, pnpm and yarn are Node programs, so Node is needed to install packages (`error P0002`) and for nothing else: `zinc run`, `dev`, `export` and `bundle` read `node_modules` themselves. bun
brings its own runtime. `zinc doctor` lists the managers and Node it finds. The plugin commands are unchanged: `zinc add <name>` is a plugin, `zinc add npm:<name>` is a package, and `zinc install` installs the packages of a
package.json first, then the plugins of zinc.json. (Tried here: npm 11, pnpm 10 and bun 1.3 add and install; yarn was not on the machine, so only its detection and the error were tested.)

What does not apply: a package that needs Node built-ins (`fs`, `net`, `child_process`) fails with `warning W0605` (esbuild's message names the built-in): use its browser build, or fetch and WebSocket. Packages are read
as written: a workspace package that ships TypeScript or JSX sources is compiled by esbuild's plain loaders, without Zinc's JSX lowering (`className`, `StyleSheet`), so publish built JavaScript. The types of packages are not
read (the program is not type-checked against `.d.ts` on this path). A bare `three` resolves to Zinc's own three plugin when the plugins folder is present, not to the npm package.

## Vite and other bundlers

`@zinc/vite` (`packages/vite-plugin-zinc/`, one ESM file, no build step) lets a Vite project build and develop a Zinc app: Zinc's transform and web host, Vite's resolver, dev server, HMR, splitting, hashing and minifying.

```sh
npm add -D vite @zinc/vite          # until it is published: "@zinc/vite": "file:/path/to/zinc/packages/vite-plugin-zinc"
```
```js
// vite.config.js
import { defineConfig } from 'vite';
import zinc from '@zinc/vite';
export default defineConfig({ plugins: [zinc({ render: 'dom' /* or 'canvas'; browsers: 'chrome >= 111' */ })] });
```
```html
<!-- index.html: the plugin adds the host's markup, the import map, the config and the script -->
<!doctype html><html lang="en"><head><meta charset="utf-8"><title>My app</title></head><body></body></html>
```

`vite` and `vite build` need `zinc` on PATH (or `ZINC=/path`, or `zinc({ zinc })`) and a `zinc.json` with the entry. The plugin calls `zinc dev <root> --target web --prepare .zinc/vite [--build]`, which does Zinc's part
and stops: the transformed program as plain ES modules (`stage/`, the imports of npm packages left as written) and the host files (`site/`: `runtime.js`, `native.js`, `dom.js`, the WebAssembly of plugins), with the
W0601 to W0603 warnings of the browsers check printed. Vite does the rest: it resolves the packages with its own resolver and pre-bundler (so a Vite project's `resolve`, `optimizeDeps` and `define` settings apply to them;
this is the one place where the packages are resolved by Vite's rules and not by Zinc's flags), serves the modules, and in `vite build` bundles the app, emits the host, `zinc:native` and the assets with content hashes and
writes the page's import map and config. `zinc:native` stays an import that the page's import map answers, as in `zinc export`.

Hot reload is Vite's. A save runs the transform again (about 100 ms) and rewrites only the staged files that changed; Vite hot-updates the modules that export only functions (they accept themselves, their exports are
forwarded to the new definitions and the components that ran them render again, by the rules of `zinc dev`); the page reloads when a module exports state, classes or is the entry; a Zinc compile error shows in Vite's
overlay. `tests/t1/web_vite.sh` builds and develops `tests/fixtures/web-vite` (Vite 8.3) in headless Chrome and checks all of it, with a CommonJS package inside.

**Rspack and webpack** are not implemented. The same two steps would apply (`zinc dev --target web --prepare dir`, then an entry that sets `globalThis.__zincLoadEntry = () => import('<dir>/stage/<entry>')` before importing
`<dir>/site/runtime.js`, `zinc:native` as an external answered by an import map, the config script of `site/index.html`); that recipe was not run. For a project without a bundler, `zinc export --target web` is the build.

## Hot reload

`zinc dev --target web` serves the project as unbundled modules (no esbuild run per save) on `http://127.0.0.1:8000/` (the next free port when taken; `--port n`, `--lan` to open it to the network, `--render` as above) and
tells the page about each save over a WebSocket (`/__zinc/ws`).

| You save | The page |
|---|---|
| a module that exports only functions (components, helpers) | the module is evaluated again in place; the component instances that ran it are disposed and rendered again (`zinc:ui/solid` does this through `_hotC`, as the typed engine's Fast Refresh does); every module you did not touch keeps its state: signals, stores, scroll positions, the open screen |
| a module that exports state (a signal, a store, a class), a new file, the entry | the page reloads (its modules may hold state that the new code would reset) |
| a file that does not compile | a red overlay with the diagnostics; the app keeps running behind it; the next good save clears it |
| anything that is not a module (assets, zinc.json, a plugin) | the page reloads |

The modules can use `import.meta.hot` as in Vite (`accept`, `dispose`, `on('beforeUpdate' | 'afterUpdate')`, `data`) to undo top-level effects. The exports of a refreshed module are forwarded: a module that imported the
old function calls the new one, with no reload of the importers.

The existing Fast Refresh of `zinc dev` (D122 to D124) maps live objects of the interpreter to new classes; that machinery is the interpreter's, so the web build reuses its program-side API
(`import.meta.hot`, `_hotC`, `zinc:ui/solid`'s hooks) and not the swap itself. A save took 55 to 70 ms to reach the page in the fixture of `tests/t1/web_dev.sh`.

### The dev bridge

A plugin whose native side has no browser backend (`zinc:process`, `zinc:lvgl`, `zinc:device`, `zinc:cdp`... the W0602 list) still works under `zinc dev --target web`: the dev
server starts a small program on QuickJS with the plugin's real native code (`targets/web/bridge-host.mjs`, written to `build/.zinc-web-dev/bridge-host.mjs`) and the page
calls it. `zinc dev` says which sides it runs (`the native sides Lvgl, Device run on this machine through the dev bridge`) and drops their W0602 lines.

- A call is a synchronous request to `http://127.0.0.1:<port>/call`, as a native call is synchronous; a promise result settles later. The callbacks and settled promises come
  back in the order the native side made them, each as a task of its own, never inside a call (as on the native event loop).
- It listens on loopback only, and every request carries a token the dev server writes into the page; a request without it gets 403. With `--lan` there is no bridge (the
  page would serve other machines) and those calls throw ZnUnsupported.
- It is for development on your own machine. An export never has one: a page hosted online gets no processes, files or devices from a server, so those calls throw
  ZnUnsupported there (the online demos use browser backends instead).
- The program's file system (`zinc:fs`), its environment (`env()`) and the host services a page lacks (processes, raw sockets, signals...) are this machine's too, from the
  project's folder, as under `zinc run`; so `zinc.json` "requires" (fs, process) is not checked under `zinc dev` unless `--lan`. What the page does itself (drawing, layout,
  input, audio, storage) stays the page's.
- A side that draws (`zinc:3d`, the `zinc:three` subset) is never bridged: it would draw on your machine, not in the page. Its plugin.json says so with `"web": {"bridge": false}`; it keeps its W0602.
- The set of native sides is read when `zinc dev` starts: a save that adds such a plugin needs `zinc dev` restarted.

`tests/t1/web_bridge.sh` runs a `zinc:process` program through it in headless Chrome.

## Hosting

Any static host. Upload the folder; `index.html` and `sw.js` should not be cached for long and the hashed files may be (`_headers` does it for Netlify and Cloudflare Pages; set it by hand for nginx, S3 or
GitHub Pages). Serve over https: `getUserMedia`, notifications, the service worker and the clipboard need a secure context (localhost counts). `.br` and `.gz` copies sit beside each file for hosts that serve
precompressed files (`gzip_static`, `brotli_static`); others compress by themselves.

## Tests

`tests/t1/web_export.sh` (the export of the hero demo, canvas and DOM, in headless Chrome), `web_dev.sh` (Fast Refresh, overlay, reload, through the DevTools pipe), `web_caps.sh` (the capability warnings and `zinc explain`),
`web_plugins.sh` (the webrtc call demo, camera, microphone, audio and sqlite), `web_dom.sh` (the semantic DOM in headless Chrome by `tools/web-dom-test`: elements, accessibility tree, Tab order, typing and caret, Enter submits a form, Page Down, a resize, the dialog, a 10 000 row list, history, prerendering), `web_dom_visual.sh` (the DOM render against the canvas render pixel by pixel, `tools/web-compare`), `web_video.sh` (video and lottie, `tools/web-video-test`), `web_gl.sh` (zinc:gl, shaders, three, context loss), `web_hw.sh` (serial, MIDI, gphoto2 and OSC against mocks, and the map) and `web_physics2d.sh` (Box2D against the native engine). `web_npm.sh` (packages through dev and export, the package managers' detection and errors), `web_libs.sh` (thirteen real libraries, installed on the first run: it needs a network once), `web_vite.sh` (`@zinc/vite`; installs Vite once). `web_real.sh` (`tools/web-real-test`: a real-input Chrome, trusted mouse and key events at a device pixel ratio of 2, a window resize, focus lost and regained, every console error collected; `--matrix` runs a list of demos, results in [web-demos.md](web-demos.md)). `tools/web-browser-test`, `tools/web-dev-test`, `tools/web-npm-test`, `tools/web-libs-test` and `tools/web-vite-test` drive Chrome; `tools/web-measure` prints the numbers of
[the report](../reports/zinc-web-export.md). Without Chrome they skip.
