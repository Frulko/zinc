# Changelog

All notable changes to Zinc are written here, for the people who use it. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
versions follow [Semantic Versioning](https://semver.org/) (while the major version is 0, a minor version may break what the previous one ran). `make release`
moves the *Unreleased* section under the new version and publishes it as the release notes.

How to add a line: see "Changelog" in `AGENTS.md`.

## [Unreleased]

### Changed (breaking)
- JSX is real JSX: write `className`, never `class`, and capitalised components (`<View>`, `<Text>`, `<Button>`, `<ScrollView>`, `<Image>`, `<Input>`).
  The engine refuses the old spelling with errors Z0006 and Z0007. Migrate a project with `zinc migrate --apply`.

### Added
- zinc:spotify: a program without its own login file uses the computer's shared one, `~/.zinc/spotify.json`, which `plugins/spotify/login.py CLIENT_ID` now writes by default.
- Android: `navigator.getBattery()` and `device('battery')` of zinc:sys give the battery's level and whether it charges.
- The music example shows a Mac's notifications on its tablet: it pairs once with the Mac over zinc:link (a 6-digit code on the tablet),
  plays each one as iOS's StandBy does on the clock or a sleeping screen (grey cards elsewhere), and keeps the last 50 on a slide of its own.
- Consoles: breakout plays on the PSP, PS Vita, PS2 and 3DS with Kenney's sprites, the d-pad or the stick moving the paddle; a console
  program that ends with nothing drawn or with an error keeps its last lines on screen until START instead of a black screen.
- `zinc export --target web` makes a Zinc app a normal web page: a static folder (hashed JavaScript and assets, an offline cache, an installable manifest, `.br` and `.gz` copies, `_headers`) that any host
  serves, with no server, no WebAssembly for ordinary apps and no special headers. The app's TypeScript runs on the browser's own JavaScript engine. `--render canvas` (the default) draws on a canvas;
  `--render dom` makes real HTML elements, so text is selectable, searchable and read by screen readers. `zinc.json` `targets.web` sets the title, icon, colours, the render mode and the browsers to support.
  See `docs/targets/web.md`.
- `zinc dev --target web` serves the app with hot reload: saving a component swaps it in place and keeps the state of everything you did not touch (a module that exports state reloads the page), and a
  compile error shows over the page until the next good save.
- The web export tells you what a browser cannot run: `--check` and the export itself warn (W0601, W0602, W0603; `zinc explain W0601`) about plugins and features missing in the browsers of
  `targets.web.browsers`, `--werror` fails on them, and a call that cannot be served throws `ZnUnsupported` instead of crashing. `import { supports, browserInfo } from 'zinc:browser'` asks the page at run time.
- Plugins declare their browser version with a `web` entry in `plugin.json`: `zinc:camera`, `zinc:microphone`, `zinc:webrtc`, `zinc:audio`, `zinc:socket` (WebSocket), `zinc:svg`, `zinc:system` and
  `zinc:sqlite` (SQLite as WebAssembly) work in the browser with the API they have on a desktop; the webrtc call demo runs unchanged.
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
- A program that starts drawing after it started (`render()` or `onFrame` from a timer or a menu click, as a menu bar app opening its
  window) now draws: before, nothing ran but its timers.
- A program that imports `zinc:ui` without drawing yet (a menu bar app) no longer opens an empty window at start, and quits on SIGTERM.
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

[Unreleased]: https://github.com/Frulko/zinc/compare/v0.1.1...HEAD
