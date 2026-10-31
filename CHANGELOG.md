# Changelog

All notable changes to Zinc are written here, for the people who use it. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
versions follow [Semantic Versioning](https://semver.org/) (while the major version is 0, a minor version may break what the previous one ran). `make release`
publishes the *Unreleased* snapshot as the release notes, then archives it under the new version after publication succeeds.

How to add a line: see "Changelog" in `AGENTS.md`.

## [Unreleased]

### UI
#### Fixed
- Selecting text with `select-text` works across several lines and several `Text` blocks, like a browser: drag from one paragraph into the next (in a `ScrollView` too, the list scrolls near its edge), the whole span is highlighted and Cmd/Ctrl+C copies it with its line breaks.

### Apps and examples
#### New
- The Discord client has a faithful Slack theme (white window, aubergine sidebar with a blue open channel, outlined message box, light code cards; the old dark one is *Slack dark*), and themes can now colour the channel list, member list and cards apart (`sidebarText`, `sidebarMuted`, `sidebarStrong`, `sidebarHover`, `sidebarSelected`, `sidebarSelectedText`, `surface`, `composerBorder`). The Teams theme gets its outlined white message box.
- The Discord code button opens a real editor (the shared `zinc:editor`) above the message box, with a language choice, highlighting, copy and paste; sending joins your message and the code as a fenced block with its language. Long code blocks you read are folded by default with a "Show code" row that unfolds them smoothly, and keep their copy button.
- The Discord example has a safe mode switch in the user bar, opens the call's quality details (score, loss, round trip, jitter, bit rates, codecs) from the signal bars beside "Voice Connected", and its themes now colour the switches, dialogs and call view too (new `success`, `warning`, `stage` colours).
#### Changed
- The screen-share dialog keeps its place while you scroll the screens and windows, and has a search field to find one by name.
- The screen-share dialog (Discord's Go Live, the call example) looks like Discord's: tabs Applications and Entire screen, a two-column grid of large previews with the application's icon and name under each, and a preset line (SD 720p 30 fps or HD 1080p 60 fps) with an SD/HD switch and a settings button for the resolution, frame rate and pointer. Apps can add a Devices tab for cameras.
#### Fixed
- The previews of the screen-share dialog no longer flash black every time they refresh.
- The Discord client no longer cuts anything at narrow widths: the side columns shrink or give way to the messages (the member list hides under 960 px, the pins and threads open over the messages under 800 px), the emoji and GIF picker and the cards, polls and pictures fit the room they have, and the user bar wraps its buttons.
- Closing the Discord client during a call leaves the call, stops your Go Live and the stream you watch first, so nobody sees you stuck in the channel.
- **Fixed** Discord calls: a still screen in Go Live (or a stalled camera) keeps sending its last picture at least four times a second, nothing is sent before the call's encryption is keyed (the first picture the viewer gets is a key frame that opens), and in the ultra low data mode the call announces the reduced size and bitrate it really sends. `DISCORD_LOG=1` prints the size, frames, key frames and target of each outgoing video every second.
- Discord calls: your camera and Go Live send a key frame every second (and again when the call's encryption key changes or someone starts watching) so the others no longer wait forever on a black tile; a third person joining no longer silences the people already there; a small tile shows the camera's lower quality layer; a Go Live you watch connects whichever of the two server messages comes first; and the call survives a network blip instead of ending with "voice gateway closed".

### Plugins and modules
- **New** `zinc:webrtc` video holds up on bad links: a lost packet is asked for again (NACK) instead of freezing the picture until the next key frame, the receiver measures the link and tells the sender (REMB), and the sender steps its picture down a ladder (720p30, 360p30, 360p15, 180p15, 90p7) and back up as the rate allows. `getStats()` gains `nackCount` and `qualityLimitationReason`; `ZINC_WEBRTC_BWE_LOG=1` prints the rate decisions, and `ZINC_FAKE_CAMERA_NOISE` adds grain to the fake camera to test it.
- **New** `zinc:webrtc` simulcast for a media server such as Galène: `addTransceiver(track, { sendEncodings: [{ rid: 'h' }, { rid: 'l', scaleResolutionDownBy: 2 }] })` sends a full and a small stream, and `scalabilityMode: 'L1T2'` sends VP8 in two temporal layers, so the server can give each viewer the stream its link carries.

### Raspberry Pi and the shell
#### New
- The Pi image builder is redesigned: a calm, Apple-like window with a short guided flow (device, network and account, apps), basics first and the rest behind *Advanced*, and a live build view with every step, its progress and time left, a result card with the next steps, and the failed step with *Retry*. It also offers the Zinc shell (`"shell": true` in a profile boots to the shell), A/B system updates, the Zinc agent and the app to start at boot.
#### Fixed
- Under the shell, an app started with `zinc device run` comes to the screen even over another page, and `zinc device stop` or a newer app replacing it no longer leaves an "app stopped (exit -1)" page.

### Calls and media
#### New
- Calls without headphones: a microphone opened with `echoCancellation`, `noiseSuppression` and `autoGainControl` takes the far end's voice coming out of the speakers away (give it zinc:audio's `played` as `reference`), quiets steady noise and levels the voice. The call example uses it.
#### Changed
- Calls between two Zinc apps hold up on lossy links: under loss the voice gets more bits for its deep redundancy and the receiver waits for it, so a link losing a quarter of its packets in bursts loses about 3% of the sound instead of 8%.

## [0.10.6] - 2026-10-31

This release turns the Raspberry Pi into a small Zinc computer: a shell that runs apps under its own bar, apps built on your Mac and sent ready to run, an image that updates itself safely and a renderer several times faster on its cores. Sidecar makes an iPad, a phone, a Pi, another Mac or a reMarkable a screen for your Mac, the reMarkable gets an app store, a web reader and zooming that follows the fingers, and Zinc Inspector now looks and works like Chrome DevTools.

Under the hood, Zinc accepts much more of the TypeScript people actually write, workers run on every engine, and large programs type-check, compile and start several times faster. Two showcase apps came out of it: a native Discord client and an iPod manager with its own Genius.

### Breaking changes
- React model (`zinc:ui/react`): a component's props are evaluated once, where the component is written, as React does; a re-render for its own state no longer reads them again. A prop that should follow a value comes from a parent that renders again, or from the component's own state.
- `zinc:sonos`: `soap()` returns the answer's element (`zinc:xml`), not its text: read a value with `r.textOf('Name')`.

### Zinc Atelier
- **Fixed** In a web build Atelier's editor fills its pane, colours the code and takes clicks, typing, IME and paste without a browser focus ring, and its buttons show their words instead of keys such as `atelier.header.run`.
- **Changed** Atelier looks and works like a Mac app: a sidebar with your app, its pages (Code, Settings, Devices, Share) and its files, a toolbar with Run and where the app runs, flat panes, the system blue and a matching dark theme. Settings opens with ⌘,.
- **New** Settings writes `zinc.json` as you change it: icon, name, version, identifier, window size and resizing, full screen, how a Raspberry Pi shows the app (window, full screen or kiosk), permissions, the hub and the app's signing key.
- **New** Share builds the Mac app, packs a `.zapp`, runs the app on a paired device and publishes it to a Zinc hub, for any machine or a Raspberry Pi.

### Raspberry Pi and the shell
- **New** An app's `zinc.json` `"shell": "fullscreen"` shows it without the top bar (Home still quits it); `"kiosk"` also takes away Home and Ctrl+Alt+Backspace and restarts the app if it ends. `ZINC_SHELL_START=<app folder>` in `/etc/zinc/session.conf` shows that app when the Pi starts. Any other value is an error naming the line.
- **New** A shell for the Pi: `ZINC_SHELL=1` in `/etc/zinc/session.conf` runs the player as a shell that starts the boot app and the tiles' apps below its bar; `zinc device run` shows an app through it and `zinc device stop` returns to the hub. An app whose `zinc.json` says `"display": "gl"` still takes the whole screen. If the shell fails twice within a minute, the Pi falls back to the old player for that boot and says why in `/run/zinc/zinc-report.txt`.
- **New** `sudo zinc-admin shell on` (or `off`) switches a Pi to the shell and back, and restarts its session.
- **Faster** An app under the shell renders on every core and draws straight into buffers of the display, shown on a plane of its own: the shell copies nothing and draws nothing for that frame. `ZINC_SHELL_DMABUF=0` goes back to shared memory.
- **Faster** The software rasterizer paints turned and zoomed images and shapes several times faster: a photo card the size of the screen on a Raspberry Pi 3 goes from 7 to 40 frames a second.
- **New** `zinc:shell` (Linux and macOS) lets a program that owns the screen run other apps: `start(dir, name)`, show the running app below its own bar (`image()`, `barHeight()`), forward it the input below the bar and quit it with `home()`. Such apps run with `ZINC_DISPLAY=shell`: they draw through the socket `ZINC_SHELL_SOCKET`, take their input from it and end when the shell asks or goes away. The Home key of a keyboard or remote is `BrowserHome` in `keyName()`.
- **New** The player installs apps from a Zinc hub: the + of its top bar pairs with the hub by the code it prints, lists the apps made for this Pi and installs them beside the apps sent with `zinc device`, with the catalog, the publisher's signature and the SHA-256 checked as on the reMarkable.
- **New** A/B images: `"ab": true` in a `tools/pi-image` profile builds an image whose whole system is replaced by a signed bundle (`tools/pi-image keys`, `tools/pi-image bundle`, then `zinc-system-update install` on the Pi). It boots the new system once and goes back to the previous one if the session does not start.
- **New** A Mac's USB-C cable is a network link to the Pi (an Apple silicon Mac shows itself as a USB network device Linux used to refuse): the image builds the driver when it has the compilers, else run `sudo zinc-admin mac-usb` once. Sidecar then reaches the Pi by its `.local` name over the cable.
- **Fixed** Updating the image no longer compiles the player on the Pi: a release carries it ready to run, `zinc:shell` included (the update to 0.9.1 failed on a Pi 3 with "cannot read the library of plugin", which `zinc pack` no longer stops on either).
- **Fixed** The player shows the full version of its engine with the commit (`0.9.1+708.gbace6c038`), as the reMarkable hub does, and a failed engine update shows the error itself on up to three lines (with the exit code, or "out of memory?") instead of one cut-off line of compiler progress.
- **Fixed** The player no longer keeps a core busy on its home screen: its animation draws 12 frames a second and stops after a minute without a touch (it used a whole core of a Pi 3 and could trip its under-voltage limit), and it reads the update status only in the settings.
- **Fixed** Apps no longer stall for up to 170 ms once a second: the screen's driver looks for keyboards, mice and HDMI inputs only when one is plugged in, instead of reopening them all every second.
- **Fixed** An app started from the player is one `zinc device` knows: `apps` shows it running, `logs` reads its output and `stop` ends it (the player comes back, with no crash page).
- **Fixed** On a Pi without a desktop, an app whose display driver cannot start falls back to the framebuffer instead of stopping; GL plugins build on the Pi itself; `zinc device run` no longer ends the shell when it starts an app; an app under the shell keeps 60 frames a second where it fell to 40 (four buffers instead of three).

### Devices, deploy and packaging
- **Changed** `zinc device deploy` to a Raspberry Pi builds the app on your computer (a `.zapp` with its plugins cross-built for the Pi) and the Pi just runs it. An app compiled by a newer zinc says so when it starts there, with the way out (`zinc device <pi> update --local`); `--source` sends the sources as before.
- **Faster** `zinc device deploy` sends only what changed when the device already holds a version of the app; the step line says how much was sent and how many files were unchanged. A device with an older agent, or a mismatch, gets the whole file, and `ZINC_DEPLOY_WHOLE=1` always sends it whole. Sending to a slow device (`install`, `deploy`) no longer slows down as the transfer grows.
- **New** `zinc pack --target rpi` (or `rpi1`, `rpi2`, `aarch64-linux`, `armhf-linux`, `x86_64-linux`) packs a `.zapp` for another Linux machine with its native plugins cross-built, including the ones a program loads at their first call (`zinc:video`). `zinc run app.zapp` loads the plugin libraries the app carries, as a fused app does, so a Pi needs no FFmpeg development packages and compiles nothing.
- **Fixed** `zinc run app.zapp` loads the native plugins the `.zapp` carries (a `.zapp` made with `zinc:video` asked for libavformat on a Pi that had it packed).
- **New** `zinc publish --target rpi` (`rpi2`, `rpi1` or a Linux target) publishes a `.zapp` packed for that machine, and `--export` publishes the export of `zinc export --target` with its engine. The signed manifest names the target (`target=`, `kind=`), and a Zinc hub keeps one package per channel and target.
- **Changed** A `.zapp` runs on any engine that has what its program uses, even one older than the zinc that packed it: `zinc pack` writes `needs` in the manifest, and an engine that lacks something says "this app needs a newer zinc engine". The reMarkable Hub tells you to update the tablet's engine instead of installing such an app.
- **Smaller** Linux exports (`zinc export --target rpi`, `linux`...) leave out the debug sections (museum-table: 139 MB down to 26 MB), and `zinc pack` and the Linux exports keep the photographs of `assets/` (JPEG, WebP) as files, decoded when first drawn, instead of baking their pixels (museum-table's package: 99 MB down to 24 MB).
- **New** Each app keeps its `zinc:storage` keys and its files in a folder of its own, `~/.zinc/apps/<name>/` (`dataDir()` of `zinc:sys`); keys an app had in the shared `~/.zinc/storage.kv` move there the first time it runs, and erasing that folder resets the app and nothing else. Programs on QuickJS, JavaScriptCore, V8 and Hermes (so every such program under `zinc dev`) keep their `zinc:storage` and AsyncStorage keys in `<zinc home>/apps/<zinc.json name>/storage.kv` too.
- **New** Android: on a rooted device `setBacklight(false)` turns the backlight fully off instead of leaving the dimmest glow, and a touch still wakes it. The app asks for root the first time; without root it dims as before.
- **New** Experimental Intel Mac runtime for macOS 10.12: run packed `zinc:gfx` programs in a software-rendered Cocoa window with game keys and mouse input. It builds separately (`targets/macos-legacy`); real Sierra compatibility is not verified yet.
- **Fixed** macOS app bundles (development and exported) declare the engine's real deployment target instead of requiring macOS 11, and keep the macOS 11-only UniformTypeIdentifiers framework optional, so builds for Catalina no longer abort at start. Loading a prebuilt plugin no longer writes a cache into its folder, so a signed bundle stays valid after launch.
- **Fixed** museum-table runs when sent to another machine: it imported the devtools plugin by a path outside the project, and now uses `zinc:devtools/cdp`.

### Performance
- **Faster** https servers parse their certificate once and resume TLS 1.3 sessions with tickets, so a returning client skips the full handshake.
- **Faster** `zinc:net` servers keep connections alive and answer pipelined requests, three times faster than before and ahead of Node 24 on the same Mac (`tools/bench-http` measures zinc, Node and Bun with oha). `serve` and `serveAsync` take `ServeOptions`: header and body sizes, connections in all and per address, a request rate per address, header, body and keep-alive timeouts, each with a default that blocks slow or flooding clients (431, 413, 429, 408).
- **Faster** Large programs build much faster after an edit (the iPod demo): type checking 1.5 s down to 0.3 s on every `zinc run`, `zinc build` and `zinc check`; writing the bytecode 1.3 s down to 0.24 s; writing the C++ of `zinc run` and `zinc build` about ten times faster, 13.7 s down to 1.4 s.
- **Faster** The first build of a plugin compiles its files on half the cores at once (`ZINC_JOBS` sets the number): `zinc:ipod` builds in 19 s instead of 72 s, and the iPod demo's first `zinc build` takes 75 s instead of 145 s.
- **Lighter** Apps give the memory they no longer use back to the system while they run: the Discord client after login with 100 servers takes 93 MB in Activity Monitor instead of 204 MB, and a program that parsed a large JSON document drops back to its size before it.
- **Faster** `JSON.parse` is about twice as fast and `JSON.stringify` a quarter faster on large documents (96,000 objects in 4.5 MB: 30 to 15 ms, 24 to 17 ms); `JSON.stringify` of a long string with accents is linear (90 KB took 19 s, now a millisecond); a `Map` or `Set` of up to 8 entries no longer allocates a hash index.
- **Faster** Promises are lighter: an async function, `then` or `catch` no longer allocates an array and three closures for the promise it returns, and a loop of `await`s runs about 20% faster interpreted and 30% faster compiled.
- **Faster** `zinc:worker` messages are about 15 times faster both ways: 100,000 records cost about 6 ms to `postMessage` and 7 ms to arrive in `onmessage` (about 100 ms each before), so posting a large data set no longer freezes the window.
- **Faster** `zinc:fs` `writeText`, `appendText`, `writeBytes`, `readText` and `copyFile` read and write a file in one go: writing 3 MB took 40 ms or more on macOS, now about 1 ms.
- **New** A minimized or hidden desktop window is an app in the background (`appState()` is `'background'`, with the `background` and `foreground` signals): nothing is drawn until it comes back.
- **Fixed** A `setTimeout(0)` set while timers run (a long computation that yields with `await` on a timer) waits for the next frame, so the window keeps drawing and taking input.

### UI and kits
- **Fixed** A plugin that calls `font('mono', n)` itself (the code editor of Atelier and zed-editor) gets the monospace face baked into the app, so its caret and columns line up.
- **Changed** A border takes room as in CSS and React Native: the content sits inside it, so `rounded-full border-2` around an avatar draws a ring, a box sized by its content grows by its border, and `box-content` adds padding and border to the size it is given. Bordered inputs, cards and buttons are a pixel or two larger.
- **Changed** `min-w-0` (in a row) and `min-h-0` (in a column) let a box shrink below its content as in CSS, so `flex-1 min-w-0` panes and texts stay inside the window; a `basis-*` respects the box's `min-*`/`max-*` size.
- **New** Negative offsets (`-top-2`, `-right-[6px]`, `-bottom-1`, `-left-px`) place an absolute box past its parent's edge, as in Tailwind.
- **New** Text: an `<Image>` inside a `<Text>` flows and wraps with the words, as in React Native (`ui.pictureRun(w, h)` puts a picture in a run of `setTextRuns`); `ui.RUN_STRIKE` strikes a run through as `RUN_UNDERLINE` underlines it; a newline in a `<Text>` starts a line instead of showing a `?`.
- **New** `<Image image={img} />` shows a runtime image (from `imageFromBytes`, `imageFromPixels` or a plugin), as `src` shows an asset, and follows a signal like any prop.
- **New** Several windows that talk, as Electron's `BrowserWindow` and `ipcMain.handle`: `zinc:system/window` opens, lists, moves, resizes, focuses and closes each window (`open`, `list`, `get`, `current`), `zinc:worker` adds `MessageChannel` ports with `postMessage` and `request`/`handle`, and a worker can compute a window's scene (`workerPort`, `parentPort`, `setScene`) so a busy computation leaves the other windows drawing.
- **New** `windowFocused()` says whether the window has the focus (another app or window in front makes it false); the `focus 0|1` system signal sets it in tests.
- **New** Keys: `ui.onKeyUp(f)` hears a key's release, and Shift, Control, Alt and Meta held alone reach `ui.onKey` and `ui.onKeyUp` (hold Shift to pick several things, act when it is let go).
- **New** Back and forward for desktop apps, as a browser's: `zinc:ui/history` keeps the app's view state per entry (`push`, `back`, `forward`, `reset`, reactive `canBack` and `canForward`, a `scrollKey` per entry), moved by Cmd+[ and Cmd+] (Ctrl elsewhere), Alt+Left and Alt+Right, the mouse's side buttons and a two-finger swipe sideways. The side buttons no longer act as a left click (`ui.goBack`, `ui.goForward`, `ui.addForwardHandler`).
- **New** Scrolling: `scrollKey` on `ScrollView` and `VirtualList` (or `ui.setScrollKey(h, key)`) brings a list back where it was when a view with the same key comes again; `scrollToRow(list, i)` brings a row into view with the least scroll; `dragToScroll` lets a mouse drag a scroll container (carousels) without the drag being a click; `ui.scrollTo(h, x, y, true)` eases to the offset.
- **New** In `zinc:ui/kit`: `ZoomView` (pinch, pan, double tap and Ctrl/Cmd + wheel zoom for any content, scaling the last picture while the fingers move and telling `onView` once they lift), `ResizeHandle` (shadcn's ResizableHandle), `ProgressRing` (a small ring filling clockwise), and `Switch` takes `accessibilityLabel` for a screen reader.
- **Fixed** Layout: a text that grows from a zero width (`flex-1 w-0`) wraps at the width it gets, style runs too; `width: pct(0)` is no width, as 0% on the web; `w-full max-w-[760] self-center` (or `self-end`) centres the box once max-width makes it narrower, as Yoga does; a child growing from `basis-0` that holds wrapping content, even deeper in a column, is as tall as that content once wrapped, and a `flex-wrap` row there wraps at the page's width.
- **Fixed** Lists: a `VirtualList` whose rows are components scrolls again (its rows piled up out of sight) and keeps their side margins; a row whose class changes keeps its place; `<VirtualList stickToBottom>` and the other scroll flags of `<ScrollView>` take effect, so a chat opens at its end and follows new messages; rows of their own heights stay in place when the list renders again; an unknown attribute on `<VirtualList>` is an error.
- **Fixed** A UI app no longer carries a 12 px font it does not use: the app was larger, and `zinc:gfx`'s default font (`textWidth(0, ...)`) was that 12 px face instead of the 16 px one.
- **Fixed** Scroll snap: a trackpad swipe released in a `snap-x` or `snap-y` container glides straight to its snap point instead of gliding on and jumping back.
- **Fixed** Text and emoji: with `"text": "shaped"`, a typographic quote, a symbol or a text-style emoji (⛔) the built-in font lacks is drawn from the system fonts; colour emoji draw in a windowed `zinc run` and on QuickJS, and a program that shows an emoji without `"text": "shaped"` says once to add it instead of a silent `?`.
- **Fixed** `"growDrawCommands": true` in a target of `zinc.json` lets a frame's text grow too, so a long list or log no longer loses its text past 32 KB, and the "text pool is full" warning says how to fix it.
- **New** `zinc:ui` `onScroll` gives React Native's `contentSize` and `layoutMeasurement` with `contentOffset`, so a list knows when it shows its end.
- **Fixed** `zinc:ui` `defineScheme` called again for the scheme on screen recolours the nodes that use its variables at once (it waited for the next scheme switch).
- **Fixed** `zinc:ui/react` `useEffect` and `useLayoutEffect` run the cleanup their callback returns, before the effect runs again and when the component goes, as React does.

### Zinc Inspector and DevTools
- **Fixed** The computed styles shown right after a class or style edit are the new ones, not those of the previous frame.
- **New** An Info view, shown first when you attach, describes the program: its `zinc.json` name, id, version and permissions, the zinc version, dev run or not, uptime and pid; the machine (system, CPU, cores, memory, this machine or a paired device); the engine and profile; the renderer, GPU, window size, scale and the refresh rate vsync aims at (following the window to another screen); plugins, source files (also of a `.zapp` or a `zinc build` executable), `zinc:` imports, functions compiled, assets on disk and in packs, workers; and frame rate, phase times, memory, the JavaScript heap and CPU time, refreshed every second (`Zinc.getProgramInfo` for other clients).
- **New** Elements looks and works like Chrome's: folded tree with disclosure triangles (Alt-click for a subtree), wrapped long lines, Chrome's colours, closing tags, inline lone texts, flex badges and `== $0`, arrow keys, and the hovered row highlighted in the program. In a dev run (`zinc dev`) it shows your components (`<Card> src/main.tsx:30`) with their props; a search finds a component, tag, class, text or id; toggles show only what is rendered, only components, or hide host wrappers.
- **New** Live editing in dev runs, never written to your source: double-click a text to change it; Styles lists a node's properties at their computed values, edited in place with arrow keys stepping numbers in their unit, names and keywords completed, colours from the kit's palette or a hex field, and new declarations added as in Chrome (`element.style` now also applies `display`, `position`, `overflow`, `align-self`, `align-content`, `flex-shrink`, `top`, `right`, `bottom`, `left`).
- **New** Classes in dev runs: the `.cls` pane switches, adds and removes classes with completion that previews each one on the node (Escape takes it back), *Edit as text* changes the whole `className`, Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z undo and redo, and a *Changes* box lists per edited node its component, `file:line` and the `className` or style keys to write, with *Copy*.
- **Changed** Component names in Elements and editing from DevTools need a dev run (`zinc dev` or `ZINC_DEV=1`); other runs record nothing, cost nothing and refuse the edits with a message.
- **New** Pick works like Chrome's inspect mode, on the Screen view or in the program (Cmd/Ctrl+Shift+C in a `zinc dev` run): margin, border, padding and content boxes with a tooltip (component, classes, size, a text's font and colour), ArrowUp and ArrowDown to move to the parent and back, a click selects and ends the pick, Escape ends it; the click never reaches the app. `DOM.getNodeForLocation` answers Chrome DevTools too.
- **Faster** Screen streams frames only as they change (JPEG, only the changed area), many times faster and with almost no CPU while still; the highlight is drawn by the inspector over the picture, never into the program's frames, and follows the pointer without lag.
- **New** Pause, Resume and Step frame freeze the whole app as Chrome pauses a page: no frames, timers, input, animation time, sound or worker messages until you resume, with a "Paused in Zinc Inspector" badge; Elements, Storage, Info and Screen keep working and an edit redraws the frozen frame. F8 or Cmd/Ctrl+\ in a `zinc dev` run toggles it (`Zinc.setPaused`, `Zinc.stepFrame`, `Zinc.pausedChanged`).
- **New** Storage works like Chrome's Application panel: a tree of `zinc:storage`, AsyncStorage and each SQLite database and table, a grid with sortable, resizable columns, filter and selection; key/values edited in place, added, deleted and cleared, live, with a JSON tree or raw view; tables with typed cells, pages, row count, sort, filter, schema and indexes, read-only queries and writes behind a confirmation in dev runs. Chrome DevTools gets the key/values through `DOMStorage`; the panel names the store it lists.
- **New** Network: a waterfall, filters by type, text and status, Preserve log, Clear, Export HAR, Copy as cURL, and per request its headers, query, payload, a JSON, text or image preview, timing phases and a WebSocket's messages; an inspector that attaches late sees every request made so far.
- **New** Threads and Performance: a lane per thread (the main thread's frames, each worker's handlers and messages), and a Threads view with each worker's state, messages waiting and posted, live heap blocks, CPU time and the error that ended it (`Zinc.getThreads`).
- **New** `zinc:stage` scenes: `zinc dev` gives the inspector to every program with a frame loop, and Elements shows the display tree (each node by its class and name, with x, y, size, scale, rotation, alpha, visibility, a text's content or an image's `src`), live as the program adds, renames or hides nodes, editable in a dev run, highlighted and picked even when turned or scaled; a scene in a `<Canvas>` shows under its Canvas. `stage.rotationUnit = 'degrees'` fixes the highlight for scenes in degrees (AS3, OpenFL ports).
- **New** Each window of a program is its own target (`multiwin · Side`, main window first) in Zinc Inspector and Chrome DevTools, following windows as they open and close.
- **New** Programs are named after their `zinc.json` instead of "Zinc app (macos)", and the list shows engine, dev run, project, pid, port and paired device (`/json/list` gives `title`, `description` and a `zinc://<app id>/<entry>` url). The inspector finds programs on any port (`ZINC_DEVTOOLS_PORT=0`, `zinc dev`), attaches at once to one alone and again when it comes back after each save.
- **Changed** Zinc Inspector stays inside its window at any size, as Chrome DevTools does (narrowing panes, wrapping toolbars and texts, a sideways-scrolling tab bar and wide SQLite tables, splitters), and opens in a 1280×800 window that resizes instead of a 320×240 one blown up.
- **Fixed** With the inspector on port 0, the program binds the port itself and `zinc dev` names it (`the inspector listens on port N`), keeping it across versions when free; the `zinc devtools:` line names the port in use and no longer shows as an error in the console.

### Apps and demos
- **Fixed** A function whose return type includes `undefined` (`(() => void) | undefined`) may end without a `return` or with a bare `return;`, as in TypeScript 5.1, and a `(): void` callback is accepted where one is expected.
- **New** `zinc:imageio` `frames(path, maxWidth, maxHeight)` decodes every frame of an animated GIF (and of APNG and animated WebP on macOS) at the size drawn, with each frame's delay, off the program's thread.
- **New** zed-editor uses Atelier's editor: several cursors (⌘D, ⌘⌥↑↓, Alt+click), undo and redo of every cursor's edit, moving and duplicating lines, from the keys or its command palette; its settings, minimap, soft wrap and font zoom stay.
- **New** Discord's code blocks are coloured by language (```ts, ```json, ```css...) and can be selected and copied.
- **New** A native Discord client (`examples/discord`), in the spirit of discord-lite, no web view (unofficial: try it with a spare account). Log in with a token kept in the keychain, a QR code scanned with the phone app, or email and password with an authenticator or SMS code (a captcha sends you to the QR code); browse servers, channels and DMs, read history and live new, edited and deleted messages; a dropped connection resumes.
- **New** Discord: write, reply, edit and delete; typing indicators both ways; unread channels and mention counts that follow what you read here or elsewhere; Discord's Markdown, timestamps, lists and subtext; every kind of content (link previews and embeds, video, audio, voice and file attachments, spoilers, stickers, reactions, polls, system messages, forwarded and replied-to messages, bot commands and buttons, threads and forum posts) and custom emoji inside the text.
- **New** Discord: avatars, server icons, emoji and pictures from Discord's CDN kept on disk (loaded six at a time, at the size shown), colour emoji, files sent with + or dropped on the window, the live member list, and older messages loading as you scroll up in a list that stays smooth over thousands of messages. Choosing a server shows its list; nothing is loaded or marked read until you pick a conversation.
- **New** Discord notifies direct messages and mentions with a system notification that opens the channel, following your Discord notification settings (levels, mutes, suppressed @everyone and roles), with the Dock's badge counting mentions; a settings screen chooses which servers show, kept on your computer.
- **New** Discord voice and video: join a voice channel or call a DM, end-to-end encrypted with DAVE; tiles with speaking rings, mute, deafen, push-to-talk (hold F8) and cameras (only those on screen are received, at their tile's size, none while minimized); Go Live shares a screen or window at 720p 30 fps (1080p, Source and 60 fps with Nitro); a Voice & audio pane picks devices, volumes, voice activity or a push-to-talk key and the camera's quality. Use headphones: there is no echo cancellation yet.
- **New** Discord stays well inside Discord's limits: 50 requests a second and 110 gateway messages a minute at most, captcha or verification requests shown instead of retried, background requests paused 10 minutes after a refusal, a 401 back to the login, reconnections with backoff and jitter, and the scripted sessions only against a local fake Discord.
- **New** Discord keeps your account to a person's day, not only a person's minute: day caps on messages, reactions, edits, deletes and new DMs kept across launches; lower limits and no new DMs for a new or unverified account; new DMs only to friends and people who share a server; at most one invite and no @everyone without the permission; a long safe mode after Discord says "too fast" or pushes back three times in a day. Settings, Account safety explains the rules and shows your account's state and today's counts.
- **New** Discord keeps to a person's pace so the account is never taken for a bot: every request (reads too) needs your own key or click, permissions, slowmode (with a countdown in the composer), message length, upload size, blocked people and repeated or pasted messages are checked before sending, each kind of action has a cap a minute and an hour with a cooldown that grows when you push on, errors and captchas pause the background requests, only one copy of the app runs, a restart within 3 minutes resumes the session, and you show as idle after 10 minutes away.
- **New** Discord: call quality bars by "Voice Connected" (pressed: loss, round trip, jitter and bit rates) and an "Ultra low data" mode (voice at about 10 kbit/s, smaller camera and Go Live at 5 fps), by hand or after 5 poor seconds; `zinc:discord-voice` gains `getStats()` and `setLowDataMode()`.
- **New** The iPod demo (`examples/ipod`) manages a classic iPod like iTunes: a drawing of it in its colour, storage, albums with covers, songs, playlists, podcasts, audiobooks, videos, photos, notes and every spec; play with the iTunes-style bar; download, add by picker or drop, delete, backups, check and repair, mount and eject, behind an Allow changes switch off at each start; an iPod plugged in or pulled out shows within seconds.
- **New** iPod: an iTunes-style Get Info window (Cmd+I) edits one or many songs (Mixed values, only ticked fields written); Repair fixes missing covers, years, genres and artist spellings (Cover Art Archive, MusicBrainz, Last.fm); Optimise finds duplicates and merges them; Lyrics shows synced lyrics from LRCLIB and writes them to the iPod; smart playlists are shown, edited with iTunes' rules and templates, and saved as real smart playlists.
- **New** iPod: a Spotify-like queue (Play next, Add to queue, drag, shuffle, repeat), back and forward with Cmd+[ / Cmd+], side buttons and swipes, search everywhere (Cmd+F or Cmd+K), an Artists page, a sleep timer that fades out, a daily wake-up alarm, macOS Now Playing and the media keys and AirPods, and the session kept and resumed at the next start.
- **New** iPod: plays on Sonos groups (this computer or a group, songs served on the network), following the speakers' events and the queue edited from the Sonos app; closing the window while Sonos plays keeps the app in the menu bar, and quitting saves the session and pauses the speakers within 3 s.
- **New** iPod: your listening history from Last.fm and ListenBrainz (imported, resumed, retried after 2, 5 and 15 minutes when down), plays counted on the iPod and scrobbled once heard for half a song or 4 minutes, and Last.fm sign-in that finishes by itself with Test connection buttons.
- **New** iPod: Genius without Apple: Genius lists from a song (25, 50 or 100) with a Why column, daily mixes, a For you page as Spotify's home (shelves you can drag and snap, Your year), endless radio with 👍 and 👎, a smooth path between two songs, a mood mixer, and Discover for artists you lack. Deep analysis with AudioMuse-AI mixes how songs sound with what you play; Prepare recommendations brings every source up to date, and recommendations are worked out in a worker so the window keeps drawing.
- **New** iPod: Add takes songs from jukebox or any Subsonic server (converting FLAC to AAC, resuming cut downloads); "Connect to a remote iPod" opens an iPod plugged into another computer through the iPod daemon; a cache per iPod (`~/.zinc/ipod/cache/<GUID>/`: covers, library, a remote iPod's songs up to `audioCacheMb` in `config.json`, 2 GB by default) makes it open at once; every job answers with a toast, progress and Cancel, and the Transfers row shows a ring, a count and a red dot for a failure.
- **New** The iPod daemon (`zinc run examples/ipod-web`, then http://localhost:8686) for a Pi or a Mac: a web page to manage the iPod from any browser, a JSON API with a token (status, tracks, tags, plays, playlists), a Subsonic server any Subsonic client (and AudioMuse-AI) streams from, jukebox's satellite routes, scrobbling to Last.fm and ListenBrainz, read-only unless started with `--allow-changes`; `--log-requests` prints each request with secrets masked.
- **New** iPod daemon details: `/pod.json` and `/api/status` (with `firewireGuid` and the database `marker`); `POST /api/update` (tags for many songs in one save), `POST /api/playlist` and `POST /api/played` (plays kept until a run with `--allow-changes`); Subsonic with `--user`/`--password` or `--api-key` (OpenSubsonic), playlists created, updated and deleted with `--allow-changes` (else error 50; smart playlists refused), absolute song paths; `--jukebox <address> --jukebox-token <token>` and `--url` report the iPod to jukebox; `--lastfm-key`, `--lastfm-secret`, `--lastfm-session`, `--listenbrainz-token` scrobble a Subsonic client's plays.
- **Fixed** iPod: For you no longer freezes the window on a large library; scrolling no longer stutters while similar artists are fetched (now all in one run, with a count and Cancel); Genius skips songs AudioMuse has not analysed; the Last.fm sign-in works (a GET, not a POST) and can start over; the queue panel and the bar follow Sonos at once; the album grid and long lines stay inside the window.
- **New** The photo sorter (`examples/photo-sorter`): pick folders, then file each picture into albums (in place or elsewhere, moved or copied) by dragging, throwing, a key or a model that learns from the camera, the date and the place; a trash that empties into the system's, undo on disk, thumbnails and EXIF, light or dark, French or English.
- **New** Trieur (`examples/trieur`): links a model learns to file, six layouts, an inbox to triage and flashcards with spaced repetition, light or dark, with an FR / EN switch.
- **New** Sprite studio (`examples/sprite-studio`): a pixel-art editor in three windows (canvas with pencil, eraser, fill, picker, frames, onion skin and undo; a floating tools and palette window over a `MessageChannel`; a live preview computed by a worker), its preview on QuickJS too.
- **New** The webrtc-call demo shows call quality live and shares a screen or a window with the share dialog; `examples/webview/sidecar-browser` streams a browser page to a tablet that becomes its remote.
- **New** Experimental `zinc:carplay` plugin and viewer demo: video, audio and two-finger touch through a separately installed PlayPort backend, with day and night appearance (`setNightMode`). USB and the microphone uplink are not implemented yet.
- **Fixed** Discord video calls follow Discord's voice protocol more closely, so cameras and Go Live streams can reach the official client and show here: a connection now announces itself before any media (also when you only watch), Go Live streams are described as Discord expects, and key frames come at the interval the server asks. `DISCORD_LOG=1` prints a diagnostic of the call (voice gateway messages without tokens, session ids or keys, and per-stream packet, key frame and decoding counters) to send with a bug report.
- **New** Discord: presence on avatars (online, idle, do not disturb, on a phone) in the member list and the DMs, and the member list as Discord shows it: hoisted roles, Online and Offline with their counts, names in their role's colour, and only the rows on screen asked for as you scroll.
- **New** Discord: pinned messages (the pin of the channel's header lists them, a click shows one in the channel; **Pin** and **Unpin** under the pointer where you may pin), a reply's reference that jumps to the message it answers (fetched once when it is older than what is loaded), threads and forum posts read in a pane beside their channel, a red NEW line above the first unread message, and a "new messages / Jump to present" bar when you scrolled up: a channel is marked read only once you see its end.
- **New** Discord: themes are plain JSON files (colours, corners, font, text size, density) chosen in Settings, Appearance, with Discord dark and light and Slack-like and Teams-like looks shipped; drop your own in the folder the pane shows (`assets/themes/theme.schema.json` describes them). Code blocks have a Copy button, and the `<>` button of the message box inserts a fenced block in the language you pick.
- **New** Discord: emoji, GIF and sticker pickers by the message box: emoji you used last, your servers' custom emoji, Unicode's by group and a search by name (the smile on a message reacts with any of them); GIFs from Discord's own GIF search, asked once the typing pauses; your servers' stickers. GIF attachments, GIF and APNG stickers and Tenor GIFs play while they are on screen and the app is in front, decoded at the size shown.
- **New** Discord: a file larger than your Discord limit (by your Nitro and the server's boosts) opens a transfer window: send it to Litterbox (anonymous, 72 hours), your pixeldrain account or your own Gokapi server, with a progress bar, then post the link.

### Sidecar: any screen for your Mac
- **New** Sidecar shows a Mac's screen as a second display or a mirror on a reMarkable, a Raspberry Pi (`app/sidecar-screen` on HDMI), an iPad or iPhone (`app/sidecar/ipad`, iPadOS 15+), an Android device (`app/sidecar/android`, Android 5+) or another Mac (`build/sidecar-receiver`, an iMac 5K say), over the network or the USB cable, charging meanwhile. Build it with `app/sidecar/mac/build.sh`, then `sidecar-screen --host <address>` (or `adb`, `usb`; `--hidpi` for a Mac); the receiving Mac runs full screen at native size (`--size WxH`, `--windowed`, Esc quits).
- **New** The menu bar app (`Sidecar.app`) chooses the outputs, lists screens that announce themselves on the network with one click to add, streams to several at once (each with its own settings and Mac display), shows each screen in the Mac's Displays under its own name, and offers "Looks like" sizes (Retina, low resolution, native pixels).
- **New** A tablet or another Mac drives the Mac: a finger or mouse is the pointer, a tap a click, two taps a double click, two fingers scroll, the Apple Pencil draws with pressure and tilt (macOS asks once for Accessibility).
- **New** Sound plays on the screen (turn on Sound in its settings, or `sidecar-screen --audio`): a Pi on its headphone jack or HDMI, a Mac on its speakers, while the Mac goes quiet. Films at 25 pictures a second play without judder: after 4 s the Mac's display and the Pi's HDMI screen switch to 50 Hz, and back 6 s after.
- **Faster** Changed tiles are filtered and compressed with zstd on every core and decoded on every core of a Pi (large changes first in reduced colours, then exact once they rest, `--exact` turns that off; a quarter of a 1080p screen moving: 54 pictures a second instead of 30, round trip 18 ms instead of 34); a part that moves like a film goes as H.264 decoded by the Pi's hardware onto a display plane (60 a second with 6% of its CPU; `--no-video` turns it off); "Whole screen as video" (`--video-all`) sends everything as H.264 while it moves and exact once quiet; two pictures in flight make slower screens smoother (a Nexus 7 goes from 50 to 60 frames a second).
- **New** A Details window per screen: link, picture, frames, throughput, encode and decode times, round trips, the screen's CPU, temperature, throttling and memory, the refresh, and a Speed test. `sidecar-screen --synthetic <percent>` sends the same moving load each run to compare links.
- **New** Sidecar opens Sidecar Screen on the Pi through its Zinc agent ("Open it there"), tries each address of a `.local` name with a cable first, and says when macOS blocks Screen Recording or Local Network access, with a button to the setting.
- **Fixed** A screen no longer stops when another screen comes or goes, stays taken by a Mac whose connection died, shows half a picture torn in tiles, or keeps a film's rectangle in video colours once the screen is still; a tablet added on the cable starts at Retina size.

### reMarkable
- **New** Sidecar on the reMarkable: the Mac's screen in fast black and white over USB, with presets (Text, Speed, Video, Reading, an experimental Hybrid with the panel's 16 greys at rest), a pen tablet mode where the Marker draws in Mac apps with pressure, tilt and hover, two-finger scroll, a three-finger quick panel, a Profile tab, the frontlight and the plug state from the Mac. `zinc-tile sidecar.zapp --session --max 7200` runs it without xochitl (`--max` sets any session's time).
- **New** Sidecar reads like paper: blue-noise dots only on photos and films, sharp black-and-white text and solid lines, dark modes turned into ink on paper area by area (`--invert 0|1|2`), pale tints as light grey, photos with their own curve and never turned negative, round avatars and screenshots kept sharp; grey patterns previewed in the settings (`--dither 3`, `--grey-levels`), and `sidecar --render` shows a landscape screen at full size.
- **Faster** Sidecar draws the pointer on the tablet, compresses with zstd, scrolls what the tablet already shows, uses the Mac's GPU for big changes, no longer waits for each update while scrolling, holds updates on pixels the panel is still driving, cleans ghosts once the mouse rests, and can stop the Mac's caret from blinking. Update both the tablet engine and the Mac app.
- **Fixed** Sidecar no longer blackens the corners of light windows inside dark areas, draws dashes along their borders or leaves ghosts and coloured residue; Full refresh redraws in clean greys first, and coloured badges of a dark mode come out light grey with dark letters.
- **New** Zinc Hub, the tablet's app store: a home grid in the style of iOS with badges for updates and apps not responding, a Store (All and Installed: update, Update all, rollback, channel, Pin to sidebar, Reset data, uninstall), permissions to Allow before install, an Info page, a Running page that stops any app, Clean up AppLoad for tiles whose app is gone, an Accueil widget card, catalogs shown offline and update checks that never block, and engine updates (`tools/rmpp-engine --publish <hub> --token <t>`, swapped in safely; `zinc --engine-info` prints what an engine runs).
- **New** Ink sessions: the Hub can run an app outside xochitl with the panel to itself (Store › Installed › Ink session, marked INK on the home grid, or `"display": {"ink": "session"}` in `zinc.json`), and says why when the tablet refuses.
- **New** Header mode (experimental): `"display": { "header": "remarkable" }`, or Settings › Experimental › reMarkable header for every app, shows the app below the tablet's live top bar with a badge naming it and its Home and Quit; xochitl's menus open over it (Zinc AppLoad build with patches 0005 to 0010; the setting writes `~/.zinc/rmpp-header`). `RemarkableBar` becomes a slim bar.
- **New** Stuck apps: a watcher notices an app that stops responding, uses the CPU while hidden or takes too much memory, and the Hub offers Stop / Wait; three fingers held for 2 s quit any app, as does pressing the power button twice on a hung one.
- **New** Zinc Web: tabs, Home, a Reader view (Mozilla's Readability), Full screen, A− / A+, a contrast slider up to 4×, the writing tools of PDF, and pages sent from the Mac by the relay's page or bookmarklet; the relay can render in your own Chrome through an extension (`--browser extension`, for sites that refuse headless Chrome), run in Docker on a NAS or Pi (`--block-private`, `--tls-cert`/`--tls-key`, `--no-sandbox`), and uses tokens of 2 letters and 8 digits (delete `relay.token` for a new one); `contrast=1..4`, `--no-open` and `--no-token` (trusted networks only) are new relay options, and Web gains Close all, First and an e-ink page style.
- **New** Writing tools as the tablet's own (ballpoint, fineliner, marker, pencil, calligraphy, highlighter, colours, widths, erasers, undo and redo: `InkPalette` of `zinc:remarkable`, with `shown` and `onHide`; `setPenMode` uses the fast Pen refresh only while the tools are unfolded), kept in notes, SVG and annotated PDFs; writing in Web, Read and PDF is as fluid as in notes (`Ink.drawOver`), and `Ink.draw` takes a view to write on a zoomed page.
- **Faster** Pinch-zoom works as in the tablet's own apps: the page is scaled as a quick ghost while the fingers move and drawn sharp once they lift, with a quiet partial refresh after; Read changes its text size by pinching, PDF and Web zoom by double tap, and the Notes example zooms up to 4×. `refreshIntent('interactive' | 'settle' | 'normal')` of `zinc:gfx` tells e-ink displays what a frame is for.
- **New** Typing with the Type Folio or AppLoad's on-screen keyboard (`"display": { "keyboard": true }`), `RemarkableKeyboard` drawn for e-paper (the kit's `Keyboard` takes `labelClass`, `specialLabelClass`, `enterKeyClass`, `shiftOnClass`, `handleClass` and `shadow={false}`), apps pinned with AppLoad's `pinned.json`, apps pinned to the sidebar with their icons, a swipe-down panel with Home, Quit and Cancel, and round icon buttons with a battery icon in the top bar.
- **Fixed** Windows that stayed hidden behind xochitl, blank widgets, a Marker ignored in widget cards, second copies of a running app, Web reloading long addresses, Read pictures shown as placeholders, Refresh in header mode, and a hub server catalog broken by one altered package.

### Plugins and modules
- **New** `zinc:net` `fetch` sends a file without loading it in the program (`bodyFile`, with `bodyPrefix` and `bodySuffix` for a multipart form) and reports a large upload as it goes (`onProgress(sent, total)`).
- **New** Statements that do not use `this` may come before `super(...)` in a derived class's constructor (TypeScript 4.6); using `this` before it is error Z0118.
- **New** `zinc:editor`: Atelier's code editor for any app. `<CodeEditor>` edits an `EditorState` with several cursors, undo, brackets that close themselves and line numbers; `<CodeView code lang>` shows highlighted, selectable code; `registerLanguage` adds a language; four themes (`LIGHT`, `DARK`, `ONE_LIGHT`, `ONE_DARK`). `zinc:command-palette` gives the fuzzy `<Palette>` and `fuzzy()`, `zinc:editor-lsp` a language server client (completion, signature, hover, definition, diagnostics). See `docs/plugins/editor.md`.
- **New** `zinc:net/acme` gets certificates from Let's Encrypt (or another ACME server) with the http-01 challenge: `certificate({ domains, email, dir })` keeps one while it has 30 days left, `keepRenewed(port, options)` renews it and swaps it into the running https server. `setCertificate(port, cert, key)` swaps one by hand, and `hostname` in `ServeOptions` chooses the address a server listens on (`127.0.0.1`, `::1`, `::`).
- **New** `zinc:net` serves WebSockets on the same port as its HTTP routes: `webSocket` in `ServeOptions` (`upgrade`, `open`, `message`, `drain`, `close` handlers, as Bun's), `ServerWebSocket` `send`, `sendBytes`, `close`, `ping`, with a message size limit (1009), an idle ping then close, a back-pressure limit (1008), and `wss://` with `cert` and `key`. `zinc:socket`'s `serveWebSocket` runs on it and takes the same limits and `cert`/`key`.
- **New** `zinc:net` streams: `streamBody: true` hands a large upload to the handler as it arrives (`req.bodyStream.each`), and a reply with `stream: (w) => ...` writes its body in parts with back-pressure (`write` returns false, `onDrain`, `onClose`, `end`).
- **New** `zinc:screen-capture` (macOS) lists screens and windows with thumbnails and app icons (`getSources`), captures one at a size and rate, and shares it in a call with `navigator.mediaDevices.getDisplayMedia` (permission `"screen"`); `zinc:screen-capture/picker`'s `pickScreen()` is a ready-made share dialog.
- **New** `zinc:webrtc` shows call quality: `CallQuality` scores `getStats()` good / fair / poor with the bit rates, `setLowDataMode(pc, true)` sends Opus at 10 kbit/s and tiny or no video, the kit's `CallStats` panel shows it live, and `getStats()` reports `framesDropped` and `availableOutgoingBitrate`.
- **New** `zinc:discord-voice`, a Discord voice connection for any program (voice gateway, UDP, both encryption modes, Opus, mixing, DAVE end-to-end encryption), with `inputDevices()`, `outputDevices()`, `setDevices()`, `setVolumes()`, `setUserVolume()` and `level()`.
- **New** `zinc:ipod` manages classic iPods (Classic, Nano, Mini, Video, Shuffle) over libgpod: detect, open or initialise, tracks with tags and covers (`artwork()`, `cover()`), playlists, `specs()`, photos (`photoAlbums()`, `photo()`), `extras()`, `download()`, snapshots and backups (`backups()`, `deleteBackup()`), check, repair, `mount()` and eject, with a free-space check before any copy and the missing SysInfoExtended written.
- **New** `zinc:ipod` edits: `update()` writes every field iTunes' Get Info edits (`''`, `0` or `false` clears one), `bpm`, `skipCount` and `lastSkipped`, `played()` adds plays, `writeLyrics()`/`readLyrics()`; smart playlists with `createSmartPlaylist`, `setSmartRules`, `refreshSmartPlaylists` and `evaluateSmart` (a Nano 6G/7G refuses them); `analyze()` finds duplicates by tags, identical files and Chromaprint fingerprints (cached) and `merge()` keeps the best copy. `ZINC_IPOD_ROOTS` now replaces the folders `detect()` looks in.
- **New** `zinc:sonos` follows SoCo: `playUri`, `addUriToQueue`, `clearQueue`, `playFromQueue` with `Song` and `musicTrackMeta`; the queue (`getQueue`, `queueSize`, `addMultipleUrisToQueue`, `removeRangeFromQueue`, `moveInQueue`, `reorderTracksInQueue`) and Sonos playlists; `Events.watch(g)` keeps groups and speakers up to date without polling (`handleNotify`, `localAddressFor`); `stop`, shuffle, repeat, cross fade, group mute and volume, `speakerByName`, `unjoin`, `partyMode`, hidden rooms; a speaker address can carry a port; faults are a `UpnpError` with its `code`.
- **New** `zinc:audio` `openMusic(path)` streams a song from disk with play, pause, seek and ended; `zinc:system/media` puts an app in macOS Now Playing with the media keys and AirPods, through the Media Session API (`mediaSession.metadata`, `playbackState`, `setPositionState`, `setActionHandler`; permission `"media"`; other targets do nothing, `zinc:platform` `MEDIASESSION`).
- **New** `zinc:imageio`: `info(path)` reads a picture's size, orientation and EXIF (date, camera, lens, exposure, GPS...), `thumbnail()` and `load()` decode and turn it upright off the main thread, newest first (`cancel(path)`), thumbnails cached on disk; JPEG, PNG, HEIC, WebP, GIF, TIFF and RAW on macOS, PNG, JPEG, GIF, BMP and WebP elsewhere, QuickJS too. `zinc:system/opener` `trash(path)` moves a file to the trash.
- **New** `zinc:secure-store` keeps secrets in the macOS Keychain with Expo's API (`expo-secure-store`); where no keychain exists the calls reject, never writing a plain file.
- **New** `zinc:subtle` adds RSA-OAEP keys and `digest('MD5', ...)` for old protocols (never for security), and works on QuickJS.
- **New** `zinc:xml` `parse(text)` reads XML into an element tree (`El` with `attr`, `child`, `all`, `find`, `findAll`, `textOf`) and `toXml` / `toJson` write it; `zinc:fs` adds `appendBytes`, `writeTextAsync` and `readTextAsync`; `copyFile` keeps the date and permissions; `zinc:sqlite` `stmt.cursor(params)` reads rows a batch at a time.
- **New** `zinc:net` servers return their port (0 takes a free one), serve several ports with their own handlers (`stop(port)`), send files (`file: path` in a `Reply`, `Range` giving a 206, past the end a 416), give `remoteAddress`, and work on QuickJS; `zinc:socket` WebSocket takes extra handshake headers.
- **New** `zinc:webview` `setZoom(factor)` and `key(code, text, mods)`; `zinc:trieur`, the card sorter on `zinc:ui` (`createDeck`, `<Deck>`, `setLanguage('fr' | 'en')`); `sys.execPath()` gives the program's own executable, as Node's `process.execPath`.
- **New** Display drivers on demand: `zinc.json` `"displays"` links them, and a process started with `ZINC_DISPLAY=<driver>` uses that screen. `display-sidecar` runs a Zinc app with an iPad, iPhone, Android or Mac running Sidecar as its own screen, no screen capture (`ZINC_DISPLAY=sidecar ZINC_SIDECAR=adb zinc run <app>`, or `usb`, or an address): touches, pinch zoom, double taps, the Pencil and a plugged mouse drive it, and a web view shows on it too.
- **Fixed** Networking: TLS 1.3 connections (`wss://`, `https`) no longer hang when tickets and the first reply arrive together (one Discord connection in two did); WebSocket receives large messages about seven times faster; `fetch` with `bodyBytes` sends bytes unchanged; a program's `User-Agent` is the only one sent; a `serveAsync` reply after 10 s is sent; `serve()` on a busy port says which port and what to do.
- **Fixed** `zinc:sqlite` `prepare(sql).get()` in a loop no longer fails after 1024 calls; `zinc:ipod` reads the USB list instead of opening iPods at every scan, mounts an ejected iPod, and prints libgpod's messages as short lines.
- **New** `zinc:webrtc`: `ZINC_WEBRTC_IMPAIR='loss=10,burst=3,rate=20k,delay=50,jitter=30,seed=1'` puts a call on a bad network without root (seeded loss and loss bursts, a rate cap with its queue, delay and jitter on what it sends), and `getStats()` gives `wireBytesSent`: what a stream costs on the wire, headers included.
- **Changed** `zinc:webrtc` calls hold up better on lossy links: the receiver rebuilds a lost packet from the next one's Opus FEC, and between two Zinc apps from Opus deep redundancy (DRED); the rest is concealed by Opus's neural PLC. The FEC follows the loss the other side reports, and the ultra low data mode sends 60 ms packets, which keeps it near 17 kbit/s on the wire. `getStats()` adds `fecPacketsReceived`, `fecSamples` and `dredSamples`.
- **Changed** `zinc:webrtc` plays received audio through an adaptive jitter buffer: its delay follows the network's jitter and loss (40 ms on a calm link, up to 300 ms) and moves by speeding up or slowing down the voice a little, without gaps or clicks. `getStats()` adds `jitterBufferDelay`, `jitterBufferTargetDelay`, `jitterBufferEmittedCount`, `insertedSamplesForDeceleration` and `removedSamplesForAcceleration`.

### Workers
- **New** `zinc:worker` runs a long computation on another thread as Web Workers do: `new Worker<In, Out>(new URL('./work.ts', import.meta.url))`, `postMessage` (a `u8[]` in the transfer list is moved), `onmessage`, `onerror`, `terminate()`, and `self.onmessage`, `self.postMessage`, `self.close()` inside. Messages are typed data (Z5012 names what is not), the worker's file is a literal path (Z5013); on the interpreter, in `zinc build` and on QuickJS, where each worker gets its own runtime and thread.
- **New** `zinc profile` samples every thread: a table and a speedscope profile per thread, workers' stacks in `--folded`, and `--trace file.json`, a Chrome trace with a track per thread and each message as an arrow from `postMessage` to its handler (also in `ZINC_TRACE`).
- **New** `zinc debug --cdp` debugs each worker as its own target, with breakpoints, stepping, locals and console, while the main program runs or stops on its own.
- **Fixed** `zinc export --target wasm` builds again; a program that starts a worker there gets an error saying workers need threads.

### Web
- **Fixed** With `--render dom`, a code editor (a `TextArea` with line numbers or highlighting) is drawn by Zinc and fills its box: it shows its colours, places the caret where you click and takes keys, IME and paste through one hidden field, without the yellow focus ring. An absolute `TextArea` placed with `inset-0` takes the size of its offsets instead of four rows.
- **Fixed** In a page, a click inside a focused text field places the caret, the right and middle buttons are no longer read as back and forward, and programs that use `zinc:i18n` get its translations (they were shown as keys).
- **New** `zinc export --target web` runs `zinc:3d` programs on WebGL 2 (worlds not yet), and the site's 3d example runs in its page.
- **New** `zinc dev --target web` runs on your machine what a page cannot: cross-origin `fetch`, `zinc:socket`, `zinc:net` servers, the other host services and their events, plugins without a browser backend (`zinc:process`, `zinc:lvgl`, `zinc:device`...: kanban, carnet and ipod work in the page), the file system and the environment; it serves videos and sounds outside `assets/` with seeking. An export still has none of this.
- **Fixed** Each page load gets a new dev bridge, so a reload no longer leaves servers and children running; `--force` starts a project that needs a feature the web lacks; a module with `export function` inside a string loads.
- **Fixed** In a page: `zinc:canvas` contexts show; the assets folder `zinc.json` names is used; asset rules (atlases, tilemaps) are built; `sha256()` works; `autostart.get()` answers; missing sensors report an error event; `font('grid', px)` measures right; `fs.exists` sees streamed videos.
- **New** The site's gallery (`/examples/`) filters the graded examples by style and stars and runs each beside its source, with copy buttons for the code and `zinc run example:<name>`; the two playable demos load at once.

### Learning and docs
- **New** `zinc learn`: the first five lessons as exercises, offline and in five languages, checked each time you save, with hints and solutions; Zinc Atelier opens them beside the code (*Help > Lessons*) and lists them with your progress.
- **New** `zinc examples` lists the graded examples (one to four stars, by style); `zinc run example:breakout` runs one, `zinc new my-ball --from example:bouncing-ball` copies one, and a misspelt name gets the closest. They ship with zinc.
- **New** `zinc explain` shows two or three fixed versions of the wrong program for the 23 errors beginners meet most, with links to the lesson and the site; Atelier prints them under the error.
- **New** `zinc doc` makes a static documentation site of a project, a plugin or the engine (`--std`), as `cargo doc` does: API from doc comments, Markdown and MDX pages, search, themes and your own `docs/theme.css`; `--out` exports it, `--serve` serves it with reload; nothing is downloaded. `zinc doc --cheatsheet` puts every engine function on one page.

### Language and engine
- **Fixed** A class read only through `import type` keeps its fields typed by `new` (`palm = new Vec3()`), so reading them no longer fails with "Property does not exist"; `c ? f() : [x, y]` with two arrays of numbers compiles again under `--profile esp32`.
- **Fixed** A function with optional parameters can be passed where a callback takes them all: a screen that uses two components named `Button` from different kits (`zinc:ui/kit` and `zinc:react-native`) compiles again.
- **Fixed** `for (const x of c ? anyValue : [y])` (an `any` and an array literal as a loop's iterable) compiles instead of failing with "Cannot find name: '__dynTo…'".
- **Fixed** Three things that worked in TypeScript now work the same: `return await` inside `try`/`finally` of an async function runs the `finally` first; an `any[]` read out of an `any` value is the same array, not a copy; `undefined` passed to an `any` parameter stays `undefined` instead of arriving as `null`.
- **New** TypeScript's utility types (`Partial`, `Required`, `Readonly`, `Pick`, `Omit`, `Record<'a' | 'b', V>`), generic arrow functions (`<T>(v: T): T => v`), `n.toString(radix)`, strings and numbers as conditions (`''`, `0` and `NaN` are false), and a React or Solid component may return `null`.
- **New** Conditionals: branches of different types take their union (`c ? new Dog() : new Cat()`), `c ? xs : []` takes the other branch's type, an `i32` and a `number` make a `number`, and `await` works in a branch of `?:`, nested too; an async function can `return` a promise without awaiting it.
- **New** Classes and interfaces: a class instance fits an interface of fields (getters, optional fields, narrower types, written through with setters, printed with its class), an array of a subtype fits an array of its base, `o.constructor.name` works, and modules that import each other's types check as in TypeScript.
- **New** JSX: a style computed by a function or a constant (`style={seg(on)}`), `{props.children}`, elements kept in variables or returned by render functions, conditionals that narrow, lists in a branch, and components named like built-ins (also from a `components` folder) used as yours.
- **Fixed** Promises: `then(onFulfilled, onRejected)`, `then` returning a promise, `Promise<void>` from generic code, `resolve()` without argument, `Promise<R>` where `Promise<R | null>` is wanted, object literals typed from the call, and functions with fewer parameters passed as callbacks.
- **Fixed** `await` in a `do...while`, in an assigned field, after narrowing a `const`, and in async arrows with default parameters; a `const` stays narrowed inside a later arrow function.
- **Fixed** Values typed `any`: bitwise operators, `Number(x)`, `'' + x` as a string, `Object.keys`, `array.splice` and `sort()` without a comparator, `JSON.stringify(value, null, indent)`, `push(a, b, c)`, generic code over `any`, `Map<string, any>`, and `undefined` given to an optional `unknown`.
- **Fixed** `new Map(entries)` and `new Set(items)`, setters through a cast, `export { default } from`, `import type` that no longer runs its module, records that hold themselves, emoji split by `charAt` and joined again, non-UTF-8 strings that crashed `slice`, and several internal compiler errors.
- **Fixed** QuickJS: TypeScript as libraries write it loads, `Date.now()` and `performance.now()` read the right clocks, and `zinc:platform` constants, `zinc:process`, `zinc:os`, `zinc:fs` links, `sys.onSignal` and `sys.kill` work.
- **New** Native plugins: a spec can pass records (interfaces, in lists, optional or nested) as plain C++ structs safe on a worker thread, a stand-in can import its spec's types, and `Promise<void>` methods are accepted; plugins linked by a symbolic link build where they live and rebuild when an outside header changes, and a failed build is reported once.
- **Fixed** A `Map` of a union of primitives (`Map<string, string | number>`) read in a closure no longer aborts the build with "internal error: a jump passes a missing value": it gets the Z0005 error that names the type.
- **Fixed** QuickJS: `setTimeout` and `setInterval` wait for the real time outside a deterministic run, as on the other engines; a program with no native call in flight used to run its timers as fast as the CPU went.

### Tools and CLI
- **New** Editor types: `Required`, `Pick`, `Omit`, `Exclude`, `Object.keys`, `JSON.stringify` with an indent, and `new Map(entries)` / `new Set(items)` are declared in `zinc.d.ts`.
- **New** `zinc publish` reads the app's key and the hub's token from `ZINC_UPDATE_SEED` and `ZINC_HUB_TOKEN` when `--key` and `--token` are not given, so they never appear on a command line; a published package gets a safe file name.
- **Changed** `zinc new` alone asks nothing and makes a game in `my-game` (`my-game-2`... when taken); `zinc new --pick` asks what to make.
- **Changed** `zinc run` and `zinc dev` print one progress line at most (the first native build: `zinc: compiling for this machine, once`); `--verbose` (or `ZINC_STEPS=1`) shows every step.
- **Changed** `zinc export --target web` compiles once and names each step, then says how to open the result; `zinc dev` names the file each reload comes from and why, and restarts quietly.
- **Fixed** A component that wraps the built-in tag of the same name (`function Input(p) { return <Input ... /> }`) renders that tag instead of calling itself.
- **Changed** Errors of `zinc run`, `zinc check` and `zinc dev` name the file from your folder, show your line with `^^^` under the mistake, and report a misspelt name once; `--engine quickjs` prints syntax and JSX errors the same way.
- **New** Headless tests: `ZINC_INPUT` scripts `keyup NAME`, `hold shift`, clicks with modifiers (`down meta`, `down shift+meta`), `forward`, and a `close` that asks the window's close handler first (`window.keepOpen()`). `ZINC_PROFILE=json` reports `present_interval` and `present_gt_16_7` / `present_gt_100`.
- **Fixed** `zinc run` on Linux and the reMarkable applies the `"targets": {"linux": {...}}` permissions of `zinc.json` (and `--profile <name>` those of that target); `zinc run` of a non-entry file reads the project's assets; `zinc dev` honours `"engine": "quickjs"`; deterministic runs wait for plugins' background jobs; a compiled run no longer fails after an engine header changed; macOS no longer delivers `zinc run`'s arguments as a dropped file.

### Security
- `zinc dev --target web`: the dev server and the dev bridge refuse requests that name another host (DNS rebinding) or come from another machine, and the reload socket refuses other sites' pages; a website could otherwise read the bridge's token and run processes or read files on your machine while `zinc dev` ran.

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

[Unreleased]: https://github.com/Frulko/zinc/compare/v0.10.6...HEAD
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
[0.10.6]: https://github.com/Frulko/zinc/compare/v0.9.1...v0.10.6
