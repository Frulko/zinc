# zinc:webview — web content in the app window (Tauri-like)

`plugins/webview` embeds native web views in the program's window, on top of the software-rendered surface. You
can build a UI with HTML/CSS/JS shipped inside the single executable, mix it with zinc:ui, and connect the two:
the page calls Zinc commands and Zinc pushes data into the page.

| target | status |
|---|---|
| macos | WKWebView inside the SDL window (`src/webview.mm`, frameworks WebKit + Cocoa, links SDL3) |
| ios | WKWebView over SDL's view (the same `src/webview.mm`, frameworks WebKit + UIKit) |
| android | android.webkit.WebView above SDL's SurfaceView (`native/android/WebviewModule.java` behind the generated `WebviewSpec`, D127; permission INTERNET) |
| sim | fake: views are handles, nothing is shown, no page runs |
| linux (WebKitGTK), windows (WebView2), wasm (iframe overlay), rpi1 | not supported yet (Z5003 at build time) |

Example: `examples/webview/hybrid` (a native sidebar next to a web panel, both ways), run with
`zinc run examples/webview/hybrid -- <dir>`. On a phone (or with `HYBRID_PHONE=1`) it is one scrolling page: the web panel
scrolls with it and the bar at the top cuts it off; `zinc export examples/webview/hybrid --target android --apk` or
`--target ios --ipa --simulator` builds it.

Zinc Next on macOS runs the real WKWebView on the interpreter and in native builds. The plugin uses the
host's SDL3; no separate SDL installation is needed. Native `.app` bundles carry their web files in
`Contents/Resources/assets`, so `zinc://` pages still load after moving the app. Deterministic tests and
`ZINC_NATIVE=sim` use the simulator, which opens no page. QuickJS currently rejects this plugin's native
callback API explicitly; use the default engine or `--interp` for WebView.

## API

```ts
import * as webview from 'zinc:webview';

const web = webview.create({ url: 'zinc://index.html', html: '', x: 0, y: 0, w: 400, h: 300 });
web.handle('readFile', (name: string) => JSON.stringify(fs.readText(name)));   // page: await zinc.invoke('readFile', 'a.txt')
web.onMessage((data: string) => console.log('page says', data));               // page: zinc.postMessage(x)
web.postMessage('{"type":"tick","n":1}');                                       // page: zinc.onmessage = (m) => ...
```

| member | |
|---|---|
| `create(opts)` / `new WebView(opts)` | `url` (`zinc://...`, `https://...`, `file://...`) or `html` (inline, relative links resolve against `zinc://app/`), and `x, y, w, h` in logical pixels |
| `<NativeView view={web} className="grow" />` | the way to place it: zinc:ui gives the view its node's box and clip, hides it under menus, dialogs and toasts and when the node is off screen (docs/ui.md "Native views"); `place(...)` is that host method |
| `setBounds(x, y, w, h)` | logical pixels, the gfx / zinc:ui coordinate space; follows the window's zoom, HiDPI density and letterbox; no clip |
| `follow()` | the older way: an `onDraw` callback for a zinc:ui `<Canvas>` that keeps the view on that node (no clip, not hidden under overlays) |
| `show()` / `hide()` | the program's own switch; the view shows when it is on and NativeView shows it |
| `navigate(url)`, `loadHtml(html)` | |
| `eval(js)` | runs JavaScript in the page, fire and forget |
| `postMessage(data)` | delivered to the page as `zinc.onmessage(value)` and as a `zinc` window event (`addEventListener('zinc', e => e.data)`); JSON text arrives parsed |
| `onMessage(cb)` | strings sent with `window.zinc.postMessage(x)` (non-strings are sent as JSON text) |
| `handle(cmd, fn)` | registers a command for `await zinc.invoke(cmd, args)`: `args` is a string (objects arrive as JSON text), the returned string resolves the page's promise (parsed when it is JSON), a `throw` rejects it with the message |
| `onLoad(cb)` | a page finished loading (its URL) |
| `close()` | removes the view |

Page side (`window.zinc`, injected before the page's scripts): `postMessage(x)`, `invoke(cmd, args) -> Promise`,
`onmessage`.

Handlers run on the event loop like any callback (a `zrt::Poller` delivers what WebKit queued while SDL pumped the
Cocoa events), so they can use every Zinc module. They are synchronous; for slow work, reply later with a message.

## Assets: `zinc://`

`zinc://app/<path>` serves the project's assets directory (`zinc.json` `assets`, default `assets/`):

- in release builds from the assets embedded in the executable (zinc:assets), so a web UI ships inside the single
  binary;
- when `ZINC_ASSETS=<dir>` is set (`zinc dev` sets it) from disk first, so edits show on reload.

`zinc://index.html` is accepted as a shorthand for `zinc://app/index.html` (the `app` host keeps relative links such
as `style.css` inside the asset root). Paths with `..` are refused. Content types come from the extension (html, css,
js/mjs, json, svg, png, jpg, gif, webp, wasm, woff2, ttf, txt).

## Security

- **Allowlist**: the page can only reach Zinc through the commands you `handle`; any other `invoke` rejects with
  `unknown command`. Treat `args` as untrusted input (the example only reads files it listed itself and refuses `/`
  and `..`).
- **Origins**: IPC is accepted only from the main frame of the app's own pages (`zinc://`, inline HTML, `file://`)
  and of local dev servers (`http(s)://localhost`, `127.0.0.1`). Messages from other origins and from iframes are
  dropped (logged). Loading a remote site is fine for display, but do not rely on a remote page for anything
  privileged, and never add a command that runs shell strings or arbitrary paths.
- **Inspector**: `zinc.json` `"plugins": { "webview": { "inspectable": true } }` lets Safari's Web Inspector attach
  (macOS 13.3+); keep it off in release builds.

## Notes and limits

- The native view is always above the software-rendered UI. Placed by `<NativeView>`, it hides itself while a zinc:ui
  layer (menu, popover, toast, dialog) overlaps it; placed by hand (`setBounds`, `follow`), hide it yourself.
- `ZINC_SHOT` saves only the software framebuffer; screenshot the window (`screencapture -l <window id>`) to see the
  web content. `ZINC_WEBVIEW_TRACE=1` prints the frames the OS view is given (macOS, iOS; the hybrid test reads them).
- Android: `zinc://app/<path>` is served as `https://appassets.androidplatform.net/<path>` (the host Android keeps for
  an app's own content: a secure origin, so `fetch` and storage work); `onLoad` reports it as `zinc://app/...`. The page
  side is the same `window.zinc`; the JavaScript interface behind it is visible to every frame, so each call carries a
  token only the app's own main document gets (injected into the HTML it is served; a local dev server's page gets the
  bridge when it starts loading, which can be after its first scripts). A debuggable build can be inspected from
  `chrome://inspect`.
- Hot reload (`zinc dev`): not verified — `zinc dev` does not link on this branch at the time of writing. Objective-C
  classes cannot be unloaded, so a reloaded library re-registers `ZincBridge` (the runtime warns about the duplicate).
- Up to 16 views.
