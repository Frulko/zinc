# Zinc Web

Web pages on the reMarkable Paper Pro. The relay on the Mac (`app/web-relay`) renders each page in Chrome at the size of the page view;
this app shows it a page at a time. Black on white, large targets, page turns instead of scrolling: one e-ink refresh per gesture.

- **Address bar**: a URL (`https://` is added), or words to search; the on-screen keyboard comes up with it. The buttons are icons (Lucide, from `zinc:icons`): the arrow left goes back, the house opens the home page, × shows a blank page,
  the black arrow opens the address.
- **Fingers**: swipe up or left for the next page, down or right for the previous one; tap a link to follow it; pinch with two
  fingers to zoom (the picture scales while the fingers move, then the relay sends it sharp); a swipe moves a zoomed page.
  The page bar does the same: first page (arrow to the top line), previous and next (chevrons), zoom out and in (magnifiers).
  On a desktop the wheel turns pages and Ctrl+wheel zooms.
- **Pen**: writes over the page. The ink is kept in page pixels, so it stays in place when you zoom, and saved per URL (the floppy disk, and on
  every page change and Quitter). **Tools** (the palette over the page, folded to one row) picks the pen as on the tablet: ballpoint, fineliner, marker, pencil,
  calligraphy, highlighter, eraser or area eraser, the colour, Thin/Medium/Thick, Undo, Redo, Erase all; the Marker's eraser end erases. On a desktop, the pen button makes the mouse
  write.
- **Export** (the picture with an arrow): the whole page with its ink as a PNG in `exports/` (the relay draws it). The bookmark with + bookmarks the page; the bookmark lists them.
- **Tabs**: each tab keeps its page, the page you were on and its way back; the stack with the number of tabs lists them (open, close, **New tab**, **Close all**). A
  page sent from the Mac (the relay's page) opens in a new tab, or in the tab that already shows it; the tabs are kept when Web quits.
- **A↓** / **A↑**: the page drawn smaller or larger (55 % to 150 %); smaller fits more of it per screen, at 65 % or less most sites show
  their desktop layout. **Full screen** (the corners): only the top bar and one thin row (back to the normal view, the page number, A↓/A↑) stay; swipes still
  turn pages. Both are kept when Web quits.
- **Refresh** (the circular arrows): a full refresh of the display, to clear the ghosting. **Settings** (the gear): the relay, its token,
  colour or grey, the e-ink style and the contrast.
- **Dashboard** (TRMNL-style; the bookmarks, then the dashboard icon of a page): the first page of that page, full screen under a thin bar,
  rendered again by the relay every **5**, **15**, **30** or **60 min** (the relay reloads the tab in its running Chrome). The picture is
  replaced only when it changed (SHA-256 of the PNG), then the whole panel gets one full refresh, so nothing ghosts. The time of the last
  render is at the bottom; a tap on the page renders it now; **Reader** goes back to the reader. **Accueil** shows the top of the page as
  an 810 x 540 widget (`RemarkableApp` of `zinc:remarkable`) that the same timer keeps fresh. The mode and the period are in `web.conf`:
  the app opens on the dashboard again. Grey: the panel's driver dithers.

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
`http://10.11.99.2:8790` (USB) and paste the token, or leave it empty when the relay runs with `--no-token`.

## Files

| Path | What |
| --- | --- |
| `~/.zinc/web/web.conf` (`ZINC_WEB_DIR`) | relay, token (mode 600), grey or colour, the last page, the dashboard's URL (`dash`) and period in minutes (`every`) |
| `~/.zinc/web/bookmarks.txt` | one URL a line |
| `~/.zinc/web/ink/<hash>.json`, `.txt` | the ink of a page (zinc:ink strokes in page pixels) and its URL |
| `~/.zinc/web/exports/*.png` | the exports |

`src/`: `main.tsx` (the shell, the dashboard's screen and the widget), `dashboard.ts` (the timer, the hash, the dashboard's and the widget's
drawing; `ZINC_WEB_DASH_MS` sets a period in milliseconds for tests), `state.ts` (the actions: open, turn, zoom, pan, links, ink, bookmarks), `pageview.ts` (the page view's
drawing and gestures), `relay.ts` (the relay's HTTP), `conf.ts`, `script.ts` (`ZINC_WEB_SCRIPT`, the test mode of `tests/t1/web_relay.sh`).
Pinch reads `touchCount()`: the reMarkable driver (`plugins/display-rmpp`) passes up to ten fingers, from AppLoad or from evdev.
`icon.svg` (zinc.json `app.icon`, the tile's icon) is Lucide's `globe` (lucide-static 0.462.0, ISC licence, https://lucide.dev/license).

## Credits

Pages are rendered by headless Google Chrome through the Chrome DevTools Protocol; the reading mode is Mozilla's [Readability.js](https://github.com/mozilla/readability) (Apache 2.0). The dashboard is inspired by
[TRMNL](https://usetrmnl.com). The other projects Zinc uses on the reMarkable are listed in
[Credits and inspiration](../../docs/targets/remarkable-paper-pro.md#credits-and-inspiration).
