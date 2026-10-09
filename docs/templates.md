# Project templates

`zinc new` creates a project from a template:

```sh
zinc new --list               # the templates, their descriptions and targets
zinc new game my-game         # templates/game/ into my-game/
zinc new my-tool              # the default template (game)
zinc init my-app --template cli   # the older spelling, same command
```

The directory must be new or empty; an unknown template or a non-empty directory is refused with the list of templates.

## Format

A template is a directory `templates/<name>/` (beside `lib/`; packages ship it in `share/zinc/templates`). Every file in it is copied into the new
project, except `template.json`, which describes it:

```json
{
  "name": "game",
  "description": "A window, the arrow keys and a square: the smallest game loop (zinc:gfx).",
  "tags": ["game", "gfx"],
  "targets": ["macos", "linux", "rpi"],
  "entry": "src/main.ts",
  "variables": { "name": "the project directory name", "id": "the name as an identifier" }
}
```

In text files and in file names (`deploy/{{id}}.service`) `{{name}}` becomes the project directory's name and `{{id}}` that name in lower case with every other character turned into `-`;
in `.json` files the values are escaped as JSON strings. A file containing a NUL byte (an image, a font) is copied as it is. `tsconfig.json` is
written by `zinc new` itself, since it names the engine files of the machine.

Each template carries tests (`tests/smoke.test.ts` at least), so `zinc test` (the tests of the project in the current directory) passes on a new
project; `tests/t1/templates_kickstart.sh` creates every template and checks them, runs their `scenarios/*.yaml` with `zinc sim`, and
compares the graphical ones with a recorded frame.

| Template | What it is | Targets |
|---|---|---|
| game | a window, the arrow keys and a square (zinc:gfx) | macos, linux, rpi |
| game-2d | a 2D game to grow from: title / play / game-over scenes, keyboard, gamepad and pointer input, SVG sprites, a saved best score (zinc:gfx, zinc:storage); sound waits for zinc:audio (ZN-390) | macos, linux, rpi |
| desktop-app | a desktop app shell on zinc:ui/nuxt: sidebar and router (Home, Notes, Settings), the application menu and a tray icon (zinc:system/menu, zinc:system/tray), dark mode and settings saved with zinc:storage | macos, linux |
| dashboard | a live dashboard on zinc:ui/nuxt: stat cards, a line and a bar chart drawn in a Canvas, alerts, pause; fed by a mock source behind a `Source` interface | macos, linux, rpi |
| 3d | a three.js scene (lights, floor, a spinning ring, orbiting satellites) with OrbitControls; motion as plain functions, tested | macos, linux, rpi |
| service | an HTTP JSON API (items, health) with tests without the network and over HTTP, and a hardened systemd unit `deploy/{{id}}.service` (zinc:net) | linux, rpi, macos |
| iot-board | an ESP32-S3 device: a QMI8658 motion sensor and a 128x64 SSD1306 OLED (a bubble level, shake to calibrate), its `board.json` and a `zinc sim` scenario; the sensor is emulated on the desktop | esp32, macos, sim, rpi1 |
| eink | a reMarkable Paper Pro notebook laid out for e-paper: a to-do list ticked with the pen and a sketch page in ink (zinc:ink), saved with zinc:storage | rmpp, macos, linux |
| cli | a command-line program (zinc:sys) | macos, linux, rpi |
| server | an HTTP server with a telemetry counter (zinc:net, zinc:telemetry) | macos, linux, rpi |
| iot | a GPIO button, an LED and an OSC message, simulated off the board (zinc:gpio, zinc:osc) | rpi, linux, macos |
| remarkable | a reMarkable Paper Pro ink canvas with undo (zinc:ui, zinc:ink) | rmpp |

## Templates from elsewhere

The template can also be a directory or a git repository holding a `template.json` at its root:

```sh
zinc new ../my-template my-app                       # a directory
zinc new https://github.com/user/zinc-starter.git app  # a git URL (https, ssh, git@, file://)
zinc new gh:user/zinc-starter@v1.2 app               # GitHub shorthand, at a tag, branch or commit
```

A git template is cloned without its submodules; its commit is recorded in the new project's `zinc.json`
(`"template": { "source": "...", "commit": "..." }`), a directory's path likewise. Creating a project never runs code of the template: git hooks
are pointed at nothing (and a clone brings none), filters configured in the template's repository are not cloned, and scripts the template
carries (a `setup.sh`, an npm `postinstall`) are plain files. `template.json` may only use the keys above; a template containing a link or a
special file (which could name a file outside it) is refused, and its `.git` directory is never copied.

## Templates from the index

The plugin index (see [plugins](plugins.md), "Plugin index") also carries templates: `templates/<name>.json` signed by its
top-level role (tier official) or `<publisher>/templates/<name>.json` signed by a role delegated to a publisher (tier
verified). `zinc new --list` adds them, with their tier, after the engine's own; `zinc new <name> <dir>` uses one when no
engine template has that name. A template given by URL is community. The trust policy decides which tiers may be used, and
under an official-only policy a verified or community template is neither listed nor created.

A template can name the plugins it needs in `template.json`, `"plugins": ["greet@^1.0", "https://example.com/x.tar.gz"]`;
`zinc new` adds each one as `zinc add` would, so the new project starts with them pinned in its `zinc.lock`.

