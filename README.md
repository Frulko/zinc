<div align="center">

<h1>Zinc</h1>

<p><strong>Native apps in TypeScript, from a Mac to a Raspberry Pi to an ESP32.</strong></p>

<p>
<a href="https://github.com/Frulko/zinc/releases/latest"><img src="https://img.shields.io/github/v/release/Frulko/zinc?include_prereleases&label=release&color=0a7cc1" alt="Latest release"></a>
<img src="https://img.shields.io/badge/status-preview-orange" alt="Status: preview">
</p>

<p>
<a href="docs/guide/01-getting-started.md">Getting started</a> ·
<a href="docs/guide/README.md">Guide</a> ·
<a href="#showcase">Showcase</a> ·
<a href="docs/plugins/">Plugins</a> ·
<a href="CHANGELOG.md">Changelog</a>
</p>

<img src="docs/img/hero.png" alt="A Zinc app: an intro, screens, transitions and a gallery" width="820">

</div>

<br>

Zinc lets you build desktop apps, games, kiosks and device interfaces the way you would with Electron or React Native,
without shipping a browser. You write a strict, typed subset of TypeScript and JSX. Zinc interprets it while you work and
compiles it to a native executable when you ship. The same program runs on a laptop, a Raspberry Pi, an e-ink tablet or a
microcontroller.

> [!NOTE]
> Zinc is an early preview (`0.x`). The language subset, the CLI and the APIs still change between releases, and macOS is the
> reference platform. Bug reports and feedback are welcome in the [issues](../../issues).

## A first look

```tsx
import { render, createSignal } from 'zinc:ui/solid';

const [count, setCount] = createSignal(0);

function App(): i32 {
  return (
    <View className="flex-1 items-center justify-center gap-4">
      <Text className="text-5xl font-bold">{count()}</Text>
      <Button className="rounded-lg bg-sky-600 px-5 py-2" onClick={() => setCount(count() + 1)}>
        <Text className="text-white">Add one</Text>
      </Button>
    </View>
  );
}

render(App, 0xffffff, null);
```

```sh
zinc dev                          # a window opens; every save updates it and keeps its state
zinc build                        # one native executable, no JavaScript engine inside
zinc build --target aarch64-linux # the same app for a Raspberry Pi, cross-compiled from your Mac
```

## Install

