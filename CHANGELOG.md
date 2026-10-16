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
- Buttons, links, rows, tabs, chips and every pressable dim while a mouse, a finger or Space / Enter presses them (in every kit, React Native's
  Pressable included), and come back after the release; dragging off cancels. `active:opacity-*`, `activeOpacity` or `pressFeedback={0}` set
  your own; `ui.setPressFeedback(false)` turns it off.
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
  with no network. The RTC names are globals. Audio and video tracks are not there yet.
- Plugin manifests take `vendorFlags`: flags for the vendored sources only (a C++ library that needs `-frtti` or `-fexceptions`).

### Fixed
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

[Unreleased]: https://github.com/Frulko/zinc/compare/v0.1.1...HEAD
