# Changelog

All notable changes to Zinc are written here, for the people who use it. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
versions follow [Semantic Versioning](https://semver.org/) (while the major version is 0, a minor version may break what the previous one ran). `make release`
publishes the *Unreleased* snapshot as the release notes, then archives it under the new version after publication succeeds.

How to add a line: see "Changelog" in `AGENTS.md`.

## [Unreleased]

This version is about staying solid when things go wrong: gestures, navigation, reactive updates and app updates now recover cleanly from interruptions and errors instead of getting stuck. A window that is covered stops drawing and costs almost nothing, Sidecar can be driven from the Mac's mouse and keyboard, and Riffle joins the apps as a window switcher for macOS.

### Sidecar

#### New

- `sidecar-browser` controls the page from the Mac: **Control** turns the window into a pad where the mouse moves, clicks and scrolls on the screen, with a Kenney pointer; the keyboard types in the page, and ⌘C, ⌘X, ⌘V, ⌘A and ⌘Z use the Mac's clipboard.

#### Fixed

- A long stream with moving pictures (a video in a web view shown on a tablet) no longer eats the Mac's memory until macOS ends the app.
- macOS apps ask for Local Network access with their own words (`permissionStrings.net` in `zinc.json`), and a Sidecar screen that macOS keeps out of reach is reported with where to allow it, instead of only "no route to host".

### Rendering and performance

#### New

- `ZINC_GL_QUIRK=no-replay` turns the GPU renderer off on a machine whose graphics driver draws wrong: the app is drawn on the CPU and one line says so.
- On the 2D canvas of a JavaScript program, `CanvasPattern.setTransform` places a pattern, and a pattern drawn larger is smoothed as Chrome smooths it, or kept sharp with `imageSmoothingEnabled = false`.

#### Faster

- On macOS a window that nobody sees (covered by other windows, minimized or hidden) stops drawing and slows its loop to 10 frames a second, about a tenth of the CPU it used, and is back at full speed the moment it shows again; `ZINC_UNSEEN=draw` keeps it drawing.
- `charCodeAt`, `codePointAt`, `slice`, `charAt`, `indexOf` and `split('')` on text with accents or emoji no longer slow down with the length of the string: a loop over 1 MB of accented text takes tens of milliseconds instead of minutes.
- The GPU renderer keeps up to four pages of glyphs and lets go of the one used longest ago when they are full, instead of starting over: text in many sizes or scripts no longer re-uploads every glyph each time the page fills.


- A desktop window where nothing moves sleeps until you touch it, a timer is due or a worker sends a message, instead of waking 60 times a second to look for changes: an idle screen uses about a quarter of the CPU it did (0.2% of one core for a hello screen on an M1 Pro).
- An exported app that uses no network is about 1.1 MB smaller (5.1 MB for a hello app on macOS, 2.4 MB zipped): it carries no TLS or HTTP code and loads no system framework it does not use.
- Opacity, translate and rotate transitions of classes (`transition duration-300 opacity-40 translate-x-16`) are played by the engine's compositor: your app draws the view once instead of at every frame of the transition, and it keeps moving while your code is busy.

#### Fixed

- Covering a running window on macOS no longer freezes the program for about a second.
- A translucent window that follows its content (an accordion in a menu bar panel) grows and shrinks smoothly on macOS: its picture was stretched or squashed during the animation.
- A `zinc device screen` request withdrawn before it was answered no longer keeps a video off its hardware layer for the rest of the run.
- A program that starts and terminates many `zinc:worker` workers no longer runs out of open files or grows in memory: each ended worker left two open files and about 8 KB behind.
- An open Zinc window no longer keeps the screen from going to sleep on the desktop: an app that must stay visible asks with `navigator.wakeLock.request('screen')`, and a kiosk (`"kiosk": true`) still keeps it on.
- A Phaser game with `type: Phaser.CANVAS` draws its MULTIPLY and SCREEN blend modes instead of plain source-over: a script now runs once the pictures the page is loading from `data:` URLs are ready, as in a browser.

### Plugins

#### New

- JavaScript games hear more of Web Audio: `OscillatorNode` makes sound (its four waves and `setPeriodicWave`), `loopStart` and `loopEnd` set the part a looping sound repeats, and `suspend()` pauses everything until `resume()`, `currentTime` included; `zinc:audio` has the same as `voice.loopPart()` and `suspend()`.
- Gamepads that SDL does not know by itself work, from the community mappings of SDL_GameControllerDB, and a program on the `gl` display driver reads gamepads too.
- `zinc:gestures` handles several things under several hands: `Fingers` gives each finger to what it landed on until it lifts, `manipulate` drags, turns and zooms a `Pose` with its own fingers without a jump when one lands or lifts, and `glide` lets it coast on when they let go.

#### Changed

- A plugin whose native code does not compile now stops `zinc pack` and `zinc export` with the compiler's error instead of shipping its stand-in, and `zinc run` says it in one clear line naming the plugin; `ZINC_NATIVE=sim` uses the stand-in on purpose.

#### Faster

- The first run of a project that uses several native plugins builds them at the same time instead of one after the other (the iPod example's five plugins: 34 s down to 18 s), sharing the cores and backing off when the machine is busy.

#### Fixed

- A disposed `Script` or a closed `WebView` stays dead: it can no longer run code in, settle a call of, or send its late messages to the script or web view created after it.
- Plugins that do their slow work on a worker thread, such as `zinc:ipod`, answer again after the program's frame loop has ended instead of never settling.
- On macOS 13 and later, `autostart.enable()` in an exported app adds the app itself to Login Items under its own name and icon, instead of a background item named after its id; an app that started at login before moves over by itself.
- An installed zinc builds a plugin whose options a project sets in `zinc.json` (`zinc:3d`, `zinc:video`, the display drivers...): the release ships those plugins' sources beside their prebuilt library, and an install that lacks them says so instead of "no native source".

- `navigator.mediaDevices.getUserMedia` asks for the camera or the microphone first, as a browser does, instead of failing with `NotAllowedError` on a Mac where access was never asked.
- With `ZINC_NATIVE=sim`, `--engine quickjs` runs a plugin's simulated stand-in like the other engines, instead of its native library (the iPod demo no longer looks for a real iPod).
- A JavaScript program that makes sound on a machine where the audio plugin cannot be built goes on in silence after one line that says why, instead of stopping with an error.

### UI

#### New

- `zinc:ui/kit` has `Input` and `Textarea` in the shape of shadcn/ui's: a bordered, rounded field that follows the page, with a muted placeholder, a stronger border while focused and a dimmed `disabled` state.
- Mistakes that used to draw nothing now say what to write: an icon name Lucide renamed (`trash-2`, `home`) draws the new icon and names it, an unknown icon name suggests the closest one, a width or a colour passed as a string at run time says `pct(n)` or `0xrrggbb`, and `<Button icon>` inside your own `function Button` says to rename it (`zinc explain U0001` to `U0004`).
- The keyboard scrolls: a focused `ScrollView` takes the arrows, Page Up and Page Down, Space and Home and End as in a browser, and Page Up, Page Down, Home and End also scroll the area the focus is in, or the one under the pointer.
- `ui.prependRows(list, n)` keeps the row on screen in place when older rows are loaded above a `VirtualList`, as a chat history does; JSX takes `onKeyUp` next to `onKeyDown`.
- React Native screens get `ImageBackground`, `<Image source={{ uri }}>`, and Pressable's `hitSlop`, `pressRetentionOffset` and `delayLongPress`; React Native's `Button` fades to 0.2 when pressed on iOS and macOS, as its TouchableOpacity does.
- A React Native `SectionList` section takes an optional `title` and a `key`, as in React Native, and sections declared first (`const DATA = [{ title, data }]`) pass to it as they are.
- React Native's `pointerEvents` works as a `View` prop, `'box-none'` (only its children take touches) and `'box-only'` (not its children) included, and `transform: [{ rotate: angle }]` takes an angle decided at run time, such as `` `${deg}deg` ``.

- Several windows: `win.open({ x, y, ... })` places a window as it opens, `onClosed(cb)` runs once after a window closes (`win.get(0).onClosed(quit)` ends the app with its main window), `onWindowClosed` of `zinc:gfx` reports any window, and a `port.handle` answer may be `async`: the reply leaves when its Promise settles, from the program or from a worker.
- A rotated, skewed or scaled view turns around a transform origin: React Native's `transformOrigin` (`'top left'`, `'10px 20%'`) or an `origin-*` class (`origin-top-left`, `origin-[25%_75%]`); touches follow it.
- A project can ask for native views with `"ui": { "render": "native" }` in `zinc.json` (or `ZINC_RENDER=native` for one run): a plugin that installs a host with `ui.setHost` then shows the tree with the platform's own views, and everywhere else the app is drawn as before.
- On macOS, `import 'zinc:appkit'` in a project with `"render": "native"` shows its `View`, `Text`, `Image`, `ScrollView`, `TextInput`, `TextArea` and `Pressable` as real AppKit views, measured by AppKit, in the system's colours and dark mode, with native typing and scrolling; presses reach your handlers as before. `appkit.dump()` prints the native tree for tests.
- `zinc:appkit` has the window's chrome: `Window` (title, toolbar style, full-size content), `Toolbar` with `ToolbarItem`s (SF Symbols or your own content, such as a search field), and `SplitView` with a `Sidebar` whose divider you drag; Tab and Shift-Tab move between the native fields and buttons. Without the AppKit host the same components draw a plain window bar, toolbar and sidebar.
- `zinc:appkit` has `Table` (an NSTableView with columns, sorting by header, multiple selection, type-select and double-click) and `Outline` (a source-list tree that expands, collapses and type-selects): a table of 10,000 rows builds only the rows in view, and without the AppKit host both draw a list with the same keys.
- Clocks, timers and columns of numbers stop shifting as their digits change: the `tabular-nums` class (and `normal-nums` to undo it) gives text tabular figures, every digit as wide as the others, and `gfx.tabularFont('sans', 15)` gives a `zinc:gfx` font the same.

- `zinc:appkit` has the macOS controls: `PushButton`, `Switch`, `Checkbox`, `PopUpButton`, `SegmentedControl`, `Slider`, `DatePicker`, `SearchField` and `Progress`, and the kits' `Button`, `Switch`, `Slider`, `Tabs`, `Select` and `Checkbox` and React Native's `Button` and `Switch` become them under `"render": "native"`. `alert()`, `sheet()` and `popover()` show an NSAlert, a sheet or a popover without stopping your frames and resolve with the button pressed or the result; without the AppKit host they draw a dialog, a panel and an anchored panel.
- A plugin can add its own macOS view to `zinc:appkit`: it declares the component in its spec (an interface extending `NativeComponent`, with typed props and `onX` events), `zinc native-gen --views` writes the Objective-C++ glue, and the plugin's NSView subclass shows wherever the component is used under `"render": "native"`; elsewhere its own drawn fallback shows. `examples/native-view` has a level indicator built this way.
- VoiceOver reads `zinc:appkit` apps by the names you give: `aria-label` or `accessibilityLabel` on a field, a kit control or a `Table`, `Outline`, `Switch`, `Slider`, `PopUpButton`, `DatePicker` or `SearchField` becomes the native view's name. A `Table` also takes a `selection` your program sets, so the same files stay selected after a sort or a search.
- On macOS the Edit menu's Cut, Copy, Paste, Undo, Redo and Select All act on the native field you are typing in, as in any Mac app.

- Animated's `useNativeDriver: true` works as in React Native: bind a value to a view with `Animated.attach(node, 'translateX', value)` (also `translateY`, `scale`, `rotate`, `opacity`), and its `timing`, `spring` or `decay` is played by the engine, so the view keeps moving smoothly while your code is busy and your code runs nothing per frame; binding a layout property such as `width` throws React Native's own error.

#### Changed

- The default layout sizes `flex-1`, `w-full` and `h-full` as a browser does: `flex-1` items share a row or a column equally whatever their content, but never get narrower than their content unless they have `min-w-0`, `overflow-hidden` or `truncate`; a `w-full` or `h-full` box along the row or column stays inside its parent instead of growing with its content; and the last width or height class wins (`w-full w-[280px]` is 280 px wide).

#### Fixed

- One error no longer freezes a reactive app: a throw inside `batch`, `untrack` or an effect used to hold every later signal update back, and a render caught by its parent (an error boundary) stopped reordered children from moving.
- Removing a scroll view in the middle of a drag no longer makes the next view created scroll under the same finger.
- A `ui.animate()` that is replaced by another, or whose view goes away, now resolves its Promise instead of leaving an `await` hanging.
- Touch gestures recover cleanly: lifting one finger of a pinch lets the other scroll again, a press held while the app goes to the background is cancelled instead of clicking on return, and a long press in a text field still sends `onPointerUp`.
- The navigation stack no longer keeps a screen when a swipe or Android's back gesture starts during a pop, and dragging a sheet down while pressing back closes only the sheet.
- `Pressable` sends `onPressOut` for a very quick tap, and an `Alert` button pressed twice runs once.
- Space and Enter keep a focused `Pressable` pressed until the key is released, so keyboard users see its pressed style; a right press held during a left click no longer loses either release; lifting the first finger of a pinch before the second no longer blocks the next pinch; a text selection dragged past the edge of a field keeps scrolling while the pointer rests there.
- The on-screen keyboard's backspace stops repeating when its press is lost, and the image viewer ignores zoom and drags while it closes.
- Scrolling up a `VirtualList` with `estimatedItemHeight` (a chat history) with the trackpad or the wheel no longer makes the messages jump as older ones come into view.
- `ui.focusNode` no longer gives the focus to a `disabled` field, as a click never did.
- A `zinc:ui` window closed and opened again no longer leaves its old state behind, and a window that shows a worker's scene draws it once instead of every frame.
- Japanese, Chinese, Persian and Arabic text, arrows and triangles such as `▸ ▾`, and emoji with skin tones or joined into one draw with the system's fonts instead of `?`, without adding `"text": "shaped"` to `zinc.json`; Latin text keeps exactly its pixels, and `"text": "simple"` keeps the old behaviour (and a smaller built program).

- JSX accepts more of what React code writes: `<Bar />` when every prop is optional, `aria-*` and `data-*` attributes on your own components, `{list.map(row)}` with a function imported from another file, `{cond ? list.map(...) : <View />}` in the Solid model, and `{props.children?.()}`, which printed a number in place of the children.
- A JSX child that is a call making a node is mounted instead of printed as a number, whatever the helper is called: `{box(p.children)}`, `{wrap(() => <Text />)}`, `{ui.createNode(...)}` and a component kept in a class field, `{this.view()}`.
- `a?.b !== undefined` now tells the checker that `a` and `a.b` are set, as TypeScript does, inside JSX too.
- A canvas drawn with `onDraw`, and an `<Icon>`, now fade with the view they are in (an `opacity-50` card, a screen leaving a navigation stack) instead of staying fully opaque; `zinc:gfx` has `setGlobalAlpha` and `globalAlpha` for the same effect in your own drawing.
- `onScroll` on a `ScrollView` or a `FlatList` runs once per scroll in a component that renders again: each render used to add another call.
- A row child with `basis-*` lays its content out at its basis, so a wrapping list inside it takes the height it needs and a scroll area around it scrolls to its end.
- With the `rn` layout, `flex-1` shrinks as in Tailwind and React Native's `flex: 1`: a pane next to a widened sidebar narrows instead of running past the window.

### The web

#### New

- An exported page has a real `zinc:fs`: what the program writes is kept across reloads in the browser's storage, and the project files listed in `zinc.json` `targets.web.files` ship with the page, read only, so apps that require `fs` (Carnet, Kanban) export without `--force` and `examples/hero` plays its video in the page.
- `targets.web.proxy` lists sites that send no CORS headers (map tiles, radio logos): the exported page fetches them through a small proxy, `serve.py` on your machine or the `proxy.mjs` the export writes for Cloudflare Workers or Deno, which only forwards GET and HEAD to those hosts.
- An exported page that uses parts no browser can run (a device plugin, processes, network servers) opens with a bar that names them and says they need the desktop app, with your download link from `targets.web.demo.link`; `targets.web.demo.samples` ships sample data for such a part and `sampleData()` of `zinc:browser` finds it.
- `fetch` of `zinc:net` works in an exported page, over the browser's own `fetch` (timeouts, size limits, `saveTo`), so apps and plugins that download with it, such as `zinc:map`, export without a W0603 warning.
- `zinc dev --target web` watches the workspace packages your app imports (npm, pnpm, yarn and bun workspaces, `npm link`): a save in one bundles the packages again and reloads the page.

#### Fixed

- An exported page whose program read a file's bytes (`readBytes` of `zinc:fs` or `zinc:assets`, as the hero demo's map does) no longer stops at start with `__qjs_bytes is not defined`, an app that makes transparent images no longer gets a W0603 warning for it, and a program that installs a signal handler at start (`sys.onSignal`) runs in a page.
- Exported pages served one after the other from the same address no longer answer with each other's offline files: each app's `sw.js` keeps and reads its own cache.
- `--prerender` takes the page as soon as its first frame is drawn instead of after a fixed six seconds, so it no longer fails with "the app drew nothing" on a busy machine, and is faster.
- In a page, `zinc:link` throws `ZnUnsupported` like `zinc:socket` does, so an app can skip it quietly (`e instanceof ZnUnsupported`); `zinc:browser` can now be imported by typed programs on every target, and its `browserFeatures()` returns a `Map`.
- `zinc export` (and `run`) of a folder of `templates/` itself says to make a project from it with `zinc new` first, instead of an error about its `{{id}}`.
- A page that reads `clock()` of `zinc:sys` (the three.js glTF viewer does) no longer stops at start with `__clockMs is not defined`, in an export and in `zinc dev`; the viewer's glTF loader on the web also reports its mesh and triangle counts again.

### Language

#### New

- JavaScript projects: `importmap.json` maps a whole folder with a key ending in `/`, as a browser does (`"three/addons/": "../three/examples/jsm/"`), and a folder with a `main.js` runs with `zinc run` even when its `zinc.json` only sets `app.window`.
- `await` at the top level of a program or test file works on every engine; an `async` arrow function or object method no longer needs its `Promise<T>` written out (`const load = async () => 1`), and a generic function's return type is inferred from its arguments (`function id<T>(x: T) { return x; }`).
- Plain JavaScript programs have the browser's `URL`, `URLSearchParams` and `WebSocket` globals, so `new URL('./worker.js', import.meta.url)` and libraries that open a `WebSocket` work without an adapter.
- `value instanceof Promise` (or any generic class) narrows a `T | Promise<T>`, as TypeScript does.
- `n.toLocaleString()` formats numbers with thousands separators on every engine, with the `minimumFractionDigits`, `maximumFractionDigits` and `useGrouping` options (in the US English format for now), and `JSON.stringify(value, replacer)` takes a replacer function, with or without an indent.
- On an `any` value the array and string methods work as in TypeScript: `d.items.push(x)`, `.splice`, `.sort()`, `.reduce`, `d.name.trim().toUpperCase()`, `.split`, `.replace`... and a change made through `d` is seen in the data it holds, not in a copy.
- More npm packages run on `--engine quickjs` and in `zinc bundle`: the browser build of a package is picked (nanoid, qs), CommonJS and UMD packages such as dayjs load with named imports too, and packages find `crypto`, `fetch`, `URL`, `TextEncoder` and the other Web globals Node and Deno have (uuid).
- `fs.writeBytesAt(path, bytes, offset)` writes bytes in place inside a file (made when missing, never cut), and a `zinc:net` reply can carry its body as bytes with `bytes: u8[]`, so a picture made in memory is served without a temporary file.
- `zinc:hash` gives `sha256(bytes)` and `sha256File(path)` at native speed on every engine, with `toHex` to print a digest as `sha256sum` does; a file is read in blocks, so a 100 MB file is hashed in a third of a second without being loaded.
- The methods of an object seen through an `any` work as in TypeScript: `typeof d.greet` is `'function'`, `console.log(d.greet)` prints `[Function: greet]`, and `d.greet()` or `d.add(2, 3)` calls it; calling a missing one throws a `TypeError`.
- `MqttClient` no longer waits forever on a broker that does not answer: `connect()` rejects after `connectTimeoutMs` (30 s by default, 0 for none) and says whether the connection, the TLS handshake or the broker's CONNACK was missing.
- A union of a primitive and another type (`video?: boolean | MediaTrackConstraints`, `string | number`) can be stored, passed and compared with `===` on the Zinc engines, and taken apart with `as`; `getUserMedia` now types its `video` and `audio` options this way.

#### Faster

- `readBytes` of `zinc:fs` and `zinc:assets`, `utf8Encode` and `randomBytes` copy their bytes at once instead of one by one: reading a 1 MB file drops from about 40 ms to under a millisecond, and `utf8Encode` of a long string on `--engine quickjs` no longer takes minutes.

#### Fixed

- `Math.atan`, `Math.asinh`, `Math.acosh` and `Math.atanh` were refused by the checker; they now work on every engine.
- A `catch` callback that returns a promise is adopted, as `then` already did, and `finally` waits for the promise its callback returns before passing the value on (or takes its rejection), in the order Node runs them.
- More valid TypeScript is accepted: a function with default parameters where one taking fewer is expected, `list.find(...)?.[1]`, `resolve(undefined)` on a `Promise<void>`, an `(e: any) => ...` callback where an `Error` is passed, a `Map` or `Set` of a class where one of its interface is expected, and a `catch` callback that returns nothing (also on `Promise.reject(e)`).
- Async fixes: `for (const [k, v] of list)` with an `await` in its body runs, `const r = untrack(() => { ... })` is accepted when the callback returns nothing, `return save()` in an async `Promise<void>` function now waits for `save`, and a `new Promise` whose executor throws rejects instead of stopping the program.
- `JSON.stringify` of a parsed object writes number-like keys first, in ascending order, as JavaScript does; a value of type `any` is accepted as the condition of `if` or `? :`; and `c ? v * 10 : v` with `v` of type `any` stays an `any` instead of failing on an object.
- `clock()` of `zinc:sys` measures below the millisecond on every engine, so a short loop no longer reads 0 ms.
- `const p: Point = JSON.parse(text)` and `JSON.parse(text) as Point` behave the same on `--engine quickjs` as on the Zinc engines: only the declared fields are kept, and a missing or wrongly typed field throws a `TypeError`.
- On `--engine quickjs`, bytes from a plugin behave as an array (`push`, `concat`, `map` to strings, `JSON.stringify`), so Discord voice encryption works and `zinc:socket` WebSocket messages of 60 KB and more arrive.
- An app's first run on this version also brings over the AsyncStorage keys (`@async/…`) older engines kept in the shared `~/.zinc/storage.kv`, so apps that ran on `--engine quickjs` find their saved data again in their own store.
- On `--engine quickjs`, `getHours()`, `getDate()` and the other local getters of a `Date` use the machine's time zone, as its constructor does, so date-fns, dayjs and moment are no longer off by the zone's offset; `catch (e: any)` is accepted there too.
- On `--engine quickjs`, `new Date()` and `Date()` read the same clock as `Date.now()`: today's date in a normal run, and in a test run (`ZINC_DETERMINISTIC`) the same fixed date at every run, as on the Zinc engines.
- A function or a static method read as a value is the same object every time, as in JavaScript: `f === f` is true, and `indexOf`, `includes` or a remove-listener call find a callback that was added before.
- A function declared inside another one can use a `const` or `let` written below it, as in JavaScript, and may share its name with a top-level function, class or constant; such programs stopped with an internal error.
- Writing an optional field through a record type adds it to a class instance that lacks it, as JavaScript does, instead of throwing "object is not extensible"; `console.log` and `JSON.stringify` show it once set, and an optional field left out of an object literal is no longer printed as `note: undefined`.

- On `--engine quickjs`, typed numbers compute as on the Zinc engines: `i32` and `u32` arithmetic wraps, a `u8` or `i16` wraps when stored, `f32` rounds, and a division stored in an `i32` truncates (`z = 7 / 2` is 3).
- A value of a record or interface type used where a wider record type is expected (`const r: Named = hasName`) stays the same object, as in TypeScript: a write through either name, an added optional field included, is seen through the other instead of going to a copy.
- `zinc:mqtt` works on `--engine quickjs`: connecting, subscribing, publishing and closing were missing there.
- Compiler fixes: a local variable no longer stops the narrowing of a top-level one of the same name in other functions (nor does a function written above the top-level declaration), the errors inside a lambda that initialises a class field are reported, a `catch` callback that only rethrows keeps the promise's type, and a union the engine cannot hold yet is an error instead of a crash.

### Developer tools

#### New

- `ZINC_RESOURCE_LOG=<file>[:seconds]` appends, every 30 seconds by default, a line with the app's memory and what each part holds (images, GPU textures, fonts, script heap): the way to see which part grows in an app that gets slower over days.
- Editors now know `zinc:ui`: after `zinc tsconfig`, `PointerEvent`, `KeyEvent` and the rest of the module come with their docs, and the event attributes of `View`, `Button` and the other host tags (`onPointerDown`, `onKeyDown`, `onInput`...) type their argument.
- Editors now know `dataDir()` of `zinc:sys`, the app's own writable folder (`~/.zinc/apps/<name>/`, made on first call), where an app keeps its files.
- Tools can read the CLI as JSON: `zinc project --json` prints the project as the engine reads `zinc.json` (targets, the permissions in force on each, the plugins the program loads), `zinc check --json` gives each diagnostic its file, line, column, fix and message in your language, and `zinc plugins --json` lists the plugins. Zinc Atelier now reads these instead of parsing text.
- `sys.kill(pid, '0')` of `zinc:sys` says whether a process exists, as Node's `process.kill`, and `sys.kill` returns false when the signal could not be delivered.
- The network log (the inspector's Network view and `zinc run --har`) masks the fields of a multipart form (a `FormData`) named in `ZINC_NET_SENSITIVE`, as it already did for urlencoded forms, JSON and query strings; files and the other fields are kept.
- `zinc lsp` completes in more places: the names a module exports inside the braces of an import, JSX component names and their attributes (a component's own props too), and the methods of strings and arrays with their signatures and docs.
- Headless runs in real time: with `ZINC_HEADLESS=1 ZINC_REALTIME=1` frames come at 60 a second, so `ZINC_FRAMES=300` lasts five seconds and a screenshot (`ZINC_SHOT`) shows what timers and network replies brought in by then; `ZINC_DURATION=ms` ends a run after that long.
- Auto-import in editors and Zinc Atelier: typing `rr` offers `rrect` from `zinc:gfx` (or an export of the sketch's other files), says where it comes from, and accepting it adds the import line or extends the one already there.
- `zinc lint` warns about a plugin in `zinc.json` `dependencies` that nothing imports (`zinc remove <plugin>` drops it), about the assets loaded at start (the `boot` group, or `loading.groups`) against the target's `boot` budget, and now reads the pixel size of JPEG and WebP images as well as PNG for its memory and texture-size estimates.
- Editors show `zinc lint`'s per-target warnings for a project whose `zinc.json` names its targets (a size wider than the ESP32's screen, a style its UI tier simplifies, a plugin not made for it): `zinc lsp` checks again each time a file is saved.
- `zinc lint` warns when a program imports a module the target's engine does not have (`zinc:gl` on the 3DS, PSP or Vita), and `zinc device deploy` to a console says so before sending it.

#### Changed

- The `"crash"` key of `zinc.json` is gone: it was never acted on, and a panic always ends the program. A project that still has it is refused with a message (`zinc explain J0001`); delete the line, and let systemd restart a service.
- `zinc.json` no longer needs `app.id` to give the window a size or limits in `app.window`: a first project can leave the id out until it packages the app (`zinc build --bundle` and `--dmg` ask for it).
- `zinc run` opens a program at once: when its native build is missing or out of date, the program runs on the interpreter while the build goes on in the background, and the next run is native (`--native` waits for the build as before). A native build that fails, as on a Mac without the Command Line Tools, is no longer tried at every run, only again once the compiler changes.
- In `zinc dev`, a save that does not compile draws the red box over your program, which keeps running with its state: the fix swaps in without starting over. The program also keeps drawing while a save compiles, and editing a module imported for its effects (`import './setup'`) runs its importer again.
- The Changes of Zinc Inspector write `className=` and fold an edited `padding: 12px` into `p-[12px]` (or `px-`/`py-`, margins alike) instead of four classes.
- The Elements panel of Chrome DevTools shows the nodes as JSX writes them, `<View className="...">`, `<Text>`, `<ScrollView>`, instead of `<view class="...">`, and a class is edited through the `className` attribute.

#### Faster

- A save in `zinc dev` reaches the screen in about half the time (hero: 1.2 s down to 0.65 s): the files you did not change are not parsed again, the fonts and images are baked again only when the save changes a text size, a character or a font face, and the compiler does more of its work on several cores.

#### Fixed

- App updates are judged more carefully: an update that exits with an error code is rolled back, opening the app a second time while an update is on trial no longer rolls back a good update, and a device update with no previous version to restore stays on trial instead of losing its way back.
- `zinc doc --serve` rebuilds again when a page is saved while it is rebuilding, instead of missing the change.
- The resource counters (the inspector's Info view, `resourceStats()`) count the GPU textures of the GL renderer again: they showed none when the renderer was in two parts of the program.
- On an HP TouchPad, a scripted run (`ZINC_INPUT`) no longer ends after 60 frames.
- A closing JSX tag with no opening tag (`</View>`) is now an error that names it, instead of confusing errors further down the file.
- Two `zinc` commands that download the same tool at once (the zig, esptool, the console SDKs, basisu) no longer break each other's install: the second waits and uses the first one's.
- The language server tags its diagnostics with the document version, so an editor no longer shows the errors of an older edit, and it ignores changes to files that were never opened.
- The language server checks again the open files that import a file you edit, so a renamed export shows its errors where it is used without a save; it answers requests sent before `initialize` or after `shutdown` with the protocol's errors, and a failed read of the standard library's declarations no longer leaves hover and completion without docs for the rest of the session.
- A macOS app names its executable after itself, in a `zinc build --bundle` and in the dev bundle of `zinc run`: login items, Activity Monitor and the process list show the app's name instead of `zinc`, and a start-at-login item belongs to its app.
- `zinc check` and `zinc lint` of a program on a JavaScript engine (a `.js` entry, or `"engine": "quickjs"` in `zinc.json`) use the QuickJS loader: `node_modules` packages resolve as they do when the program runs, and browser globals no longer raise type errors. `zinc lint` warns about what QuickJS lacks, such as `Temporal`.
- `zinc monitor --udp` listens on this machine only (`--host 0.0.0.0` receives from devices on the network) and shows the control characters of what arrives escaped, so a datagram can no longer clear or retitle your terminal.
- A program on QuickJS (a `.js` entry or `"engine": "quickjs"`) now follows the `"permissions"` of its `zinc.json` as the typed engines do: an exported app refuses to read, write or watch files it was not granted, and `zinc run` warns about them.
- After a failed save, `zinc dev` prints the first error after `compile error:`, not the first line of the output, which could be a plugin's progress note.
- `zinc doctor --details` lists the plugins without a prebuilt library by reason, one line each, instead of one line per plugin (sixty in a build from the sources).

- Clearer first steps on the command line: `zinc run --engine quickjs app.tsx` works like `zinc run app.tsx --engine quickjs`, `zinc run breakout` points to `example:breakout` when there is an example of that name, a wrong pairing code says "wrong code" instead of a TLS alert, and `zinc dev --device` no longer prints a port error before it picks another port than 9229.
- `zinc export` of a project whose `zinc.json` name is not a file name ("Zinc Atelier") names its files after `app.id` instead of stopping, and a folder with no `zinc.json` of its own no longer takes the settings of the project around it.
- A compile error after a save in `zinc dev` ends with the same line as in `zinc run` (what to do, `zinc explain <code>`) and names the file from the project; importing an npm package in typed code says that npm packages are not loaded and how to run one, and `zinc explain Z0119` covers engine modules, `tsconfig.json` paths and npm.
- Zinc Inspector polish: the Screen view names the hovered node in a tooltip on the picture, the Elements badges sit right after the tag, ArrowUp and ArrowDown reach the parent while picking in a `zinc:stage` scene, "+ add a declaration" no longer shows with no node selected, an edit is applied when you click from it into the palette's hex field, and programs killed without cleaning up no longer linger in the program list.

- A QuickJS app's bytecode (`.qbc`) records the zinc that compiled it: after an update the app runs its `.js` instead of bytecode another zinc wrote, and a lone `.qbc` says to build it again. Its source map carries the sources, so a moved or exported build still shows them, and its stack traces name the project's file (`src/util.js:2`).
- Export and build fixes: `zinc build <dir> --bundle` works with `--bundle` after the folder, `zinc export --apk` with a relative `-o` passes its 16 KB check, an export run with `ZINC_DETERMINISTIC=1` ships a plugin's native code instead of its test stand-in, and the `flash.sh` of an ESP32 export (`--engine mquickjs`) no longer erases the board's saved settings (touch calibration, Wi-Fi networks, `zinc:storage`).
- What a program printed is written before it starts a child process or reads its input, so a prompt shows before `onStdin` waits and the program's lines come before what the child writes to the same terminal or file; `onStdin` of `zinc:sys` now also works on `--engine quickjs`.
- `zinc lint --target n3ds` (and psp, vita) no longer warns about the plugins a console has built in (`audio`, `3d`, `physics2d`, `lan`, and the pure-Zinc `sprite` and `tilemap`).
- `zinc pack` carries the assets folder `zinc.json` names, also when it lies outside the project (`"assets": "../shared/assets"`), instead of only a folder called `assets`; `zinc check`, `zinc run` and `zinc pack` warn when that folder does not exist, and an `"assets"` written as an array says what to write.
- `zinc mem --json` and `zinc profile` of a program that calls `console.error` or `sys.exit` keep stdout for the report (the program's lines go to stderr, in order, and the exit code is the program's), and a program on an ESP32 sends all its lines back, `console.error` and `sys.exit` included.
- `zinc run --native` runs your edits: after a plain `zinc run` of the same file, it kept starting the executable it had built before the edit.

### Apps and examples

#### New

- Riffle (`app/riffle`), a window switcher for macOS: hold Cmd and press Tab to go to any window in the order you last used it, minimized, hidden or on another Space included, from a plain list with a menu bar icon and settings.
- `examples/appkit-tour`, a Finder-like browser made of real AppKit views: a toolbar with a search field, a sidebar of places, a table of 10,000 files you sort and select, an inspector form, an alert, a sheet, the menu bar and dark mode. `ZINC_RENDER=drawn` draws the same program.

#### Changed

- In Musique (arbre), ticking a room to group it with the speakers shows the tick at once, faded until the Sonos confirms, instead of nothing for one to three seconds.
- `examples/js-phaser` opens at three times its 320x240 game size on a desktop, instead of a small window.
- `examples/midi` plays each note as a tone too, so its first run is heard with no instrument open (`MIDI_TONE=0` leaves the sound to the instrument).

#### Faster

- The iPod example's For you page no longer pauses the window when it refreshes a large history (the year's counts are now done by SQLite), and the first sync after a library change reads the 10,000 songs a slice at a time instead of in one block.

#### Fixed

- The delete icons of the Nuxt UI, Carnet and Discord examples and of the `desktop-app` template draw again: they used `trash-2`, a name Lucide changed to `trash`.
- Zinc Atelier's Settings page shows a project whose `zinc.json` has comments or a byte order mark, and edits it, instead of calling it a plain sketch.


### Docs and learning

#### New

- The docs speak to AI assistants: the site publishes `llms.txt`, `llms-full.txt` and a Markdown copy of every docs page (`index.md` beside it), in each of the five languages.
- Zinc Atelier's start view opens with **Your first sketch**: a circle that follows the mouse, whose comments, in your language, are the lesson and mark with » the places to change.
- The website has a search box in each of its five languages: press `/` anywhere on the site, then type a function, a module or an error code such as `Z0103`.
- `zinc help <name>` explains a function or class of the standard library (`zinc help rrect`, `zinc help Stage.addChild`): its comment, its signature and an example from the docs.
- The docs work offline: `zinc help --search <words>` looks through the lessons, the guides, the error codes, the API and the commands, and `zinc help --docs` builds the docs of your version once, on your machine.
- In Zinc Atelier, F1 shows the help of the name under the caret, ⌘⇧H opens one search box over the lessons, the docs, the error codes and the commands, and the Help menu opens the docs from your machine.
- After an update, Zinc Atelier shows once a small card with what changed (Help > What's New any time, "Don't show again" turns it off), and `zinc changelog` prints the same notes.
- Each line of `zinc doctor` that is not ready links to the fix for your system in the docs.
- Every lesson page of the website has a **Run it here** button under its picture: the lesson's program runs in the page, with Restart and a way back to the picture, before anything is installed.
- Zinc Atelier's empty editor and console say what to do and offer one button, its tour works from the keyboard (Tab, Enter, Escape) and its animations follow the system's reduced motion setting.

## [0.11.5] - 2026-11-05

This version makes Zinc a better place to build and debug real apps: a documentation generator, threads with `zinc:worker`, a much richer Inspector and faster builds. It also grows the apps that run on it, with Sidecar turning almost any screen into a second display, a full iPod manager, a deeper reMarkable experience, and new games such as Hamlet.

### Developer tools

#### New
- `zinc doc` makes the documentation of a project, a plugin or the engine (`--std`) as a static site, as `cargo doc` does: the API from the code and its doc comments, the Markdown and MDX pages of `docs/` and of each plugin's `docs/` (steps, tabs, callouts, commands with a copy button, screenshots, examples), search, light and dark themes and your own `docs/theme.css`. `--out` exports the folder, `--serve` serves it on this machine and reloads the pages when you save; nothing is downloaded.
- `zinc profile` samples every thread of a program with workers: one table per thread, one speedscope profile per thread, the worker's stacks under its name in `--folded`, and `--trace file.json`, a Chrome trace (Perfetto, chrome://tracing) with a named track per thread and each message drawn as an arrow from `postMessage` to the handler that ran it. `ZINC_TRACE` and the Performance panel get the worker tracks and arrows too.
- `zinc profile` opens with the wall-clock and CPU split and names closures by where they are (`outer/inner`, `Class.method/<anonymous>`).
- `zinc debug --cdp` debugs workers: each worker is a target of its own, as Chrome attaches a page's workers, with its breakpoints, stepping, locals and console, while the main program runs or stops on its own.
- Zinc Inspector, Performance: a lane per thread (the main thread's frames, each worker's handlers and messages), and a new Threads view lists the program's workers with their state, the messages waiting and posted each way, their live heap blocks, their CPU time and the error that ended them (`Zinc.getThreads` for other DevTools clients).
- Zinc Inspector, Elements: in a dev run (`zinc dev`) the tree shows your components (`<Card> src/main.tsx:30`) around the nodes they render, foldable; clicking one shows its props. A search finds a component, tag, class, text or id and opens the tree to each match; toggles show only what is rendered (on by default), only components, or hide host wrappers.
- Zinc Inspector, live styling in dev runs: add, remove and switch classes (with completion of the known classes) and add, change, switch off or delete `element.style` properties; the computed style and box model follow at once, and nothing is written to your source.
- Zinc Inspector, Network: a waterfall, filters by type, text and status, Preserve log, Clear, Export HAR, Copy as cURL, and per request its headers, query, payload, a JSON, text or image preview, the timing phases and a WebSocket's messages. An inspector that attaches late, or a second one, sees every request made so far.
- Zinc Inspector, Storage: the key/values of `zinc:storage` and async-storage (view, edit, add, delete, clear, updated live) and the SQLite databases the program opened (tables, schema, rows by page, read-only queries; writes behind a confirmation, in dev runs only). Chrome DevTools gets the key/values through `DOMStorage`.
- `zinc dev --target web` runs the plugins that have no browser backend (`zinc:process`, `zinc:lvgl`, `zinc:device`...), the file system and the environment on your machine through a local bridge, so apps that need them work in the page during development; an export still has none.
- `zinc dev --target web` also bridges `zinc:socket` (TCP, UDP, servers), the events of `zinc:net`'s fetch, `zinc:osc` and the other host services, and a `zinc:net` server (`serve`, `serveAsync`) of the page listens on your machine and answers with the page's handler.
- `zinc dev --target web` serves the project's videos and sounds outside `assets/` (with seeking), so `zinc:video` plays them in the page by their path.
- Headless tests: `keyup NAME` and `hold shift` (`hold` lets go) lines in `ZINC_INPUT` script a key's release and modifiers held alone, and a click can hold modifiers (`down meta` is a Cmd-click, `down shift+meta` holds both).
- `ZINC_CLOCK_TICK=<ms>` makes the deterministic clock move at each `performance.now()` read, so tests can observe time-sliced work.
- `ZINC_PROFILE=json` reports `present_interval` (the time between two frames reaching the screen) and `present_gt_16_7` / `present_gt_100` among the late frames.

#### Changed
- `zinc run` and `zinc dev` show every step again, as `zinc build` does and in English: engine, cache, compile, plugins, resources, run and exit. `zinc dev` adds `watch`, `change`, `swap` and `check`. `-q` hides them, `ZINC_STEPS=brief` keeps only the first-build line.
- `zinc:devtools`: component names in the Elements tree, and editing classes or styles from DevTools, now need a dev run (`zinc dev`, or `ZINC_DEV=1`); other runs record no names, cost nothing, and refuse the edits with a message that says so.
- Deterministic runs (`ZINC_DETERMINISTIC`, `zinc test`, `zinc capture`) wait for a plugin's background jobs at each turn of the loop, so their results show in the same frame on every run.
- A `.zapp` runs on any zinc engine that has what its program uses, even one older than the zinc that packed it: `zinc pack` writes `needs` in the manifest, and an engine that lacks something says "this app needs a newer zinc engine". The Hub tells you to update the tablet's engine instead of installing such an app.
- Each app keeps its `zinc:storage` keys and its files in a folder of its own, `~/.zinc/apps/<name>/` (`dataDir()` of `zinc:sys` gives it); the keys an app had in the shared `~/.zinc/storage.kv` move there the first time it runs. Erasing that folder resets the app and nothing else.

#### Faster
- Type checking a large program is faster: 1.5 s down to 0.3 s for the iPod demo, on every `zinc run`, `zinc build` and `zinc check` after an edit.
- The compile of a large program spends less time writing its bytecode (1.3 s down to 0.24 s for the iPod demo), and `zinc run` and `zinc build` write the C++ of a large program about ten times faster (13.7 s down to 1.4 s).
- The first build of a plugin compiles its source files at once, half the cores at a time (`ZINC_JOBS` sets the number): `zinc:ipod` builds in 19 s instead of 72 s, and the iPod demo's first `zinc build` takes 75 s instead of 145 s.

#### Fixed
- A function with more than 256 live values now fails with a message that names the function and says how to split it.
- `zinc run --native` compiles a program that does not draw too, instead of silently interpreting it.
- The one-line "compiling for this machine" notice goes to a terminal only; a redirected stderr stays empty.
- `zinc export` and `zinc build --bundle` on macOS accept an SVG `app.icon`; the export used to fail on it.
- `zinc build` and `zinc export` keep the window's size and `zoom` from `targets.<platform>` in `zinc.json`, as `zinc run` does: a small window no longer came out at double size.
- A program that sets its window title (`windowCtl`) now runs in the browser, where it sets the page title, instead of stopping with an error.

### Language and runtime

#### New
- `zinc:worker` runs a long computation on another thread, as the Web Workers API does: `new Worker<In, Out>(new URL('./work.ts', import.meta.url))`, `postMessage` (a `u8[]` in the transfer list is moved), `onmessage`, `onerror`, `terminate()`, and `self.onmessage` / `self.postMessage` / `self.close()` in the worker. Messages are typed data (Z5012 names what is not), the worker's file is a literal path (Z5013); the app keeps drawing while the worker computes. It runs on the Zinc interpreter and in compiled builds (`zinc build`); not on QuickJS yet.
- TypeScript's utility types: `Partial<T>`, `Required<T>`, `Readonly<T>`, `Pick<T, 'a' | 'b'>`, `Omit<T, 'a'>` over an interface or a record of data properties, and `Record<'a' | 'b', V>` (keys given as string literals; a dictionary is still a `Map<string, V>`).
- Generic arrow functions: `const id = <T>(v: T): T => v`.
- `await` in a branch of `?:` (`const png = id === '' ? '' : await cover(id)`), and an async function can `return` a promise without awaiting it, as in TypeScript; an `await` inside a larger expression of a branch still asks for a `const` first.
- A string or a number can be a condition (`if (name)`, `s ? a : b`, `!count`, `a && b`): `''`, `0` and `NaN` are false, as in JavaScript, instead of error Z0103.
- `const [a, b] = await Promise.all([pa, pb])` accepts promises of different types, up to six, however the result is kept: destructured, as `r[0]`, or not at all.
- `n.toString(radix)` prints a number in any base from 2 to 36, with the same digits as JavaScript (`(255).toString(16)` is `ff`).
- Arrays have the standard `copyWithin(target, start, end?)`: a block moved inside an array in one native call, the same on every engine.
- JSX: `style={seg(on)}` and `style={card}` take a style computed by a function or held in a constant of the same file; its object is lowered as a `style={{...}}` written in place, on every engine.
- `<Image image={img} />` shows a runtime image (from `imageFromBytes`, `imageFromPixels` or a plugin), as `src` shows an image of the assets; it follows a signal like any prop.
- `fetch(url, { saveTo: path })` of `zinc:net` has the engine write the response to a file, whatever its size and without holding the program up: a 200 replaces the file, a 206 adds to it, so a cut download goes on with a `Range`.

#### Faster
- `JSON.parse` is about twice as fast and `JSON.stringify` a quarter faster on large documents (a 4.5 MB array of 96,000 objects: 30 to 15 ms, 24 to 17 ms), and a `Map` or `Set` of up to 8 entries no longer allocates a hash index.
- Promises are lighter: an async function, `then` or `catch` allocates less. A loop of `await`s of an async function runs about 20% faster interpreted and 30% faster compiled.
- `array.fill(...)` and `array.set(...)` run as one block copy: filling a million elements takes 0.13 ms instead of 7 ms in the interpreter.
- Compiled apps release the encoded module before execution and copy only the required arguments when calling native plugins, and native calls allocate temporary array storage only when they need it.

#### Fixed
- Captured local functions apply their default arguments correctly, including fresh arrays and defaults that refer to earlier parameters.
- `String()` accepts dynamic JSON values, including arrays, objects, `null` and missing fields.
- A regex `replace` whose replacer function calls `n.toString(16)`, `Math.max(...)` and the like compiles, instead of failing with an internal error.
- Array methods on an `any` value (`data.codecs.map(...)`, `.filter`, `.join`, `.some`, `.includes`...) work, as in TypeScript, instead of failing with "cannot be called".
- `{list.map(row)}` with a named function that returns JSX shows the rows, as it does with an inline arrow, instead of printing numbers.
- `fetch` returns a binary download byte for byte: `response.bytes()` and `arrayBuffer()` no longer lose two bytes where a gzip or an archive holds two surrogate halves side by side, and a server reads a large upload's bytes in one step.
- `serveAsync` and `listen` with `requestTimeoutMs: 0` wait as long as a request needs, as documented: the connection was closed at once.
- A function that returns `cond ? <A /> : <B />` mounts as a component: it printed a number where the UI should be.
- On QuickJS, `Date.now()` and `performance.now()` stood still while a piece of code ran, so a program that timed its own work read 0 and one that waited on them never returned; they now read the real time, as on the other engines.
- `Date.now()` and `performance.timeOrigin` were off from the real time by however long the program took to start (a few hundred ms, different at each run); they now give the real time.
- `fetch` of a URL with no host says `invalid URL` instead of an empty reason.
- `fetch(url, {saveTo})` writes on a worker thread and syncs what it wrote, so a slow disk or SD card no longer freezes the frames while a file downloads.

### UI

#### New
- A transparent window without `transparentColor` has a real alpha per pixel: `bg-white/10` over `window.setVibrancy` shows the blurred desktop through it, for glass panels.
- A `rotate` started with `animate()` is played by the engine's compositor: a spinner costs the program nothing per frame and keeps turning on macOS while the program is busy. `animate(ref, prop, to, { iterations: Infinity })` repeats an animation (the kit's `Spinner` uses it); `ZINC_COMPOSITOR=0` lets the program draw every frame as before.
- `ui.onKeyUp(f)` hears a key's release, and Shift, Control, Alt and Meta held alone now reach `ui.onKey` and `ui.onKeyUp`.
- `zinc:ui/history`: back and forward for desktop apps, as a browser's: each entry holds the app's view state, `push`, `back`, `forward`, `reset`, reactive `canBack` and `canForward`, and a `scrollKey` per entry. Cmd+[ and Cmd+] (Ctrl elsewhere), Alt+Left and Alt+Right, the mouse's back and forward buttons and a two-finger swipe sideways move through it.
- The mouse's side buttons go back and forward (`ui.goBack`, `ui.goForward`, `ui.addForwardHandler`) instead of acting as a left click, and a two-finger swipe sideways over a page that does not scroll sideways does the same when the app listens; a `ZINC_INPUT` script can send `forward`.
- `scrollKey` on `ScrollView` and `VirtualList` brings a list back where it was: the offset is kept under the key when the view goes and given back when a view with the same key comes. `ui.setScrollKey(h, key)` does it from code.
- `dragToScroll` on a scroll container lets a mouse drag it (carousels); the drag is not a click. `ui.scrollTo(h, x, y, true)` eases to the offset.
- `zinc:ui/kit` has `ProgressRing` (a job's progress as a small ring filling clockwise), `ZoomView` (pinch, pan, double tap and Ctrl/Cmd + wheel zoom for any content, with an `onView` callback when the fingers lift) and `ImageViewer` (`openImageViewer`): a picture opens over the app growing from its thumbnail, with wheel and pinch zoom, drag to pan, double click to zoom, Left and Right through the pictures, a caption, and copy and save buttons.
- E-ink mode for `zinc:ui` (on a reMarkable, or `ZINC_EINK=1` on a Mac): colours snap to black, white and the panel's primaries, shadows, gradients and opacity are left out, and `pattern-hatch`, `pattern-cross`, `pattern-dots` and `pattern-stripes` fill a box with ink where a tint would be.
- `layer-cache` keeps a box's children as one picture that is drawn again only after `invalidate(node)`, and `refreshRect(x, y, w, h, 'fast' | 'quality' | 'full')` of `zinc:gfx` names the e-ink waveform of a region.
- `onTwoFingerTap` for a two-finger tap gesture.
- In `zinc:ui/kit`, a `Tooltip` shows on keyboard focus and hides on press, `ImageViewer` and `CallStats` take a `labels` map for their words, and `attachTooltip` gives a tooltip to a node made by code.
- `Popover` takes a `trigger` to open from an icon or any content; `dnd.autoScroll` scrolls a container on both axes.

#### Changed
- E-ink displays: frames carry an intent, `refreshIntent('interactive' | 'settle' | 'normal')` of `zinc:gfx`, which `zinc:ui` sets itself around a pinch.
- The kit's `Keyboard` takes `labelClass`, `specialLabelClass`, `enterKeyClass`, `shiftOnClass`, `handleClass` and `shadow={false}`.

#### Fixed
- `border-transparent` no longer draws a white line.
- List rows using a numeric JSX index update correctly after reordering, and invisible text inputs no longer repaint to blink a hidden caret.
- `Icon` follows e-ink mode: its strokes take the panel's black, white or primary instead of a near-grey tint.
- `aria-label` and `role` work on `VirtualList`, and an icon name written in an expression (`<Icon name={on ? "heart" : "star"} />`) is included in the program without listing it in `zinc.json`.
- A long press on a `Tooltip` shows its hint on touch screens.
- A program that resizes its window on every frame keeps showing its frames: they were all dropped until the window stopped moving.
- Image viewers release their high-resolution copies on navigation and close, including late loads.
- JavaScript games using Pointer Events receive finger presses, movement and releases with stable touch identities, and canvas presentation respects `image-rendering: pixelated` and `crisp-edges`, keeping pixel art sharp on Retina displays.
- A press on a focusable node no longer scrolls it into view, as in a browser: a drawing surface taller than its scroll area stayed under the pointer only by luck.

### Rendering and performance

#### New
- `ZINC_RENDERER=metal` draws a macOS window on the GPU with Metal (sprites, boxes, text, images, render targets with transparency, one draw call for sprites from many sheets); frames it cannot draw yet still go through the software renderer.
- `createImage(w, h, true)` makes a transparent render target: sprites and boxes with partial alpha drawn between `beginImage` and `endImage` keep their transparency, so regions and sprite sheets can be composed with `drawImageRect`; `clearImage` empties it.
- `updatePixelsRect` changes one rectangle of an image, and a GL display uploads only that part to the GPU.
- `updatePixels(image, pixels, opaque)` in `zinc:gfx` shows a computed picture from one `u32` a pixel instead of four bytes: a quarter of the array and no per-byte loop, on every engine and on the web.
- `frameStat(n)` tells a game the last frame's draw calls, quads, bytes uploaded to image textures and present wait, and `ZINC_PRESENT_STATS=1` prints them with the GPU display's frame times and the longest interval between two frames.
- `ZINC_PRESENT=auto` enables experimental idle display snapshots on macOS; the default uses continuous Metal presentation to avoid flashes when the renderer changes.
- `zinc:ui/image-cache` bounds unused decoded pictures while protecting images held by UI nodes and viewers.

#### Changed
- macOS window: frames are drawn and shown on a render thread while the program builds the next one, so a frame costs the longer of the two instead of their sum; deterministic runs and captures keep one thread and the same pixels. `ZINC_RENDER_THREAD=0` turns it off, `=1` forces it on.
- Source runs and app bundles load JPEG/WebP assets on demand from their compressed files instead of baking all decoded pixels; standalone executables keep their embedded assets.

#### Faster
- On the web, pictures that a program redraws every frame upload without re-allocating their buffer: about 15% less script time per frame on the Pixel Plays demos, and with `updatePixels` they spend 5 to 30% less script time per frame than before.
- Large software-rendered shadows reserve memory only for the distinct alpha rows they use, raster and HTTP scratch buffers are allocated when needed, GPU display drivers release unused software buffers, and console and browser runners release decoded input bytes before execution, so each rendering thread uses less memory.
- The Sonos plugin reads a group and its rooms in parallel, and a new `eachGroup` runs work over groups, three at a time. The inspector, the Markdown reader's Notion sync and pictures, Zinc Hub's icons, Discord file uploads and iPod library loads no longer wait for one request at a time.
- Museum releases hidden 3D output buffers and stopped video decoders after navigation, recreating them when needed.
- On an Android device that tells apps a larger screen than its panel really has, the GL renderer draws only the panel's pixels: no setting needed.
- `zinc:mapping` on Linux and Raspberry Pi takes films straight from the hardware decoder into the GPU, with no copy: a Pi 3B+ plays a mapped 720p film at 60 fps (43 before) and 1080p30 on time.

#### Fixed
- macOS keeps Metal presentation continuous by default and retains the last snapshot during resize, avoiding empty frames from adaptive renderer transitions.
- GL renderers release textures of destroyed runtime images, and QuickJS shares standard-module state across relative and `zinc:` imports.

### Plugins

#### New
- `zinc:imageio`, for image files on disk: `info(path)` reads a picture's size as shown, orientation and EXIF (date taken, camera, lens, ISO, exposure, aperture, focal length, GPS) from its header; `thumbnail(path, maxSide)` and `load(path, maxWidth, maxHeight)` decode, downscale and turn it upright off the program's thread, newest request first (`cancel(path)` drops a waiting one), and thumbnails are cached on disk. JPEG, PNG, HEIC, WebP, GIF, TIFF and camera RAW on macOS; PNG, JPEG, GIF, BMP and WebP elsewhere. Works on QuickJS too.
- `zinc:system/opener`: `trash(path)` moves a file or folder to the trash, where it can be put back (the Finder's Trash on macOS, the freedesktop.org trash on Linux and in headless runs); false when it could not.
- `zinc:system/media`: an app that plays shows in macOS Control Center's Now Playing (title, artist, album, cover, position, playing or paused) and answers the media keys and AirPods buttons, with the web's Media Session API (`mediaSession.metadata`, `playbackState`, `setPositionState`, `setActionHandler`); permission `"media"`. Other targets do nothing (`zinc:platform` `MEDIASESSION`).
- `zinc:fs`: `appendBytes(path, bytes)` adds bytes at the end of a file, and `writeTextAsync(path, text)` and `readTextAsync(path)` write and read a file on a worker thread and return a promise, so a frame goes on while a large file is saved or loaded.
- `zinc:sqlite`: `stmt.cursor(params)` reads a query's rows a batch at a time (`cur.next(500)`), with its own statement, so other queries can run between batches.
- `zinc:net`: `serve` and `serveAsync` return the port they listen on (port 0 takes a free one), a request has `remoteAddress`, and a reply can send a file (`file: path` in the `Reply`) in blocks and with byte ranges (`Range` gives a 206, a range past the end a 416), so a server streams songs and videos that players can seek. `serveAsync` is declared for TypeScript.
- `zinc:subtle`: `digest('MD5', data)` for the protocols that still ask for it (Subsonic's tokens); not Web Crypto, never for security.
- `zinc:xml`: `parse(text)` reads XML into an element tree (`El` with `attr`, `child`, `all`, `find`, `findAll`, `textOf`), and `toXml` / `toJson` write one; for UPnP, SOAP, RSS and device descriptions.
- `zinc:audio`: `openMusic(path)` plays a song or an audiobook as it is read from the disk, never decoded whole: play, pause, seek, position, duration, ended. On macOS and iOS it plays AAC, ALAC, MP3, WAV and AIFF, elsewhere WAV, FLAC, MP3 and Ogg Vorbis.
- `zinc:sf-symbols` gives a program Apple's SF Symbols as images to tint: `<Image image={symbol('sun.max', 16, 12)} className="tint-[#3a3a3c]" />`.
- `zinc:monitors` controls the Mac's displays: resolutions and HiDPI, brightness, contrast, volume and input over DDC, dimming and warmth, XDR boost, arrangement, mirroring, rotation, connection and virtual displays.
- `tray.bounds()` tells where a menu bar icon is, `window.onBlur()` tells when the window loses the keyboard, `window.setVibrancy(material, radius)` rounds the blur of a frameless window, and `window.setFrame(x, y, w, h)` moves and resizes the window in one step: together they make a menu bar panel.
- `zinc:ink` recognises handwriting on the device, with no cloud: `recognise(strokes)` names a mark as a letter (`A`-`E`, `V`), a circle, an `x`, a tick or a line, says when a letter is circled, and answers `unknown` rather than guess; `recogniseAsync` matches off the UI thread, `StrokeGrouper` collects the strokes of one mark, `loadModel` swaps in your own templates. A small neural net (49 KB, int8, under half a millisecond a mark) copes with slanted, stretched and shaky writing; `loadModel('letters.znm')` loads a net you trained with `tools/ink-train/train`, and `recognise(strokes, { net: false })` keeps the template matcher alone.
- `Ink.draw` of `zinc:ink` takes an optional view (`ox`, `oy`, `z`) to draw and write on a zoomed page, and `Ink.drawOver` draws your own app's ink over a page.
- `zinc:webview` runs on Linux desktops with WebKitGTK: same code, same `<NativeView>`, `zinc://` assets, `postMessage` and `invoke`. Install `libwebkit2gtk-4.1-0`; on a screen with no desktop, `create` says so.
- `zinc:webrtc` video holds up on bad links: a lost packet is asked for again (NACK), the receiver measures the link and tells the sender (REMB), and the sender steps its picture down a ladder (720p30, 360p30, 360p15, 180p15, 90p7) and back up as the rate allows. `getStats()` gains `nackCount` and `qualityLimitationReason`; `ZINC_WEBRTC_BWE_LOG=1` prints the rate decisions, and `ZINC_FAKE_CAMERA_NOISE` adds grain to the fake camera to test it.
- `zinc:webrtc` simulcast for a media server such as Galène: `addTransceiver(track, { sendEncodings: [{ rid: 'h' }, { rid: 'l', scaleResolutionDownBy: 2 }] })` sends a full and a small stream, and `scalabilityMode: 'L1T2'` sends VP8 in two temporal layers.
- `zinc:carplay` (experimental) and a native viewer demo receive video, audio and touch controls through a separately installed PlayPort backend; it forwards two simultaneous touch contacts with stable finger slots and supports day/night appearance through `setNightMode`. USB and microphone uplink are not implemented yet.
- `zinc:lastfm`, the Last.fm scrobbler, as a plugin.
- Native plugins: a spec can declare interfaces and pass them, in lists, optional or nested, as parameters, results and promise results; the generated C++ header has a plain struct per record with `zn::rec::encode`/`decode`, safe on a worker thread, and fields appended later stay readable both ways. `zinc:gphoto2`'s `detect()` uses it.
- A stand-in `x.sim.ts` can `import type { ... } from './x.spec'` to use its spec's records instead of copying them, and the plugin still imports them from the spec.
- `zinc:system` opens and saves files in a web export (the browser's picker, a download) and reports files dropped on the page, and `uploadFile` of `zinc:web/fetch` sends a file of any size with its progress, in the browser and natively.
- `zinc:link` announces a short public text (`advertise({ info })`, `Peer.info`), and a web export builds with it: each call answers that a page has no sockets.
- `zinc:mapping`: `/layer/<n>/edgeoffset` moves where each side's gradient starts, and `/layer/<n>/picture` moves, turns and fades the picture inside its zone.
- `zinc:mapping`: `/layer/<n>/maskcurve/<k>` gives a polygon mask Bézier handles.
- `zinc:fleet` gives several machines one clock over the network.
- `zinc:mapping`: `/output/viewport` shows a part of the canvas, so that machines side by side show one picture.
- `zinc:socket`: a UDP `Datagram` has `age`, the milliseconds since the system received it, which tells how long it waited for the program to read it.
- `zinc:video`: `player.seek(seconds)` (a paused player stays paused, on the picture of that moment), `player.rate` (0.0625 to 16) and `player.playhead`, the position that runs between two pictures, with `player.seeking`.

#### Changed
- `zinc:net`: a program can serve several ports at once, each with its own handler (`serve`/`serveAsync` again on another port no longer replaces the first server), and `stop(port)` stops one; `stop()` still stops them all. The Spotify login now stops only its own callback server.
- `zinc:fs` `copyFile` keeps the source file's modification time and permissions, so a picture copied to another disk keeps its date.
- `zinc:mapping` adds `info()`, `layerJson(layer)`, `playsMedia()` and `isFileName(name)`, and its state gives the output in pixels.
- `zinc:mapping`: an `outside` edge now starts its gradient at the edge, and `/layer/<n>/inset` brings the far end of the gradient back instead of moving its start.

#### Fixed
- `zinc:storage` reports read/write failures and preserves existing data when a replacement write fails.
- Spotify calls that find an expired token share one refresh, so simultaneous calls cannot invalidate the rotated token.
- `zinc:osc` `listen` fails with a clear error when another program holds the UDP port, instead of seeming to work while that program gets the messages.
- `zinc:ink` no longer takes a `B` drawn as a stem and one looped stroke for a letter with a circle round it.
- A plugin's native `Promise<T>` export written on the C ABI (`native/*.abi.c`) is no longer refused at load: `zinc native-gen --c` writes the result type of the promise.
- On macOS, apps with an `app.id` use their own application name in system tools even without permissions, including JavaScript and WebGL apps.
- A program that draws, exported with `zinc export --target x86_64-linux`, now opens a window on a desktop (the size of its `sim` target when it names no Linux size) and takes the screen without one, instead of showing nothing.
- On the web, `zinc:system/dialog` can pick a folder, and a folder dropped on the page gives the files in it.
- `zinc:mapping`: the `cover` fit deformed the picture instead of cutting what exceeds; `/layer/<n>/fit` also takes `width` and `height`, and `/layer/<n>/frame` slides and zooms the picture.
- `zinc:mapping`: a mask with no feather has a clean edge at the size it is shown, and drawing one no longer costs a slow graphics chip a shader per pixel.
- `zinc:fleet`: two machines with windows open agree on the time within a fraction of a millisecond instead of up to 8 ms, because the wait for a frame no longer counts.
- `zinc:link`: on a channel from `onConnection`, `peer.host` is now the address the session comes from; it was empty.

### iPod

#### New
- `zinc:ipod` manages classic iPods (Classic, Nano, Mini, Video, Shuffle) over libgpod: detect (also iPods plugged in but not mounted, no longer iPhones), `mount()`, open or initialise, tracks with their tags and covers, playlists, a free-space check before any copy, backups, check and repair, eject. It writes the missing SysInfoExtended file itself.
- `zinc:ipod`: `specs()` gives every detail of an iPod (model, firmware, serial, storage by kind, library counts, cover sizes), `artwork()`/`cover()` give a track's cover, `photoAlbums()` and `photo()`/`photoImage()` read its photos, and `extras()` lists its notes, contacts, calendars and voice recordings.
- `zinc:ipod`: the database is backed up to the computer before the first change of a session, snapshots are taken at each save, and backups share the music and copy only what changed (`backups()` lists them, `deleteBackup(folder)` deletes one and refuses anything outside the backup folder). `download(ids, dir)` copies tracks to the computer as `Artist/Album/NN Title.ext`, skipping files already there.
- `zinc:ipod`: `analyze()` finds duplicate songs by their tags, by identical files and by their sound (Chromaprint fingerprints, cached), and lists music without a cover or tags, unused files and empty playlists; `merge()` keeps the best copy of each song with the tags, cover, play counts, rating and playlist places of the others. Analysing again reads only the files that changed.
- `zinc:ipod`: smart playlists. `playlists()` gives each one's rules; `createSmartPlaylist(name, rules)`, `setSmartRules(id, rules)` and `refreshSmartPlaylists()` write them, and every save refills the live ones. `evaluateSmart(rules, tracks)` previews the songs without writing, including the Media Kind rule. A Nano 6G/7G refuses them: "this iPod keeps no smart playlists; save it as a normal playlist".
- `zinc:ipod`: tracks give `bpm`, `skipCount`, `lastSkipped` and the file's kind and date modified; `update(id, { bpm })` sets the tempo, and `update()` writes what iTunes' Get Info edits (grouping, description, compilation, sort names, start and stop times, volume adjustment, skip when shuffling, remember position, the lyrics flag, the play count). A field given as `''`, `0` or `false` clears it.
- `zinc:ipod`: `played([{ id, count, at }])` adds plays to the iPod's play counts and moves the last played date in one save; `writeLyrics(id, text)` writes lyrics into a song's file (MP3, WAV, AIFF, M4A, M4B) and `readLyrics(id)` reads them back.
- The iPod demo reads a classic iPod plugged into the computer: a drawing of it in its colour, storage by kind of media, albums with covers, every song (search and sort), playlists and every detail of `ipod.specs()`. It plays the iPod's music (double-click a track, then play, pause, previous, next and seek) and shows podcasts, audiobooks, videos, photos, notes and files.
- The iPod demo manages the iPod: download albums, playlists, podcasts or chosen songs, add files and folders (picker or drop on the window, with **One playlist per folder**), backups (take, restore, delete), check and repair, mount and eject, a transfers queue with every step and file listed, and a log. Every change waits for the Allow changes switch, off at each start, and an iPod plugged in or pulled out shows within seconds.
- The iPod demo: an Optimise page analyses the iPod, shows each group of duplicates with why it matched and the copy it keeps (click another to keep it), and merges the ticked groups as a transfer. A Repair page finds albums without a cover, songs without a year or genre, artist names written several ways and duplicates, shows each fix before writing it (cover from the Cover Art Archive, year and genre from MusicBrainz, the most used spelling or Last.fm's) and writes a group as one Transfers job.
- The iPod demo: every download, add, backup, restore, delete, check, repair, analysis and merge answers on the page it was started from with a toast showing progress, Show and Cancel, then its result or error; the sidebar's Transfers row shows a ring, a count and a red dot for a failure not seen.
- The iPod demo keeps a cache per iPod (named after its FireWire GUID): covers, the library, so an iPod opens at once and is read again in the background only when its database changed, and a remote iPod's songs played, the least recently played dropped past 2 GB (`audioCacheMb` in `config.json`).
- The iPod demo: back and forward (‹ › in the top bar, Cmd+[ and Cmd+], the mouse's side buttons, a swipe) return to each page, album, artist, playlist or photo as it was left, at the same scroll, search and selection; every page has a search that ignores case and accents, Cmd+F or Cmd+K searches songs, albums, artists and playlists from anywhere, and a new Artists page lists the album artists.
- The iPod demo: a queue as Spotify's. Right-click a song, a selection, an album or a playlist for Play, Play next and Add to queue; the list button of the bar opens the queue, where entries are dragged, removed or double-clicked. Shuffle mixes only what comes next and turning it off restores the order; repeat goes all, one, off. The session (queue, song and moment, shuffle, repeat, output, volume) is kept and shown paused at the next start.
- The iPod demo plays on Sonos: the button at the right of the bar picks this computer or a Sonos group, and play, pause, next, previous, seek and the group's volume drive it. The speaker's queue follows every change, changes made in the Sonos app come back, and the bar follows the speakers' events (falling back to reading the group each second when the events do not reach the computer). Closing the window while Sonos plays keeps the app in the menu bar, serving the songs; Cmd+Q asks first, and quitting saves the session and pauses the speakers.
- The iPod demo: every song heard for half its length or 4 minutes counts, here, on Sonos or from a remote iPod: one more play on the iPod (kept until Allow changes is on), a scrobble to Last.fm and ListenBrainz once their accounts are entered in Settings (sent later when offline), and a line in the iPod's listen history. Quitting counts the song under way for the time heard.
- The iPod demo: Settings › Listening history imports your Last.fm scrobbles and your ListenBrainz listens (by user name or the export zip), with the songs played in the app; each song is matched to the iPod's tracks (accents, "feat.", "Remastered", "Live" and near spellings) and the page lists the most played artists and songs the iPod does not have. A failed Last.fm import tries again by itself after 2, 5 and 15 minutes, a refused key or an unknown user is not retried, and the import lists its steps in Transfers.
- The iPod demo: smart playlists as iTunes made them. Playlists › + › New smart playlist (or right-click a song, album or artist › Smart playlist like this…) opens the editor: Match all or any of the rules, a limit with its order, live updating, and templates (Never played, Top 25 most played, Recently added, 5 stars, Forgotten favourites, a tempo range). Save to iPod writes a real smart playlist; one whose rules cannot be read here says why and offers Duplicate as normal playlist. Normal playlists can be made and filled from Playlists › + and a song's menu.
- The iPod demo: Genius without Apple. Right-click a song › Genius from this song (25, 50 or 100 songs), or the sparkles beside the song playing, gives the iPod's closest songs from your listening history, similar artists (Last.fm with an API key), genre, decade, plays, ratings and skips, with a Why column saying why each was picked; it plays at once here or on Sonos, and Save to iPod writes a normal playlist. The Playlists page also lists your mixes, the taste clusters of your history, and every Genius list asked is kept for each iPod.
- The iPod demo: a For you page, first under the iPod in the sidebar, as Spotify's home: Jump back in, Daily Mix 1-6, On Repeat, Repeat Rewind, Rediscover, Time Capsule, Because you listened to…, your top songs and artists of the month and year, and Your year. Shelves snap their cards, can be dragged with the mouse and hide their scroll bars (switches in Settings › For you); the page opens instantly from what was kept. A mood mixer at its end (Chill, Focus, Party, Workout, Melancholy, Happy, with energy and tempo) remakes its list at once.
- The iPod demo: Start radio from a song's menu or a Genius list plays songs close to it without end, never the same song twice; 👍 steers the next songs toward the one playing, 👎 skips it and keeps its artist out. Path from here… makes a list "From A to B" that moves smoothly from one song to another.
- The iPod demo: deep analysis with AudioMuse-AI. Settings › AudioMuse takes its address and API token (Test connection, Analyse now as a Transfers job, Sync results); Genius, the mixes and For you then mix how songs sound with what you play, and For you adds "Sounds like…" shelves and Mood mixes. A finished analysis is synced by itself. Settings › Share with AudioMuse serves the iPod to AudioMuse-AI as a Subsonic server (Navidrome type), and its playlists are written to the iPod only while Allow changes is on. Settings › Recommendations › Prepare recommendations brings each source up to date.
- The iPod demo: a Discover page lists the artists Last.fm calls similar to the ones you listen to that are not on the iPod, ranked by how much you play the artists that point at them, with their top albums and songs and links to Bandcamp, MusicBrainz and Last.fm.
- The iPod demo: Get Info (Cmd+I, a song's right-click menu, or the Songs page's button) opens an iTunes-style Info window on the songs selected, with Details, Artwork, Options, Sorting and File tabs; with several songs, values they do not share say Mixed and only the fields you edit are written, as one Transfers job and one save. Needs Allow changes.
- The iPod demo: a Lyrics panel shows the lyrics of the song playing from LRCLIB, synced lyrics highlight the line sung, and Write to iPod puts them in the song's file (Allow changes).
- The iPod demo: a sleep timer (15 to 90 minutes, the end of the song or of the album) fades the music out over its last minute, pauses, then puts the volume back for the next Play. Settings › Wake-up alarm plays a daily mix, a playlist, a Genius list or a radio at a time and on the days you pick, here or on a Sonos group, its volume rising over a few minutes; it sounds only while the app is open.
- The iPod demo: the song playing shows in macOS Control Center's Now Playing with its cover and position, and the media keys, Control Center and AirPods play, pause, skip and seek it.
- The iPod demo: the Add page takes songs from jukebox (or any Subsonic server, such as Navidrome): set its address and token in Settings › jukebox, browse or search it, and Add puts songs on the iPod with their tags and covers; a song the iPod cannot play is converted to AAC by jukebox, an interrupted download resumes, and a jukebox playlist becomes an iPod playlist.
- The iPod demo: "Connect to a remote iPod" on the Devices page (the address and token of an iPod daemon) opens an iPod plugged into another computer like a local one, marked with a network sign: albums with covers, songs, playlists, playing, add, delete and eject when the daemon allows changes. Save to iPod also works on it.
- The iPod demo: the Last.fm key and secret are kept as you type them, Test connection is always there, and the Last.fm sign-in finishes on its own once you allow the app in the browser; the Last.fm and ListenBrainz cards name the account.
- The iPod daemon (`examples/ipod-web`, for a Raspberry Pi or a Mac, `zinc run examples/ipod-web`, then open http://localhost:8686): a web page of the iPods plugged in and their specs, where any browser on the network can search and sort the songs, browse albums and playlists, play and download songs, and with `--allow-changes` add files by drag and drop, delete songs and eject. The open iPod's library is a JSON API (`/api`, with a token) and a Subsonic server (`/rest`, `--user` and `--password`); `POST /api/played`, `POST /api/playlist` with `{"name", "ids"}` and `POST /api/update` with `{"ids": [...], "patch": {...}}` write plays, playlists and tags, and `/api/status` gives the iPod's `firewireGuid` and database `marker`.
- The iPod daemon works as AudioMuse-AI's media server (type Navidrome) and as a satellite of jukebox: `--api-key K`, playlists with `--allow-changes`, `--jukebox <address> --jukebox-token <token>` to report the iPod and its songs to jukebox (`--url` names the address jukebox reaches the daemon at), a Subsonic client's `scrobble` counting on the iPod and going to Last.fm and ListenBrainz (`--lastfm-key`, `--lastfm-secret`, `--lastfm-session`, `--listenbrainz-token`), and `--log-requests` printing one line per request with passwords and keys masked.
- `examples/ipod-rescue` adds a recovery workshop with read-only Mac diagnostics, local firmware inspection, metadata backups, Classic specifications and known firmware branches, SysCFG dump comparison against a reference, and a restoration simulator. Physical erase and firmware writes stay locked until qualified.

#### Fixed
- The iPod demo's For you, Genius, the mixes and the mood mixer are worked out a little at a time instead of in one long freeze, with breathing placeholder cards and turning rings while they wait.
- The iPod demo: a For you shelf no longer opens the card under a drag, and the iPod daemon's songs carry `albumArtist`, `played`, `userRating` and an absolute `path`.

### Music and Sonos

#### New
- `zinc:sonos` plays and manages the queue: `playUri`, `addUriToQueue`, `clearQueue` and `playFromQueue` (named after SoCo's) with `Song` and `musicTrackMeta` to play song files from a plain `http://` URL with title, artist, album and cover; `getQueue` (paged), `queueSize`, `addMultipleUrisToQueue`, `removeRangeFromQueue`, `moveInQueue` and `reorderTracksInQueue`; and the Sonos playlists (`getSonosPlaylists`, `createSonosPlaylist(FromQueue)`, `addItemToSonosPlaylist`, `removeFromSonosPlaylist`, `moveInSonosPlaylist`, `clearSonosPlaylist`, `removeSonosPlaylist`, `playSonosPlaylist`).
- `zinc:sonos` events: `Events` subscribes a group's speakers (`watch(g)`), renews the subscriptions and keeps `Group` and `Speaker` objects up to date from each notification, so a program follows what plays, the volumes, the rooms and the queue (`group.queueUpdateId`) without polling; `localAddressFor(ip)` gives this computer's address on a speaker's network.
- `zinc:sonos` has more of SoCo's calls: `stop`, `endDirectControlSession`, `setShuffle`, `setRepeat`, cross fade, group mute, `setRelativeGroupVolume`, `speakerByName`, `unjoin`, `partyMode`, `playUri` with a title, `start` and `forceRadio`, hidden rooms in `sys.allSpeakers`, `group.media` and `track.metadata`; a fault is a `UpnpError` with its UPnP `code`, and a speaker's address can carry a port. `airplayBridge(uri)` recognises a bridge stream.
- `examples/music-tree` recognises a stream of airplay2-sonos-bridge: it shows the song and the sender from the bridge, hides previous, next and seek, and offers "Arrêter AirPlay"; Settings has its status and mode.
- Last.fm scrobbling in `examples/music-tree`, set up from a phone: a QR code and a one-time code open a page served by the app for ten minutes at most.
- `app/sonos-lastfm` scrobbles Sonos playback, including Spotify Connect, with browser authorization, a persistent retry queue, group-aware listening time and a terminal log of track, playback and scrobble status changes.

### Sidecar

#### New
- Sidecar shows a Mac's screen on another screen over the network, in colour: run the `app/sidecar-screen` app on a Raspberry Pi (HDMI, `display-fbdev`), then `sidecar-screen --host <its address>` on the Mac (built by `app/sidecar/mac/build.sh`). Changed tiles are compressed with zstd on every core; large changes go first in reduced colours, then exact once they rest (`--exact` turns that off).
- Sidecar shows a Mac's screen on another Mac (an iMac 5K as a second display): run `build/sidecar-receiver` on the Mac that shows it, full screen at its native size (`--size WxH`, `--windowed`; Esc quits), then `sidecar-screen --host <its name>.local --hidpi` on the Mac that sends. Videos are decoded in hardware.
- Sidecar uses an iPad or iPhone on the USB cable as the Mac's screen, charging meanwhile: the Sidecar app for iPadOS 15 and later (`app/sidecar/ipad`, now also on iPhone), `sidecar-screen --host usb`, and "iPad or iPhone on the USB cable" in the menu's Add a screen.
- Sidecar uses an Android device (Android 5 and later) on the USB cable as the Mac's screen: the Sidecar app for Android (`app/sidecar/android`), `sidecar-screen --host adb`, and "Android on the USB cable" in the menu. What moves plays as video decoded by the device's hardware (60 frames/s on a Nexus 7).
- Sidecar's "Add a screen" lists the screens on the same network (the iPad, iPhone, Android and Mac apps announce themselves), one click to add. Each screen shows in the Mac's Displays and on its card in the menu under the device's own name, and several screens run at once.
- An iPad, an Android device or another Mac used as a screen now drives the Mac: a finger (or the mouse) is the pointer, a tap a click, two quick taps a double click, two fingers scroll, and the Apple Pencil draws with its pressure and tilt. macOS asks once for the Accessibility permission.
- A colour screen's size is chosen in the menu ("Looks like"): Retina and HiDPI sizes (drawn at twice and scaled down), low resolution below 800 × 560 points (larger, softer text), and native pixels. Details says which one macOS uses.
- Sidecar streams to several outputs at once (the reMarkable and one or more screens): each output in the menu bar app starts and stops on its own, with a dot on its card while it runs, and a mirror can copy a different Mac display on each. Each output keeps its own mode and settings, and the menu bar app starts by choosing the output.
- Sidecar can send a screen's whole picture as one H.264 stream ("Whole screen as video", experimental; `sidecar-screen --video-all`): on a Raspberry Pi 3 a screen that moves everywhere goes at 60 pictures a second instead of about 23, letters a little softer. It plays as video only while the screen moves; once it is quiet the screen is sent again pixel-exact.
- Sidecar on a Pi plays videos in hardware: a part of the Mac's screen that moves like a film is sent as H.264 and decoded by the Pi's video decoder onto a display plane, the rest stays exact (60 pictures a second with 6% of the Pi's CPU). `--no-video` turns it off. Update both the Pi app and the Mac tools.
- Sidecar plays the Mac's sound on the screen: turn on Sound in the screen's settings (macOS asks once to record the system's audio). The Mac goes quiet meanwhile; a Pi plays it on its headphone jack, or on HDMI when the screen has speakers, and a Mac receiver on its speakers. `sidecar-screen --audio` on the command line.
- Sidecar plays films at 25 pictures a second without judder: after 4 s of such a film, the Mac's Sidecar display and the Pi's HDMI screen switch to 50 Hz (when the screen takes it), and back to 60 Hz 6 s after the film. The screen goes dark for a moment at each switch.
- Sidecar's menu bar app has a Details window for a screen: the link (Wi-Fi, Ethernet or USB cable, addresses), the picture (size, codec), frames captured and sent, throughput, encode and decode times, round trips, and the screen's CPU, clock, temperature, throttling (a Pi's under-voltage shows in red) and memory. Its Speed test gives the real throughput and ping on the connection in use.
- Sidecar opens Sidecar Screen on the Pi through its Zinc agent when the Mac waits for it, and has an "Open it there" button. A name like `zinc-player.local` now tries each of its addresses, a cable first.
- A Mac's USB-C cable is a network link to the Pi (an Apple silicon Mac shows itself as a USB network device that Linux refused): the Pi image builds the driver when it has the compilers, else `sudo zinc-admin mac-usb` once; Sidecar then reaches the Pi by its `.local` name over the cable.
- `sidecar-screen --synthetic <percent>` sends the same moving load every run, to compare links and screens.
- Sidecar on the reMarkable shows a Mac's screen on the tablet over USB, as a second display (Retina, 1:1 or a chosen size) or a mirror, in fast black and white: open Sidecar on the tablet, then run `app/sidecar/mac/build.sh` and `build/sidecar` on the Mac. Two fingers scroll the Mac (in the way the tablet is turned), a two-finger tap is the full refresh, and a three-finger tap opens a quick panel (clean, full refresh, preset, contrast, lock the turn). It can also run without xochitl, on the whole screen: `zinc-tile sidecar.zapp --session --max 7200` (`zinc-tile --max` sets any session's time).
- Sidecar's menu bar app (`app/sidecar/mac/build/Sidecar.app`) has start and stop, presets (Text, Speed, Video, Reading), a settings window that explains each knob, a pen tablet mode where the Marker draws in Mac apps with pressure, tilt and hover, a Profile tab with live numbers from the Mac and the tablet's panel (recorded to a file on demand), and shows when a reMarkable is plugged in by USB and can start on it, set its frontlight and end its app. It can also stop the Mac's text caret from blinking while it runs, as each blink leaves a ghost on e-ink.
- Sidecar on e-ink dithers with blue noise, cleans through grey checkers instead of a black flash, and dots only photos and films by default, keeping the interface pure black and white (Greys: Pictures only; `--dither 3`). Window borders come out as solid lines, pale tints show as a light grey instead of white paper, and a settings preview shows each grey pattern.
- Sidecar turns dark areas into ink on paper, so a dark mode's windows (Discord, a code editor) are readable: each mostly dark part is turned at its own border, and coloured bars and badges come out light grey with dark letters. Dark areas in settings: Turned (the default; Video keeps them), Kept, or Whole screen; `--invert 0|1|2`. Photos (avatars, thumbnails, pictures in a chat) get their own gentle curve and are never turned into negatives, round pictures keep their shape, and screenshots shared in a chat are drawn as sharp text.
- Sidecar has an experimental Hybrid preset: fast black and white dots while things move, the panel's 16 true greys once they rest, with no flash or pause after each scroll. "Grey levels at rest" (All, 16, 4; `--grey-levels`) sends a resting page in fewer bytes. "Mouse pause" waits until the mouse rests before it cleans ghosts, and "Panel timing" holds updates until their place rests.
- Sidecar's menu bar app says when macOS blocks its local network access (the reMarkable then looks unplugged) or Screen Recording permission is missing, with a button to the setting.

#### Changed
- Sidecar keeps two pictures on the way to a screen that answers within two refreshes, instead of one: smoother on slower screens (a Nexus 7 goes from 50 to 60 frames/s while you work).
- Sidecar compresses its pictures with zstd when the tablet's engine reads it, so less goes through the cable. Update both the tablet engine and the Mac app.
- Sidecar's Full refresh now redraws the whole screen in clean greys before it flashes, so it no longer brings back the fast dots and leftover marks.

#### Faster
- Sidecar on the reMarkable is faster: the tablet draws the pointer itself, large updates are compressed, a scroll moves what the tablet already shows instead of sending it again, big changes are processed on the Mac's GPU, and the tablet no longer waits for each update to finish while a scroll runs. Update both the tablet engine and the Mac app.
- Sidecar on a Pi decodes a picture on every core and shows it as soon as it is whole (a quarter of a 1080p screen moving: 54 pictures a second instead of 30, a round trip of 18 ms instead of 34).
- Sidecar's "Whole screen as video" is about 4 ms quicker to encode and sharper on a fast link (the iPad's cable, Ethernet, Thunderbolt).

#### Fixed
- Sidecar no longer leaves ghosts, doubled text or pink and yellow residue from updates sent onto pixels the panel is still driving.

### reMarkable

#### New
- Zinc Hub can run an app outside xochitl, with the panel to itself: Store › Installed › Ink session turns it on or off per app, the home grid marks it INK and opens it that way, and an app whose zinc.json says `"display": {"ink": "session"}` gets it at install. When the tablet refuses (xochitl restarted too often lately), the Hub says why. In an ink session, closing an app leads to the Hub, the Hub opens other apps without restarting xochitl, and closing the Hub brings xochitl back.
- Hub: the home page is a launcher in the style of iOS (six apps to a row, rounded icons, a badge for an update or "!" when the app does not respond), shown at once from the last catalog that checked, also without the server. An Update all button installs every update (the engine first, the Hub last), and a Store lists every app of the server (**All**) and manages the installed ones (**Installed**): update, rollback, channel, **Pin to sidebar**, **Reset data** (erases what the app saved, never your documents), uninstall (tap twice), and the Zinc engine first with **Update the engine**.
- Hub: each app shows its description, author, size and what it uses (zinc.json `"permissions"`, `description`, `app.author`), and installing an app, or an update that asks for more, first shows those permissions with **Allow** / **Cancel**. **Clean up AppLoad** in Settings removes the Zinc tiles whose app is gone, an **Info** page shows the Hub and engine versions, the tablet's system, battery (and the Marker's), memory and storage, and every action shows what it is doing in a modal that keeps an error on screen until OK.
- Hub: **Accueil** shows the Hub as a widget card with the updates waiting and the apps not responding, each with **Stop**.
- Stuck apps: every Zinc app runs with a tiny watcher that notices when it stops responding, uses the CPU while hidden or takes too much memory. The Hub's **Running** page lists the apps with their state, CPU, memory and uptime and stops any of them; an app that stops responding shows at the top of the Hub with **Stop** / **Wait**, and a hung app whose window you close, or that stays hung while hidden for 10 minutes, is stopped by itself. Three fingers held on the screen for 2 s quit a Zinc app, or press the power button twice (sleep, wake).
- The Hub updates the reMarkable's engine itself: `tools/rmpp-engine --publish <hub> --token <t>` sends the engine bundle to a hub server, and the Hub app checks it and swaps it in, keeping the old engine if anything fails. `zinc --engine-info` prints what an engine runs.
- AppLoad (the Zinc build) can pin apps to the tablet's sidebar: each app listed in `pinned.json` gets its own entry under AppLoad's and opens with one tap. Installing that AppLoad build restarts the tablet's interface once.
- Swipe down from the top edge of any Zinc app, past the upper fifth of the screen, to open a panel with **Accueil**, **Quitter** and **Annuler** (a shorter swipe still brings AppLoad's window bar). Apps get it through `RemarkableApp` of `zinc:remarkable`; the top bar shows Home and Quit as round icons, with a battery icon.
- Experimental header mode: `"display": { "header": "remarkable" }` in zinc.json shows the app below the tablet's own top bar (menu, logo, battery, time), which stays live, with a badge before the status icons showing the app's name with Home and Quit. xochitl's sidebar and menus open over the app, and an app the Hub opens works there even when it does not use `zinc:remarkable`. Settings › Experimental › **reMarkable header** turns it on for every app. Needs the Zinc build of AppLoad; without it the app stays full screen.
- Writing tools for ink as the tablet's own: ballpoint, fineliner, marker, pencil, calligraphy and highlighter, the Paper Pro's colours, three widths, stroke and area erasers, undo and redo (`InkPalette` of `zinc:remarkable`, in Zinc PDF). Each stroke keeps its tool in the saved notes, the SVG export and the annotated PDF (the highlighter stays translucent in any PDF reader). `InkPalette` takes `shown` and `onHide` for an app that opens it from its own button.
- `RemarkableKeyboard` of `zinc:remarkable`: an on-screen keyboard drawn for e-paper in the tablet's language (Hub, Web and Read use it). The Type Folio and AppLoad's on-screen keyboard type into Zinc apps' text fields (letters, accents, arrows, Backspace, Return, shortcuts); `"display": { "keyboard": true }` in zinc.json makes `zinc-tile` ask AppLoad to show its keyboard.
- A reMarkable app can size its surface as a whole fraction of the panel (810x1080 for the Paper Pro, 1080x810 in landscape), drawn at two physical pixels per pixel, and can run in landscape: set `"orientation": "landscape"` in `app` of `zinc.json` (`ZINC_RMPP_ROTATE=270` for the other side), with the Marker and the fingers following the turn.
- `setWaveform(mode, colour)` of `zinc:remarkable` names the panel's raw refresh mode under an ink session; `examples/remarkable/quill-lab` shows the demos of Quill with it, `quill-originals` runs the real ones. An e-ink app on a colour panel can ask `zinc:ui` to stop snapping colours with `setEinkColour(true)`.
- Pinch-zoom works as in the reMarkable's own apps: the page you see is scaled as a quick ghost while your fingers move, and the sharp page is drawn once when they lift; with the Zinc build of AppLoad the fast mode starts at once. After a zoom or a gesture the page is cleaned with a quiet partial refresh instead of a flash. Every Zinc app with a zoomable view gets it; PDF, Web and Read use it, double tap zooms in to twice or back to the whole page, and the Notes example zooms its page with two fingers, up to 4x.
- Read: pinch the page to change the text size; it is laid out again at the nearest size when your fingers lift (A- and A+ still work), and it has the tools palette too.
- Murdoku runs on the reMarkable (`targets.rmpp` in its `zinc.json`) in portrait and landscape, black and white with the same official artwork as the colour app, with a one-screen layout that needs no scrolling and docks under the tablet's header. It can be played in colour on the Paper Pro (a "Mode couleur / Mode N&B" button, remembered), and with the pen: a circled letter places that person, a bare letter is a pencil note, an X crosses a cell out, and a two-finger tap undoes.
- `examples/ink-lab`: write on a rectangle and watch what `zinc:ink` recognises beside it, live while the pen is down: best candidates with scores, the boxed marks, a letters / shapes / all switch, Undo and Restart. The notes example for reMarkable has a Record mode to collect handwriting samples.
- Android: on a rooted device, `setBacklight(false)` now turns the backlight fully off instead of leaving the screen at its dimmest glow, and a touch still wakes it. The app asks for root the first time; without root it dims as before.

#### Changed
- Handwriting is read far better: `zinc:ink`'s net now learns from real writers (UJI Pen Characters, CC BY 4.0), so on 20 writers it never saw 94.5 % of letters and marks read right instead of 75 %, and it accepts far fewer letters that are not asked for. Ink Lab can switch between `new net` and `old net` to read the same marks with both.
- A letter or a cross written in several strokes now reads as one mark: `StrokeGrouper` waits 900 ms after the pen lifts by default.
- Ink Lab writes on the Pen waveform in an ink session, with its own bar to leave, and redraws only when the Marker moves; Murdoku's writing layer is redrawn the same way.
- PDF, Read and Web draw their pages with the panel's clean UI refresh and switch to the fast Pen refresh only while the writing tools are unfolded (`setPenMode` of `zinc:remarkable`); a pinch or a two-finger pan uses the fast refresh while the fingers move, then one full refresh cleans the page when they lift, and the full refresh comes only after about six screens of changes.
- Hub: checking for updates no longer blocks the Hub; its result, or "Server unreachable", shows in the status line. **Reset data** on a running app stops it first.

#### Faster
- Writing with the Marker on the Paper Pro follows the pen: with the current AppLoad the stroke is drawn in the pen waveform and sent as it grows, then redrawn cleanly a moment after you lift (`ZINC_RMPP_INK_AUTO=0` turns it off); with an older AppLoad it is sent 30 times a second instead of 8.
- Writing with the pen in Zinc Web, Read and PDF is as fluid as in notes: the page and your finished strokes are kept as one picture and only the new bit of the stroke is drawn. Pinching and panning scale the page you see instead of drawing it and your notes again at every move.

#### Fixed
- Ink drawn over a board (`Ink` with `overlay`) now keeps the pen's pressure width and no longer redraws the whole stroke as one line.
- An app docked under the header in landscape, or on a surface drawn at two pixels per pixel, now pads by the header's real size on the right side.
- An app that names the `rmpp` display driver in `zinc.json` now gets the e-ink look on the Paper Pro even when it is published as a Linux or Pi build; `ZINC_EINK=0` still shows the colour app.
- A palm that lands while the Marker is near the glass, or in the 300 ms after it left, no longer reaches the app as a touch (`ZINC_RMPP_PALM_MS` changes the delay).

### Zinc Web on the reMarkable

#### New
- Zinc Web: send a page to the tablet from the Mac, with the relay's page at `http://127.0.0.1:8790/` or its **Send to reMarkable** bookmarklet; an e-ink style (on by default) makes pages black on white, underlines links and puts fixed bars and cookie banners back in the page.
- Zinc Web has tabs (a page sent from the Mac opens in a new tab, tabs are kept when Web quits, **Close all** closes every tab), a **Reader** button that shows the article alone as Firefox's Reader View does, **Full screen**, **A-**/**A+** to draw the page smaller or larger, a **Home** button, a **×** that empties the address field and shows a blank page, and writing with the same tools as PDF (the **Tools** palette over the page).
- Zinc Web has a **contrast slider** in Settings, from the page as it is to 4x, that darkens the page and thickens thin text for e-ink (the web relay takes `contrast=1..4`; the names normal, high and max still work). The next screen is fetched while you read, so a page turn waits for nothing.
- The web relay's page opens in the Mac's browser when the relay starts (`--no-open` does not), shows whether the tablet is connected and which page it reads, and lists what you sent with **Again**. Its token is 2 letters and 8 digits, easy to type (delete `relay.token` to get a new one), and `--no-token` runs it without one on a trusted network.
- The web relay runs on a server (a NAS, a Pi, a VPS) as a Docker image with Chromium (`app/web-relay/docker`): `--block-private` refuses pages of the local network, `--tls-cert`/`--tls-key` serve HTTPS, `--no-sandbox` runs Chromium in a container.
- Web relay: `--browser extension` renders pages in your own Chrome through a small Chrome extension (`app/web-relay/extension`), so sites that refuse headless Chrome open with your sessions; its popup turns it off and sends the current tab to the reMarkable.

#### Changed
- Zinc Web has thinner bars with icon buttons (finger-sized, black on white, inverted when active) and a First button that goes back to page 1; a pen button in its bar opens the writing tools instead of a Tools button covering the page.

### Raspberry Pi and the shell

#### New
- The Pi image builder is redesigned: a calm window with a short guided flow (device, network and account, apps), basics first and the rest behind *Advanced*, and a live build view with every step, its progress and time left, a result card with the next steps, and the failed step with *Retry*. It also offers the Zinc shell (`"shell": true` in a profile boots to the shell), A/B system updates, the Zinc agent and the app to start at boot.
- The Pi screen sleeps when nobody uses it: after a delay it fades to black and turns off, and the next touch wakes it. *Settings > Display* sets the delay (5 minutes by default, or never) and the transition. An app that must stay visible keeps it on with `navigator.wakeLock.request('screen')`, and kiosk apps always do.
- `zinc device <device> screen --live` also sends the gamepads of your computer to the device; a program sees them as its own, and an app under the player shell now gets the gamepads, those plugged into the device too.
- The pinball demo follows its window or screen; on a vertical screen, like a Pi player turned on its side, the table takes the whole screen under a one-line score.

#### Fixed
- `zinc device <device> screen --live`: a key or gamepad button you let go no longer stays pressed for an app under the player shell or on a display driver; games stopped responding because of it. It no longer freezes on its first image.
- Animations under the Pi shell are smooth: an app now draws one frame per screen refresh, instead of bursts where one frame in three was never shown.
- `zinc device deploy --target rpi` of a program with `"display": "gl"` takes the screen from the player: it used to run with no picture ("is another program the DRM master?").

### Games

#### New
- Build a village with `zinc run examples/hamlet`: roads laid by dragging with a live preview (`X` flips the corner, `R` auto-routes), houses that grow through three levels, production chains from wood and stone to bread, leather, tools, honey, candles and mead, a market, a tavern, and a campaign of goals that unlock buildings, with a peddler and adventures (`C`). Easy, Normal and Hard difficulties, and fire, collapse and theft risks with a fire post, a repair works and a watch post.
- Hamlet has seven landscapes (Vallée, Plaine, Rivière, Lac, Forêt, Montagne, Côte, Classique) with biomes, rivers, lakes and the sea, maps up to 128 x 128 (256 x 256 in the sandbox), and seasons that change the land gradually: blossom, russet leaves, snow, frozen water, falling leaves, rain, and light that follows the hour. Land has relief: hills, plateaus, rivers in valleys and, in the Montagnes landscape, mountain ranges that hold the ore; houses need level ground, roads climb one level a tile at a higher cost, walkers slow on slopes, and nothing crosses a cliff.
- Hamlet villagers have moods, sleep at night, stroll to the market and show their thoughts; deer, rabbits and boar live in herds, wolves can roam forest maps, and birds, ducks and fish share the scene. Villagers and carts keep to the roads: a workshop whose road does not lead to the village entrance stays idle and says so, and a store can be set to accept, refuse or only collect a good.
- Hamlet has a GPU tile view (`ZINC_HAMLET_VIEW=cite`): isometric tiles with slopes, cliffs and snow by height, smooth pointer-anchored zoom, inertia panning and a placement ghost, in the Pixel Plays look with walk, work and graze animations at 1x and 2x. `ZINC_HAMLET_ATLAS=computed|files` (or the settings panel) chooses whether sprites are baked at start or loaded from exported sheets.
- Hamlet buildings can cover several tiles (`"size": [w, h]` in `economy.json`): the storehouse, market, mill and tavern are 2x2, the sawmill and chapel 2x1, the farm and theatre 3x3, and a house grows into a 2x2 Manoir when the ground around it is free. Markets keep a stock, a chapel and a festival ground join the services, and a house climbs to a fourth level when all four services, three foods and a pleasant street reach it.
- Hamlet has six missions, from a first village to a mountain with mines, the peddler, a city of 400 people and a hard survival with fire and crime: each has a briefing, a map, goals that unlock buildings and sometimes a time limit, a win or lose ending and a next mission. Pick one in the new-village form (`N`); the goals window (`C`) follows it. A sandbox form sets seed, size up to 256 x 256, landscape, lakes, forest, rock and relief, river, infinite resources, risks and a start, with a small preview of the map.
- Hamlet new villages and missions are generated in groups instead of by a dice per tile: woods and flower meadows with clearings, stone, clay, iron and berries in patches, and deer, rabbits and boar in herds that follow a leader. Villages saved before keep their map, and the Classique landscape keeps the old spread.
- Hamlet explains itself: the top bar shows population, jobs filled against places, the goods that matter and the food; click any building to see what it does, what it needs and why it stands idle; advisors (`F`) cover Work, Housing, Food and stores, Services, Safety and People with what to build; hovering a service building lights the road tiles its next walker will cover; map overlays follow the slopes and show where a well reaches; a four-step guided start can be dismissed with Pass.
- Hamlet has a technical window (`F3`) with frame times, the world and the tile under the pointer; windows drag by their title bar and close with their button or `Esc`; message clicks point an arrow at the place and a double click opens its window; ambience and effects have separate volumes with synthesised sounds.
- Play the pirate game Just go straight with `zinc run examples/just-go-straight`, with native rendering and sound, without a browser.
- Pixel Plays has a ninth game, Droit devant (`9`): the pirate game redrawn as lit pixel dioramas with four endings. It also has Arrêt au stand (`0`), a racing pit stop; Odyssée (`-`), a floating spaceship you can switch between an explorer, a starship and a round freighter with `S`; and Objectif Lune (`=`), a moon rocket you launch with Space when the sync needle is in the green zone, by day or by night (`S`).
- `examples/pixel-plays` brings the Balote diorama to Zinc, with mouse, keyboard and touch throws, a bot opponent and pause; its `harbor.js` entry previews a living quay with a drifting boat.
- `examples/clear` recreates classic Clear with heat-map lists, typing, swipe actions, drag reordering, palettes, undo and local saves.
- `examples/murdoku` generates detective puzzles with 400 clue formulations and interlocking furnished rooms; every scene has one solution and a deduction path without guessing. Alphabetic witness badges, placement checks, X elimination and visual hints use a compact interface, with touch letters and Plan / Witnesses / Help tabs on small or portrait screens. Investigations print on paper: `examples/murdoku/authoring/print_ticket.py --host <printer>` makes a till receipt on an 80 mm ESC/POS printer, and `print_sheet.py enquete.pdf` a two-page A4 PDF at 300 dpi with the solution on the back (`--mono` for a black and white printer).
- `examples/pro-threads` runs animated light-thread lettering through native WebGL 2, with nine palettes, seven effects, editable letters and an alphabet view.

#### Changed
- Hamlet: every resource has its harvest time, yield and percentage in `economy.json`, the production-chain tree window is gone (recipes and costs are in the build menu tooltips), and saves from before this version start a new village.
- Murdoku has new furniture and composed character artwork, clear continuous walls and ivory-framed windows with reflections and sills, two-column witness cards and letter badges, and mobile tools that stay accessible while scrolling. Its deductions use pairs and triples of reserved rows or columns, and hints account for current placements and crossed-out cells and flag contradictions before revealing another position.

#### Faster
- Hamlet opens large maps much faster with much less memory, and panning is up to 40 % faster on the interpreter; maps of 512 tiles generate in 3 s instead of 12 s; a village of 500 people and 300 animals steps in about 1.5 ms instead of 58 ms; and carts and settlers on big maps read a cached distance map, so a 256 x 256 village with thousands of walkers no longer stalls. On maps of 192 x 192 and more, animals far from every building and from the camera rest as a count per region and reappear when you scroll or build near them.

#### Fixed
- Hamlet's late-winter snow lies in soft patches instead of dithered white noise; the tile view never shows a black map while the camera moves, and zooming out no longer leaves the village as a small clipped rectangle in the dark.
- In a Hamlet city whose labour pool is under 100 %, people outside the pool no longer count as jobless, and a scarce pool staffs every workshop once before filling any twice.
- Hamlet no longer puts trees, rocks, deposits, flowers, animals or people on the dark border of the map; saves from before drop what stood there.

### Apps and examples

#### New
- Photo sorter demo (`examples/photo-sorter`): pick one or more folders, then file each picture into album folders (in place or into another folder, moved or copied) by dragging, throwing, a key or the suggestion of a model that learns from the camera, the date and the place; a trash that empties into the system's or puts everything back; undo takes each change back on disk; thumbnails and EXIF from `zinc:imageio`, light or dark, in French or English.
- `zinc:trieur`, the Trieur card sorter on zinc:ui (`createDeck`, `<Deck>`): file a card by dragging or throwing it onto a zone, by its key or by the suggestion of a model that learns from your choices, several zones at once (hold Shift or the card), undo; six zone layouts, light and dark palettes, English and French labels (`setLanguage('fr' | 'en')` changes them at once). The Trieur demo (`examples/trieur`) adds links, an inbox to triage and flashcards with spaced repetition, with an FR / EN switch in its sidebar.
- `app/lumen`: display control in the menu bar in the spirit of BetterDisplay, on a translucent menu that follows the system's light or dark look: resolution slider, DDC, virtual displays, HiDPI, picture in picture and arrangement.
- The Discord client has themes that choose a layout, not only colours: `"layout": "slack"` gives Slack's screen and `"layout": "teams"` Teams'; switching theme in Settings changes the layout at once. There is a faithful Slack theme (the old dark one is *Slack dark*), and themes can colour the channel list, member list, cards, switches, dialogs and call view apart.
- The Discord client speaks English and French (system language, or the *Language* row of Settings > Appearance), and every icon-only button has a tooltip, also when you reach it with Tab.
- The Discord client: the code button opens a real editor (the shared `zinc:editor`) above the message box, with a language choice, highlighting, copy and paste, and sends your message and the code as a fenced block; long code blocks you read are folded by default with a "Show code" row. Clicking a picture opens it over the pictures of the channel. It has a safe mode switch in the user bar, and the call's quality details (score, loss, round trip, jitter, bit rates, codecs) open from the signal bars beside "Voice Connected".
- Discord calls cancel the echo of your speakers before your microphone is sent (`setEchoCancellation` of `zinc:discord-voice`, the SpeexDSP canceller of `zinc:microphone`): on by default with speakers and off with headphones, with a switch in Settings > Voice & audio.
- The Discord client fits windows narrower than 640 px: servers and channels, the conversation, the call and the settings show one at a time with a Back button, and the screen-share dialog and the image viewer toolbar fit too.
- The video mapper has a real editor, itself a Zinc app that opens in any browser or natively: every anchor moves by 1 pixel with the arrows and by 10 with Shift, deformation grids, masks, media sent from the browser and played live, columns of media to switch with the remote, calibration with SVG templates and a snapshot for Premiere or Cavalry, a three.js view of the room and a GLB. See `examples/video/mapper/README.md`.
- The video mapper saves and loads named scenes, exports and imports them as files and starts a new empty one; shows calibration cards (grid, focus, colours, white) on the whole output or on layers; has a sound mixer with a master volume, a mute and each layer's volume; selects a zone with a click, and its options remove the selection frame and the focus ring.
- The video mapper links corners of two layers so they move together, softens one edge of a layer with a cut and a gradient you set (`/layer/<n>/inset` in `zinc:mapping`), and rebuilds its 3D view from the corners, the lens and those links: faces of one box now meet.
- The video mapper works like Resolume and Millumin: a library of media and sources with thumbnails, a grid of clips always on screen, a clip dragged onto a cell, fired alone or with its column, and a layer emptied with one click (`/cell`, `/stop`, and `none` as a layer source of `zinc:mapping`).
- The video mapper announces itself on the network and shows a pairing code: the native editor lists the mappers it finds and pairs once, a browser opened at the address enters the same code.
- The video mapper fades each side of a layer inward, outward past its edge, or across it: choose **Inside**, **Outside** or **Both** under *Edges*, or send `/layer/<n>/edgedir`.
- In the video mapper, drag a zone or press the arrows to move it whole; **Undo**, **Redo** (Cmd or Ctrl+Z) and the *History* view go back through the actions, shared by every editor of that mapper.
- In the video mapper, a second click on a clip or a column stops it and an empty column stops everything; clips have an **x**, the panels resize, **Send a folder** and a closable transfer window follow what you send, and a bottom bar shows the device and what runs on it.
- In the video mapper, a clip says what its fit does to the picture; **width** and **height** make that side span the zone, and you drag the visible part and zoom to choose what shows.
- In the video mapper, a soft edge has an **offset** that slides where its gradient starts, from -10 % to +10 %, and a clip has its own **x**, **y**, **scale**, **rotation** and **opacity**.
- In the video mapper, a mask point can become a curve with two handles (**Curve**, **Corner**), and **feather** sets how soft its edge is, sharp by default.
- The video mapper editor speaks French: choose the language in *Options*, its texts live in `assets/i18n/<lang>.json`, and a new language is a new file.
- The video mapper starts on several machines: `--join` takes another mapper's clock, `--viewport` chooses the part of the canvas, and the **sync** card shows how far apart the screens are.
- The video mapper leads other mappers from a new *Devices* view: pair a machine once with a code shown on its output, place it in the canvas, and it takes the setup, the show and every command, with columns launched at the same moment over a shared clock; `/fleet/...` does the same over OSC, and this replaces `--join`.
- Video mapper, several machines: the leader's media reach the others by themselves, in the background and without troubling the picture (a cut copy goes on where it stopped), and each film stays on the leader's, within a frame between two instances on one Mac; *Devices* shows the progress and how far off each machine is.
- Video mapper over OSC: it also understands the addresses of Millumin and Resolume and bundles, moves, pauses and changes the speed of films (`/layer/n/time`, `speed`, `pause`, `/transport`), and tells those who subscribe what happens, in the words of each (`/feedback/subscribe`). `chataigne/mapper-control.noisette` is a ready project to drive it from Chataigne.

#### Changed
- Discord: `zinc:discord-voice` clamps every camera and Go Live quality announce to a ceiling (the free tier's 720p 30 by default, Go Live's 1080p 60 only with Nitro) and logs a clamp as "over the ceiling".
- Discord uses `zinc:ui/image-cache` with background cleanup and off-thread decoding at display size; portable WebP thumbnails resize during decoding.
- The video mapper inspector speaks of one thing at a time, in two tabs: **Clip** (fill, framing, playback) and **Layer** (name, sound, colour, position, crop, edges). The grid shows where a clip can land, says *Drop here* or *Replace*, and icons mark its buttons and views.
- Video mapper: copying media to a follower waits while its film is behind, at least 0.5 MB/s, so the show comes first.

#### Faster
- Musique (arbre) decodes covers and radio logos on a background thread, only after a quiet second or two while you touch it, so a new cover no longer freezes the screen.

#### Fixed
- Discord video (camera and Go Live) from Zinc now opens in the web client; `DISCORD_VIDEO_SPS=orig` goes back to the encoder's own parameter set.
- The video mapper runs on Android, down to 4.4 and a Mali-400: `zinc:mapping` draws in the app's window, a layer pays only for the colour, gamma, mask and grid steps it uses, and `ZINC_BUFFER=854x480` renders at a panel's real size when the system announces a larger one. A player finds no video where the system has no `libmediandk` instead of the app failing to start. The mapper demo takes `--port` for the OSC port, and its editor tells a stale token from an app that does not answer.
- `zinc:mapping` plays a video or an image file straight on a layer on Android: `/layer/<n>/media clip.mp4` with its sound and hardware decoding (`/layer/<n>/volume`, `/layer/<n>/loop`), the new file taking over at its first picture. `/layer/<n>/fit` (`stretch`, `contain`, `cover`) and `/layer/<n>/inputRect` fit any source into a smaller zone.
- In the video mapper, a layer always shows the clip its row plays: moving a playing clip takes its picture with it, and a layer left showing a stray media is emptied at start.
- In the video mapper room, two faces linked by several corners meet at those corners in 3D and in the exported scene, even when the corners and the lens disagree a little.

### Mobile and Zinc Go

#### New
- Hold three fingers for one second to return directly to Zinc Go from live or installed apps. Shake the phone to open Zinc Go's Reload / Go home menu, including installed apps; on iPhone, "Ajouter une note" in the shake menu saves feedback locally per app with a timestamp, device and system details, Zinc version, resolution and safe-area information.
- Experimental Intel Mac runtime targeting macOS 10.12: run packed `zinc:gfx` programs with a software-rendered Cocoa window, game keys and mouse input. Build separately from `targets/macos-legacy`; real Sierra compatibility remains unverified.

#### Changed
- `tools/zinc-go-iphone` shows export, configuration, compilation, installation and launch progress in the terminal while keeping the build log.

#### Fixed
- iPhone: mobile exports pass plugin compiler options with arguments (fixing the missing-header error when building Zinc Go), rebuilds keep their native compilation cache, and the helper selects a connected device. Zinc Go uses the iPhone's Wi-Fi address for pairing and starts with an empty, clearable link field; iOS text fields replace and delete selected text correctly and keep the keyboard's cursor in sync.
- The Apple camera backend scales rotated capture buffers correctly and enables continuous autofocus; Zinc Go scans with a portrait camera format. Murdoku and the scanner's controls respect iPhone safe areas in portrait and landscape; mobile builds enable the accelerometer backend, and motion detection pauses while the app is in the background.

## [0.10.18] - 2026-11-01

### Rendering and performance
#### New
- `startImageDecode`, `pollImageDecode` and `cancelImageDecode` in `zinc:gfx` decode a PNG, JPEG or WebP on a background thread, so a cover or a photo no longer holds a frame for 40 to 100 ms on a Raspberry Pi.

#### Faster
- The smooth stretch of a small picture over a large area (the lava lamp clock of Musique) draws noticeably faster on a Raspberry Pi (a full-screen lamp took 14 ms of drawing, now under 10).
- A program that draws nothing now wakes 60 times a second instead of 125, which saves battery and CPU on idle screens and keeps the frames in step with the display.

### Apps and examples
#### Faster
- Musique (arbre) decodes covers and radio logos on a background thread: a new cover no longer freezes the screen for a moment.
- Musique (arbre) no longer stalls while you touch it: covers and pages are prepared in the background only after a quiet second or two, one at a time, and the slide you swipe to is remembered a moment later instead of in the frame of the gesture.

## [0.10.16] - 2026-11-01

### Raspberry Pi and the shell
#### New
- The player fits a narrow screen (the Pi's panel turned to portrait): home tiles wrap into a grid, the cards stack their button under the text, Settings sections become a row of tabs, and a very small screen keeps the tiles only.
#### Faster
- An idle Pi shell costs less: the home animation rests after 20 seconds without a touch, an unchanged screen no longer asks the display for a refresh every frame, and a turned screen stores each changed pixel directly.
#### Fixed
- `zinc device <pi> screen --live` shows a screen that does not move: while someone watches, the whole screen is sent again every 2 seconds, so a viewer that connects to a still screen sees it.

### Performance
#### Faster
- Rounded pictures (`drawImage` with a radius) cost little more than square ones: only the corners are tested, so a cover grid or a player cover is several times cheaper on a Raspberry Pi 3.

### Apps and examples
#### Faster
- The Musique (arbre) player slides and turns pages with about half the work on a Raspberry Pi 3: the blurred cover background and the covers are prepared once at their shown size instead of being scaled at every frame, and the pages are no longer prepared in the background twelve at a time.
#### Fixed
- The Musique (arbre) player fits the 7-inch Raspberry Pi screen under the shell: the volume bar is no longer cut at the bottom edge and the page no longer scrolls, the cover is a little larger, the times and the album line are easier to read, and the previous and next buttons light up when pressed.

## [0.10.15] - 2026-11-01

### Raspberry Pi and the shell

#### New

- A Raspberry Pi with a weak power supply tells you: an amber bolt appears in the top bar while the Pi reports under-voltage (tap it for what to do), and *Settings, System* has a *Power* line. A small background service (`zinc-power-guard`) also lowers the CPU clock while the supply is too weak and restores it a minute after the last alarm; turn it off with `ZINC_POWER_GUARD=0` in `/etc/zinc/session.conf`. `zinc-admin status` adds `power=`.
- The Pi keeps its logs across a power cut: the journal is stored on the card (40 MB at most) and written every 5 seconds, so `journalctl -b -1` shows what happened before the Pi lost power. Updates install this on existing Pis.
- The shell says an app is starting: until its first frame the area under the bar shows its icon, its name and a spinner, with a calmer line after 8 seconds on a slow start. Taps show at once: a pressed app tile shrinks and brightens, switches and colour swatches light up too.
- Screen rotation for the Pi: *Settings, Display* turns the whole screen (top bar, app and touch) by 0, 90, 180 or 270 degrees, the image builder has a *Rotation* choice, and `zinc-admin rotation <degrees>` or `ZINC_ROTATE` in `/etc/zinc/session.conf` does the same. Apps run without the shell turn too.

#### Fixed

- `screen --live` of a still screen (the shell at rest) shows the screen at once and refreshes it every 2 seconds, instead of staying black until something moves; `ZINC_MIRROR_LOG=1` on the device says what the live stream sends.
- A multi-touch screen keeps working after turning the Raspberry Pi's screen by 90 or 270 degrees: every touch used to land on the same spot.
- `zinc device <pi> screen` and `screen --live` show the whole screen under the shell, the top bar and the app below it, and the live view follows the app in real time. An app under the shell no longer answers the screen request itself.

### Performance

#### Faster

- `zinc pack` (and `zinc device deploy`) turns the large PNG images of `assets/` into a fast-load format at the same path, so a Raspberry Pi 3 no longer shows a black screen for 20 seconds decoding sprite sheets. Your code and your files do not change; turn it off with `"assets": { "optimize": false }` or `zinc pack --no-optimize`.
- On QuickJS, `readBytes()` of `zinc:fs` and `zinc:assets` hands over a file's bytes in one step instead of one call per byte, and `imageFromBytes()` converts the pixels in a single pass: loading a 2048 x 2048 sprite sheet is several times faster on a Raspberry Pi.
- `load()` of `zinc:audio` returns at once for a long MP3, OGG or FLAC file: it is decoded in the background and plays as soon as the first seconds are ready, instead of freezing the start of the program (15 seconds for a 3-minute song on a Raspberry Pi 3).

### Apps and examples

#### Faster


#### Fixed


## [0.10.13] - 2026-10-31

### UI
#### Fixed
- Selecting text with `select-text` works across several lines and several `Text` blocks, like a browser: drag from one paragraph into the next (in a `ScrollView` too, the list scrolls near its edge), the whole span is highlighted and Cmd/Ctrl+C copies it with its line breaks.

### Apps and examples
#### New
- The Discord client has a faithful Slack theme (white window, aubergine sidebar with a blue open channel, outlined message box, light code cards; the old dark one is *Slack dark*), and themes can now colour the channel list, member list and cards apart (`sidebarText`, `sidebarMuted`, `sidebarStrong`, `sidebarHover`, `sidebarSelected`, `sidebarSelectedText`, `surface`, `composerBorder`). The Teams theme gets its outlined white message box.
- The Discord code button opens a real editor (the shared `zinc:editor`) above the message box, with a language choice, highlighting, copy and paste; sending joins your message and the code as a fenced block with its language. Long code blocks you read are folded by default with a "Show code" row that unfolds them smoothly, and keep their copy button.
- The Discord example has a safe mode switch in the user bar, opens the call's quality details (score, loss, round trip, jitter, bit rates, codecs) from the signal bars beside "Voice Connected", and its themes now colour the switches, dialogs and call view too (new `success`, `warning`, `stage` colours).
- **New** `ImageViewer` in `zinc:ui/kit` (`openImageViewer`): a picture opens over the app the way PhotoSwipe does it, growing from the thumbnail and going back on close (Escape, a click outside, a drag down), with wheel and pinch zoom around the pointer, drag to pan, double click to zoom, Left and Right (keys, buttons, swipe) through the pictures, a caption and copy and save buttons. In the Discord client, click a picture to open it over the pictures of the channel.
#### Changed
- The screen-share dialog keeps its place while you scroll the screens and windows, and has a search field to find one by name.
- The screen-share dialog (Discord's Go Live, the call example) looks like Discord's: tabs Applications and Entire screen, a two-column grid of large previews with the application's icon and name under each, and a preset line (SD 720p 30 fps or HD 1080p 60 fps) with an SD/HD switch and a settings button for the resolution, frame rate and pointer. Apps can add a Devices tab for cameras.
#### Fixed
- **Fixed** pictures sent to a Discord conversation (and the ones you upload) no longer stay an empty grey block: the app could not read the WebP that Discord's image proxy sends (`imageFromBytes` of `zinc:gfx` now decodes WebP everywhere), a picture shows a box of its own shape while it loads, and an error message with an icon when it cannot load.
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
#### Fixed
- Go Live from the Discord example sends its video the way Discord's servers read it (their native header-extension ids, the stream id on every packet, a sequence number for congestion control), asks to resume the stream as soon as it is created and each time Discord pauses it, and logs the stream's pause state with `DISCORD_LOG=1`; `DISCORD_VIDEO_EXT`, `DISCORD_VIDEO_PT`, `DISCORD_VIDEO_CODECS`, `DISCORD_VIDEO_ACTIVE` and `DISCORD_VIDEO_TYPE` switch the variants for experiments.
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

### Legacy iPhone

#### New

- `tools/build-ios-legacy --aot` builds an experimental app for a jailbroken iPhone 4 on iOS 7.1.2, with GLES2 graphics, touch and the native keyboard. `tools/ios-legacy-device` provides USB deployment, app input, screenshots and profiling. `rn-showcase` runs, but animations and scrolling still need optimization.

#### Changed

- The experimental legacy iPhone host renders at logical pixel density to reduce GPU load, with less fine detail than Retina.

#### Faster

- GLES2 scrolling reuses the previous image and redraws the exposed areas. Opaque screens use a simpler copy shader, and elements fully inside rounded clips avoid redundant shader calculations. Rounded clip calculations on SGX535 are confined to the borders of large cards. Hidden opaque card interiors skip drawing the surfaces behind them.

#### Fixed

- Single-line mobile inputs dismiss the keyboard on Return by default; React Native inputs support `submitBehavior` and `blurOnSubmit`. The legacy iPhone keyboard has a Done button and selects the keyboard for the focused field. Keyboard avoidance uses the native transition duration.

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
- Figma component contracts connect real native Slider, Switch, virtualized lists and sticky chat containers to TypeScript. Zinc Live shows connectors and emitted events, extracts photo backgrounds separately from text, and can export the selected app’s controller. `app/maison` demonstrates a responsive Home Assistant remote with simulated devices and a native WebSocket client.
- Zinc Live’s **Exporter le projet…** saves a standalone project with named TSX components, TypeScript action connectors and bundled assets. Exports capture the displayed revision and create a fresh folder to preserve earlier code edits.
- Zinc Live connects Figma to a persistent native Mac companion with viewport, connection, prototype and motion controls; `tools/figma-live --make-app` creates a local Finder launcher. Text uses real font files, icons use SVG, and exports retain Figma component, palette and typography definitions. `--lan` uses the existing Zinc Go development route.
- `zinc:ui.registerFont(name, file)` lets native Text use a runtime TrueType file for both layout and rendering, via `font-[name]`.
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
- Zinc Live redraws the native preview when Figma changes a component; a successful code refresh can no longer leave the previous screen displayed.
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

[Unreleased]: https://github.com/Frulko/zinc/compare/v0.11.5...HEAD
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
[0.10.13]: https://github.com/Frulko/zinc/compare/v0.10.6...v0.10.13
[0.10.15]: https://github.com/Frulko/zinc/compare/v0.10.13...v0.10.15
[0.10.16]: https://github.com/Frulko/zinc/compare/v0.10.15...v0.10.16
[0.10.18]: https://github.com/Frulko/zinc/compare/v0.10.16...v0.10.18
[0.11.5]: https://github.com/Frulko/zinc/compare/v0.10.18...v0.11.5
