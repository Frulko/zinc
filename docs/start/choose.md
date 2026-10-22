# Choose your kind of program

Zinc runs many kinds of programs with one tool. Which kind you write decides what you import, which template to start from
and what to read next. This page helps you pick. You can change your mind later: every kind is the same language and the
same commands (`zinc new`, `zinc run`, `zinc dev`).

New to programming? Start with [the lesson track](../learn/README.md), then come back here. Already comfortable? Run
`zinc new <template> my-project` with a template from the table, then `zinc run`. [Getting started](../guide/01-getting-started.md)
walks through the first five minutes.

## The short answer

| If you want to make... | Pick |
| --- | --- |
| a game, or anything you draw yourself | drawing and games |
| a window with buttons, lists and text fields | an app with screens (Solid style) |
| a ready-made, good-looking app | ready components (Nuxt UI or shadcn style) |
| an app you already wrote with React Native | React Native code |
| a 3D scene | 3D |
| a program with no window: a server, a tool for the terminal | services and command-line programs |
| something that runs on a small board with a screen or sensors | boards and microcontrollers |
| a JavaScript library (three.js, Phaser) as it is | plain JavaScript |

## The kinds, one by one

"Template" is what `zinc new <template> my-project` copies. "Example" is a finished program in `examples/`, run with
`zinc run examples/<name>`.

### Drawing and games

- **You write:** a function called every frame that draws rectangles, text and images, and reads the keyboard, mouse or gamepad
  (`zinc:gfx`: `onFrame`, `rect`, `drawText`).
- **Template:** `game` (a square you move with the arrow keys), `game-2d` (a small game with scenes, sprites and a saved score).
- **Example:** `examples/breakout`, `examples/platformer`.
- **Read next:** [Getting started](../guide/01-getting-started.md), then [UI apps](../guide/03-ui-apps.md#fonts-assets-and-images) for fonts and assets.

### An app with screens, Solid style

- **You write:** JSX components (`<View>`, `<Text>`, `<Button>`) styled with `className`, and values that update the screen by
  themselves (`createSignal` from `zinc:ui/solid`).
- **Template:** `eink` and `remarkable` (both written for the reMarkable tablet, they also run on your computer).
  There is no general-purpose template for this kind yet: copy `examples/ui` or start from `desktop-app`.
- **Example:** `examples/ui`, `examples/hero`.
- **Read next:** [UI apps](../guide/03-ui-apps.md).

### An app with screens, React style

- **You write:** the same components, with hooks (`useState`, `useEffect` from `zinc:ui/react`).
- **Template:** none yet.
- **Example:** `examples/rn-showcase`.
- **Read next:** [UI apps](../guide/03-ui-apps.md#solid-vs-react).

### Ready components, shadcn style

- **You write:** screens built from finished parts (buttons, dialogs, tabs, switches) from `zinc:ui/kit`.
- **Template:** none yet.
- **Example:** `examples/ui/kit-gallery`.
- **Read next:** [the UI kit](../ui-kit.md).

### Ready components, Nuxt UI

- **You write:** screens built from the components of Nuxt UI (`zinc:ui/nuxt`): sidebars, tables, charts, forms.
- **Template:** `desktop-app` (sidebar, pages, menu, dark mode) and `dashboard` (cards and charts).
- **Example:** `examples/nuxt-ui`.
- **Read next:** [Nuxt UI on Zinc](../nuxt-ui.md).

### React Native code

- **You write:** React Native components and styles, with `"ui": { "preset": "react-native" }` in `zinc.json`.
- **Template:** none yet.
- **Example:** `examples/rn-port`, `examples/rn-tester`.
- **Read next:** [React Native on Zinc](../react-native.md).

### 3D

- **You write:** a scene with the three.js API (or the lower-level `zinc:3d`).
- **Template:** `3d`.
- **Example:** `examples/three`, `examples/gl-cube`.
- **Read next:** [the three.js plugin](../plugins/three.md).

### Plain JavaScript

- **You write:** `.js` files, with npm libraries, run on QuickJS (or V8, JavaScriptCore, Hermes with `--engine`).
- **Template:** none yet: put a `.js` entry in a `zinc.json` project and `zinc run` picks the engine.
- **Example:** `examples/js-three`, `examples/js-phaser`.
- **Read next:** [JavaScript engines](../guide/12-js-engines.md).

### Services and command-line programs

- **You write:** a program with no window: it reads its arguments, answers HTTP requests, talks MQTT, runs timers
  (`zinc:sys`, `zinc:net`).
- **Template:** `cli`, `server`, `service` (an API with tests and a systemd unit).
- **Example:** `examples/service/sensor-hub`.
- **Read next:** [Headless services](../guide/04-headless-services.md).

### Boards and microcontrollers

- **You write:** a program that reads sensors, drives pins and draws on a small screen (`zinc:gpio`, display drivers, or LVGL).
  It runs on your desk first, with the hardware simulated, then on the board.
- **Template:** `iot` (a Raspberry Pi button and LED), `iot-board` (an ESP32 with a motion sensor and a screen).
- **Example:** `examples/boards`, `examples/esp32-widgets`.
- **Read next:** [Boards](../boards.md).

### Old tablets and phones

- **You write:** a tree of display objects on `zinc:gfx`, which keeps each frame cheap on a 2011 tablet.
- **Template:** none.
- **Example:** `examples/music-tree`.
- **Read next:** `examples/GUIDELINES.md` in the repository.

## Which kinds have no template yet

React-style apps, the shadcn-style kit, React Native code and plain JavaScript have none: start from the example named
above (copy its folder, then `zinc run` it). A template for each is planned; until then the example is the starting point.

## Not sure?

Run two or three examples and keep the one that feels like what you want to make: `zinc run examples/breakout`,
`zinc run examples/hero`, `zinc run examples/nuxt-ui`. Then [the syntax cheat sheet](../reference/syntax.md) shows what you
can write, and `zinc explain <code>` explains any error.
