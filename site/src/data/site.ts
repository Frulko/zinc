import fs from 'node:fs';

export const REPO = 'https://github.com/Frulko/zinc';
export const INSTALL = 'curl -fsSL https://github.com/zinc-engine/zinc/releases/latest/download/install.sh | sh';
export const img = (f: string) => `${import.meta.env.BASE_URL}docs-assets/img/${f}`;

export type Demo = { f: string; t: string; d: string; cmd: string };
export const demos: Demo[] = [
  { f: 'hero.png', t: 'Hero', d: 'A complete app: intro, screens, transitions, a gallery and a command palette.', cmd: 'zinc run examples/hero' },
  { f: 'zed-editor.png', t: 'A code editor, Zed style', d: 'A project tree, tabs, highlighting and a minimap, written in Zinc.', cmd: 'zinc run examples/zed-editor' },
  { f: 'museum-table-full.jpg', t: 'A museum touch table', d: 'A multi-touch table showing a museum collection.', cmd: 'zinc run examples/museum-table' },
  { f: 'pinball3d-play.png', t: '3D pinball', d: 'A 3D pinball table in play.', cmd: 'zinc run examples/pinball3d' },
  { f: 'navigation.png', t: 'Offline GPS navigation', d: 'Turn-by-turn navigation through Paris, with no network.', cmd: 'zinc run examples/maps/navigation' },
  { f: '3d-model.png', t: '3D model viewer', d: 'A 3D model drawn by the zinc:3d plugin.', cmd: 'zinc run examples/3d/model' },
  { f: 'video-mapper.png', t: 'GPU video mapping', d: 'Video layers warped onto surfaces.', cmd: 'zinc run examples/video/mapper' },
  { f: 'video-looper.png', t: 'Video looper', d: 'Gapless video playlists on the FFmpeg plugin.', cmd: 'zinc run examples/video/looper' },
  { f: 'remarkable-notes.png', t: 'An e-ink notebook', d: 'A handwriting notebook for the reMarkable Paper Pro.', cmd: 'zinc run examples/remarkable/notes' },
  { f: 'esp32-2432s022-home.png', t: 'A 2.2" ESP32 touch screen', d: 'A widgets tour on a small ESP32 board.', cmd: 'zinc run examples/boards/esp32-2432s022' },
  { f: 'iot-panel.png', t: 'IoT panel', d: 'A GPIO simulator with a live chart and telemetry.', cmd: 'zinc run examples/iot-panel' },
  { f: 'music-touchpad.png', t: 'A Sonos remote on a 2011 tablet', d: 'The Musique app on an HP TouchPad.', cmd: 'examples/music/install.sh' },
  { f: 'kit-gallery.png', t: 'UI kit', d: 'shadcn-style components, with a dark theme too.', cmd: 'zinc run examples/ui/kit-gallery' },
  { f: 'breakout-demo.png', t: 'Breakout', d: 'A small game: arrows, mouse or touch.', cmd: 'zinc run examples/breakout' },
  { f: 'script-playground.png', t: 'Sandboxed scripting', d: 'QuickJS-ng with typed host functions.', cmd: 'zinc run examples/scripting' },
];
export const demo = (f: string) => demos.find((d) => d.f === f)!;

// The plugin tables are read from README.md so the site never drifts from it.
const readme = fs.readFileSync('../README.md', 'utf8');
const rows = (head: string) => {
  const at = readme.indexOf(head);
  const out: string[][] = [];
  for (const line of readme.slice(at).split('\n').slice(1)) {
    if (line.startsWith('</details>')) break;
    if (!line.startsWith('|') || /^\|[-| ]+\|$/.test(line)) continue;
    out.push(line.slice(1, -1).split('|').map((c) => c.trim().replace(/^`|`$/g, '')));
  }
  return out.slice(1);
};
export const modules = rows('<summary><b>36 modules</b>');
export const drivers = rows('<summary><b>9 display drivers</b>');

export const targets = [
  ['aarch64-macos, x86_64-macos', 'Mac, Apple silicon and Intel'],
  ['x86_64-windows', 'Windows 10 and 11 (console programs for now)'],
  ['x86_64-linux', 'PCs and servers'],
  ['aarch64-linux', 'Raspberry Pi 3, 4 and 5 (64-bit), reMarkable Paper Pro'],
  ['armhf-linux', 'every 32-bit Raspberry Pi OS, Pi 1 and Zero included'],
  ['armv7-linux', 'NTC CHIP and PocketCHIP'],
  ['armv7-webos', 'HP TouchPad on webOS 3'],
  ['esp32', "flashes the board, or runs it in Espressif's QEMU"],
];

export const cli: [string, string][] = [
  ['start a project from one of 13 templates (game, 3D, dashboard, IoT, e-ink, service...)', 'zinc new game my-game'],
  ['run it, with hot reload and a DevTools inspector', 'zinc run  |  zinc dev'],
  ['run plain JavaScript (three.js, PixiJS, Phaser) as it is', 'zinc run app.js --engine quickjs'],
  ['set breakpoints in VS Code or Chrome', 'zinc debug --dap  |  zinc debug --cdp'],
  ['understand an error', 'zinc explain Z0104'],
  ['test on the interpreter, in native code, on QuickJS or a simulated device', 'zinc test --runner aot'],
  ['try it on a device I do not have', 'zinc run --simulate hp-touchpad'],
  ['build a native executable, for this machine or another', 'zinc build  |  zinc build --target aarch64-linux'],
  ['flash a board', 'zinc flash --target esp32'],
  ['drive a Pi or a Mac from my desk (shell, files, apps, logs)', 'zinc agent (on it), zinc device (here)'],
  ['ship a .app, a single executable or a .zapp', 'zinc export  |  zinc pack'],
  ['publish a version and signed updates', 'zinc publish'],
  ['add a plugin from the signed index', 'zinc add <plugin>'],
  ['capture frames, measure speed', 'zinc capture  |  zinc bench'],
];