With [Homebrew](https://brew.sh) on macOS or Linux:

```sh
brew install frulko/zinc/zinc
```

Or with the install script, which puts `zinc` on your `PATH` (add `-s -- --atelier` for the Zinc Atelier app on a Mac):

```sh
curl -fsSL https://github.com/Frulko/zinc/releases/latest/download/install.sh | sh
```

Then create a project and run it:

```sh
zinc new desktop-app my-app && cd my-app
zinc dev
```

`zinc doctor` tells you what your machine can build and run, and `zinc update` installs each new release. To build from the
sources, see [Building Zinc](#building-from-source).

## Features

- **Native output.** Your program is compiled to C++ and then to one executable. There is no browser and no JavaScript engine
  inside, so it starts fast and runs on modest hardware.
- **Fast Refresh.** `zinc dev` swaps every save into the running app. The page you were on, what you typed and the game in
  progress all stay, and DevTools inspect the UI live.
- **UI you already know.** Solid or React models, Tailwind-style classes, and component kits modelled on shadcn/ui, Nuxt UI
  and React Native. A GPU renderer draws them, down to a Raspberry Pi's VideoCore IV.
- **The JavaScript ecosystem, too.** Plain JavaScript and npm packages such as three.js, PixiJS and Phaser run unchanged on
  QuickJS (built in), JavaScriptCore, V8 or Hermes.
- **Web APIs on real devices.** `fetch`, WebSocket, `crypto.subtle` and `localStorage`, plus the battery, sensors, camera,
  microphone and notifications of the machine the app runs on.
- **One tool.** `zinc` creates, runs, debugs, tests, packages, signs, publishes and flashes. Cross builds use a pinned
  toolchain, with no Docker and no SDK to install.
- **Devices from your desk.** `zinc agent` turns a Pi or a Mac into a device you deploy to, inspect and update over the network.
  `zinc run --simulate` tries an app on hardware you do not have.
- **78 plugins.** 3D and three.js, video, WebRTC, audio and MIDI, maps, physics, SQLite, and drivers for e-ink, LCD, OLED
  and LED-matrix screens. A program only carries the ones it imports.

## Runs on

| | |
|---|---|
| **Desktop** | macOS (Apple silicon and Intel), Linux, Windows |
| **Raspberry Pi** | every model from the Pi 1 and Zero to the Pi 5, on its desktop or straight on the screen, with a boot shell and app hub |
| **Tablets and phones** | reMarkable Paper Pro, iPhone and iPad (Zinc Go), Android, HP TouchPad |
| **Microcontrollers** | ESP32 boards with LCD, OLED or LED-matrix screens |
| **Handhelds and consoles** | PSP, PS Vita, Nintendo 3DS, PlayStation 2 |
| **Web** | WebAssembly, with WebGL |

macOS is built and tested on every release. Linux and Windows packages come out of the same release, and the devices above
are tested by hand on real hardware. See [docs/targets](docs/targets/) for what each one supports.

## Showcase

<table>
<tr>
<td width="33%"><img src="docs/img/zed-editor.png" alt="A code editor in the style of Zed"><br><b>Code editor</b><br><code>examples/zed-editor</code></td>
<td width="33%"><img src="docs/img/museum-table-full.jpg" alt="A museum's multi-touch table showing a collection"><br><b>Museum touch table</b><br><code>examples/museum-table</code></td>
<td width="33%"><img src="docs/img/pinball3d-play.png" alt="A 3D pinball table in play"><br><b>3D pinball</b><br><code>examples/pinball3d</code></td>
</tr>
<tr>
<td><img src="docs/img/navigation.png" alt="Turn-by-turn navigation through Paris"><br><b>Offline GPS navigation</b><br><code>examples/maps/navigation</code></td>
<td><img src="examples/js-three/screenshot.png" alt="A lighthouse at night made with three.js"><br><b>three.js, unmodified</b><br><code>examples/js-three</code></td>
<td><img src="docs/img/video-mapper.png" alt="Video layers warped onto surfaces"><br><b>Video mapping</b><br><code>examples/video/mapper</code></td>
</tr>
<tr>
<td><img src="docs/img/remarkable-notes.png" alt="A handwriting notebook on e-ink"><br><b>E-ink notebook</b><br><code>examples/remarkable/notes</code></td>
<td><img src="docs/img/esp32-2432s022-home.png" alt="A widgets tour on a 2.2 inch ESP32 screen"><br><b>ESP32 touch screen</b><br><code>examples/boards/esp32-2432s022</code></td>
<td><img src="docs/img/music-touchpad.png" alt="A Sonos remote on an HP TouchPad"><br><b>Sonos remote on a 2011 tablet</b><br><code>examples/music</code></td>
</tr>
</table>

Run any of them with `zinc run <path>`. The [examples](examples/) folder holds over a hundred more, from a Discord client to
React Native and Nuxt UI showcases.

## How it works

<p align="center"><img src="docs/img/architecture.svg" alt="Zinc in layers: the program, the standard library, the compiler, three engines over one runtime, the host and the HAL, with plugins on the side and the zinc CLI underneath" width="820"></p>

The compiler turns your program into a typed intermediate form and one bytecode. Three engines share a single runtime, so they
behave the same byte for byte:

- **The interpreter** runs while you work (`zinc run`, `zinc dev`).
- **The native compiler** writes C++ for the executable you ship (`zinc build`).
- **A JavaScript engine** runs plain JavaScript, with QuickJS built in and JavaScriptCore, V8 or Hermes on demand.

Below them, a thin hardware layer per platform is all that changes from one machine to the next. Plugins add native code and
modules without growing the engine. More detail is in [ARCHITECTURE.md](ARCHITECTURE.md) and the
[guide on JavaScript engines](docs/guide/12-js-engines.md).

## The `zinc` command

| To… | Run |
|---|---|
| start a project from a template (app, game, 3D, dashboard, e-ink, IoT, service…) | `zinc new game my-game` |
| run it with Fast Refresh and an inspector | `zinc dev` |
| debug in VS Code or Chrome DevTools | `zinc debug --dap` · `zinc debug --cdp` |
| understand an error | `zinc explain Z0104` |
| test on every engine, or on a simulated device | `zinc test` · `zinc run --simulate hp-touchpad` |
| build for this machine or another | `zinc build` · `zinc build --target armhf-linux` |
| deploy to a Pi or a Mac on the network | `zinc device deploy` |
| ship a Mac app, a single executable or a `.zapp` package | `zinc export` · `zinc pack` |
| publish a version with signed updates | `zinc publish` |
| flash a board | `zinc flash --target esp32` |

## Documentation

- [Developer guide](docs/guide/README.md): getting started, the language, UI apps, services, plugins, testing, distribution
- UI: [the basics](docs/ui.md), [the component kit](docs/ui-kit.md), [Nuxt UI](docs/nuxt-ui.md), [React Native](docs/react-native.md)
- [Plugins](docs/plugins/), [targets](docs/targets/) and [boards](docs/boards.md)
- [Changelog](CHANGELOG.md)

## Building from source

You need CMake 3.20 or later and a C++20 compiler. Every library is vendored, and Node.js is not required.

```sh
git clone https://github.com/Frulko/zinc && cd zinc
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
tools/build zinc
build/zinc doctor
```

## Contributing

Issues and pull requests are welcome. Before changing the engine, read [ARCHITECTURE.md](ARCHITECTURE.md) for how the code is
laid out and [TESTING.md](TESTING.md) for the tests to run. Work in progress lives on `develop`; `main` holds the last release.

### A note on AI

Zinc has been a project of several years, and of many failed attempts and discarded designs. It exists today thanks to
intensive help from AI. A large part of its code, tests and documentation was written by AI coding agents working through a
backlog of precise tasks, under rules a person sets and checks ([AGENTS.md](AGENTS.md), [RULES.md](RULES.md)). The direction,
the design choices and the testing on real hardware stay human. Every behaviour is meant to be proven by a test, and reports
of anything wrong are welcome.
