# Zinc Web

Web pages on the reMarkable Paper Pro. The relay on the Mac (`app/web-relay`) renders each page in Chrome at the size of the page view;
this app shows it a page at a time. Black on white, large targets, page turns instead of scrolling: one e-ink refresh per gesture.

- **Address bar**: a URL (`https://` is added), or words to search; the on-screen keyboard comes up with it. **‹** goes back.
- **Fingers**: swipe up or left for the next page, down or right for the previous one; tap a link to follow it; pinch with two
  fingers to zoom (the picture scales while the fingers move, then the relay sends it sharp); a swipe moves a zoomed page.
  **Previous**, **Next**, **−** and **+** do the same. On a desktop the wheel turns pages and Ctrl+wheel zooms.
- **Pen**: writes over the page. The ink is kept in page pixels, so it stays in place when you zoom, and saved per URL (**Save**, and on
  every page change and Quitter). **Undo** removes the last stroke; the Marker's eraser end erases. On a desktop, **Pen** makes the mouse
  write.
- **Export**: the whole page with its ink as a PNG in `exports/` (the relay draws it). **★** bookmarks the page; **Bookmarks** lists them.
- **Refresh**: a full refresh of the display, to clear the ghosting. **Settings**: the relay, its token, colour or grey.

## Run it

```sh
zinc run app/web-relay -- --data web-relay-data      # on the Mac: prints the token
zinc run app/web                                      # the e-ink emulator at 1620x2160: Settings, relay http://127.0.0.1:8790 and the token
```

On the tablet (the engine of ZN-841 in `/home/root/zinc`), either through the hub (`app/hub`, Install) once the app is published:

```sh
zinc update-keygen > web.key                           # once: then add "update": {"url": "<hub>", "publicKey": "<public= line>"} to zinc.json
zinc publish app/web --key "$(sed -n 's/^seed=//p' web.key)" --hub http://127.0.0.1:8787 --token "$(cat hub-data/publisher.token)"
```

or by hand: `zinc pack app/web -o web.zapp`, `scp web.zapp root@10.11.99.1:/home/root/zinc-apps/`, then on the tablet
`/home/root/zinc/bin/zinc-tile /home/root/zinc-apps/web.zapp` and reload AppLoad. In **Settings** set the relay to
`http://10.11.99.2:8790` (USB) and paste the token.

## Files

| Path | What |
| --- | --- |
| `~/.zinc/web/web.conf` (`ZINC_WEB_DIR`) | relay, token (mode 600), grey or colour, the last page |
| `~/.zinc/web/bookmarks.txt` | one URL a line |
| `~/.zinc/web/ink/<hash>.json`, `.txt` | the ink of a page (zinc:ink strokes in page pixels) and its URL |
| `~/.zinc/web/exports/*.png` | the exports |

`src/`: `main.tsx` (the shell), `state.ts` (the actions: open, turn, zoom, pan, links, ink, bookmarks), `pageview.ts` (the page view's
drawing and gestures), `relay.ts` (the relay's HTTP), `conf.ts`, `script.ts` (`ZINC_WEB_SCRIPT`, the test mode of `tests/t1/web_relay.sh`).
Pinch reads `touchCount()`: the reMarkable driver (`plugins/display-rmpp`) passes up to ten fingers, from AppLoad or from evdev.
`icon.svg` (zinc.json `app.icon`, the tile's icon) is Lucide's `globe` (lucide-static 0.462.0, ISC licence, https://lucide.dev/license).
