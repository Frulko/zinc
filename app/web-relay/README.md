# Zinc web relay

The Mac half of Zinc Web (`app/web`): the reMarkable cannot run a browser, so this headless Zinc server loads each page in headless Chrome at
the tablet's size and sends pictures of it, whole e-ink pages or a zoomed part, as PNG (grey by default), with the map of its links so that a
tap on the tablet can follow one. It also renders the page with the tablet's ink over it for the PNG export.

## Run it

```sh
zinc run app/web-relay -- --port 8790 --data web-relay-data      # prints the token the tablet needs
```

It needs Google Chrome (or Chromium; `--chrome <path>` or `CHROME=<path>` for another place). Chrome starts at the first request with its
own profile in `<data>/chrome-profile` and stops with the relay. On the tablet, in Zinc Web's **Settings**, set the relay
(`http://10.11.99.2:8790` when the tablet is on USB, the Mac's address on the Wi-Fi otherwise) and paste the token.

## HTTP

Every request but `/health` carries `Authorization: Bearer <token>` (`<data>/relay.token`, mode 600). Sizes are tablet pixels; a page is
laid out at `w / dpr` CSS pixels (`dpr` 2: 1620 tablet pixels are 810 CSS pixels, a tablet layout).

| Request | Answer |
| --- | --- |
| `GET /render?url=&w=&h=&dpr=2&mode=grey\|color` | `{"url", "title", "width", "height", "page", "links": [[x, y, w, h, href], ...]}` of the whole page (cut at 40 screens) |
| `GET /shot?url=&w=&h=&dpr=&mode=&x=&y=&cw=&ch=&zoom=1` | PNG of the page rectangle (x, y, cw, ch) at `zoom`: `cw*zoom` x `ch*zoom` pixels. Page k is `y=k*h` |
| `POST /export?url=&w=&h=&dpr=&mode=` | body: an SVG of the ink in page pixels; answer: PNG of the whole page with the ink over it |
| `GET /health` | `ok` |

The page is loaded again only when `url`, `w`, `h`, `dpr` or `mode` change. Only `http://` and `https://` pages are rendered (a `file://`
URL would read the Mac's files). Grey is Chrome's achromatopsia vision emulation: the page as seen without colour, with its contrasts kept.

## Why Chrome over CDP, not the webview plugin

The relay is headless: no window and no AppKit run loop, which a WKWebView needs to load and draw. Headless Chrome needs neither, renders
the whole page beyond the viewport, gives the links' boxes by `Runtime.evaluate` and the grey rendering by emulation, and runs the same
on a Linux machine. `tools/cdp.py` already drives it for the tests. `src/chrome.ts` is the client: Chrome started with `zinc:process`,
its DevTools WebSocket with `zinc:socket`, one tab, one request at a time.

`tests/t1/web_relay.sh` checks it with a page of `fixture/` served on 127.0.0.1.
