# Changelog

All notable changes to Zinc are written here, for the people who use it. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
versions follow [Semantic Versioning](https://semver.org/) (while the major version is 0, a minor version may break what the previous one ran). `make release`
publishes the *Unreleased* snapshot as the release notes, then archives it under the new version after publication succeeds.

How to add a line: see "Changelog" in `AGENTS.md`.

## [Unreleased]

### Added
- `examples/ipod-web`: the page at `/` manages the iPod from any browser on the network: search and sort the songs, browse albums with their covers and playlists, play and download songs, and with `--allow-changes` add files by drag and drop, delete songs and eject; `GET /api/status` gives what its header shows.
- iPod demo: "Connect to a remote iPod" on the Devices page (the address and token of an `examples/ipod-web` daemon, kept in `config.json` beside the logs) opens an iPod plugged into another computer like a local one, marked with a network sign in the sidebar: its albums with covers, songs and playlists, playing (each song is fetched once into a cache), add, delete and eject when the daemon allows changes (else its sentence is shown); backups, check, repair and Optimise stay for a plugged iPod. The songs page also deletes the selected songs, behind Allow changes.
- `zinc:net`: a server's request has `remoteAddress`, the client's IPv4 address (`127.0.0.1` from the same machine).
- `await` in a branch of `?:` (`const png = id === '' ? '' : await cover(id)`), and an async function can `return` a promise without awaiting it (it settles as that promise does), as in TypeScript; an `await` inside a larger expression of a branch still asks for a `const` first.
- `zinc:net`: a reply can send a file (`file: path` in the `Reply`), in blocks and with byte ranges (`Range` gives a 206, a range past the end a 416), so a server streams songs and videos that players can seek; `serveAsync` is declared for TypeScript.
- `zinc:subtle`: `digest('MD5', data)` for the protocols that still ask for it (Subsonic's tokens); not Web Crypto, never for security.
- `examples/ipod-web`: the iPod daemon for a Raspberry Pi or a Mac: a web page (and `/pod.json`) of the iPods plugged in and their specs, the open iPod's library as a JSON API (`/api`, with a token) for a remote app, and a Subsonic server (`/rest`, `--user` and `--password`) so any Subsonic client streams the iPod's music; read only unless started with `--allow-changes` (add, remove, eject): `zinc run examples/ipod-web`, then open http://localhost:8686.
- `zinc:ipod`: `analyze()` finds duplicate songs by their tags, by identical files and by their sound (Chromaprint fingerprints, cached on the computer), and lists the music without a cover or tags, unused files and empty playlists; `merge()` keeps the best copy of each song with the tags, cover, play counts, rating and playlist places of the others, and removes the rest with their files (docs/plugins/ipod.md).
- iPod demo: an Optimise page that analyses the iPod, shows each group of duplicates with why it matched and the copy it keeps (click another to keep it), and merges the ticked groups as a transfer, behind Allow changes.
- iPod demo: an eject button beside the open iPod, and the transfers open to list every file with its tags or why it was refused, and its size.
- iPod demo: each transfer shows every step it takes as it runs, in a panel that follows the end (the files hashed, each song fingerprinted or read from the cache, each duplicate group with the copy kept and why); every step is also written to `logs/details.log` in the backup folder.
- `zinc:ipod`: `analyze()` keeps the hashes of identical files on the computer beside the fingerprints, so analysing again reads only the files that changed; its progress names each file and what was found.
- `zinc doc` makes the documentation of a project, a plugin or the engine (`--std`) as a static site, as `cargo doc` does: the API from the code and its doc comments, the Markdown and MDX pages of `docs/` and of each plugin's `docs/` (steps, tabs, callouts, commands with a copy button, screenshots, examples), search, light and dark themes and your own `docs/theme.css`. `--out` exports the folder, `--serve` serves it on this machine and reloads the pages when you save; nothing is downloaded (docs/guide/14-doc.md).
- `n.toString(radix)` prints a number in any base from 2 to 36, with the same digits as JavaScript (`(255).toString(16)` is `ff`).
- Generic arrow functions: `const id = <T>(v: T): T => v`.
- A stand-in `x.sim.ts` can `import type { ... } from './x.spec'` to use its spec's records instead of copying them, and the plugin still imports them from the spec.
- A string or a number can be a condition (`if (name)`, `s ? a : b`, `!count`, `a && b`): `''`, `0` and `NaN` are false, as in JavaScript, instead of error Z0103.
- Native plugins: a spec can declare interfaces and pass them, in lists, optional or nested, as parameters, results and promise results; the generated C++ header has a plain struct per record with `zn::rec::encode`/`decode`, safe on a worker thread, and fields appended later stay readable both ways (docs/guide/05-plugins.md, "Records"). `zinc:gphoto2`'s `detect()` uses it.
- `zinc:ipod` manages classic iPods (Classic, Nano, Mini, Video, Shuffle) over libgpod: detect, open or initialise, tracks with their tags and covers, playlists, a free-space check before any copy, snapshots at each save, backups, check and repair, eject. It writes the missing SysInfoExtended file itself (docs/plugins/ipod.md).
- `zinc:ipod`: `specs()` gives every detail of an iPod (model, firmware, serial, storage by kind, library counts, cover sizes, SysInfoExtended), `artwork()`/`cover()` give a track's cover as pixels or an image, `detect()` also lists iPods plugged in but not mounted (and no longer iPhones), and the database is backed up to the computer before the first change of a session instead of being copied on the iPod at every save; backups share the music and copy only what changed (`backups()` lists them).
- The `examples/ipod` demo shows a classic iPod plugged into the computer, read only: a drawing of it in its colour, its storage by kind of media, the albums with their covers, every song (search and sort), the playlists and every detail of `ipod.specs()`.
- `zinc:audio`: `openMusic(path)` plays a song or an audiobook as it is read from the disk, never decoded whole: play, pause, seek, position, duration, ended. On macOS and iOS it plays AAC, ALAC, MP3, WAV and AIFF, elsewhere WAV, FLAC, MP3 and Ogg Vorbis.
- `zinc:ipod`: `photoAlbums()` and `photo()`/`photoImage()` read the iPod's photos, `extras()` lists its notes, contacts, calendars and voice recordings.
- The `examples/ipod` demo plays the iPod's music: double-click a track, then play, pause, previous, next and seek in the bar at the top, as in iTunes. It also shows the podcasts, audiobooks, videos, photos and the notes and files of the iPod.
- `zinc:ipod`: `download(ids, dir)` copies tracks to the computer as `Artist/Album/NN Title.ext`, skipping files already there; `deleteBackup(folder)` deletes a backup and refuses anything outside the backup folder; `mount()` mounts an iPod plugged in but not mounted.
- The `examples/ipod` demo manages the iPod: download albums, playlists, podcasts or chosen songs, add files and folders (picker or drop on the window), backups (take, restore, delete), check and repair, mount and eject, a transfers queue and a log. Every change waits for the Allow changes switch, off at each start, and an iPod plugged in or pulled out shows within seconds.
- `<Image image={img} />` shows a runtime image (from `imageFromBytes`, `imageFromPixels` or a plugin), as `src` shows an image of the assets; it follows a signal like any prop.
- `zinc:carplay` forwards two simultaneous touch contacts with stable finger slots and supports day/night appearance through `setNightMode`; the demo includes a Day/Night button.
- Experimental `zinc:carplay` plugin and native viewer demo receive video, audio and touch controls through a separately installed PlayPort backend. USB and microphone uplink are not implemented yet.
- reMarkable: Sidecar shows a Mac's screen on the tablet over USB, as a second display (Retina, 1:1 or a chosen size) or a mirror, in fast black and white: open Sidecar on the tablet, then run `app/sidecar/mac/build.sh` and `build/sidecar` on the Mac.
- reMarkable: Sidecar scrolls the Mac with two fingers (in the way the tablet is turned); a two-finger tap is the full refresh. It can also run without xochitl, on the whole screen: `zinc-tile sidecar.zapp --session --max 7200` makes its session tile (`zinc-tile --max` sets any session's time).
- reMarkable: Sidecar has a menu bar app (`app/sidecar/mac/build/Sidecar.app`): start and stop, presets (Text, Speed, Video, Reading), a settings window that explains each knob, and a pen tablet mode where the Marker draws in Mac apps with pressure, tilt and hover.
- reMarkable: Sidecar dithers with blue noise, cleans through grey checkers instead of a black flash, and opens a quick panel on a three-finger tap (clean, full refresh, preset, contrast, lock the turn).
- reMarkable: Sidecar is faster: the tablet draws the pointer itself, large updates are compressed, a scroll moves what the tablet already shows instead of sending it again, and big changes are processed on the Mac's GPU. Update both the tablet engine and the Mac app.
- reMarkable: Sidecar turns dark areas into ink on paper, so a dark mode's windows (Discord, a code editor) are readable: each part of the screen that is mostly dark is turned at its own border, big titles included, and the light windows around it stay. Dark areas in Sidecar's settings: Turned (the default; Video keeps them), Kept, or Whole screen; `--invert 0|1|2`.
- reMarkable: Sidecar dots only photos and films by default and keeps the interface pure black and white, so letters are sharper and less is sent (Greys: Pictures only; `--dither 3`); window borders and separators come out as solid lines instead of dotted ones.
- reMarkable: Sidecar shows pale tints of the interface (a text selection, a highlighted row, a pale button) as a light grey instead of white paper.
- reMarkable: Sidecar draws photos (avatars, thumbnails, pictures in a chat) with their own gentle curve and no edge lines, and never turns them into negatives inside a dark area: faces and pictures read instead of ink blobs.
- reMarkable: Sidecar has an experimental Hybrid preset: fast black and white dots while things move, the panel's 16 true greys once they rest, with no flash or pause after each scroll. "Grey levels at rest" (All, 16, 4; `--grey-levels`) sends a resting page on the panel's own grey levels, blue noise between two, in fewer bytes.
- reMarkable: Sidecar scrolls faster: while a scroll runs the tablet no longer waits for each update to finish before drawing the next one; what that leaves is cleaned once the scroll stops.
- reMarkable: Sidecar's settings show a preview of each grey pattern (Pictures only, Blue noise, Grid, None); click one to use it.
- reMarkable: Sidecar's menu bar app can stop the Mac's text caret from blinking while it runs (each blink leaves a ghost on e-ink), and restores it after.
- reMarkable: Sidecar waits until the mouse rests (moves, clicks, drags, a finger or the Marker) before it cleans ghosts: "Mouse pause" in the settings.
- reMarkable: Sidecar no longer leaves ghosts, doubled text or pink and yellow residue from updates sent onto pixels the panel is still driving: the tablet holds them until their place rests ("Panel timing" in the settings).
- Sidecar's menu bar app starts by choosing the output (the reMarkable, or a screen added by its address); each output keeps its own mode and settings, and only the reMarkable shows the e-ink presets. A missing Screen Recording permission now says so, with a button to the setting.
- Sidecar works with any screen on the network, in colour: run the `app/sidecar-screen` app on a Raspberry Pi (HDMI, `display-fbdev`), then `sidecar-screen --host <its address>` on the Mac (built by `app/sidecar/mac/build.sh`). Changed tiles are filtered and compressed with zstd on every core. Large changes go first in reduced colours, then exact once they rest (`--exact` turns that off).
- Sidecar streams to several outputs at once (the reMarkable and one or more screens): each output in the menu bar app starts and stops on its own, with a dot on its card while it runs, and a mirror can copy a different Mac display on each.
- Sidecar's menu bar app says when macOS blocks its local network access (the reMarkable then looks unplugged), with a button to the Local Network setting.
- reMarkable: Sidecar compresses its pictures with zstd when the tablet's engine reads it, so less goes through the cable. Update both the tablet engine and the Mac app.
- reMarkable: Sidecar's menu bar app shows when a reMarkable is plugged in by USB and can start on it, waits for the tablet's app without giving up, sets the tablet's frontlight and ends the tablet's app from the Mac.
- Sidecar's menu bar app has a Details window for a screen: the link (Wi-Fi, Ethernet or USB cable, addresses), the picture (size, codec), frames captured and sent, throughput, encode and decode times, round trips, and the screen's CPU, clock, temperature, throttling (a Pi's under-voltage shows in red) and memory.
- Sidecar on a Pi is faster: a picture is decoded on every core and shown as soon as it is whole (a quarter of a 1080p screen moving: 54 pictures a second instead of 30, a round trip of 18 ms instead of 34). `sidecar-screen --synthetic <percent>` sends the same moving load every run, to compare links and screens.
- Sidecar on a Pi plays videos in hardware: a part of the Mac's screen that moves like a film is sent as H.264 and decoded by the Pi's video decoder onto a display plane, the rest stays exact (60 pictures a second with 6% of the Pi's CPU, a whole 1080p screen included). The Details window shows it; `--no-video` turns it off. Update both the Pi app and the Mac tools.
- Sidecar can show a Mac's screen on another Mac (an iMac 5K as a second display): run `build/sidecar-receiver` (built by `app/sidecar/mac/build.sh`) on the Mac that shows it, full screen at its native size (`--size WxH`, `--windowed`; Esc quits), then `sidecar-screen --host <its name>.local --hidpi` on the Mac that sends. Videos are decoded in hardware.
- Sidecar plays the Mac's sound on the screen: turn on Sound in the screen's settings (it shows once the screen says it can play it; macOS asks once to record the system's audio). The Mac goes quiet meanwhile; a Pi plays it on its headphone jack, or on HDMI when the screen has speakers, and a Mac receiver on its speakers. `sidecar-screen --audio` on the command line.
- Sidecar plays films at 25 pictures a second without judder: after 4 s of such a film, the Mac's Sidecar display and the Pi's HDMI screen switch to 50 Hz (when the screen takes it), and back to 60 Hz 6 s after the film. The screen goes dark for a moment at each switch; the Details window shows the refresh.
- Sidecar's Details window has a Speed test: the real throughput and app-to-app ping to the screen on the connection in use, and which of its addresses answered. Update the screen's app too.
- Sidecar opens Sidecar Screen on the Pi through its Zinc agent when the Mac waits for it (the player was in front), and has an "Open it there" button. A name like `zinc-player.local` now tries each of its addresses, a cable first.
- Pi image: a Mac's USB-C cable is a network link to the Pi (an Apple silicon Mac shows itself as a USB network device that Linux refused): the image builds the driver when it has the compilers, else `sudo zinc-admin mac-usb` once; Sidecar then reaches the Pi by its `.local` name over the cable.
- reMarkable: Sidecar's menu bar app has a Profile tab: live numbers from the Mac and the tablet's panel (how long it moves, how busy it is, what was held), recorded to a file on demand.
- reMarkable: Web no longer covers the top of the page with a Tools button; a pen button in its bar (also in full screen) opens the writing tools. InkPalette takes `shown` and `onHide` for an app that opens it from its own button.
- Hub (reMarkable): the home grid is a launcher in the style of iOS: six apps to a row, each icon in a rounded square with the name under it, and a round badge on its corner (a dot for an update, "!" when the app does not respond).
- Hub (reMarkable): the apps, their names, descriptions and icons show at once from the last catalog that checked, also without the server; an Update all button installs every update (the engine first, the Hub last).
- Android: on a rooted device, `setBacklight(false)` now turns the backlight fully off instead of leaving the screen at its dimmest glow, and a touch still wakes it. The app asks for root the first time; without root it dims as before.
- Experimental Intel Mac runtime targeting macOS 10.12: run packed `zinc:gfx` programs with a software-rendered Cocoa window, game keys and mouse input. Build separately from `targets/macos-legacy`; real Sierra compatibility remains unverified.
- reMarkable Hub: Settings › Experimental › **reMarkable header** turns the docked mode on for every app (the file `~/.zinc/rmpp-header`), with the Zinc AppLoad that has patch 0005.
- reMarkable: pinch-zoom no longer stutters: while the fingers move the screen gets one fast picture at a time, at the pace the panel can show, and with the Zinc build of AppLoad (patch 0006) the fast mode starts at once instead of after a second. Every Zinc app gets it.
- reMarkable: pinch-zoom works as in the reMarkable's own apps: the page you see is scaled as a quick ghost while your fingers move, and the sharp page is drawn once when they lift. The fingers' moves no longer pile up behind the screen either. Every Zinc app with a zoomable view gets it.
- reMarkable: after a zoom or a gesture the page is cleaned with a quiet partial refresh instead of a flash; the full refresh comes only after about six screens of changes. The zoom's ghost is drawn in crisp black and white.
- reMarkable: the apps' top bar shows Home and Quit as round icons, with a battery icon; the swipe-down panel has icons too.
- reMarkable (header mode): opening xochitl's menu no longer shrinks the app to its pill; xochitl's sidebar and menus open over it (needs the Zinc AppLoad build with patches 0007 to 0009).
- reMarkable (header mode): a badge in xochitl's own header, before its status icons, shows the running app's name with Home and Quit, drawn with xochitl's own label and icons; the app no longer draws a bar of its own (needs the Zinc AppLoad build with patch 0010).
- reMarkable (header mode): an app the Hub opens shows its own name in the header, and its Home and Quit work even when it does not use zinc:remarkable: Home floats it (its widget, else the minimized pill), Quit ends it (back to the Hub).
- Zinc Web: a **contrast slider** in Settings, from the page as it is to 4×, replaces the three steps; the web relay takes `contrast=1..4` (the names normal, high and max still work).
- Each app now keeps its `zinc:storage` keys and its files in a folder of its own, `~/.zinc/apps/<name>/` (`dataDir()` of `zinc:sys` gives it); the keys an app had in the shared `~/.zinc/storage.kv` move there the first time it runs. Erasing that folder resets the app and nothing else.
- Zinc Web: a **Home** button goes back to the first page, and **×** next to the address field empties it and shows a blank page without loading anything.
- reMarkable Hub: **Reset data** on an app that is running stops it first, then erases what it saved (it used to refuse and ask you to stop it).
- reMarkable Hub: Store › Installed always lists the Zinc engine first, with its version and **Update the engine** when the server has a newer one.
- reMarkable (experimental): `"display": { "header": "remarkable" }` in zinc.json shows the app below the tablet's own top bar (menu, logo, battery, time), which stays live; `RemarkableBar` becomes a slim bar with the title, **Accueil** and **Quitter**. A tap on the tablet's bar hides the app until its menu closes. Needs the Zinc build of AppLoad (patch 0005); without it the app stays full screen.
- reMarkable: swipe down from the top edge of any Zinc app, past the upper fifth of the screen, to open a panel with **Accueil**, **Quitter** and **Annuler** (a shorter swipe still brings AppLoad's window bar). Apps get it through `RemarkableApp` of `zinc:remarkable`.
- reMarkable Web: **Close all** in Tabs closes every tab. The web relay's token is now 2 letters and 8 digits, easy to type on the tablet and in the extension (delete `relay.token` to get a new one).
- Zinc Web relay: `--browser extension` renders pages in your own Chrome through a small Chrome extension (`app/web-relay/extension`), so sites that refuse headless Chrome (Cloudflare, Reddit, Leboncoin) open with your sessions; its popup turns it off and sends the current tab to the reMarkable.
- reMarkable: AppLoad (the Zinc build) can pin apps to the tablet's sidebar: each app listed in `pinned.json` gets its own entry under AppLoad's and opens with one tap. Installing that AppLoad build restarts the tablet's interface once.
- reMarkable Hub: the home page is now a grid of your installed apps (tap to open), with an **Update** or **Not responding** badge; a new **Store** lists every app of the server (**All**) and manages the installed ones (**Installed**): update, rollback, channel, **Pin to sidebar** (AppLoad's `pinned.json`), **Reset data** (erases what the app saved, never your documents) and uninstall.
- reMarkable Hub: **Accueil** now shows the Hub as a widget card with the updates waiting and the apps not responding, each with **Stop**.
- reMarkable Hub: each app shows its description, author, size and what it uses (zinc.json `"permissions"`, `description`, `app.author`), and installing an app, or an update that asks for more, first shows those permissions with **Allow** / **Cancel**.
- reMarkable Hub: **Uninstall** an app (tap twice), **Clean up AppLoad** in Settings removes the Zinc tiles whose app is gone, and the Hub updates itself like any app and opens again on the new version. While an action runs, its buttons grey out. A new **Info** page shows the Hub and engine versions, the tablet's system, battery (and the Marker's, charging when attached), memory and storage. Every Hub action shows what it is doing in a modal that blocks other taps until it ends, and keeps an error on screen until OK.
- reMarkable: three fingers held on the screen for 2 s quit a Zinc app, even one that no longer answers its buttons; or press the power button twice (sleep, wake): an app that was not responding is stopped on waking.
- Stuck apps on the reMarkable: every Zinc app now runs with a tiny watcher that notices when it stops responding, uses the CPU while hidden or takes too much memory. The Hub's new **Running** page lists the apps with their state, CPU, memory and uptime and stops any of them; an app that stops responding shows at the top of the Hub with **Stop** / **Wait**. A hung app whose window you close, or that stays hung while hidden for 10 minutes, is stopped by itself.
- The Hub updates the reMarkable's engine itself: `tools/rmpp-engine --publish <hub> --token <t>` sends the engine bundle to a hub server, and the Hub app shows **Update the engine** (also when an app needs a newer engine), checks it and swaps it in, keeping the old engine if anything fails. `zinc --engine-info` prints what an engine runs.
- Writing tools for ink on the reMarkable, as the tablet's own: ballpoint, fineliner, marker, pencil, calligraphy and highlighter, the Paper Pro's colours, three widths, stroke and area erasers, undo and redo (`InkPalette` of `zinc:remarkable`, in Zinc PDF). Each stroke keeps its tool in the saved notes, the SVG export and the annotated PDF (the highlighter stays translucent in any PDF reader).
- Zinc Web: a Contrast setting (normal, high, max) darkens the page and thickens thin text for e-ink; the next screen is fetched while you read, so a page turn waits for nothing; the relay starts Chrome at once, and `--no-token` runs it without a token for a test on a trusted network.
- Zinc Web: send a page to the tablet from the Mac, with the relay's page at `http://127.0.0.1:8790/` or its **Send to reMarkable** bookmarklet; an e-ink style (on by default) makes pages black on white, underlines links and puts fixed bars and cookie banners back in the page.
- `zinc:remarkable` has `RemarkableKeyboard`, an on-screen keyboard drawn for e-paper in the tablet's language (Hub, Web and Read use it); the kit's `Keyboard` takes `labelClass`, `specialLabelClass`, `enterKeyClass`, `shiftOnClass`, `handleClass` and `shadow={false}`.
- Zinc Web: a **Reader** button shows the article alone, as Firefox's Reader View does (Mozilla's Readability), in a book-like layout for e-ink; its links still work.
- Zinc Web writes with the same tools as PDF (the **Tools** palette over the page): pens, highlighter, colours, widths, redo and the area eraser.
- Zinc Web: **Full screen** keeps only the top bar and a **Normal view** button over the page, and **A−**/**A+** draw the page smaller or larger so more of it fits on a screen.
- Zinc Web has tabs: a page sent from the Mac opens in a new tab, and the page you were reading stays in its tab at the same page; tabs are kept when Web quits.
- The web relay's page opens in the Mac's browser when the relay starts (`--no-open` does not), shows whether the tablet is connected and which page it reads, and lists what you sent with **Again**; several pages sent in a row all open.
- The web relay runs on a server (a NAS, a Pi, a VPS) as a Docker image with Chromium (`app/web-relay/docker`), so the tablet reads the web without the Mac; `--block-private` refuses pages of the local network, `--tls-cert`/`--tls-key` serve HTTPS, `--no-sandbox` runs Chromium in a container.
- Typing on the reMarkable Paper Pro: the Type Folio and AppLoad's on-screen keyboard type into Zinc apps' text fields (letters, accents, arrows, Backspace, Return, shortcuts). `"display": { "keyboard": true }` in zinc.json makes `zinc-tile` ask AppLoad to show its keyboard for the app.
- `<ZoomView>` of `zinc:ui/kit`: pinch, pan, double tap and Ctrl/Cmd + wheel zoom for a page, a picture or any content. While the fingers move it scales the last picture instead of drawing the content again, and tells your app the new view once, when they lift (`onView`).

### Changed
- `zinc:ipod`: `ZINC_IPOD_ROOTS` (for tests) now replaces the folders `detect()` looks in instead of adding one, so a test never reads a real iPod that is plugged in.
- Deterministic runs (`ZINC_DETERMINISTIC`, `zinc test`, `zinc capture`) wait for a plugin's background jobs (zinc:ipod's reads) at each turn of the loop, so their results show in the same frame on every run.
- Promises are lighter: an async function, `then` or `catch` no longer allocates an array for the value nor three closures for the promise it returns. A loop of `await`s of an async function runs about 20% faster interpreted and 30% faster compiled.
- Zinc Web on the reMarkable: thinner bars with icon buttons (finger-sized, black on white, inverted when active), and a First button that goes back to page 1 of the page.
- reMarkable Hub: checking for updates (at start and with **Check for updates**) no longer blocks the Hub; its result, or "Server unreachable", shows in the status line.
- reMarkable: a pinch or a two-finger pan uses the fast refresh while the fingers move, then one full refresh cleans the page when they lift.
- E-ink displays: frames carry an intent, `refreshIntent('interactive' | 'settle' | 'normal')` of `zinc:gfx`, which `zinc:ui` sets itself around a pinch. On the reMarkable the fast refresh starts as soon as the second finger lands and the clean refresh follows the final picture at once, instead of being guessed from the finger count and a 1.5 s timer.
- reMarkable PDF and Web: pinching and panning a page scale the page you see instead of drawing the page and your notes again at every move, so they follow the fingers; the sharp page comes once, when they lift. A double tap zooms in to twice or back to the whole page.
- reMarkable Read: pinch the page to change the text size; it is laid out again at the nearest size when your fingers lift (A− and A+ still work). The Notes example zooms its page with two fingers, up to 4×.
- `Ink.draw` of `zinc:ink` takes an optional view (`ox`, `oy`, `z`) to draw and write on a zoomed page.
- reMarkable: PDF, Read and Web draw their pages with the panel's clean UI refresh and switch to the fast Pen refresh only while the writing tools are unfolded (`setPenMode` of `zinc:remarkable`); Read has the tools palette too, and in Web unfolding it no longer renders the page again.
- A `.zapp` runs on any zinc engine that has what its program uses, even one older than the zinc that packed it: `zinc pack` writes `needs` in the manifest, and an engine that lacks something says "this app needs a newer zinc engine". The Hub tells you to update the tablet's engine instead of installing such an app.
- Writing with the pen in Zinc Web, Read and PDF is as fluid as in notes: the page and your finished strokes are kept as one picture and only the new bit of the stroke is drawn. `Ink.drawOver` of `zinc:ink` does the same for your own app's ink over a page.

### Fixed
- A row of a virtual list (`VirtualList`, `ui.virtualize`) whose class changes (a selection, a hover style) keeps its place: it no longer jumps to the top of the list and leaves a gap.
- `zinc:net`: `fetch` with `bodyBytes` sends the bytes as they are; bytes 0x80 and above were turned into U+FFFD, so an uploaded song or picture arrived damaged.
- A function expression that uses variables of the function around it, passed where a slightly different function type is expected (a `sort` comparator declared `: i32`), no longer stops the compile with "invalid IR".
- `zinc:net` servers and fetches work on QuickJS (`--engine quickjs`): its functions were missing there, and a program that only listened ended at once.
- reMarkable: Sidecar no longer blackens the corners and borders of a light window or picture inside a dark area (black steps, a black bar), no longer draws dashes and dotted bands along the borders of dark areas, keeps dark buttons and bars as they are, dithers a screenshot posted in a dark chat as a picture, and draws thin lines solid in every grey pattern instead of dotted. A tune saved by an older Sidecar switches to "Pictures only" greys.
- `zinc:ipod`: `detect()` no longer opens the iPods over USB at every scan: it reads the system's USB list, so nothing is sent to an iPod while it is mounted, being ejected or ejected ("OK to disconnect"). An iPod not mounted shows the model its disk gave earlier in the session, else "iPod".
- iPod demo: the album grid has four columns, so a fifth album no longer runs past the window, and a page with a long line of text wraps it instead of growing wider than the window.
- `ipod.mount('')` mounts an iPod that was ejected and is still plugged in: it resets it on USB, as unplugging it does, instead of saying there is no iPod disk.
- A row whose child grows from `basis-0` (or a small basis) and holds content that wraps is as tall as that content once wrapped at the child's real width: a page with wrapping cards beside a picture scrolls to its end instead of stopping early.
- The same holds when the wrapping content sits deeper, in a column inside the growing child (a sidebar beside a page whose cards wrap), and a `flex-wrap` row in such a page wraps at the page's width instead of running past it.
- `"growDrawCommands": true` in a target of zinc.json now lets a frame's text grow too: a long list or log no longer loses its text past 32 KB ("the text pool is full"), and that warning says how to fix it.
- `c ? xs : []` compiles: the empty array takes the type of the other branch, as in TypeScript (it stopped on Z0109 "empty array literal").
- zinc:ipod prints libgpod's messages as one short line each (`zinc:ipod: libgpod: ...`) instead of blank lines and assertions at every read and save; a smart playlist rule libgpod does not know is kept as it was.
- On a Raspberry Pi, apps no longer stall for up to 170 ms once a second: the screen's driver stopped reopening every keyboard, mouse and HDMI input each second to look for new ones, and now looks only when one is plugged in.
- An app's own component named like a built-in one (`Button`, `Image`, `Input`...) and imported from a folder named `components` is the app's component again, instead of the built-in tag that refused its props with error Z0005.
- A newline in a `<Text>` starts a line, as in React Native, instead of showing as a `?`.
- `sys.onSignal` and `sys.kill` work under `--engine quickjs` (they stopped with "__host_sigWatch is not defined").
- A named function passed to a built-in array method with no other use as a value (`songs.sort(byTitle)`) compiles instead of Z0005 "this function used as a value".
- Native plugins: a record field named like a C++ keyword (`auto`, `new`, `delete`, `default`...) no longer breaks the generated header; it is `auto_` in C++.
- A `Promise<T>` made by generic code with `T = void` (`fail<void>()`, `Promise.reject<void>(e)`) is a `Promise<void>`, the same one an async function returns: it settles at the same microtask as in JavaScript, and messages say `void` instead of an internal type.
- `p.then(onFulfilled, onRejected)` takes the rejection handler (it was refused with Z0104): its result fulfils the new promise, an error in it rejects it.
- `return new Promise(resolve => setTimeout(resolve, ms))` in a function returning `Promise<void>` takes `T` from the return type instead of stopping on Z0109; `resolve()` of a `Promise<void>` (and of `Promise.withResolvers<void>()`) needs no argument and can be passed where a `() => void` is wanted.
- A function with fewer parameters can be passed where one with more is wanted (`p.then(done)` with `done: () => void`), as in TypeScript.
- An object literal passed to a generic call takes its type from the type wanted there, as in TypeScript: `return Promise.resolve({ xs: [], size: 0 })` in a function returning `Promise<Picture>` no longer stops on Z0109 (empty array) or Z0103, and its number literals take the record's types.
- Native plugins: a method that returns `Promise<void>` is accepted (it was refused with Z5011 "bad signature 'Pn'"); a plugin whose build fails is reported once instead of being rebuilt, and the index fetched, at every use; vendored C files find the headers of the plugin's `pkg` libraries.
- Sidecar on a screen (a Pi) no longer shows half of a picture, torn in tiles: a picture is shown whole at the refresh after its last piece, and the Mac keeps one picture in flight when the link is slow.
- A plugin rebuilds when a header it includes from another directory changes (display-fbdev's `../display-rmpp/stream.h`): before, the old library stayed in the cache.
- `zinc pack` no longer stops on "cannot read the library of plugin" when a plugin comes prebuilt with the engine (the Raspberry Pi image could not update to 0.9.1 because of it).
- reMarkable (header mode): Refresh works again under xochitl's header, and the page's ghosting is cleaned by its automatic full refresh, as in full screen.
- Hub server: a package altered on the server's disk no longer breaks the whole catalog (every tablet got an error); its line stays and the tablets refuse that package alone.
- reMarkable: an app with a widget (RemarkableApp) no longer comes back as a blank page when its widget or minimized pill is opened again; the pill names the app running in the window, not the one launched, and a collapsed widget is only as wide as that pill (Zinc AppLoad patch 0010).
- Pi player: a failed engine update now shows the error itself (with the exit code, or "out of memory?" when the build was killed) on up to three lines, instead of one cut-off line of compiler progress.
- macOS development and exported app bundles now declare the engine’s compiled deployment target instead of requiring macOS 11, preventing an AppKit startup abort on Catalina builds.
- macOS window loading keeps the macOS 11-only UniformTypeIdentifiers framework optional, allowing Catalina-targeted builds to use SDL’s older-system fallback.
- Loading a prebuilt plugin no longer writes an export cache into its directory, preserving signed application bundles after launch.
- JSX: `{(c ? xs : ys).map((r) => c ? <A /> : <B />)}` draws one row per item; it drew the list of node numbers as text.
- `zinc run` on Linux (and the reMarkable) applies the `"targets": {"linux": {"permissions": …}}` adjustments of zinc.json, and `--profile <name>` those of that target; it read the Windows ones.
- reMarkable: an app pinned to the sidebar shows its icon instead of a black square: the tile icon `zinc pack` makes keeps its transparency.
- reMarkable Web: a page with a long address (reddit) no longer loads over and over and blocks the app; long tab titles and addresses wrap instead of running off the screen.
- reMarkable: the Marker works in an app's widget card (it only reacted to a finger), and a minimized app no longer receives taps from the Marker used elsewhere on the tablet.
- reMarkable Read: pictures from the web (http/https, downloaded once and kept for offline reading, also for Notion pages at sync), inline `data:` pictures and file names with spaces or `%20` now show instead of a "[picture: …]" placeholder.
- reMarkable Hub: an engine published after an update made in the same session is offered at once, without reopening the Hub.
- A string read from bytes that are not UTF-8 (a binary upload read as text) no longer crashes `slice`, `charAt` and `substring`: each invalid byte reads as U+FFFD. The app hub crashed on a 39 MB engine upload.
- `JSON.stringify` of a long string with accents or other non-ASCII characters is linear: it took 19 s for 90 KB, it now takes a millisecond.
- reMarkable: tapping the tile of an app that is already running (hidden or minimised) now replaces it instead of starting a second copy, so a page sent to Zinc Web opens in the one you see.

## [0.9.1] - 2026-10-26

### Added
- App icons on the reMarkable: `zinc pack` puts zinc.json's `app.icon` (a PNG or an SVG) in the `.zapp` as a 150 px `icon.png` on white, `zinc-tile` shows it on the app's AppLoad tile, and the hub lists each app with its icon (checked against the signed catalog; a framed initial when an app has none). The hub, Zinc Web and the dashboard and notes examples have one.
- The reMarkable dashboard example saves its tasks, habits, scratchpad and focus timer as they change: it comes back as it was, and the timer keeps running while the app is closed. Its scratchpad has Clear and Refresh buttons and writes in the fast pen mode.
- reMarkable app widgets: wrap an app in `RemarkableApp` of `zinc:remarkable` with a small view (`widget={{ view, width, height }}`) and **Accueil** shows it as a card over the tablet's screen, its taps going to the running app; the dashboard example's widget has the focus timer and three tasks. Needs the patched AppLoad of `integrations/remarkable-engine/appload`.
- reMarkable app widgets fold: a tap on the card's header shrinks it to the header alone and another tap opens it again; the tablet remembers it with the card's place. The card, the minimized pill and the window bar of the patched AppLoad are smaller and thinner (64 px header, 2 px outline).
- reMarkable apps keep running in the background: the top bar of `zinc:remarkable` has an **Accueil** button next to **Quitter** that minimizes the app (`minimizeWindow()` of `zinc:gfx`; with an AppLoad that does not support it, it quits instead), and AppLoad's own `_` button now works on Zinc tiles (swipe down from the top).
- Zinc hub: `zinc run app/hub-server -- --port 8787 --data <dir>` serves your apps to paired devices: `zinc publish --hub <url> --token <t>` uploads a version (the hub checks its signature, its SHA-256 and that it is newer), a device pairs with the code the hub prints and gets a catalog signed with the hub's key, and an admin page lists apps and devices and retracts a version.
- Zinc Hub (`app/hub`), the app store of the reMarkable: set the hub server's address, pair with the code it prints, then install, update (checked at start), roll back and switch an app between stable and beta; each installed app gets its own AppLoad tile. A catalog, manifest or `.zapp` that does not match its signature or SHA-256, and a version older than the installed one, are refused with a message.
- Zinc Web reads web pages on the reMarkable: `zinc run app/web-relay` on the Mac renders them in headless Chrome at the tablet's size (grey, or colour), and `app/web` shows them a page at a time, follows a link when you tap it, zooms with two fingers or + and −, keeps your pen notes per page, exports the page with its notes as a PNG and keeps bookmarks.
- Zinc Web dashboards: **Bookmarks, Dashboard** shows a page full screen on the reMarkable and has the relay render it again every 5, 15, 30 or 60 minutes (a tap: now); the picture changes only when the page did, with a full refresh against ghosting, and **Accueil** shows its top as a widget.
- Zinc PDF (`app/pdf`) reads PDFs on the reMarkable: the PDFs of `~/zinc-docs`, a page fitted to the screen, swipe or Previous/Next and a page strip to turn pages, pinch or + and − to zoom, pen notes and an eraser per page (kept beside the document), and Export writes `<name>.annotated.pdf` with your notes as ink annotations any PDF viewer shows. It comes back at the page and zoom you left.
- `zinc:pdf` opens PDF files with PDFium: page count and sizes, a page or part of one drawn into an image at any scale, ink annotations, and saving a copy. `plugins/pdf/vendor/fetch` downloads PDFium's pinned library for macOS and Linux arm64.
- Zinc Read (`app/markdown`) reads Markdown on the reMarkable: a library of `.md` files in `~/zinc-docs`, pages turned by swipe or button, a table of contents, links between documents, task boxes ticked into the file, text size and pen notes per document; Notion pages (an integration token and a page link in Settings) are imported as Markdown and read offline, **Sync** refreshes them. Programs parse Markdown with the new `zinc:markdown` module (md4c).
- `crypto.subtle` (`zinc:subtle`) signs and verifies with Ed25519: `importKey('raw' | 'raw-private', ..., { name: 'Ed25519' })`, `generateKeyPair`, `sign` and `verify`.
- A `zinc:net` server accepts request bodies up to 64 MiB (was 1 MiB), and `req.rawBody` gives a binary upload byte for byte.
- reMarkable Paper Pro: zinc runs on the tablet itself. `tools/rmpp-engine` makes the engine bundle and its `deploy.sh` installs it in /home/root/zinc; there `zinc run app.zapp` draws through AppLoad or, from a `zinc-tile --session` tile, through the display lease, and `zinc pack` packs a project with no compiler on the tablet. `zinc-tile app.zapp` adds the app's AppLoad tile.
- Nova Patrol DS 0.2.6 adds depth behind the stars and along ramp slopes, with cached stereo views prepared before play.
- Zinc Go keeps the apps `zinc device deploy` sends: its home screen lists them, starts one again (its name and a loader first) or deletes it, and on iOS puts one on the iPhone's home screen as an icon that opens it (`zinc://open/<app>`, a Web Clip profile installed from Settings).
- `tools/zinc-go-iphone` builds Zinc Go from your tree, signs it with your Apple team (a free Personal Team works), installs it on your iPhone and starts it.
- `zinc:location`: the device's position on iOS and macOS (permission, current position, a watch, errors as values), a fake path for tests (`ZINC_FAKE_LOCATION`), and the `examples/geo` demo; Zinc Go links it.
- `zinc:photos` reads and writes the photo library on iOS and macOS: full or limited access, albums with counts, pictures newest first, thumbnails and whole pictures to draw, saving to the library or an album. Ask for it with `"permissions": ["photos"]` (or `"photos-add"` to save only); `ZINC_FAKE_PHOTOS=<folder>` lends a folder of pictures on a desktop. Zinc Go includes it, and `examples/photos` shows it.
- iOS: `zinc:microphone` and `zinc:webrtc` build for iPhone and iPad, so a video call (examples/webrtc-call) runs in an exported app and in Zinc Go.
- `zinc:physics2d` exposes `ContactKind.Hit` with solved approach speed for kicks, scoring and audiovisual feedback, including the browser backend.
- Buffered complete-refresh captures on 3DS (`ZINC_FRAME_CAPTURE=1`, `ZINC_PROFILE=defer`) save the last minute on exit; `tools/n3ds-frame-report` reports CPU/GPU costs, allocations, fallbacks and missed refreshes with a 60 Hz gate.
- Godot Warehouse offers finite idle/updating UI probes; `tools/bench-workflows-macos` records sequential macOS window timings, process CPU and memory with raw evidence.
- Swift Observatory and Pocket Rally accept finite background native performance probes with idle/active workloads, startup readiness and raw host tick/copy samples.
- reMarkable Paper Pro: `"display": { "ink": "session" }` runs the app under a display lease. `zinc export --target rmpp` ships the `lease` binary, and the AppLoad tile starts the app through it. The lease stops xochitl through systemd and brings it back once on every way out, also when the app crashes or hangs, when you hold the power button for 2 s, or when its time runs out. It refuses a launch beyond 2 xochitl restarts per 10 minutes or 6 per hour, and says when the next launch is allowed. Recovery commands are in docs/targets/remarkable-paper-pro.md.
- reMarkable: `"display": { "ink": "native" }` draws pen strokes through the zinc-ink lane inside xochitl when it is installed and verified for the tablet's OS, and falls back to qtfb with one message otherwise; `"ink": "session"` also accepts a supervised session with xochitl stopped. `ZINC_RMPP_INK` overrides it at launch.
- reMarkable Paper Pro: the zinc-canvas XOVI extension draws an app's pen strokes in xochitl's own Pen mode with xochitl running, so `"ink": "native"` works on OS versions where the zinc-ink lane cannot (install it with `integrations/remarkable-ink/install.sh canvas`). With it loaded, the display lease brings back the document xochitl had open when the session ends.
- Zinc Hub: **Open** runs an installed app in the hub's own AppLoad window, and the hub comes back when the app quits (`zinc-tile` launchers read `ZINC_NEXT`).
- reMarkable: the screen gets a full refresh by itself once partial updates add up to one screen or 300 updates and the pen has rested 1.5 s (options `full_after_pct`, `full_after_updates`, `full_idle_ms`); `refreshDisplay()` of `zinc:gfx` asks for one (Notes has a Refresh button). Needs AppLoad 0.6.0 for apps on qtfb.
- reMarkable: `"ink": "native"` finds AppLoad 0.6.0's framebuffer again; the ink canvas and lane stayed off ("qtfb buffer") because AppLoad now names its shared memory with a random key.
- reMarkable: the display driver knows the Paper Pro Move and the Paper Pure (their AppLoad framebuffer formats), and draws on the reMarkable 2 through rm2fb when it is installed; an unknown model runs on AppLoad's framebuffer with a message naming it.
- PSP and PS Vita: a project's asset groups (`packs/<group>.zpk`) are read from the memory stick or the app's folder while the program runs, on a reader thread, as on the 3DS. `tools/console-demos` writes them beside the PSP's `EBOOT.PBP` (with `default.zpk`, which the EBOOT no longer carries) and into the Vita's .vpk.
- The `night` option of a picture's asset rule accepts `{base}`, the file name before its first dot: `"night": "{base}.night.png"` pairs `b12.near.png` with `b12.night.png`.
- Tokyo draws its near level on the PSP and the PS Vita, and its first frames behind the loading screen: no more hitch when the flight starts.

### Changed (breaking)
- reMarkable: the `display.direct` option is gone; use `"ink": "native"` (the ink lane replaces the experimental direct bridge, which never loaded).

### Changed
- zinc:3d `World.select()` chooses the same as before for less: 2.7 ms a frame instead of 3.5 for Pocket Tokyo on the PSP (PPSSPP).

### Fixed
- reMarkable (header mode): Refresh works again under xochitl's header, and the page's ghosting is cleaned by its automatic full refresh, as in full screen.
- The reMarkable top bar shows the battery level on the tablet (it showed "Battery —").
- PSP and PS Vita: the device player's waiting screen shows its text (address, pairing code) instead of a blank screen.
- Console players (3DS, PSP, Vita): a program reads the files of its project's `assets/` folder (`zinc:assets`, `loadObj`) under `zinc dev --device` and `zinc device deploy`, instead of failing with ENOENT.
- `zinc dev --device` and `zinc device deploy` to a console player refuse a JavaScript project (QuickJS) before sending it, with the reason, instead of "cannot read ./dev/program.zbc", and warn about each plugin the player lacks (`zinc lint --target <profile>`); on the console, a missing module is "not available on this device (profile n3ds)".
- `zinc --version` of a build tree follows the checkout: the version is read again when HEAD moves, not only when the tree was first configured.
- Zinc Go on iOS: adding an app to the home screen no longer leaves Safari waiting on 127.0.0.1 (Zinc Go keeps serving the profile while Safari is in front).
- Zinc Go: after an app ran, the home screen no longer draws its texts in that app's font sizes (the font caches start again with each program's fonts), and it scrolls when it is longer than the screen.
- The iOS export uses the texts of `permissionStrings` in zinc.json for the system's permission questions (it wrote a default text), and asks for the motion sensors with `"motion"`.
- `zinc export --target ios`: `-DZINC_BUNDLE_ID=` signs the app under another bundle id, for a team other than the one that registered `app.id`.
- reMarkable Paper Pro: fast drawing on qtfb asks AppLoad for its fastest pen waveform (ufast) instead of the slower fast mode.
- Nova Patrol and Nova Patrol DS 0.2.5 trigger powered bumper/slingshot rebounds, scores, target drops, flashes and sparks from actual Box2D impact events. Solved hit speeds replace pre-solve snapshots; the optimized collision stepping is preserved.
- The browser Physics2D shim implements the packed `stepState` protocol used by the shared plugin.
- 3DS: Tokyo no longer runs out of memory and crashes after a long flight on an original 3DS (the heap broke into pieces too small for the next ground picture). The interpreter gives back 12 of the 16 MB the runtime kept, the GPU gets 24 MB, and a picture's copy leaves the heap once it is on the GPU: about 18 MB of heap stays free. A streamed block waits for its ground picture before it draws (the coarser level shows meanwhile), and no picture is freed or rewritten while the GPU may still read it, the likely cause of blocks flashing white while scrolling. An out-of-memory on the card's reader thread ends the program with its message, without the crash. Tokyo draws Pocket Tokyo's 40,000 triangles on the 3DS (55,000 ran at about 20 fps).
- 3DS: the device player's waiting screen writes in a font twice as large, readable on the console.
- Nova Patrol DS 0.2.4 removes redundant physics subdivisions during fast free flight; Box2D CCD handles board contacts, with local guards for nearby ball pairs and slow balls hit by moving mechanisms. Pinball game/effect random streams now replay consistently across engines.
- 3DS: a zinc:3d world (Tokyo) no longer crashes a real console with a data abort at the end of its draw; the device player's waiting screen wraps its pairing line instead of cutting the code off.
- Nintendo 3DS GPU submission avoids flushing the entire linear heap each frame. Nova Patrol DS 0.2.3 caches fixed lamp contours, reduces Box2D bridge traffic, and shifts the FPS label right.
- 3DS: Tokyo runs on an original 3DS, 2DS or 3DS XL (it froze on a black screen there): `tools/console-demos` writes its `default.zpk` to the SD card beside the `.3dsx` (`3ds/<name>/`) instead of linking it in, and a program gets 22 MB of GPU memory and the rest as heap. When memory runs out, the program now says so and returns to the Homebrew Launcher. The device player's waiting screen shows its address and pairing code again (it was blank). The log has a `n3ds: old|new, app, heap, linear` line, and `tools/console-run` gives a program only an Old 3DS's 64 MB in Azahar.
- `zinc export --target rmpp` links the reMarkable display driver: the exported app opened no screen on the tablet and quit after a second.
- reMarkable Paper Pro: `"ink": "session"` runs on OS 3.29: Quill's library is patched for the new display engine. The launcher accepts every OS version that has been tested and names the tablet's engine when it refuses one.
- reMarkable: buttons react to finger taps and to the Marker again; a release was reported at the screen's corner, so no tap ever clicked.
- reMarkable: `"ink": "session"` now draws through Quill on the tablet: the export ships `launch.sh` and Quill's `libquill.so` beside the app and the lease, and the lease checks the tablet's vendor library and hands the app what it needs. `deploy.sh` copies them with `scp -O` (the tablet has no SFTP server).
- Nova Patrol DS 0.2.2 reduces CPU work with a 240 Hz base physics clock while retaining adaptive fast-contact steps and Box2D CCD, and shows refresh FPS on the bottom screen. 3DS builds no longer add an 8 ms per-eye delay on top of display synchronization.
- Console GPU polygon cache keys no longer depend on the previous polygon’s point count. 3DS profiling now reports GPU versus software surfaces.
- `zinc export --target rmpp` writes the AppLoad files again: `external.manifest.json`, `icon.png` (zinc.json `app.icon` when it is a PNG), and `deploy.sh`, which copies the app to the tablet.
- zinc.json `"3d": {...}` sets zinc:3d `defaults3D()`'s numbers for every machine or one profile (`"3d": {"psp": {"budget": 30000}}`), read by the program on every engine and console.
- The `world` asset rule reads glTF extras: a material's `night` picture and `"glow": "night"`, a node's `reach` (a landmark with a cell of its own), and the `region` option writes one far chunk per region; textured grounds whose uvs follow x and z become top batches.
- PSP and PS Vita builds show an icon and a background in the console menu: a project puts its own in `console/` (`--art` names another folder), the others get Zinc's. Orbit, Breakout, Meadow Run, Pocket Tokyo, Paint Arena and the PSP hardware demo have theirs.
- zinc:3d's stand-in (`ZINC_NATIVE=sim`, used where the native renderer cannot be built) compiles again and selects a `World` as the native renderer does, so a streaming world runs on it.
- `zinc pack --profile psp|vita|n3ds` no longer builds zinc:3d and zinc:physics2d for this machine nor puts their libraries in the console's pack, and a native build that fails can no longer slip a plugin's stand-in into a console program unseen: the pack now says when it uses one.
- A program compiled with a plugin's stand-in because the plugin's native code did not build is compiled again on the next run instead of being reused from the cache, so the native code is used as soon as it builds.
- A compiled program (`zinc run --native`, `zinc build`) that uses a zinc:3d `World` links again on macOS instead of falling back to the interpreter.

## [0.8.2] - 2026-10-25

### Added
- Native integration demos include bounded background-window proofs and reviewed captures for SwiftUI, Godot-hosted Zinc UI and the LibGodot host.
- Pocket Rally dispatches native desktop events and accepts background Zinc button clicks; its finite native proof checks game keyboard input, GPU rendering and clean window shutdown.
- Texture rules can make `"format": "clut8"` pictures, the PSP's 8-bit pictures (a quarter of RGBA8's memory): `"night": "{stem}.night.png"` quantises a night picture with it into a second palette, and `"colors"` caps the palette.
- PSP: a zinc:3d World draws its clut8 pictures with the day's and the night's palettes mixed by `World.setNight`, so the dusk is a smooth blend instead of a switch, and draws the sun's shadows of `World.shadows` on the ground and the roofs (a ground picture of at most 128 colours), as the 3DS does.
- zinc:3d `World.clearShadows()` turns a world's shadows off and frees its heights.
- examples/tokyo on the PSP: shadows that follow the clock (the panel's Shadows button, `ZINC_TOKYO_SHADOWS=0` to start without), a smooth dusk, and ground pictures four times as detailed in half the memory.
- zinc:3d `defaults3D()` gives each machine's numbers for a large world (the PSP's, 3DS's, Vita's, Pi's and the desktop's reaches, triangle budget, haze, frame rate, night, sky, chunk idle and read times); `new World(asset)` applies them and `world.serve()` reads the chunks it asked for. `ZINC_3D_PROFILE=psp` tries a console's on a desktop. A World's default reaches and budget are now the desktop's (600 m, 2000 m, 400000 triangles).
- The 3DS streams a world's near level from the SD card: an asset group the console's pack leaves out is written by `tools/console-demos` as `3ds/<name>/<group>.zpk` beside `3ds/<name>.3dsx` (copy both), read by a thread ahead of the frames into 40 slots (`World.slots`, `defaults3D().slots`), so Pocket Tokyo draws its near city there too.
- An asset rule `"as": "world"` turns any glTF or GLB scene (or a `.world.json` listing several) into a zinc:3d world: cells of `cell` metres, near, mid and far levels (`_LOD1`/`_LOD2` nodes, else simplified), walls by compass sector, per-target `levels` and picture options, and a `.zworld.json` saying where each source node went.
- The pinball demos share `examples/pinball-kit`: Box2D for Nova Patrol and Nova Patrol DS, Jolt for the 3D tables, reusable table geometry and validation, and a fixed simulation clock with ball interpolation. New graphics console cores link Box2D too; existing cores need rebuilding.
- Refreshed pinball cabinets: clearer score panels and launch instructions, Kenney CC0 ball and spark sprites, darker Tidal Lock art, and mechanical bumper and slingshot recoil.
- `tools/build-console-core <psp|vita|n3ds> --aot <project>` compiles the program into the console build instead of interpreting it (PSP, PS Vita, 3DS): about 1.8 times faster program code, and a smaller binary.
- `examples/swift-observatory` builds a macOS SwiftUI app with a live embedded Zinc scene, native speed/pause controls and two-way object selection.
- Godot scene publication preserves `zinc_world` cell/LOD metadata, explicit dynamic subtrees and static source identities for the shared world asset build; invalid settings retain the previous publication.
- Zinc Pocket Rally (`examples/zinc-libgodot`) packages an experimental Godot 4.6 runtime with Zinc navigation, real GDScript gameplay and bounded pause/speed/reset commands in one native desktop host.
- Godot Warehouse (`examples/godot-zinc-ui`) hosts a real Zinc inventory/search/settings interface in a native GDExtension, with bidirectional game actions, focus routing and premultiplied transparent output.
- Parcel Yard (`examples/godot-to-zinc`) exports an editable Godot scene with stable object IDs and shared assets, then runs Zinc-written movement and gate interactions without Godot. Unsupported behavior fails before publication.

- Native hosts can drive one Zinc program offscreen through a C surface API, with input, resize, pause and premultiplied alpha output.
- Blender scene world collections now build through the existing streamed world importer, preserving authored object and static collision provenance for Inspector picking.


- Lantern Post is a playable Blender-authored courier game with a skinned companion, three deliveries, source/collision inspection and safe scene/clip reimport. `zinc:animation/scene` loads independently animated scene instances.

- `zinc:animation` plays real skinned GLB characters with named clips, crossfades, safe seeking, marker events and bone sockets. The Blender companion animation lab includes editable source and playback/debug controls.

- Blender scene publications validate world cell sizes and retain source identities for static world baking; unbuilt world revisions are rejected safely while the world importer is pending.
- Blender and Godot authoring tools can publish validated `zinc.scene` scenes; `zinc:3d/scene` loads shared models and preserves compatible gameplay state when a revision is reimported.

- Debug and measure a paired device from your computer: `zinc dev --device <name>` puts the program's inspector on `localhost:9229` here (open `chrome://inspect`), `zinc device <name> profile <app>` runs the app with the frame profiler and brings back its summary and its trace (for Perfetto or `chrome://tracing`), `zinc device <name> bench` runs the render benchmark suite there and writes its JSON here, and `zinc device <name> deploy --no-run` installs without starting.
- `zinc dev --device` puts a dev bar across the top of the device's screen: X quits back to the player, the time, and a menu to restart the program, show the performance panel or save a screenshot. `ZINC_DEV_BAR=1` shows it over any app.
- examples/tokyo: Pocket Tokyo's flight over Shiba and the Tokyo Tower (PLATEAU and OpenStreetMap buildings) on zinc:3d, one program for the Mac, the Pi, the PSP, the Vita and the 3DS with per-device levels of detail and triangle budgets; `examples/tokyo/tools/city-world.py fetch` then `build` makes the city as a zinc:3d world.
- examples/tokyo has a control panel: the 3DS's touch screen, an overlay that Select (Tab on a computer) opens elsewhere. It flies the eye to Tokyo Tower, Zojo-ji, Shiba Park, Hamamatsucho, Shiodome, Takeshiba pier or Shinbashi on a small map, sets the time of day, the haze, the triangle budget, the shadows, the readout and the 3DS's stereo picture, and switches between the guided tour and free flight.
- zinc:3d `World` on the 3DS draws as Pocket Tokyo does: small vertex programs per kind of surface, a light per compass sector, shadows of the sun over a height map (`world.shadows(...)`) and a smooth dusk (`world.setNight(n)` now takes how far the night has come, 0 to 1).
- On the 3DS, pictures packed as ETC1 (an asset rule's `"format": "etc1"`) are drawn as ETC1 with their mipmaps: a quarter of the memory of RGBA8.
- zinc:3d `World` draws a large static world from a `.zworld` file: it chooses natively, each frame, the cells in view, their level of detail by distance, the walls facing the eye and the chunks to load and free, within a triangle budget, and draws only those index ranges.
- zinc:3d has fog: `scene.fog = new Fog(color, near, far)` fades what is between `near` and `far` (view depth) into `color`, as three.js's Fog, on the GPU, in software and on the PSP, PS Vita and 3DS. `material.fog = false` keeps a sky out of it.
- zinc:3d no longer recomputes the matrices of nodes that have not moved, which cost the PSP a native call per node each frame.
- zinc:3d's `loadModel` reads a `.zmesh` file in one call instead of one call per byte: a 50 KB model no longer stalls a PSP frame for about 200 ms.
- An asset rule's `targets` object gives options for one target only (`"targets": { "psp": { "maxSize": 64 } }`), and `"skip": true` leaves a file out of that target's packs.
- `zinc pack --profile <console>` packs the assets built for that console instead of this computer's.
- `zinc dev --device` tells each start phase by phase: packing here, sending, starting there, the device's own steps (a plugin built there shows with its time) and the first frame on its screen, then the total from the save.
- `zinc device <name> update --local` puts the engine of your zinc source tree on a Linux device without a release: it builds the package for the device (`tools/build-linux`), sends it, and the device's agent and the apps it starts run on it. `--local --remove` goes back to the installed engine; an engine that cannot start is set aside by itself.
- `zinc dev <project> --device <name> --perf` shows the performance panel over the program on the device, and `--live` opens the device's screen in a window here for the session. `zinc dev --perf` shows the panel on this computer.
- Raspberry Pi: the player's home lists the six apps sent last, newest first, with their icons (zinc.json `app.icon`); a tap starts one, Edit deletes one after a confirmation, and past six a + opens all of them. An app sent by `zinc dev --device` now stays on the Pi after the session, marked DEV.
- Nintendo 3DS: hold START and SELECT for a second to leave a program and go back to the Homebrew Launcher.
- PS Vita: zinc:3d draws on the GPU (GXM) in the default core: lights, flat and smooth shading, vertex colours, textures, blending and emissive colours, composed with the 2D frame; `ZINC_3D=software` keeps the CPU renderer. examples/3d/cubes takes 0.7 ms a frame instead of 6.7 in Vita3K.
- PS Vita: the default GXM core draws rounded rectangles, borders, shadows, filled paths and vertical and horizontal gradients on the GPU, like the PSP and the 3DS; such frames were drawn in software before. A frame with a radial gradient, a rounded clip or a rotation still is. `ZINC_VITA_GPU=0` keeps the software path.
- Zinc Player for the PSP, the PS Vita and the 3DS: start it on the console, pair with `zinc device pair <address> <code>` (the code is on its screen), then `zinc device deploy <project>` sends and runs your program there, and `zinc device logs`, `stop`, `run`, `shot` and `zinc dev --device` work as with any device.
- Zinc Go is a device of `zinc device` too: its home screen shows the phone's name, address and a pairing code; `zinc device pair <address> <code>`, then `zinc device deploy <project>`, `zinc dev <project> --device <name>`, `logs`, `stop`, `run` and `shot` work on the phone as on a Raspberry Pi. On Android `zinc device list` finds it on the Wi-Fi; over USB, `adb forward tcp:7733 tcp:7733` and pair with `127.0.0.1`.
- HP TouchPad (webOS): `tools/webos-player build`, `install` and `start` build and run a first Zinc Player there, without a screen yet (programs print, they do not draw): pair with `zinc device pair <address> <code>`, then `zinc device deploy`.
- `tools/build-console-core <psp|vita|n3ds> --player` builds the Zinc Player (EBOOT.PBP, a VPK with its own title id ZNPL00001, a .3dsx).
- PSP, PS Vita and Nintendo 3DS: zinc:3d (meshes, lights, textures, `render()`) runs in the console cores; it drew nothing there before.
- New demo `examples/3d/orbit`: a ringed planet, moons, a space station and an asteroid belt in zinc:3d, for the desktop, the PSP, the PS Vita and the 3DS (in stereo there). zinc:3d's `gpu()` says whether a GPU draws.
- PSP and Nintendo 3DS: vertical and horizontal gradients are drawn on the GPU; a frame with one was drawn in software before (only radial gradients still are).
- PSP: zinc:3d draws on the GE (hardware transform and lighting) instead of in software: the cubes demo renders in about 6 ms a frame instead of 30. `ZINC_PSP_GPU=0` keeps the software renderer.
- Nintendo 3DS: zinc:3d draws on the PICA200 instead of in software, on both eyes in stereoscopic 3D: the cubes demo renders in about 2 ms a frame instead of 25. `ZINC_N3DS_GPU=0` keeps the software renderer.
- Three games for the Nintendo 3DS's two screens, in stereoscopic 3D: Nova Patrol DS (`examples/n3ds-pinball`, the space pinball's table across both screens), Meadow Run 3D (`examples/n3ds-platformer`, the level on top, the map and the stylus look-around below) and Starfall (`examples/n3ds-starfall`, draw lines with the stylus to throw falling stars back into their constellation).
- `zinc:lan`: UDP (broadcast included) and TCP sockets that you poll once a frame. The same calls work on a desktop and on the PSP, PS Vita and 3DS. On the consoles, `up()` joins the Wi-Fi first: a PSP uses its first network setting. See `docs/plugins/lan.md`.
- `examples/lan-arena` (Paint Arena): a paint-ball match in a raycast 3D arena. The Mac hosts it, and PSP, PS Vita and 3DS players on the same Wi-Fi find it and join. Bots fill in when you play alone.
- PSP: a zinc:3d `World` is drawn the way Pocket Tokyo draws its city (vertices of 8 and 12 bytes, one light per wall direction, two depth ranges for a 6 km view): examples/tokyo renders in 1.3 ms a frame instead of 3.2, with Pocket Tokyo's 42,000-triangle budget, and now shows the night.

### Changed
- Calls from a program into a native plugin are cheaper on the consoles, and zinc:3d places its nodes in single precision on the PSP, which has no double-precision hardware: Orbit's 3D work takes a quarter less time a frame on a PSP.

### Fixed
- reMarkable (header mode): Refresh works again under xochitl's header, and the page's ghosting is cleaned by its automatic full refresh, as in full screen.
- Nintendo 3DS games use elapsed time in stereo, fixing doubled gameplay speed and excess physics work. New Nintendo 3DS also enables its supported faster CPU/cache mode. Nova Patrol DS 0.2.1 includes these fixes.
- Nova Patrol DS 0.2: use the compiled `--aot` console build, skip unchanged Box2D bridge writes and stationary flipper geometry, and apply a smaller 3DS effect budget. The dual-screen view now displays the textured bumper caps, mechanical recoil, Kenney spark sprites and refreshed score panels.
- Pinball flippers stop transferring energy when held at rest, fast multiball contacts use travel-limited steps, and separating 3D contacts no longer trigger active kicks. Nova Patrol's target bank and ramp lip no longer trap slow balls.
- Nova Patrol starts with `--engine quickjs`; its control hints now show keyboard, touch and gamepad inputs together.
- `zinc device <name> <command>` works again for a device named like a command (`bench`, `top`...): the name comes first.
- Linux packages for ARM and the other architectures built on another machine (`tools/build-linux`) now hold the plugins' libraries for that architecture: the first program run on a Raspberry Pi after an install or an update no longer compiles plugins for minutes. Plugins that need a system library (zinc:video, zinc:ffi...) are still compiled on the device; `sizes-linux.json` names them.
- Nova Patrol DS (`examples/n3ds-pinball`): the ball shows on the 3DS; its picture was left out of the package.
- `zinc device screen --live`: a second viewer of the same device used to freeze the first window without a word; the first one now says another viewer took the screen and ends.
- Nintendo 3DS: a zinc:3d view on the GPU updates at every frame with the 3D slider down; it showed a new picture only when something else on the screen changed (2 or 3 a second in Orbit).
- PSP, PS Vita and Nintendo 3DS: a native module call that changes an array argument no longer crashes the console (zinc:3d's scenes compute their node matrices that way now, about twice as fast on a PSP).
- `zinc device deploy` to a player (a console, Zinc Go) no longer refuses a program that uses a native plugin the player has (it read the target's name as the plugin's).

## [0.8.0] - 2026-10-25

### Added
- `zinc device <device> screen --live` shows the device's screen in a window on your computer, live, and your mouse and keyboard drive it: the player of a Zinc Pi image, an app, a `zinc dev --device` program. Close the window to stop.
- PS Vita: `tools/build-console-core vita --vitagl` builds a core that draws everything on the GPU through vitaGL (rounded corners, gradients, shadows and paths included); the default GXM core stays faster for games. It needs `libshacccg.suprx` extracted on the console (ShaRKBR33D); without it the core draws in software.
- PSP: the console core draws zinc:gfx frames on the GE: rectangles (rounded ones too), borders, shadows, filled paths, images, sprites and text. A frame with a gradient, a rounded clip or a rotation is still drawn in software and shown by the GE. `ZINC_PSP_GPU=0` keeps the software path.
- zinc:hardware's `setStereo` documentation and the hardware-n3ds demo shift a thing in front of the screen right for the left eye; they said the opposite, so near things looked behind the screen. The demo has a new "3D object" page: a cube turning half out of the screen among stars and orbiting balls, its pivot tilted with the circle pad, L and R moving it in depth.
- Nintendo 3DS: `tools/build-console-core n3ds --title NAME` names the app in the Homebrew Launcher; every core was called "zinc-core" there.
- Nintendo 3DS: the console core draws zinc:gfx frames on the PICA200 through citro3d, the same way as the PSP, both eyes of stereoscopic 3D and the bottom screen included. `ZINC_N3DS_GPU=0` keeps the software path.

## [0.7.6] - 2026-10-24

### Changed
- The macOS downloads (Intel and Apple silicon) run on macOS 12 Monterey and later; they needed macOS 13.3 before.
- `zinc device <pi> update` on a Zinc Pi image installs the newest release the way the player's update page does (engine, player and system together) instead of asking for a manifest address.

### Fixed
- reMarkable (header mode): Refresh works again under xochitl's header, and the page's ghosting is cleaned by its automatic full refresh, as in full screen.
- Nintendo 3DS and other consoles: a program leaving the console core stops the GPU and the screens first; on a real 3DS XL, going back to the Homebrew Launcher after a heavy run crashed the console.
- Updating a Zinc Pi image from its player no longer stops at "The rebuilt player did not draw its test frame": the screen driver now writes `ZINC_SHOT` pictures. The update to 0.7.6 works from a Pi on 0.7.4 or 0.7.5.

## [0.7.5] - 2026-10-24

### Added
- `zinc device <device> screen [file.png]` captures what the device's screen shows now, whoever draws it: the player of a Zinc Pi image, an installed app or a `zinc dev --device` program.
- `zinc dev --device` shows what it does: packing the project, the transfer's progress, and on the device the plugins being compiled (a Pi takes seconds per plugin).
- The Pi image builder shows how far the long steps are (download, unpacking, checksum, compression): percent, MiB done and the time left, under the step and in the progress bar.
- The Pi image builder shows which Zinc version (engine and player) the image will carry, and the build log names it.

### Fixed
- reMarkable (header mode): Refresh works again under xochitl's header, and the page's ghosting is cleaned by its automatic full refresh, as in full screen.
- `zinc pack`, `zinc dev --device` and `zinc device deploy` carry what a project needs beyond its own code: its own plugins (`plugins/`), and for a JavaScript project (a `.js` entry) its sources, its `node_modules` (linked packages included) and the libraries its `importmap.json` names outside the project (three.js, PixiJS).
- A project on QuickJS (`"engine": "quickjs"` in zinc.json) runs from `zinc pack`, `zinc dev --device` and `zinc device deploy` as it does with `zinc run`: the package carries its sources instead of compiling them for the typed engine, which refused what QuickJS accepts (examples/fatty's circular imports).
- `zinc pack` of a project whose assets include a link to a file elsewhere (the hero demo) makes an archive that runs: it named the file outside the archive, which `zinc run`, `zinc dev --device` and devices refused.
- `zinc:link` (and the demos that use it, like music-tree) compiles on a Raspberry Pi: the Linux ARM downloads lacked the headers it needs.
- `zinc agent` started before the network (a Pi at boot) is now found by `zinc device list` and `zinc device pair <name>`: it announces itself once the network is up.
- Pairing a reflashed device replaces its old pairing: `zinc dev --device` and `zinc device` no longer pick the dead one and fail with "does not accept this workstation's key".
- `zinc device` and `zinc dev --device` accept the device's address (`192.168.2.32`) as well as its name, and `zinc device pair <name>` falls back to `<name>.local`.
- The Pi player starts again on images built with 0.7.4: the screen driver's source was incomplete, so the player restarted in a loop. The Linux ARM downloads now carry the source of every screen driver.
- A Pi image with a keyboard layout finishes its first boot: cloud-init's config stage failed on it, so the first-boot setup never ended.
- The Pi image is built with the latest Zinc release (0.7.4) instead of 0.6.2, and each release now updates it.

## [0.7.4] - 2026-10-24

### Fixed
- reMarkable (header mode): Refresh works again under xochitl's header, and the page's ghosting is cleaned by its automatic full refresh, as in full screen.
- The Linux downloads carry their version again: those of 0.7.3 were named and reported `0.0.0-dev`, so `zinc update` and the Pi player's Updates menu could not compare them.

## [0.7.3] - 2026-10-24

### Added
- Fresh Pi images generate a unique `xxxx-xxxxxx-xxxxx` network name at first boot when Hostname is empty. It survives reboots; reflashing generates another name. Explicit profile/Imager names remain supported.
- `zinc:ui/kit` exports a reusable `Spinner` activity ring driven by the engine, with reduced-motion support.
- `examples/glass-icon-reveal` adapts Zanwei Guo's glass reveal to a native Zinc scene with GPU refraction, light/dark looks and touch, mouse and keyboard playback controls, using the shared Mac, Android and Pi shader API.
- A dedicated manual Pi image workflow produces a checked `.img.xz` for Etcher or Raspberry Pi Imager from a verified signed ARM64 engine release. `tools/pi-image configure <boot-dir> [profile.json]` applies saved login, Wi-Fi and SSH settings to a freshly flashed card without rebuilding it.
- On the ESP32-2432S022 under `--engine mquickjs`, the BOOT button is pin 0 of `zinc:gpio` (read and watch it), and holding it 3 s turns the board off, as `device.powerOff()` does; RST, or the battery's button, turns it on again. The widgets' System page has a Turn off button.
- `<ScrollView stickToBottom>` follows its end as the content grows while it shows it (a chat, a log), and stays put once the user scrolls up. `examples/esp32-ble/mac` uses it for its messages.
- An ESP32 under `--engine mquickjs` tells why its program stopped, screen or not: the exception, a loop that never ends (stopped after 10 s, with its line) or a crash of the C (from ESP-IDF's core dump, the functions named by `zinc run`). The board keeps it and tells it again at each start until another program runs; three crashes in a row put it in safe mode, where a new program can still come.
- `zinc run <app> --target esp32 --engine mquickjs --attach` reads a board that already runs, over USB or Wi-Fi, without writing or restarting it.
- The ESP32-2432S022 calibrates its touch under `--engine mquickjs`: keep a finger on the screen while the board starts and tap the five crosses it shows. The board keeps the correction (up to 45 px towards the edges on this panel) for every program; `zinc:device` reads and sets it with `touchMap()` and `setTouchMap()`, which also turn or mirror the touch, and `calibrateTouch()` restarts the board into the crosses (the Calibrate button of `examples/esp32-widgets`' System page).
- `examples/touch-check` measures how precise a touch screen is over several rounds of crosses, shows its distortion, fits the map that corrects it with a confidence that rises as the rounds agree, and applies it on the board. `zinc:lvgl` gives the pointer in the display's pixels with `pointerX()`, `pointerY()` and `pointerDown()`.
- The website offers English, French, Spanish, Italian and German navigation, getting started pages and guides, with a language switcher.
- Zinc Pi Image can save named presets of all image settings and restore them from a list. The latest edits return when the app reopens; save failures are shown instead of being silently ignored.
- The Pi player's Updates menu checks for releases for its architecture, installs a chosen newer or older engine after verifying its signature and rebuilding the matching player bundle on the Pi, and restores the previous engine and player if startup fails. An icon appears when an update is available; the saved previous version can also be restored from the menu.
- The Pi player's Wi-Fi settings can restart the network services after confirmation and scan again, without rebooting the Pi.
- `examples/fatty` ports the complete 2013 Flash/Starling game to TypeScript on Zinc/QuickJS, keeping its package structure, comments, original graphics, animations, bitmap font and music; the Top 5 is saved locally.
- `examples/kanban` is a native project board over the Zinc backlog: drag and reorder cards, search and filter tasks, open their details, and watch declared agent assignments change live. Demo moves stay local and never edit the backlog.
- Zinc speaks English, French, Spanish, Italian and German: `--lang fr` on any command or `ZINC_LANG=fr` for one, `zinc config set lang fr` to keep it; otherwise it follows the language of your system. The first messages are translated (an unknown command, a usage error, `zinc new`); error codes, commands and options stay as they are.
- `zinc new` with no argument asks what you want to make (the arrow keys and Enter, or a number) and the name of the folder; in a script it prints its usage and writes nothing. It ends with the next steps: `zinc dev`, the file to change, the lessons and the guide.
- The first `zinc` typed at a terminal says hello, lets you choose your language and shows three steps to start. `zinc version` prints the version.
- Zinc Atelier speaks English, French, Spanish, Italian and German: it follows `ZINC_LANG`, then the `lang` saved in `~/.zinc/config.json`, then the system language, and Tools > Language switches it at once and remembers the choice.
- `zinc:i18n` loads a program's texts from `i18n/<lang>/<area>.json`, with `{name}` placeholders, plural forms and English as the fallback.
- Atelier's start view says what Zinc is, links to the lessons, groups the examples (a 3D example is new) and offers templates: File > New Project from Template… makes a project of `zinc new` without a terminal.
- Atelier's Help menu opens the lessons (Learn), the getting started guide, the kinds of programs, the syntax, the examples and the error codes; a click on an error code in the console shows what it means; the header buttons and the engines say what they do.
- Atelier's first launch asks for the language, then a short tour shows the start view, the code, Run, the console, a mistake and its fix, completion, the palette, where the sketch runs and the templates; Skip (or Escape) ends it, Help > Tour of Atelier replays it.
- `zinc:stage`: build a program as a scene of objects, as in ActionScript 3 or Haxe/OpenFL (`Stage`, `Sprite`, `addChild`, `onAddedToStage`, `onUpdate`, `onDraw`, `numChildren`, `mouseX`...), with a light row/column layout, tap and drag zones and scroll boxes; `stage.frame(dt)` draws only when something changed, which keeps old tablets fast. See `docs/reference/stage.md`.
- `zinc tour`: a guided first walk in your terminal, in eight steps that check themselves (make a project, run it, change a line, read a mistake with `zinc explain`, Fast Refresh with `zinc dev`, a kind of program, the docs, Zinc Atelier). It keeps your place: `zinc tour --list`, `zinc tour 5`, `zinc tour --reset`.
- Two templates for `zinc new`: `canvas` (a sketch drawn with the web's Canvas API, full window, no JSX) and `stage` (a scene of objects you tap and drag, light on old tablets). A new page, *Four ways to write a program*, puts the drawing, scene, Canvas and interface styles side by side with the same small program in each, and the lessons gain a scene track and a Canvas track.
- Choose how to write it: after a game or an app with windows, `zinc new` asks for the style (Drawing, Scene, Canvas or Interface) and makes the matching template; Atelier's New sketch offers the four styles, each a small program to begin from, and its examples are grouped by style. `zinc new` copies a template's `README.<lang>.md` as the README in your language when it has one.
- `zinc migrate ui-explicit-looks --apply` writes the look `<Button>`, `<Input>` and `<TextArea>` draw today into your classes (`bg-slate-700 px-2 py-1` on a Button, the dark slate field on Input and TextArea), only where your classes leave it out, and names the classNames it cannot read; `zinc migrate` with no name does not run it.
- Style objects take what only classes could give, as in React Native: `zIndex`, `fontStyle`, `textTransform`, `textDecorationLine`/`Color`/`Style`, `textShadowColor`/`Offset`/`Radius`, `fontWeight` from `100` to `900`, `pointerEvents`, `cursor`, `shadowLevel`, and an alpha or `transparent` on `color`, `borderColor` and `shadowColor` (`'#0f172a80'`, `'rgba(0,0,0,0.5)'`).
- Style objects also take the focus ring, the field colours, the scroll bars and transitions: `outlineWidth`/`Color`/`Offset`/`Style` (`outlineStyle: 'none'` removes the keyboard focus ring), `placeholderTextColor`, `selectionColor`, `cursorColor`, `showsVerticalScrollIndicator`/`showsHorizontalScrollIndicator` (also as ScrollView props), and `transitionProperty`/`Duration`/`TimingFunction`/`Delay`. New classes to match: `outline-dashed`, `outline-dotted`, `outline-solid`, `placeholder:text-*`, `caret-*`; zinc:react-native's TextInput takes `placeholderTextColor`, `selectionColor` and `cursorColor`.
- Style objects take `position: 'sticky'`, as the `sticky` class.
- A `zinc:stage` scene fits inside an interface: `<Canvas onDraw={(x, y, w, h) => stage.drawIn(x, y, w, h)} />` draws it in the Canvas's box (taps on its sprites stay inside it), and `stage.update(dt)` in `render`'s frame function moves it.
- A new page, *Beyond the components* (`docs/start/beyond.md`), for when the ready-made elements are not enough: a chart drawn in a `Canvas` with `zinc:gfx` and with the web's canvas, styles as objects, components of your own, transitions and `Animated`, a scene inside an interface and an interface inside a scene; seven small programs to run in `docs/start/samples/`.
- A Raspberry Pi image that boots straight into a Zinc app: `tools/pi-image build [profile.json]` makes it from Raspberry Pi OS Lite in Docker (board, screen, user, SSH, Wi-Fi, libraries such as FFmpeg or gphoto2, the app to start) and writes the `.img.xz` with its Raspberry Pi Imager entry; `tools/pi-image check` looks inside a built image. When the app crashes, the Pi shows its exit status and last lines and can start it again.
- Zinc Pi Image (`zinc run image/builder`): the same build from a window, with the settings of Raspberry Pi Imager, a progress bar and the build's log.
- The Pi image's home screen: a welcome page that shows how to send an app from your computer (remote access, a pairing code), and settings for Wi-Fi with an on-screen keyboard, remote access, SSH, the Pi's name, the background and restart or shut down. It works by touch or mouse; its bottom line shows the Zinc version and, while the Pi starts, what it is doing. Programs sent with `zinc dev --device` or `zinc device run` take the screen and the player comes back when they end. `tools/pi-image player` runs it on your computer.
- `zinc:network` plugin: the machine's interfaces and addresses, and listing, joining and forgetting Wi-Fi networks through NetworkManager (`docs/plugins/network.md`).
- `examples/js-spline`: scenes made in Spline (spline.design) running on Spline's own runtime, with their animations and pointer events; `examples/js-spline/pick.sh` lets you choose one of the scenes it carries or downloads a showcase of 22 more (`d`), `examples/js-spline/fetch.sh <link>` adds any scene from its Spline export link, the frames per second are shown in a corner, and `tools/test-lib spline-runtime-2.0.98` fetches the runtime once.
- A web program that needs WebGL 2 says `"requires": ["gpu>=webgl2"]`: on a machine whose GPU cannot make a WebGL 2 context it now stops with the reason (`--force` runs it anyway), and any other program gets a warning with the `null` context. `ZINC_WEBGL_MAX=1` makes any machine behave like such a GPU.

### Changed
- Use `make preflight` for local checks before release, or the manual workflow's `changed` mode with a published tag as its comparison base for affected tests without building release packages.
- Zinc Pi Image has an illustrated settings workspace with desktop checkboxes and a clearer build panel with hardware summary, animated loading and step progress, and image actions. Build output follows new lines, pauses when you scroll up, and resumes with **Latest output**.
- LVGL runs about 1.6 times faster on the ESP32-2432S022 under `--engine mquickjs` (the widgets' Bench page: 38 fps, from 24): its hottest code runs from the internal RAM instead of the flash. A plugin lists such files under `targets.esp32.iram` in its `plugin.json`.
- A program on the ESP32-2432S022 under `--engine mquickjs` has about 26 KB more memory once LVGL draws: the board's panel bus copies each area, so LVGL renders into one buffer and the firmware keeps one band. A Lottie animation now fits after the widgets' benchmark page.
- A program that styles only with style objects, never with `className`, no longer carries the class parser: about a tenth less code to compile and interpret, and a native app about 145 KB smaller (a React Native program too, sticky section headers included).
- `zinc dev --device` runs on a device whose Zinc is another release of the same series (0.6.x on both), with a note. Another series is refused with the ways out: `zinc device <name> update`, or `--force` to try anyway (the program may crash). It works with devices that run 0.6.2.
- `zinc` and `zinc help` show the commands to start with and the commands to ship; `zinc help --all` lists every command, and `zinc help <command>` gives two examples. `zinc new --list` sorts the templates by what they make, one line each.
- A misspelt command suggests the closest one (`zinc hlep`: did you mean `zinc help`?).
- `zinc doctor` starts by saying whether this machine is ready, and exits 1 when it is not. The console SDK, iPhone 4S and Rust rows moved to `zinc doctor --details`, and plugins without a ready library now say they are built the first time a program uses them.
- `zinc run` says when it builds a plugin for the first time (once, 5 to 20 s). `zinc check` prints `ok` and what it checked. `zinc dev` starts by naming the file to change and saying that Ctrl+C stops.
- Error messages speak your language: the title of every error code, the common details, the closing hint and `zinc explain` (`zinc explain --markdown --lang fr` writes the list). The start of the line, `file:line:col: error Z0103:`, stays as it is for the tools that read it, and `zinc check --json`, `zinc lint` and `zinc lsp` stay English.
- Errors say `number` where your program says `number`, not `f64`. `document`, `window`, `alert` and `localStorage` say that Zinc has no browser and what to use; `import ... from 'fs'` or `'react'` names the Zinc module (`zinc:fs`, `zinc:ui/react`), another package names `zinc add npm:<package>`; an untyped parameter or `var` in a `.ts` file says that `zinc run file.js` runs plain JavaScript.
- `zinc explain` with no code lists the codes, and takes `z0103` or `103` as well as `Z0103`.
- `zinc dev` starts a program that has not changed since its last start without compiling it again (a `zinc:ui` app with the inspector: 0.6 s to 0.02 s), as `zinc run` already did; a windowed `zinc run` on a machine with no C++ compiler does too, and a change to a `tsconfig.json`, a `package.json` or a file added beside a source now compiles again.

### Fixed
- reMarkable (header mode): Refresh works again under xochitl's header, and the page's ghosting is cleaned by its automatic full refresh, as in full screen.
- Using the result of a function that returns nothing no longer crashes the compiler: `console.log(f())` and `` `${f()}` `` print `undefined` as in JavaScript, and other uses (`[f()]`) give a Z0005 error on that line.
- Windows: plugins whose native code calls a recent engine function (`svg`, for its transforms) link again; `zinc.exe` now exports the whole engine surface plugins use.
- Windows archives include the engine import library, so plugins can compile on first use after installation.
- The Pi player uses the screen's native resolution, including 1080p. Framebuffer input now sends keyboard/text events with the configured layout, handles USB devices connected after boot, and shows a mouse cursor even while the app keeps an idle frame.
- Signed Pi updates carry the matching player sources, administration helper and session service as well as the engine; existing cards can receive these fixes without reflashing after a one-time updater-helper upgrade. Failed activation and rollback restore the previous player and system files together.
- `zinc device logs` drains output received just before a connection closes instead of occasionally dropping its final lines.
- Zinc Pi Image clears a previous settings-save error after saving succeeds again.
- Pi images apply the configured login password even when Raspberry Pi OS has already renamed the account. Failed first-boot setup now keeps cloud-init, the initramfs and the settings available for recovery instead of deleting them.
- Music Tree uses the Pi screen’s native resolution and adapts its player, navigation, grids, settings and overlays to compact landscape or portrait screens; short views scroll so controls remain reachable. Clock, weather and room-volume views also fit narrow screens.
- Pi development apps take turns on the display: the player yields before launch and returns after exit, and starting another app replaces the previous one. `device deploy` with logs stops its app on Ctrl-C; `--no-logs` leaves it running. Requires the updated agent and image session files.
- `zinc device deploy` sends Raspberry Pi projects to their installed engine by default, preserving QuickJS and avoiding a cross build and repeated engine transfer. `--target rpi` still makes a native export; preparation reports its complete duration. Missing native plugins may need a first build on the Pi.
- `tools/examples-status` respects the project's entry and engine from `zinc.json`; QuickJS projects such as Fatty are no longer checked as standalone typed programs.
- `zinc help --all` lists `mem`, and `zinc help mem` documents the memory report and `--check-leaks` again.
- `zinc tour` notices a save made while it checks the previous edit, instead of waiting for another save or Enter before continuing.
- An ESP32 under `--engine mquickjs` keeps its touch calibration, Wi-Fi networks and `zinc:storage` data when `zinc run` writes another firmware (going from one demo to another): the firmware is written around them. `zinc run` and `zinc flash` also say how long a firmware takes to write, the screen staying white meanwhile, and show its percentage as it goes (the program's too).
- `zinc run` and `zinc check` with `--engine mquickjs` no longer hang on a program with a loop that never ends: the check stops it after 10 s and names its line.
- `zinc run --target esp32` builds the firmware a program's plugins need before it writes the program, so the board no longer shows a ReferenceError ("not in this firmware") during the build.
- An animated screen on the ESP32-2432S022 under `--engine mquickjs` no longer freezes after a few seconds: ESP-IDF's driver for its 8-bit panel bus could cut a transfer in the middle of a 32-bit word, and the DMA then stopped for good.
- GitHub releases display the changelog from the tagged commit, including when checkout loses the tag annotation. Failed or unwatched releases keep their notes in `Unreleased`; reruns restore the complete release notes and only archive published entries, leaving newer edits pending.
- Nuxt UI select menus float above cards and neighbouring fields instead of being clipped by their container. Escape and clicks outside close the list.
- Kanban’s Modify action includes the existing criteria, plan, notes and result, even when a task has no description. Edit or clear these sections, edit/check/add/remove criteria, and save them back to their original Backlog.md fields.
- Kanban’s Modify action places the cursor directly in the prefilled Markdown editor, including when reopening an unfinished draft.
- Kanban cards stay visible while scrolling through long columns, and dragged cards keep the pointer's original grip with an insertion marker. The compact task window renders Markdown and lets you save the title, description and comments to Backlog.md while retaining unfinished drafts.
- When Atelier cannot find zinc, the status line says so and how to fix it, instead of "Build failed".
- `zinc:canvas` draws where it should under `zinc:gfx`'s `setTransform`: inside a `zinc:stage` sprite or a turned `zinc:ui` parent, its shapes, gradients and images were drawn at the wrong place and cut away.
- A native plugin whose library could not be prebuilt for a package keeps its sources there, so Zinc compiles it on first use: in 0.6.2 the Linux packages carried `display-fbdev` and `display-gl` without them, and a program asking for them failed with `CacheCheckFailed`.

### Changed (breaking)
- `<Button>`, `<Input>` and `<TextArea>` draw nothing you did not ask for, as React Native's: a Button is a focusable box that centres its content (no slate fill, no padding), a field shows its text, caret and placeholder in the colour and size of the text around it (no dark fill, border, radius or padding). Text with no colour is black on a light window and white on a dark one. To keep the old look, run `zinc migrate ui-explicit-looks --apply` in your project.
- zinc:react-native's `TextInput` has no dark fill any more: give it a `backgroundColor` if you want one.
- zinc:react-native's `Pressable` no longer dims while pressed and, under the react-native preset, a border with no `borderColor` is black instead of light grey, as in React Native: show the pressed state with `style={({ pressed }) => [...]}` or a child `{({ pressed }) => ...}` (both work now) or use `TouchableOpacity`, and give the border a `borderColor` to keep the grey.

## [0.6.2] - 2026-10-22

### Fixed
- reMarkable (header mode): Refresh works again under xochitl's header, and the page's ghosting is cleaned by its automatic full refresh, as in full screen.
- `zinc:icons` draws its icons on an installed Zinc: the packages lacked the Lucide icon data, so every `icon()` was `null` and every `<Icon>` empty. When that data is missing, the compiler now says so.

## [0.6.1] - 2026-10-22

### Added
- `zinc:lvgl`: `animate()` hands a property of an object (position, size, opacity, radius, rotation, scale) to LVGL, which moves it in C at every turn, with an easing, a delay, repeats and a way back: the program no longer moves objects every frame. `stopAnimation()` stops one, and `posX()`, `posY()` say where an object is. The Bench page of `examples/esp32-widgets` can hand its objects to LVGL.

### Changed
- A plugin's native function takes up to twelve arguments on the ESP32 under `--engine mquickjs` (eight before).

### Fixed
- reMarkable (header mode): Refresh works again under xochitl's header, and the page's ghosting is cleaned by its automatic full refresh, as in full screen.
- The macOS packages ship the native libraries of `zinc:link`, `zinc:webrtc` and `zinc:webview`: a program that imports them (`examples/music-tree`) no longer stops with Z5011 "no native source" on an installed Zinc.

## [0.6.0] - 2026-10-22

### Added
- `zinc run|export|flash --target esp32 --engine mquickjs`: a `zinc:gfx` program in TypeScript runs on an ESP32 on MicroQuickJS, compiled to bytecode on the computer and written to the board in a second (`zinc flash` writes the firmware once). `examples/breakout` runs unchanged on the ESP32-2432S022. A feature the board lacks fails before anything is sent, at your own file and line. AOT stays the default on the ESP32. The program runs from the board's flash, so it costs no RAM.
- `zinc run ... --engine mquickjs --emulator` runs the same program in the esp32sim emulator (built from its sources with Rust's cargo the first time), with no board: the last frame is saved as a PNG.
- `zinc run <app> --target esp32 --emulator --live` shows the emulated board's screen in a window, in real time, with the mouse as its touch screen; the UART still prints in the terminal, and closing the window (or Ctrl-C) stops it.
- On the ESP32 with `--engine mquickjs`: `zinc:gpio` (setup, write, read, watch: debounced edges from an interrupt) and `zinc:storage` (kept in the board's NVS), with timers, and a program that only listens keeps running. `examples/esp32-gpio` blinks an LED and reads a button.
- `zinc run --emulator-script <file>` drives the esp32sim emulator (pins, touches, buttons at given times); a `touch X Y 1|0` line taps the ESP32-2432S022's touch screen.
- `zinc toolchain swc`: the pinned SWC compiler, fetched the first time `--engine mquickjs` needs it.
- `zinc:ble`: Bluetooth Low Energy on the Mac (scan, connect, send and receive text over the Nordic UART Service, or advertise it), and the same API on the ESP32 with `--engine mquickjs`. `examples/esp32-ble` is a Mac app and a board that talk; `ZINC_NATIVE=sim` gives a simulated device.
- On the ESP32 with `--engine mquickjs`: `zinc:wifi` joins the saved network at each start, or opens a setup network with a captive page where a phone picks the network (as WiFiManager does), and sets the clock (`Date.now()` is then the real time); the board answers at `<name>.local`. `examples/esp32-wifi`.
- On the ESP32 with `--engine mquickjs`: `zinc:espnow` sends packets between boards with no access point. `examples/esp32-espnow`.
- `zinc run --target esp32 --host <name>.local` (or `--host last`) sends the program to a board over Wi-Fi, updates its firmware first when needed, and shows its console; a firmware that does not start is rolled back by the board.
- A program that uses `zinc:wifi`, `zinc:espnow` or `zinc:ble` gets the network firmware, which zinc writes to the board by itself; `zinc flash --target esp32 --engine mquickjs --net` writes it by hand.
- A plugin can bring a C library to TypeScript on the ESP32 under `--engine mquickjs`: its native code written in C on Zinc's native ABI (`native/<x>.abi.c`) is built into the board's firmware by zinc, with ESP-IDF installed the first time, and the same file is the plugin's library on the computer. See docs/plugins/native-esp32.md.
- On the ESP32 under `--engine mquickjs`, a plugin's native code can be C++ on Arduino's core (`native/<x>.abi.cpp`, `espressif/arduino-esp32` in its `idfComponents`): an Arduino sketch's `setup()` and `loop()` run beside the TypeScript program, and a change of the sketch rebuilds the firmware in under half a minute. `examples/esp32-arduino`.
- `zinc:qrcode`: QR codes from text (`encode`, `runs`, `wifiText`), on every engine and on the ESP32. `examples/esp32-qrcode` shows one on the board.
- `zinc check <app> --target esp32 --engine mquickjs` checks and compiles a program for the board without writing anything to it.
- A plugin's native code on the ESP32 can draw the screen itself, sending areas of pixels to the panel (`zn_panel_buffer`, `zn_panel_flush` in the firmware's `zn.h`). Plugins' C is now compiled for speed (`-O2`). See docs/plugins/native-esp32.md.
- `zinc:lvgl`: LVGL 9 widgets (buttons, sliders, switches, charts, keypads...), flex layout, smooth scrolling, Lottie animations (ThorVG) and a display that turns to landscape (`rotate`) from TypeScript, the light interface for an ESP32 under `--engine mquickjs`. LVGL draws only what changed, straight to the panel. The same program runs on the computer, where LVGL gets no more memory than the board would give it, so a screen too big for the board fails there too. `examples/esp32-widgets` is a six-page tour. See docs/plugins/lvgl.md.
- `zinc:device` works on the ESP32 under `--engine mquickjs`: the backlight's brightness (PWM), the JavaScript heap and the chip's free memory, the chip, its clock and flash size, the ESP-IDF version, the firmware's build, whether touch answered, and the last frame's time and draw commands. New everywhere: `flashSize()`, `idfVersion()`, `firmware()`.

### Changed
- Compiled programs are smaller on every target (the methods no code calls and the dispatch tables of classes without methods are left out): `examples/breakout` goes from 37.6 KB to 24.6 KB of bytecode, a large interface tour from 2.4 MB to 690 KB.
- Plugins that bundle a C library (sqlite, lvgl, audio, physics3d...) are much smaller to download and on disk: their compiled libraries no longer carry debug information. They are compiled again once.
- A program takes less memory once loaded: with `examples/breakout` loaded, the ESP32 core has 210 KB of its heap free instead of 158 KB.
- `zinc run --target esp32 --engine mquickjs` writes the MicroQuickJS firmware by itself when the board runs another one or an older one: no `zinc flash` first. Its flash now holds two firmware slots for updates over Wi-Fi, and programs moved, so the first run after this update rewrites the firmware.

### Changed (breaking)
- Programs are written in version 8 of the bytecode format: a board flashed by an older zinc refuses them and says so. Run `zinc flash --target esp32` once to write the new core firmware.

### Fixed
- reMarkable (header mode): Refresh works again under xochitl's header, and the page's ghosting is cleaned by its automatic full refresh, as in full screen.
- `zinc run --target esp32 --qemu` no longer leaves the emulator running after the program ends.
- Every engine now takes the same file for an import as the interpreter: under QuickJS, mquickjs, JSC, V8, Hermes, `zinc bundle` and the web target, an import picks the platform's file (`x.macos.ts`, `x.esp32.ts`), also for index files, `./x.js` naming `x.ts` and `tsconfig.json` `paths`; `x.ts` comes before `x.native.tsx`, and `zinc:hardware` loads. `zinc:platform`'s `TARGET` is `esp32` on the board.
- A plugin whose vendored C includes a configuration header beside `plugin.json` (such as `lv_conf.h`) is rebuilt when that header changes, on the computer and in the ESP32 firmware.
- A plugin's native code on the computer gets a monotonic clock in milliseconds from `now_ms`, which returned 0.
- A local variable or parameter named like a Web global (`screen`, `document`, `navigator`...) no longer pulls `zinc:web` into the program, which made a program fail under `--engine mquickjs`.

## [0.5.2] - 2026-10-22

### Fixed
- reMarkable (header mode): Refresh works again under xochitl's header, and the page's ghosting is cleaned by its automatic full refresh, as in full screen.

- The JavaScript engines (`--engine quickjs`, `v8`, `hermes`, `jsc`) load the display driver a project names in `zinc.json` (`"display": "gl"`): `examples/video/mapper` stopped with "symbol not found '_zgl_layers'" on all of them.
- `zinc:osc` works on the JavaScript engines: `listen` failed with "__host_oscListen is not defined", and the messages now reach its callback.
- `--engine quickjs`: a script that reads `instance.exports.` (WebAssembly) is no longer taken for a CommonJS module; it stopped with "invalid redefinition of parameter name".
- `zinc device deploy --inspect`, `zinc pack --inspect` and `zinc export --inspect` put the inspector in front of the program again: the option was lost to `zinc run --inspect`.
- zinc builds again for 32-bit Linux (armhf for the Raspberry Pi, and i686): its WebAssembly interpreter was compiled for x86_64 whatever the target.
- zinc built from source with GCC on x86-64 Linux no longer crashes while compiling a program that uses `any` or `JSON.parse`.
- A plugin that cannot start because a library it needs is missing (after a Homebrew upgrade, for example) now names that library and the command that puts it back, instead of printing the system loader's whole report.
- `++` and `--` on something that is not a variable or a property (`3++`) are error Z0004, as `3 += 1` is, instead of crashing the compiler.
- `zinc export --target web` and `zinc bundle` bundle again a package that a pnpm store or a workspace links into `node_modules` from elsewhere: its own `"imports"` (`#internal`) were not found.
- `zinc run --target esp32 --qemu` says why the emulator cannot start (its first error, a missing library for example) instead of "cannot write to the device".
- On an Intel Mac, `zinc run --target esp32 --qemu` downloads an emulator that runs there: the one it fetched was built for Apple Silicon ("Bad CPU type in executable").
- A built-in method taken as a value (`const f = s.slice`, `console.log(arr.push)`) is error Z0005 with the way out (call it, or wrap it in an arrow function): it compiled to the string's or the array's length, and printing it crashed the compiler.
- `zinc:mapping` answers every `/sync`: one sent within 100 ms of the last was dropped, so the mapper's web editor got "no answer" on every other quick refresh. It is now answered when its turn comes (still at most 10 replies a second).
- The notification relay (`examples/notify-relay`) keeps relaying after the Mac's clock goes back (set by hand, or corrected by the network): until the clock caught up, every new notification was taken for an old one and dropped.

## [0.5.0] - 2026-10-21

### Added
- `zinc run --engine jsc` (or `"engine": "jsc"` in zinc.json) runs a JavaScript program on macOS's own JavaScriptCore, compiled to machine code: about 10 times faster JavaScript than QuickJS, calls into zinc about 50 ns slower. `zinc test --runner jsc` and `zinc bundle --engine jsc` go with it. WebGL and the web environment's games (three.js, PixiJS, Phaser, p5.js) run on it.
- `zinc run --engine v8` (or `"engine": "v8"` in zinc.json) runs a JavaScript program on V8, on Apple silicon Macs for now: compiled to machine code like JavaScriptCore, with calls into zinc faster than on QuickJS. Its engine (a 14 MB download) is fetched the first time a program asks for it. `zinc test --runner v8` and `zinc bundle --engine v8` go with it, and WebGL as on the other engines.
- Experimental: `zinc run --engine hermes` runs a JavaScript program on Hermes, React Native's engine; its engine (a 2 MB download) is fetched the first time a program asks for it. Hermes has no WebAssembly or module scripts.
- `zinc run --engine hermes --inspect` opens the program to Chrome DevTools, as on V8: breakpoints in your own source files, stepping, the console; `--inspect-brk` waits at the first line. `zinc dev` does it by itself for a project with `"engine": "hermes"`.
- `zinc build` of a project on `"engine": "hermes"` precompiles it to Hermes bytecode (`build/<name>.hbc`, run with `zinc run build/<name>.hbc`), and `zinc export` puts the bytecode in the app: it starts without parsing its JavaScript. On `"jsc"` or `"v8"`, `zinc build` writes the bundled program (`build/<name>.js`).
- `zinc build` of a project on `"engine": "quickjs"` now writes the bundled program and its QuickJS bytecode (`build/<name>.js` and `build/<name>.qbc`, run with `zinc run build/<name>.qbc`) instead of a native program, and `zinc export --target macos` makes an .app that starts from that bytecode: about 50 ms sooner for hero. A bytecode file older than its bundle, or written by another QuickJS, is skipped with no error and the bundle runs.
- `zinc engine list | install | update | remove`: the engines that are not shipped with zinc (V8) are downloaded from the signed index on first use, checked (hash, signature, the zinc they were built for) and kept in `~/.zinc/engines`; `zinc doctor` lists them and `zinc run` says once a day when a newer one exists. `zinc export` of a project on `"engine": "jsc"` or `"v8"` makes a macOS app that carries its engine and may compile JavaScript to machine code.
- WebAssembly on the QuickJS engine (`WebAssembly.Module`, `Instance`, `Memory`, `Table`, `Global`, `validate`, `compile`, `instantiate`), from the `wasm` pack, an interpreter (WAMR, 0.1 MB) that is not in zinc by default: it is downloaded and checked the first time a program uses `WebAssembly` (`zinc engine install wasm` ahead of time). Offline, using `WebAssembly` says how to get it. JavaScriptCore and V8 have their own.
- `zinc run --engine v8 --inspect` opens the program to Chrome DevTools (chrome://inspect, port 9229): breakpoints in your own source files, stepping, the console. `--inspect-brk` waits at the first line. `zinc dev` does it by itself for a project with `"engine": "v8"`.
- `zinc run --engine jsc --inspect` makes the program inspectable in Safari's Web Inspector (Develop menu > this Mac), with your own source files through the source map.
- `<TextArea rows={0}>` is as tall as its text and grows or shrinks as you type, like CSS `field-sizing: content`.
- `MARK_CARET` in `ui.setMarks` draws another person's caret in a text field, and `ui.anchorOf(h)` gives the other end of a field's selection.
- `zinc:ui/dnd`: drag and drop between nodes (`draggable`, `dropTarget`, `monitor`, closest edge, `autoScroll`), modelled on Pragmatic drag and drop, the same with a mouse, a finger or a pen; `ui.nodeAt(x, y)` gives the node under a point.
- `examples/carnet`: a Notion-style block editor whose pages are Markdown files in a folder; every window that opens it edits the same pages live, with the others' carets shown.
- `zinc:loro` (also importable as `loro-crdt`): Loro CRDT documents with the loro-crdt API, maps, lists, rich text and movable trees whose snapshots and updates sync with Loro's browser, Swift and Rust clients. It needs Rust (rustup.rs) the first time a program uses it.
- A plugin can ship Rust code: `"cargo": "<crate dir>"` in a target of `plugin.json` builds the crate with cargo and links it; `zinc doctor` says whether cargo is found.
- `examples/carnet-nbe`: Carnet on its own packages (`@nbe/core`, `@nbe/markdown`, `@nbe/collab`), imported unchanged on `--engine quickjs`, with a view in `zinc:ui`; its notes are an Obsidian-style vault of Markdown files (folders, `[[links]]` and linked mentions, Cmd+O quick switcher, full-text search, changes made by other programs followed, a vault switcher that opens any folder), and two windows edit them live.
- `--engine quickjs` runs plugins that call back or return promises (`zinc:socket` servers and WebSockets, for one); a program that waits on one (a server) keeps running, and its timers keep their real delays meanwhile.
- `zinc:sqlite` is built with FTS5: full-text tables (`CREATE VIRTUAL TABLE ... USING fts5`), `MATCH`, ranking and `snippet()`.
- `--engine quickjs` runs TypeScript libraries as they are written: intersection, conditional, mapped, indexed access and template literal types, `keyof typeof`, labelled tuples, generic arrow functions, `import type X from`, `export type { … } from`, object rest patterns, top-level `await`, and CommonJS files and packages (`import x from` gives their `module.exports`). The engine of Athena Crisis and the kirari highlighter run unchanged.
- The typed engines report the TypeScript they do not compile yet as Z0005 with its name ("intersection types", "generic arrow functions"...) instead of a syntax error.
- `ui.scrollBy(h, dx, dy)` moves a scroll offset without stopping a fling in progress.
- `zinc build --no-embed` and `zinc export --no-embed` keep the baked fonts and images out of the executable, in `<name>.res` beside it.

### Changed
- `zinc build --bundle` (and the `.app` of `zinc export --target macos`) keeps the baked fonts and images in `Contents/Resources/<name>.res` instead of inside the executable.
- On macOS, trackpad and Magic Mouse scrolling follows the fingers pixel for pixel, then macOS's own momentum, so a fling glides and stops as in any Mac app; fingers on the pad stop it, and a mouse wheel notch still eases (and jumps with Reduce motion).

### Fixed
- reMarkable (header mode): Refresh works again under xochitl's header, and the page's ghosting is cleaned by its automatic full refresh, as in full screen.
- `--engine quickjs` loads a package that a pnpm workspace links in two places (`node_modules` symbolic links) once, by its real path; it was loaded twice, with two copies of its state.
- WebGL 2 on macOS: a shader with `continue` inside a `switch` now links (it failed with an empty log), and a vertex shader that returns before it writes `gl_Position` gets (0, 0, 0, 0) as in a browser instead of drawing streaks across the frame (Spline's metaball scenes showed both).
- The web environment has `IntersectionObserver`, and a library may define its own `target` on an event it dispatches: Spline's runtime did and failed with "'target' is read-only".
- With `"text": "shaped"`, a space or punctuation after an emoji is as wide as in the text around it; it took the emoji font's, as wide as a picture.
- `onCleanup` in a component rendered by a list (`{items().map(...)}`) now runs when its row goes away; it was dropped, so a row's subscriptions and handles outlived it.
- A component's `onCleanup` that reads and sets a signal no longer makes the list it is in render again in the middle of its update (the next row was built twice and one copy freed under the program).
- `zinc check` reports an error inside a class's `static { }` block (a static it assigns that the class does not declare) instead of accepting it and crashing when the program is compiled.
- A file that uses Dyn values (`JSON.parse`...) can write `T | undefined` as a type again: it failed with Z0101 "Cannot find name 'undefined'".
- Magic Mouse scrolling on macOS had no momentum at all; it now glides like the trackpad.
- `examples/agents`: scrolling up through a long conversation no longer stops dead each time older messages load.
- `--engine quickjs`: an import used only for types no longer runs its module (it could close an import cycle and stop a program with "is not initialized"), and constructor parameter properties are set after `super(...)` when code comes before it.

## [0.4.3] - 2026-10-21

### Changed
- On a Homebrew install, the update notice, `zinc update` and the formula's caveats say `brew update && brew upgrade zinc`: Homebrew reads its taps at most once a day on its own, so `brew upgrade zinc` alone could say there is nothing new.

### Fixed
- reMarkable (header mode): Refresh works again under xochitl's header, and the page's ghosting is cleaned by its automatic full refresh, as in full screen.
- `brew install` and `brew upgrade` of zinc no longer end with "Failed to fix install linkage": the plugins' libraries now leave room in their header for the path Homebrew writes into them.
- The update notice no longer announces a version found on another channel than this install's (a `zinc update <url>`, another install sharing `~/.zinc`): a Homebrew zinc could say "zinc 99.0.0 is available".

## [0.4.2] - 2026-10-20

### Added
- `zinc:ui`: `setTextRuns(node, runs)` styles parts of one text (bold, italic, monospace, underlined, a colour of its own or a scheme variable through `schemeColor`): the text wraps with each part in its font and still selects and copies as one.

### Changed
- `zinc:svg`: `Svg.draw` follows the `setTransform` of `zinc:gfx`, as the other drawing calls do. An app that added the transform's offset to the icon's position itself now draws it that far off: drop the offset.
- When a newer zinc exists, every command (not only `zinc run` and `zinc dev`) prints one dim line with the command that updates yours, whatever installed it: `zinc update`, `brew upgrade zinc`, the Zinc Atelier download, or `git pull` and `tools/build zinc` for a clone. `zinc update` on a Homebrew zinc says to use `brew upgrade zinc`, up to date or not.
- The `agents` example is laid out like VS Code (an activity bar, conversations by folder with their status, tabs, a detail panel, a status bar, light and dark), shows each tool call live as a card with its status, input and output, hangs a subagent's calls under it, and stops a turn with Escape at any time (the next message resumes the session). Its conversations are kept on disk and its memory stays flat however long they run: one turn of 20 000 tool calls and 200 MB of output keeps it under 150 MB (`tests/t1/agents_memory.sh`).
- The `agents` example draws answers as markdown (headings, lists, code blocks under their language, tables), lets any part of an answer be selected and copied with Cmd+C, and has a copy button on each answer and code block. Files, images and folders dropped on the window become references in the message (`[Image #1]`, `@src/app.ts`, `@src/`), typing `@` lists the folder's files, and each CLI gets them its own way (Claude Code `@path`, Codex `-i`, opencode `-f`).
- The `agents` example folds a turn's tool calls into one line, as Claude Code does (`Running npm test… · 12 s · 3 tools` with a turning spinner, then `Used 12 tools · 3 agents · 41 s`, red when a tool failed or the turn was interrupted; a click shows the cards), shows each turn's and each conversation's tokens, context use and cost as the CLI reports them (by model on hover, kept with the conversation), and each CLI's plan limits (the 5-hour session and the week, with their resets) as `claude -p /usage` and `codex app-server` tell them, checked every 5 minutes or as set in Settings; opencode's are shown as unknown, as it does not tell them.
- The `agents` example's model menu is a search: typing filters the models (case and accents aside, by name, id or provider), the arrow keys and Enter or Tab pick one, Escape closes it. opencode's models, OpenCode Go's included, come from its local server under their providers with their context window and price, their variants as the effort, and a turn's cost and tokens by model from its session; OpenCode Go's plan limits link to opencode's console, the only place it shows them.
- The `agents` example shows OpenCode Go's 5-hour, week and month usage with their resets, a rate-limited window in red, in the Agents panel and the status bar: it reads them from opencode.ai with the Go key `opencode auth export` gives, for that one request, never writing or passing the key on. Settings turns it off; then, or when the key is missing, expired or revoked, they show as unknown with the reason and a link to the console.

### Fixed
- reMarkable (header mode): Refresh works again under xochitl's header, and the page's ghosting is cleaned by its automatic full refresh, as in full screen.
- `zinc:net`: `fetch` no longer sends the `Authorization`, `Proxy-Authorization` and `Cookie` headers on to another site when it follows a redirect; they go to the address they were given for only, as in browsers and curl.
- `zinc:ui` (classic layout): a box that flex-shrink makes narrower than it measured, or a child wider than its column, is laid out again at the width it gets, so the texts in it wrap inside it instead of keeping the lines of the wider width and running past its edge; an item that reaches its min-width stops there and the others share the rest, as in CSS. `break-words` now also cuts a long word in a text with style runs.
- `zinc:ui`: `rotate`, `skewX`/`skewY` and uneven `scaleX`/`scaleY` (style, transform array, `animate`) now paint, children, texts and icons included; they only moved hit-testing before, so a spinner turned with `animate(ref, 'rotate', 360)` stood still.
- The `agents` example: the hint of a new conversation wraps instead of running past the right edge of the pane.
- The `agents` example wraps everything in the conversation to the pane's width with the Agents and detail panels open or in a narrow window (messages, answers, lists, code), breaks long paths and URLs, and lets the agent tabs, the settings of the next turn and the message field fit a narrow pane.
- The `agents` example runs opencode in the conversation's folder; it ran in the folder the app was started from.
- The `agents` example shows the reason an opencode turn was refused by its provider (an OpenCode Go model the workspace's settings keep out) instead of an empty error.
- `zinc:process`: `run()` closes the program's input at once, so a command that reads its stdin to the end (`cat`, `claude -p`) finishes instead of waiting forever.
- A child process that writes without pause (a CLI streaming a large output, `yes`) no longer holds the event loop: timers, frames and keys keep running while its output is read (Escape could not stop it before).
- A child process that writes faster than the program reads its output (a large tool output on a slow machine) no longer piles that output up in memory: zinc stops reading the child's pipes past 4 MB waiting and the child waits until the program catches up.

## [0.4.0] - 2026-10-20

### Added
- Install with Homebrew on macOS or Linux: `brew install frulko/zinc/zinc`; `brew upgrade zinc` installs each new release, and `zinc update` on that install says so.
- An `agents` example: a small desktop tool that finds the Claude Code, Codex and opencode CLIs and their configuration, and chats with them in a folder, their answers streaming in; each turn picks its mode, model, effort and fast mode as the CLIs do (`zinc run examples/agents`).
- `zinc:system/dock`: `setVisible(true|false)` and `isVisible()` put a tray-only macOS app (`"dock": false`) in the Dock and Cmd+Tab while its window is open, and take it out again; elsewhere they do nothing.
- `zinc:socket`: `new WebSocket('wss://…')` and `connectTls(host, port)` connect over TLS, with the server's certificate checked against the system's roots as `fetch` does for https; a certificate that does not verify fails the connection.
- `zinc:spotify`: `find` and `findMore` (a search by kind, with pages), `artist`, `artistAlbums`, `artistTracks`, `album` and `playlist` pages, `pause`; items carry their artist, length and year.
- `zinc:sonos`: `queueSpotify` adds a Spotify song, album or playlist after the current song or at the end of the queue, `spotifyItem` builds it, Spotify's song and artist radios (`spotify:trackRadio:<id>`, `spotify:artistRadio:<id>`) play; a track knows its number in the queue and the queue's length.
- `zinc:spotify`: `Login` logs in from the app on a computer with a browser (the redirect served on port 8765), `reload()` reads the login file again and `logout()` forgets the account (the client id stays); the music example connects Spotify from its Spotify page on macOS, and checks or logs out the account in its settings; with a client id built in (src/spotify-client.ts) it logs in on a computer that never ran zinc.

### Changed
- A checkout builds and runs from its root: the engine moved out of `next/` (`cmake -S . -B build && tools/build zinc`, then `build/zinc run examples/hero`); an installed zinc reads its files from `share/zinc`.
- macOS: a window uses about a third of the memory it did (Activity Monitor: about 80 MB instead of 210 for a 1180x760 window on a Retina screen, 45 MB for a small form): it shows the frame through Metal instead of OpenGL. `ZINC_RENDERER=gl` brings OpenGL back, for shaders drawn on the GPU.

### Removed
- `zinc ui` (the Figma design tools), ZincStudio and the Figma plugin: they ran on the Node prototype, which is removed with them (its code is under the git tag `prototype-final`).

### Fixed
- reMarkable (header mode): Refresh works again under xochitl's header, and the page's ghosting is cleaned by its automatic full refresh, as in full screen.
- Two programs started at the same time (two `zinc run`, a test beside an app) no longer fail to build or load the same plugin: the builds of a `ZINC_HOME` take turns.
- `zinc export --target web --render dom --prerender` no longer comes out without its first screen on a busy machine ("the app drew nothing in six seconds").
- The one-line installers (`curl -fsSL https://github.com/Frulko/zinc/releases/latest/download/install.sh | sh`, `install.ps1`) and `zinc update` now download from the releases that exist; they pointed to a repository that does not exist yet.
- TLS 1.3 (https `fetch`, MQTT over TLS, `wss://`): the first bytes a server sends right behind its session tickets are no longer held back until more data arrives, and a write after a ticket no longer fails.
- `zinc export --target android` and `--target ios`: a plugin imported from several files of a program no longer stops the native build (CMake: "another target with the same name already exists").
- `zinc build --bundle` adds `.app` to an output without it, and a build whose output is a folder says so instead of a linker error (errno=21).

## [0.3.1] - 2026-10-19

### Fixed
- reMarkable (header mode): Refresh works again under xochitl's header, and the page's ghosting is cleaned by its automatic full refresh, as in full screen.
- tc: zinc.exe finds its package and unpacks zig on Windows

## [0.3.0] - 2026-10-19

### Added
- Zinc Atelier for Windows: `Zinc-Atelier-<version>-windows-x86_64.zip` on each release; unzip it and open "Zinc Atelier.exe".
- The zinc CLI for Linux (x86_64, aarch64, armhf, i686) on each release, updated by `zinc update`; `install.sh --atelier` adds Zinc Atelier to the applications menu.

### Fixed
- reMarkable (header mode): Refresh works again under xochitl's header, and the page's ghosting is cleaned by its automatic full refresh, as in full screen.
- Windows: zinc.exe finds the standard library and the prebuilt plugins beside it; the download looked for them at the path of the machine that built it.
- Windows: the first native build no longer fails to unpack the compiler it downloads ("Cannot connect to D: resolve failed").

## [0.2.3] - 2026-10-19



## [0.2.2] - 2026-10-19

### Added
- music: scroll and swipe with the mouse wheel and the trackpad

### Fixed
- reMarkable (header mode): Refresh works again under xochitl's header, and the page's ghosting is cleaned by its automatic full refresh, as in full screen.
- frontend: include algorithm for the JSX source map lookup

## [0.2.1] - 2026-10-19

### Fixed
- reMarkable (header mode): Refresh works again under xochitl's header, and the page's ghosting is cleaned by its automatic full refresh, as in full screen.
- Windows: the `zinc` download is back; 0.2.0 shipped without it because its build failed.

## [0.2.0] - 2026-10-19

### Added
- `zinc:3d`'s software renderer picks its own resolution (`scale: 0`, the new default): a big screen is drawn at under 400,000 pixels and scaled up, so a 3D scene at 1080p on a Raspberry Pi 3B+ goes from 12 to about 40 frames a second. Set `scale` to keep a fixed divisor.
- `display-gl` draws the interface on the GPU by default on the Pi and other Linux boards (`renderer: "auto"`; the CPU when the GPU cannot): 1080p presents in 3 ms instead of 33.
- On a Raspberry Pi with a mouse, `display-gl` now shows a mouse pointer (the display's cursor plane, no GPU cost).
- `zinc:gfx` `profSection(label)` ends a `ZINC_PROFILE` section and returns its numbers as JSON, so one run can measure several scenes in turn; `next/tools/zbench` uses it to run a whole suite in one launch on any device and write a report file the app produces itself.
- `ZINC_PROFILE=json` prints the frame profile as one JSON line (p50 / p99 / max / mean per phase, the interval between frames, late-frame counts, the GPU's name and the GL renderer's counters
  including the GPU time where the driver has it); `ZINC_PROFILE_SKIP=n` leaves the warm-up frames out. `next/tools/zbench` uses them to measure rendering on a Mac, an Android tablet, a webOS tablet or an iPhone or iPad.
- `zinc:script/fast`: `exposeNum` and `callNum` call across the QuickJS boundary with up to four numbers and a number back, without text conversion. A call costs
  about 0.06 us on a desktop and 1.3 to 2.6 us on a 2012 tablet, where `expose` and `call` cost 60 to 95 us. Use it for the hot calls of a script host (a UI mutation, a cell of a map).

### Changed (breaking)
- JSX is real JSX: write `className`, never `class`, and capitalised components (`<View>`, `<Text>`, `<Button>`, `<ScrollView>`, `<Image>`, `<Input>`).
  The engine refuses the old spelling with errors Z0006 and Z0007. Migrate a project with `zinc migrate --apply`.

### Added
- Windows: `zinc.exe` builds natively on a Windows machine (zig's mingw target, no Visual Studio) with the window, the event loop and the console: console programs run and the graphics host renders offscreen. `next/tools/windows-setup.ps1` installs a machine (git, CMake, Ninja, Python, zig 0.15.2), `docs/targets/windows.md` says how; `zinc doctor` names the Windows profile now, and libuv's and SDL3's Windows sources are vendored.
- Windows: a release now carries `zinc-<version>-windows-x86_64.zip` and `install.ps1` (`irm https://github.com/zinc-engine/zinc/releases/latest/download/install.ps1 | iex`), built and tested on a Windows runner; not signed yet, so SmartScreen may ask you to confirm.
- Windows: `ZINC_GPU=integrated|discrete` picks the graphics card of a laptop with two (the discrete one is the default, `ZINC_GL_STATS=1` prints the card in use).

### Fixed
- reMarkable (header mode): Refresh works again under xochitl's header, and the page's ghosting is cleaned by its automatic full refresh, as in full screen.
- `zinc device run` and `deploy` no longer fail with "the session with <device> ended early" while an update is on trial: the client waits for the whole trial, and `ZINC_AGENT_TRIAL_MS` is now real time on a busy device.
- Web export (`--render dom`): a long virtual list no longer jumps by a few rows after a big scroll on a slow machine (the browser's scroll anchoring is off on its scroller).
- `--engine quickjs`: a `queueMicrotask` callback is called with no arguments (it received `undefined`), and `queueMicrotask` with something other than a function throws a TypeError, as in Node and browsers.
- On a Raspberry Pi 3 (and other tiling GPUs) at 1080p, a list of rounded cards, a list that updates, an animation of many views and a small change on a busy screen ran at 3, 24, 0.25 and 24 frames a second and now run at 60: rounded clips are clipped in the shader instead of copying the screen, a frame is no longer drawn into a texture and copied for nothing, the depth pass only runs when rectangles pile up, and the VideoCore IV uses the lean programs. Shadows and gradients are 2 to 6 times faster there. Details and numbers: `docs/reports/pi-1080p.md`.
- Windows: the CPU renderer (`ZINC_RENDERER=cpu`) no longer crashes with several render threads, a laptop with two graphics cards now draws on the NVIDIA or AMD one instead of the integrated one, and `zinc doctor` no longer prints "the system cannot find the path".
- Windows is named as itself everywhere: `zinc doctor`, the default target, the lint and the platform the UI kit sees (`platform()` is `windows`, so a PC with a mouse is no longer taken for a touch screen).
- `zinc:script` now links in a cross build (`--target armv7-webos`, the Linux targets) and in an exported Android or iOS project; it failed with an undefined `zn_module_QuickJS`.
- `zinc:script` host calls and results that are plain numbers, strings, booleans or null are about twice as fast (no JSON machinery for them); other values behave as before.
- iOS: `fetch` and every HTTPS connection failed on a device with `UNABLE_TO_VERIFY_LEAF_SIGNATURE`; the certificate is now checked by iOS itself (its roots and the profiles you installed).
- `zinc export --target android|ios` no longer builds the plugins for the Mac first: an export on a machine without FFmpeg kept `zinc:video` out of the
  app, and a fresh machine needed the Xcode tools for a plugin the phone compiles anyway.
- iOS export: an app icon that is not 1024 x 1024 (a 512 px PNG, an SVG) no longer stops the Xcode build; it is resampled to 1024.
- Web target: a screen could go blank after the window was resized (a tab you had left still reacted to the new size and wrote over the screen on show); the same fault could hit a desktop app.
- Web target: a letter typed into a text field of a canvas page arrived twice.
- Web target, DOM mode: a program that draws with `zinc:gfx` or three.js and has no `zinc:ui` tree showed a blank page; it now gets a window-sized canvas and takes mouse and keys.
- `@zinc/vite`: under `vite` (the dev server) an app that uses `zinc:gl`, a runtime shader or a plugin's native side no longer stops with "Failed to fetch dynamically imported module: /@id/zinc:native".
- Web target: the page no longer asks for `/favicon.ico` (a 404 in every console) when the app has no icon, and an error thrown on every frame is reported once, not sixty times a second.

### Added
- iOS: `zinc:audio`, `zinc:link`, `zinc:3d` and three.js can be exported to iPhone and iPad (`zinc export --target ios`); 3D draws in software there for now.
- `zinc:device-info` tells what the app runs on, as Expo's expo-device: phone, tablet, desktop or TV, brand, maker, model name (`iPad Pro (12.9-inch) (1st generation)`) and identifier,
  system name, version and build, memory, CPU architectures, and whether it is a simulator. `Platform.isPad` and `Platform.isTV` now answer for real, and `Platform.constants` is there.
- PS Vita: zinc:gfx frames are drawn by the Vita's GPU (GXM) at 960x544 instead of the CPU, so games such as Meadow Run run at the screen's rate. A frame
  with shapes the GPU path does not draw yet (rounded corners, gradients, paths) is rasterized in software and shown by the GPU; `ZINC_VITA_GPU=0` keeps the old path.
- `@zinc/vite` (`packages/vite-plugin-zinc`): a Vite plugin that builds and develops a Zinc app for the web with Vite's own resolver, hot module replacement and bundling; `zinc dev --target web --prepare <dir>` is the step
  it calls. `zinc bundle` now warns (Q0001) about `Intl`, `Temporal` and `WebAssembly` used inside the packages it links, and resolves package names with esbuild (`exports` conditions and the `browser` field).
- npm packages on the web target: `zinc dev --target web` serves a project that imports packages from `node_modules` (bundled once by esbuild, Vite's way, and kept in `.zinc/web-deps` by the
  lockfile's hash; saving your own code never bundles them again, an install reloads the page), and `zinc export --target web` resolves them the same way (`exports` conditions, the `browser`
  field, CommonJS, pnpm links). `zinc add npm:<package>` and `zinc install` call the project's own package manager (npm, pnpm, yarn or bun, found from `packageManager` or the lockfile);
  `zinc doctor` lists the ones it finds and Zinc never installs one (P0001, P0002, W0605: `zinc explain`).
- Web target: `zinc:physics2d` (Box2D as WebAssembly), `zinc:serial` (Web Serial), `zinc:midi` (Web MIDI), `zinc:gphoto2` (WebUSB, the basic PTP controls), `zinc:osc/full` (through a WebSocket relay,
  `open(0, 'ws://relay')`) and `zinc:map` (MapLibre GL JS) work in the browser, each saying which browsers lack its API (W0601). Hardware plugins need Chrome or Edge and ask the person.
- Web target: `zinc:gl` (WebGL 1 and 2), `drawShader` runtime shaders and `three` run on the browser's own WebGL. `examples/gl-cube` draws the same frame as on the desktop,
  `examples/three/cubes` and the glTF viewer run on the real three.js (the pinned r186 copy), and `zinc:canvas` is the browser's Canvas2D. Pictures show in canvas and DOM mode alike,
  under whatever the app draws after them.
- zinc:spotify: a program without its own login file uses the computer's shared one, `~/.zinc/spotify.json`, which `plugins/spotify/login.py CLIENT_ID` now writes by default.
- Android: `navigator.getBattery()` and `device('battery')` of zinc:sys give the battery's level and whether it charges.
- The music example shows a Mac's notifications on its tablet: it pairs once with the Mac over zinc:link (a 6-digit code on the tablet),
  plays each one as iOS's StandBy does on the clock or a sleeping screen (grey cards elsewhere), and keeps the last 50 on a slide of its own.
- `zinc:hardware`: the parts of a machine beyond its screen and pad, one call each: `battery()`, `network()`, `accelerometer()`, `gyroscope()`,
  `rearTouches()` (the Vita's rear pad; the right mouse button on a desktop), `microphoneLevel()`, `stereoDepth()` / `setStereo()` /
  `stereoEye()` (the 3DS's 3D screen), `vibrate()` and `saveLocation()`; null, -1 or [] where the machine has none. See "Hardware" in
  `docs/targets/handhelds.md`.
- `zinc run --simulate psp|vita|ps2|n3ds` runs a program as on that console: its screen size, and a panel for its battery, Wi-Fi, tilt, rear
  touch pad, microphone level and 3D slider.
- zinc:audio plays on the PSP, PS Vita, PS2 and 3DS: tones, samples, WAV and Ogg Vorbis files, voices and streams, unchanged from the desktop.
- Consoles: a project's assets go with it (the asset pack of `zinc pack`, linked into the core by `tools/console-demos`): zinc:assets,
  sprite atlases (zinc:sprite) and tile maps (zinc:tilemap) work on the PSP, Vita, PS2 and 3DS, and Meadow Run (`examples/platformer`)
  plays there.
- `gamepadButtonValue` gives how hard a pressure-sensitive button is pressed (the DualShock 2's); a test script presses with `gbutton I B VALUE`.
- Consoles: a hardware demo shows every part of the console live, one screen each with Kenney's button icons: `examples/hardware-psp`
  (buttons, analog nub, sound at 44.1 kHz, the screen at 60 fps, battery, clock, the Wi-Fi switch, saving) and `examples/hardware-n3ds`
  (both screens, the stylus, stereoscopic 3D following the slider, circle pad and C-stick, ZL / ZR, motion, the microphone, sound through
  ndsp or CSND, battery, Wi-Fi) and `examples/hardware-vita` (both sticks, front and rear touch, motion, sound at 48 kHz, battery, Wi-Fi,
  the cameras) and `examples/hardware-ps2` (the DualShock 2's pressure-sensitive buttons, both sticks and both motors, sound through the
  SPU2, saving on the memory card). A console's pad is gamepad 0 with its sticks; the 3DS's bottom screen is the program's `openWindow`; a Vita program saves
  in `ux0:data/<title id>/`.
- Consoles: breakout plays on the PSP, PS Vita, PS2 and 3DS with Kenney's sprites, the d-pad or the stick moving the paddle; a console
  program that ends with nothing drawn or with an error keeps its last lines on screen until START instead of a black screen.
- `zinc export --target web` makes a Zinc app a normal web page: a static folder (hashed JavaScript and assets, an offline cache, an installable manifest, `.br` and `.gz` copies, `_headers`) that any host
  serves, with no server, no WebAssembly for ordinary apps and no special headers. The app's TypeScript runs on the browser's own JavaScript engine. `--render canvas` (the default) draws on a canvas;
  `--render dom` makes a real web page: semantic HTML (nav, main, headings, lists, links, buttons, a real `<form>` with real inputs), CSS classes and the browser's own layout, scrolling,
  Tab order, focus rings, text input, selection and form submission, with the accessibility tree built from it. `zinc.json` `targets.web` sets the title, icon, colours, the render mode and the browsers
  to support. See `docs/targets/web.md`.
- `<Form onSubmit>` (zinc:ui/kit and React Native): fields submitted as one. In the page it is a real `<form>`: Enter submits it after the browser checks `required`, `pattern` and `minLength`, and
  password managers and autofill see it; elsewhere it routes Enter in a text field to `onSubmit`. Inputs take `name`, `type`, `autoComplete`, `required`, `pattern`, `minLength`, `enterKeyHint`.
- `zinc export --target web --render dom --prerender` puts the first screen's elements and style sheet into `index.html` (taken in headless Chrome, so Chrome must be installed): the page is readable and painted before any script runs, and the app adopts
  those elements instead of building them again. `targets.web.scroll: "page"` lets the document scroll instead of a window-sized stage, and `targets.web.dir` sets `<html dir>`.
- `zinc:video` and `zinc:lottie` work in the browser: a video is the browser's own `<video>` (streamed, with controls, fullscreen and picture-in-picture, and a message with a download link when it cannot decode the file), a
  Lottie animation is drawn by lottie-web loaded only when the first one is shown. The export warns (W0604, `zinc explain W0604`) about video codecs a browser of the target set cannot play.
- A `<Stack path={(route) => '/' + route.name}>` (zinc:ui/navigation) keeps the page's address and history in step with its screens on the web: a push is a history entry, the browser's Back button pops the screen.
- Semantic hints for the page: `as="nav"`, `as="h1"`, `as="ul"`, `href` and `role` on any View or Text choose the HTML element (see "Semantic hints" in `docs/ui.md`); other targets ignore them.
- `zinc dev --target web` serves the app with hot reload: saving a component swaps it in place and keeps the state of everything you did not touch (a module that exports state reloads the page), and a
  compile error shows over the page until the next good save.
- The web export tells you what a browser cannot run: `--check` and the export itself warn (W0601, W0602, W0603; `zinc explain W0601`) about plugins and features missing in the browsers of
  `targets.web.browsers`, `--werror` fails on them, and a call that cannot be served throws `ZnUnsupported` instead of crashing. `import { supports, browserInfo } from 'zinc:browser'` asks the page at run time.
- Plugins declare their browser version with a `web` entry in `plugin.json`: `zinc:camera`, `zinc:microphone`, `zinc:webrtc`, `zinc:audio`, `zinc:socket` (WebSocket), `zinc:svg`, `zinc:system` and
  `zinc:sqlite` (SQLite as WebAssembly) work in the browser with the API they have on a desktop; the webrtc call demo runs unchanged.
- Zinc Relay (`examples/notify-relay`): a menu bar app that sends your Mac's notifications to a paired tablet over zinc:link, with the
  app's icon and, for messages, the sender's picture (or initials), except the apps, websites and Focus modes you hold back. A tap on the
  tablet opens the app on the Mac. It reads Notification Center's database, so its setup assistant asks once for Full Disk Access (and
  Contacts, local network, notifications) and opens the right System Settings pane.
- The `contacts` permission in `zinc.json` writes the Contacts usage text macOS shows when an app asks for the contacts.
- The kits look like the platform they run on: iOS's buttons, switches, sliders, segmented controls and type scale on iOS, Material 3's on
  Android, macOS's (with the accent colour you chose in System Settings) on a Mac; Linux, the web and the boards keep the kit's own look.
  React Native's `Switch`, `Button` and `ActivityIndicator` draw as each platform does; a switch ticks on iOS; a long press opens a context
  menu on a touch screen. `"ui": {"platformLook": "neutral"}` in `zinc.json` (or `"ios"`, `"android"`, `"macos"`) forces one look; see
  "Platform look" in `docs/ui.md`.
- `zinc bundle` makes one optimised JavaScript file of a program for QuickJS: TypeScript, TSX, zinc: modules, plugins and npm packages
  linked, unused code dropped, `__ZINC_ENGINE__`, `__ZINC_PROFILE__`, `__ZINC_CAPS__` and `process.env.NODE_ENV` folded in, with
  `--minify`, `--sourcemap` (traces mapped back to your files), `--bytecode` (a `.qbc` that starts without parsing) and `--watch`. The pinned
  esbuild is downloaded and checked once (`zinc toolchain esbuild`); `zinc check --engine quickjs` reports what QuickJS-ng lacks (Q0001).
- Buttons, links, rows, tabs, chips and every pressable dim while a mouse, a finger or Space / Enter presses them (in every kit, React Native's
  Pressable included), and come back after the release; dragging off cancels. `active:opacity-*`, `activeOpacity` or `pressFeedback={0}` set
  your own; `ui.setPressFeedback(false)` turns it off.
- Typing on phones: a long press on a text field selects a word with handles and a Cut, Copy, Paste, Select All menu in the phone's style, a
  dragged handle shows a magnifier, and IME composition is underlined in the field (desktop IMEs too). `TextInput`'s `autoCapitalize`,
  `autoCorrect`, `returnKeyType` and `textContentType` reach the phone's keyboard.
- Lists scroll like Android on Android: the fling of Android's own scroller, no rubber band, the stretch at the edges (Android 12 and later) or the
  glow (before), and Android's scrollbar fade. iOS and the desktop keep iOS's deceleration and rubber band.
- `zinc:ui/navigation`: a stack navigator (`<Stack renderScreen={...}>`, `nav.push`, `pop`, `present`) that moves like the phone it runs on:
  iOS's slide with the edge swipe back, Android's shared axis with the back key and Android 14's predictive back, a sheet or a full-screen dialog
  for modal screens.
- Phones know who they are: `platform()` and React Native's `Platform.OS` answer `android` and `ios`, `Platform.select` picks the `ios` and
  `android` branches, `Platform.Version` tells the OS version, and `x.android.ts` / `x.ios.ts` replace `x.ts`. `ZINC_PLATFORM=android|ios`
  runs a phone's behaviour on the desktop.
- What the phone's system says reaches the app: the safe area (`SafeAreaView`, `env(safe-area-inset-*)`), light or dark (`Appearance`,
  `setScheme('auto')`), the text size setting (`PixelRatio.getFontScale`, text follows it), reduce motion, the keyboard's height, and the back
  key (`BackHandler`, `ui.addBackHandler`). `StatusBar` styles the system bar, `Vibration` and the new zinc:haptics (`Haptics.impact`,
  `selection`, `notification`) give touch feedback. Tests send these signals with `ZINC_INPUT` lines (`theme dark`, `back`, `keyboard 336`).
- `examples/rn-showcase` is a kitchen-sink app in the React Native way (as Expo's): tabs and a stack, components, forms with validation, a
  network tab with a mock server, a WebSocket feed, media, a camera page, motion and gestures, notes that persist, device APIs, light and dark, en and fr.
- `zinc update` installs the new release by itself (checked against a signed manifest, the old engine kept for `zinc update --rollback`); a quiet daily notice says when a
  new version is out; the Atelier app has Help > Check for Updates. `zinc --version` now tells the real version.
- Two downloads per release: the `zinc` command line (`zinc-<version>-macos-<arch>.tar.gz`, nothing else to install) and the Atelier app (`Zinc-Atelier-<version>-macos-<arch>.zip`).
  `install.sh` installs the command line, `--atelier` adds the app.
- `zinc doctor` is a short, coloured check-up that tells what to do next; `zinc doctor --details` keeps the full report. On a Mac without the Xcode command line tools,
  `zinc build` offers to run `xcode-select --install`.
- `zinc lint` (also `--target` and `--all-targets`) warns before you build something a platform cannot run or cannot afford; `zinc migrate` rewrites old code for you.
- `--background` (or `ZINC_BACKGROUND=1`) opens a window without taking the focus.
- Hot compile mode for `zinc dev` (`import.meta.hot`); Android and iOS targets and profiles; an Android export; hello and the React Native showcase run on a Nexus 7.
- `zinc dev` swaps the code of a save into the running program (`zinc dev: v1 refreshed src/x.ts`): same window, and the modules you did not touch keep
  their state. When it cannot (a top-level effect without `import.meta.hot.dispose`, a new plugin, `zinc.json`), it restarts and says why in one line.
- Fast Refresh for Solid components: saving a page of a `zinc:ui/solid` app (the desktop-app template's `src/pages/home.tsx`) renders
  that component again in place, with the page you are on and what you typed kept; a module that exports only functions and classes
  (the game-2d template's `scenes.ts`) no longer sends the game back to its title screen. `import.meta.hot.off` removes a listener.
  A program on QuickJS still restarts at each save, and `zinc dev` now says so.
- `zinc:camera`: webcams and built-in cameras on macOS and Linux (`devices()`, `requestPermission()`, `Camera.open(id, { width, height, fps })`),
  frames in an image you draw, `snapshot()` as RGBA, mirror, brightness and contrast; "Zinc Fake Camera" stands in when there is none or with
  `ZINC_FAKE_CAMERA=1`. `navigator.mediaDevices.getUserMedia({ video })` and `enumerateDevices()` work once the program imports `zinc:camera`.
  It needs `"camera"` in zinc.json `permissions` when the project declares them.
- `examples/webcam`, a small camera app: live preview (fit or fill), camera picker, a shutter that saves PNG photos with a strip and a viewer,
  mirror, brightness, contrast, 320x240 to 1280x720 at 15 or 30 fps, a live HUD, the "Allow the camera" and "access is off" screens, keyboard shortcuts.
- `Camera.toPng()` gives the newest frame as PNG bytes: `fs.writeBytes` them to save a photo. In `ZINC_INPUT` scripts, `key Space` presses the space bar.
- `zinc:microphone`: microphones on macOS and Linux (`devices()`, `requestPermission()`, `Microphone.open(id, { sampleRate, channels })`),
  samples in 20 ms blocks through `onData`, `level()` for a meter; "Zinc Fake Microphone" stands in when there is none or with
  `ZINC_FAKE_MICROPHONE=1`. `navigator.mediaDevices.getUserMedia({ audio })` and `enumerateDevices()` work once the program imports it.
  It needs `"microphone"` in zinc.json `permissions` when the project declares them.
- `zinc:webrtc`: WebRTC data channels with the Web's API (`RTCPeerConnection`, `RTCDataChannel`, `createOffer`, `onicecandidate`,
  `ondatachannel`...): text and bytes peer to peer, on a LAN with no server, or through STUN and TURN; two peers in one program connect
  with no network. The RTC names are globals.
- `zinc:webrtc` sends and receives audio and video: `addTrack`, `addTransceiver`, `ontrack`, `RTCRtpSender` (`replaceTrack`,
  `setParameters` with `maxBitrate`, `maxFramerate`, `scaleResolutionDownBy`), `RTCRtpTransceiver` (`direction`, `setCodecPreferences`,
  `stop`), `removeTrack`, and `getStats()` with inbound, outbound and round-trip numbers. Opus audio and VP8 video everywhere, H.264 in
  hardware on macOS; the peer's video is an image you draw like the camera's (`track.camera.image`), its audio blocks of samples.
- `examples/webrtc-call`: a video call, two peers in one window (an echo) or by room name through webrtc-chat's signalling server: your
  preview and the other side's video, mute with a level meter, video on and off, a camera picker, the speaker, a stats overlay (codec,
  size, frame rate, bit rates, round-trip time, loss); wide and phone layouts, light and dark.
- `zinc:audio` plays samples as they come: `audio.stream(channels, rate)` gives an `AudioStream` to `write()` to (a call's audio, a
  synthesizer); it buffers 60 ms, and stays short when the writer runs ahead.
- `MediaStreamTrack` has `frameIndex`, `snapshot()` and `onSamples()` whatever plugin made it, and `MediaStream` has `addTrack`,
  `removeTrack` and `getTrackById`.
- `examples/webrtc-chat`: a chat and a file sent peer to peer, two peers in one window, by copy and paste, or by room name through a small
  signalling server (`signal-server.ts`), with the connection state, round-trip time and a microphone level meter.
- Plugin manifests take `vendorFlags`: flags for the vendored sources only (a C++ library that needs `-frtti` or `-fexceptions`).
- `zinc:camera` on Android (the NDK's camera2, the CAMERA permission asked through the system dialog) and iOS (AVFoundation, shared with macOS);
  on Linux, MJPEG is chosen when a webcam gives YUYV too slowly, and `permissionStatus()` is `denied` with the `sudo usermod -aG video $USER` hint
  when your user may not open the cameras. Not yet tried on those devices.
- zinc.json `"permissionStrings": {"camera": "..."}` sets the text of the system's question on macOS and iOS. With `"camera"` in the permissions,
  an Android export asks for CAMERA without hiding the app from devices that have no camera, and a macOS app lists an iPhone (Continuity Camera)
  without a warning. The android and ios profiles now offer the camera.
- `Camera.still()` copies the frame on screen into a new image in about a millisecond, and `Camera.encodePng()` encodes a PNG on another thread;
  `ZINC_FAKE_CAMERA=4` lists four fake cameras to try a camera picker.
- `zinc build --target` takes the names people type for Linux (`linux-arm64`, `linux-armhf`, `linux-armv7`, `linux-x86_64`) and a 32-bit PC
  target, `linux-x86` (i686); `zinc toolchain targets` says the oldest glibc each one needs (2.28).
- `next/tools/build-linux --arch aarch64|armhf|x86_64|i686` builds zinc for Linux from a Mac with the pinned zig (no Docker), windows
  included (X11 and KMS/DRM), and packs `zinc-<version>-linux-<arch>.tar.gz`; it runs on Debian 10, Raspberry Pi OS Buster and newer.

### Changed
- `zinc run --engine quickjs` runs TSX and the whole UI stack (zinc:ui, the kits, React Native, Nuxt UI): hero, rn-showcase and nuxt-ui
  draw the same frames as on the typed engine. Imports resolve as there too (plugins, `tsconfig.json` paths, `node_modules`), and
  `import.meta.url` is set.

### Fixed
- reMarkable (header mode): Refresh works again under xochitl's header, and the page's ghosting is cleaned by its automatic full refresh, as in full screen.
- Text no longer shows `?` for invisible characters (bidi marks, zero-width spaces, variation selectors) a font has no glyph for: they draw as nothing.
- A program that starts drawing after it started (`render()` or `onFrame` from a timer or a menu click, as a menu bar app opening its
  window) now draws: before, nothing ran but its timers.
- A program that imports `zinc:ui` without drawing yet (a menu bar app) no longer opens an empty window at start, and quits on SIGTERM.
- Dates under the PSP and PS2 profiles (32-bit numbers): `new Date()` was NaN on a PS2 and `Date.now()` lost up to two minutes on both;
  they keep the millisecond now.
- A program for the PSP or PS2 profile (`--profile psp`, `ps2`: 32-bit numbers) that read an `f64[]` from a native module into a `number[]`,
  zinc:audio's `samples()` among them, failed to compile with "Cannot find name: '__T7'".
- Programs built for 32-bit Raspberry Pi OS (`zinc build --target armhf-linux` or `armv7-linux`, `zinc export --target rpi1` or `rpi2`) start
  on Bullseye and Buster: they asked for glibc 2.34. Every Linux target now runs on glibc 2.28 and newer.
- Resizing a window on macOS by dragging its edge re-lays out the app at each size instead of stretching the last frame; animations,
  timers and video keep running during the drag, and the growing edge shows the app's background colour.
- `zinc.json` `app.window` (title, `minWidth`, `minHeight`, frame...) now applies to the native program `zinc run` starts and to the programs
  `zinc build` writes, not only to the interpreter; `maxWidth`, `maxHeight` and `aspectRatio` are new.
- `zinc:webrtc` connects to Chrome when Zinc makes the offer: the offer asks to be the DTLS client, since Chrome's large handshake
  could not be read by the server side.
- The macOS camera no longer aborts the app on cameras that accept only fixed frame rates (an iPhone as webcam, some USB webcams): the rate asked is matched to one the camera offers.
- Modals, dialogs, sheets and alerts no longer slide their dimmed background in with them: the dim fades in and out in place while the
  content fades, grows or slides (React Native's Modal `animationType`, the kit's Dialog, Nuxt UI's Modal and Slideover, `Alert.alert`), and
  closing plays the motion backwards instead of vanishing.
- A React Native screen at rest no longer repaints every frame: icons, a stopped `ActivityIndicator`, `useWindowDimensions` and
  `KeyboardAvoidingView` used to keep the app drawing (and allocating) sixty times a second; it now sleeps until something changes.
- Platform-specific files work again: next to `feed.ts`, a `feed.macos.ts` (or `feed.esp32.ts`, `feed.android.ts`...) replaces it when building for
  that platform, and imports keep writing `./feed`.
- A method with a default parameter that a subclass overrides received `null` for it (`new EventTarget().addEventListener('x', fn)` crashed).
- A program run as a standalone app on macOS saw extra arguments in front of its own.
- The camera simulator did not compile on a machine without libgphoto2, so the camera examples failed there.
- Solid component props that read signals now follow them; the touch marks are off by default (`ZINC_TOUCHES=1` shows them).
- The web export of programs that use asset groups, storage or device features no longer stops at start.
- Opening, switching or closing a camera on macOS no longer freezes the window: the camera starts and stops off the main thread, and a new size
  or rate reuses the running camera instead of stopping and starting it.
- `examples/webcam` fits any window: the bottom bar and the settings were cut off when the window was short or several cameras were listed;
  the settings now scroll, long camera names end with "…", the HUD stays on the picture, and a phone in portrait gets the picture on top, the
  settings under it and the shutter at the bottom. It no longer lags: it draws only when the camera sends a frame, lists the cameras after the
  window shows, and a photo appears at once while its PNG is saved in the background.
- A `truncate` text in a row that shrinks it (a long name beside a badge) ends with "…" at its final width instead of running over its neighbours.

[Unreleased]: https://github.com/Frulko/zinc/compare/v0.9.1...HEAD
[0.6.2]: https://github.com/Frulko/zinc/compare/v0.6.1...v0.6.2
[0.6.1]: https://github.com/Frulko/zinc/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/Frulko/zinc/compare/v0.5.2...v0.6.0
[0.5.2]: https://github.com/Frulko/zinc/compare/v0.5.1...v0.5.2
[0.5.0]: https://github.com/Frulko/zinc/compare/v0.4.3...v0.5.0
[0.4.3]: https://github.com/Frulko/zinc/compare/v0.4.2...v0.4.3
[0.4.2]: https://github.com/Frulko/zinc/compare/v0.4.0...v0.4.2
[0.4.0]: https://github.com/Frulko/zinc/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/Frulko/zinc/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/Frulko/zinc/compare/v0.2.3...v0.3.0
[0.2.3]: https://github.com/Frulko/zinc/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/Frulko/zinc/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/Frulko/zinc/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/Frulko/zinc/compare/v0.1.1...v0.2.0
[0.7.3]: https://github.com/Frulko/zinc/compare/v0.6.2...v0.7.3
[0.7.4]: https://github.com/Frulko/zinc/compare/v0.7.3...v0.7.4
[0.7.5]: https://github.com/Frulko/zinc/compare/v0.7.4...v0.7.5
[0.7.6]: https://github.com/Frulko/zinc/compare/v0.7.5...v0.7.6
[0.8.0]: https://github.com/Frulko/zinc/compare/v0.7.6...v0.8.0
[0.8.2]: https://github.com/Frulko/zinc/compare/v0.8.0...v0.8.2
[0.9.1]: https://github.com/Frulko/zinc/compare/v0.8.2...v0.9.1
