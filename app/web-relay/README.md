# Zinc web relay

The Mac half of Zinc Web (`app/web`): the reMarkable cannot run a browser, so this headless Zinc server loads each page in headless Chrome at
the tablet's size and sends pictures of it, whole e-ink pages or a zoomed part, as PNG (grey by default), with the map of its links so that a
tap on the tablet can follow one. It also renders the page with the tablet's ink over it for the PNG export.

## Run it

```sh
zinc run app/web-relay -- --port 8790 --data web-relay-data      # prints the token the tablet needs
```

It needs Google Chrome (or Chromium; `--chrome <path>` or `CHROME=<path>` for another place). Chrome starts with the relay, with its
own profile in `<data>/chrome-profile`, and stops with it. On the tablet, in Zinc Web's **Settings**, set the relay
(`http://10.11.99.2:8790` when the tablet is on USB, the Mac's address on the Wi-Fi otherwise) and paste the token.

## Send a page from the Mac

Open `http://127.0.0.1:8790/` in a browser on the Mac (the relay prints the address, with `?token=` when it has one): type an address and
**Send**, and Zinc Web opens it on the tablet within three seconds (it asks the relay while its page view shows). The same page has a
**Send to reMarkable** button to drag to Chrome's bookmarks bar: clicked on any page, it sends that page.

## The e-ink style

On by default (Zinc Web, **Settings**, **E-ink style**). The page is asked for a light scheme, no motion and more contrast (the
`prefers-color-scheme`, `prefers-reduced-motion` and `prefers-contrast` media features, which well-made sites follow), then a stylesheet
makes text black on white, removes shadows and animations, underlines links and draws form borders in black; fixed and sticky bars
(headers, cookie banners) go back into the flow of the page so that they do not cover its text. Pictures are left alone, so a white logo
drawn for a dark header disappears on the white background. **Contrast** (normal, high, max) then pushes the greys apart and thickens thin text.

## HTTP

Every request but `/health` carries `Authorization: Bearer <token>` (`<data>/relay.token`, mode 600). `--no-token` serves every request without one: for a test on a network you trust, since whoever reaches the port then drives the relay's Chrome. Sizes are tablet pixels; a page is
laid out at `w / dpr` CSS pixels (`dpr` 2: 1620 tablet pixels are 810 CSS pixels, a tablet layout).

| Request | Answer |
| --- | --- |
| `GET /render?url=&w=&h=&dpr=2&mode=grey\|color` | `{"url", "title", "width", "height", "page", "links": [[x, y, w, h, href], ...]}` of the whole page (cut at 40 screens) |
| `GET /shot?url=&w=&h=&dpr=&mode=&x=&y=&cw=&ch=&zoom=1` | PNG of the page rectangle (x, y, cw, ch) at `zoom`: `cw*zoom` x `ch*zoom` pixels. Page k is `y=k*h`. `&fresh=1` (the dashboard's timer) reloads the page in the running Chrome, bypassing its cache |
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
