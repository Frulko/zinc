# Changelog

All notable changes to Zinc are written here, for the people who use it. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
versions follow [Semantic Versioning](https://semver.org/) (while the major version is 0, a minor version may break what the previous one ran). `make release`
moves the *Unreleased* section under the new version and publishes it as the release notes.

How to add a line: see "Changelog" in `AGENTS.md`.

## [Unreleased]

### Fixed

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
- `--engine quickjs` loads a package that a pnpm workspace links in two places (`node_modules` symbolic links) once, by its real path; it was loaded twice, with two copies of its state.
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
- Two programs started at the same time (two `zinc run`, a test beside an app) no longer fail to build or load the same plugin: the builds of a `ZINC_HOME` take turns.
- `zinc export --target web --render dom --prerender` no longer comes out without its first screen on a busy machine ("the app drew nothing in six seconds").
- The one-line installers (`curl -fsSL https://github.com/Frulko/zinc/releases/latest/download/install.sh | sh`, `install.ps1`) and `zinc update` now download from the releases that exist; they pointed to a repository that does not exist yet.
- TLS 1.3 (https `fetch`, MQTT over TLS, `wss://`): the first bytes a server sends right behind its session tickets are no longer held back until more data arrives, and a write after a ticket no longer fails.
- `zinc export --target android` and `--target ios`: a plugin imported from several files of a program no longer stops the native build (CMake: "another target with the same name already exists").
- `zinc build --bundle` adds `.app` to an output without it, and a build whose output is a folder says so instead of a linker error (errno=21).

## [0.3.1] - 2026-10-19

### Fixed
- tc: zinc.exe finds its package and unpacks zig on Windows

## [0.3.0] - 2026-10-19

### Added
- Zinc Atelier for Windows: `Zinc-Atelier-<version>-windows-x86_64.zip` on each release; unzip it and open "Zinc Atelier.exe".
- The zinc CLI for Linux (x86_64, aarch64, armhf, i686) on each release, updated by `zinc update`; `install.sh --atelier` adds Zinc Atelier to the applications menu.

### Fixed
- Windows: zinc.exe finds the standard library and the prebuilt plugins beside it; the download looked for them at the path of the machine that built it.
- Windows: the first native build no longer fails to unpack the compiler it downloads ("Cannot connect to D: resolve failed").

## [0.2.3] - 2026-10-19



## [0.2.2] - 2026-10-19

### Added
- music: scroll and swipe with the mouse wheel and the trackpad

### Fixed
- frontend: include algorithm for the JSX source map lookup

## [0.2.1] - 2026-10-19

### Fixed
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

[Unreleased]: https://github.com/Frulko/zinc/compare/v0.5.0...HEAD
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
