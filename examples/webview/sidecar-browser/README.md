# sidecar-browser

A web view streamed to a tablet. The window is a small browser; **Stream to Android (USB)** or **Stream to iPad / iPhone (USB)** starts
the program again with its screen on the tablet (`display-sidecar`), and the window becomes the tablet's remote: what is typed in its
address bar, the shortcuts and the history buttons act on the page the tablet shows. Touch the tablet to use the page; **Stop streaming**
brings the page back to the window.

While it streams, the Mac's keyboard types into the page on the tablet (tap a field there first), the − / 100 % / + buttons zoom it,
and a pinch on the tablet magnifies it around the fingers. A mouse plugged into the tablet hovers and right clicks.

```sh
zinc run examples/webview/sidecar-browser
```

The tablet runs the Sidecar app (`app/sidecar`), open and connected by USB (Android: USB debugging on). The page runs in WebKit on the Mac.

- `src/main.tsx` picks the role: the window, or the tablet's side (`SIDECAR_BROWSER_ROLE=screen`, set by the window).
- `src/state.ts` holds the window's state and starts the tablet's side (`sys.execPath()` with `zinc:process`), its orders on stdin.
- `src/console.tsx` draws the window: the browser, then the remote while it streams.
- `src/screen.tsx` is the tablet's side: one web view over the screen, the orders read from stdin, the pages it opens told on stdout.

`SIDECAR_BROWSER_DEMO=adb ZINC_HEADLESS=1 ZINC_FRAMES=1000000000 ZINC_SHOT=mac.png zinc run examples/webview/sidecar-browser` scripts a
run: it streams to the Android, types `openstreetmap.org` on the Mac, and quits 12 s later with the window's last frame in `mac.png`.
