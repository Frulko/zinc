// Project tooling: zinc init, zinc export, zinc dev (rebuild + restart on save), zinc monitor (telemetry viewer).
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as dgram from 'node:dgram';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { ZINC_ROOT, STD_MODULES, LIB_FILES } from './frontend.ts';
import { iconPng } from './icon.ts';
import { modulePaths } from './plugins.ts';
import type { Built, Opts, Project } from './cli.ts';

const TEMPLATES: Record<string, Record<string, string>> = {
  game: {
    'src/main.ts': `import { onFrame, clear, rect, text, width, height, isDown, Btn } from 'zinc:gfx';

let x = width() / 2, y = height() / 2;
onFrame((dt: number) => {
  if (isDown(Btn.Left)) x -= 120 * dt;
  if (isDown(Btn.Right)) x += 120 * dt;
  if (isDown(Btn.Up)) y -= 120 * dt;
  if (isDown(Btn.Down)) y += 120 * dt;
  clear(0x101820);
  rect(x - 8, y - 8, 16, 16, 0xfeca57);
  text(4, 4, 'arrows to move', 0xffffff, 1);
});
`,
  },
  cli: {
    'src/main.ts': `import * as sys from 'zinc:sys';

const args = sys.args();
console.log(\`hello from \${sys.platform()}\`, args);
`,
  },
  server: {
    'src/main.ts': `import { serve, Request, Reply } from 'zinc:net';
import * as telemetry from 'zinc:telemetry';

let hits = 0;
telemetry.expose('hits', () => hits);
serve(3000, (req: Request): Reply => {
  hits++;
  return { status: 200, contentType: 'application/json', body: JSON.stringify({ path: req.path, hits }) };
});
console.log('listening on http://localhost:3000');
`,
  },
  iot: {
    'src/main.ts': `import * as gpio from 'zinc:gpio';
import { send } from 'zinc:osc';

gpio.setup(17, 'out', 'none');
gpio.setup(27, 'in', 'up');
gpio.watch(27, 'falling', 20, (e: gpio.PinEdge) => {
  gpio.write(17, 1);
  send('127.0.0.1', 9000, '/button', [e.pin, e.timestampMs]);
  console.log('button', e.pin);
});
console.log('waiting for the button on pin 27 (ZINC_GPIO_SCRIPT="27:0@500" simulates a press)');
`,
  },
  // reMarkable Paper Pro: JSX + handwriting; `zinc run` shows it in the e-ink emulator, `zinc deploy --target rmpp`
  remarkable: {
    'src/main.tsx': `import { createSignal, render } from 'zinc:ui/solid';
import { Ink, InkCanvas } from 'zinc:ink';

const ink = new Ink();
const [strokes, setStrokes] = createSignal<i32>(0);

function App(): i32 {
  return <view class="flex-col h-full bg-white">
    <view class="flex-row items-center gap-6 p-6">
      <text class="text-[48px] font-bold text-black">My app</text>
      <button class="px-6 py-4 rounded-lg border-2 border-black bg-white focus:bg-white" onClick={() => { ink.undo(); setStrokes(ink.strokes.length); }}>
        <text class="text-[34px] text-black">Undo</text>
      </button>
      <text class="text-[34px] text-gray-600">{strokes()} stroke(s)</text>
    </view>
    <view class="h-[3px] bg-black"></view>
    <InkCanvas ink={ink} class="grow" />
  </view>;
}

render(App, 0xffffff, (dt: number) => { if (ink.strokes.length !== strokes()) setStrokes(ink.strokes.length); });
`,
    'zinc.json': JSON.stringify({ entry: 'src/main.tsx', assets: 'assets', display: 'rmpp', targets: { macos: { width: 1620, height: 2160 }, linux: { width: 1620, height: 2160 } } }, null, 2) + '\n',
  },
};

/** tsconfig.json for editors (VS Code...): Zinc's own lib instead of the DOM / ES lib, `zinc:*` modules resolved to
 *  the standard modules and plugins of this checkout, JSX typed by lib/editor/jsx.d.ts. The compiler ignores it. */
export function tsconfigFor(dir: string): string {
  const abs = path.resolve(dir);
  const rel = (p: string) => { const r = path.relative(abs, p); return r.startsWith('.') ? r : './' + r; };
  const paths: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(STD_MODULES)) paths[k] = [rel(v)];
  try { for (const [k, v] of Object.entries(modulePaths(abs))) paths[k] = v.map(rel); } catch { /* no project yet */ }
  return JSON.stringify({
    compilerOptions: {
      target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', strict: true, noLib: true, types: [],
      useUnknownInCatchVariables: false, allowImportingTsExtensions: true, noEmit: true, jsx: 'preserve', paths,
      plugins: [{ name: 'zinc-ts-plugin' }],
    },
    files: [...LIB_FILES, path.join(ZINC_ROOT, 'lib/editor/jsx.d.ts')].map(rel),
    include: ['src/**/*', '*.ts', '*.tsx'],
  }, null, 2) + '\n';
}

/** tsserver loads plugins by package name only: link node_modules/zinc-ts-plugin to lib/editor/zinc-ts-plugin. */
export function linkEditorPlugin(dir: string): void {
  const nm = path.join(dir, 'node_modules'), link = path.join(nm, 'zinc-ts-plugin');
  fs.mkdirSync(nm, { recursive: true });
  // replace our own link only: a real directory of that name is someone's package, never deleted
  const st = fs.lstatSync(link, { throwIfNoEntry: false });
  if (st && !st.isSymbolicLink()) { console.error(`zinc: ${link} exists and is not a link; left as is`); return; }
  if (st) fs.unlinkSync(link);
  fs.symlinkSync(path.join(ZINC_ROOT, 'lib/editor/zinc-ts-plugin'), link, 'dir');
}

export function initProject(dir: string, template: string) {
  const files = TEMPLATES[template];
  if (!files) throw new Error(`unknown template '${template}' (${Object.keys(TEMPLATES).join(', ')})`);
  if (fs.existsSync(dir) && fs.readdirSync(dir).length) throw new Error(`${dir} is not empty`);
  const name = path.basename(path.resolve(dir));
  const all: Record<string, string> = {
    'zinc.json': JSON.stringify({ name, entry: 'src/main.ts', assets: 'assets', targets: {} }, null, 2) + '\n',
    ...files,
    'assets/.gitkeep': '',
    '.gitignore': 'build/\ndist/\nnode_modules/\n',
    'tsconfig.json': tsconfigFor(dir),
    'README.md': `# ${name}\n\nA Zinc app (${template} template).\n\n\`\`\`sh\nzinc run            # native build + run\nzinc run --target sim\nzinc dev            # rebuild and restart on save\nzinc export --target macos\n\`\`\`\n`,
  };
  for (const [f, c] of Object.entries(all)) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), c);
  }
  linkEditorPlugin(dir);
  console.log(`created ${dir} (${template}); next: cd ${dir} && zinc run`);
}

/** DEV-11: dist/<name>-<target>/ with the executable (assets embedded), scripts, a service unit and, for GUI apps,
 *  the platform's app packaging (macOS .app + Info.plist + .icns, Linux .desktop, AppLoad manifest, web page/favicon).
 *  version / id / icon come from zinc.json. docs/guide/07-distribution.md */
export function exportApp(p: Project, target: string, exe: string, buildDir: string): string {
  const name = p.name, version = p.version ?? '0.1.0', id = p.id ?? `dev.zinc.${name.replace(/[^A-Za-z0-9.-]/g, '-')}`;
  // the name becomes a directory under dist/ (removed first), file names, and on linux / rpi1 / rmpp words of shell
  // commands run with sudo on the device and systemd unit lines: no separators, no control characters, and a plain
  // [A-Za-z0-9._-] word where it reaches a shell
  const shellTarget = target === 'linux' || target === 'rpi1' || target === 'rmpp';
  if (/[\/\\\x00-\x1f\x7f]/.test(name) || name.startsWith('.') || (shellTarget && !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)))
    throw new Error(`zinc.json name "${name}" is not usable for ${target} (letters, digits, '.', '_', '-'; set "name" in zinc.json)`);
  if (/[\x00-\x1f\x7f]/.test(version)) throw new Error('zinc.json version contains control characters');
  const out = path.join(p.dir, 'dist', `${name}-${target}`);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const report = path.join(buildDir, 'report.json');
  const gui = fs.existsSync(report) && JSON.parse(fs.readFileSync(report, 'utf8')).usesGfx === true;
  if (typeof p.icon === 'string' && !fs.existsSync(p.icon)) throw new Error(`zinc.json icon not found: ${p.icon}`);
  // the project's picture, or a generated one (a letter on a colour: compiler/src/icon.ts), for every packaging
  const iconFile = iconPng(name, p.icon, p.dir, buildDir);
  const files: Record<string, string> = {
    'README.txt': `${name} ${version} (${target}) — built with Zinc.\nRun: ./run.sh\nThe executable is self-contained: assets are embedded.\n`,
  };
  let bin = path.join(out, name);
  const copyExe = (to: string) => { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(exe, to); fs.chmodSync(to, 0o755); };

  if (target === 'wasm') {  // a static site: index.html + app.js + app.wasm (+ favicon)
    const cm = path.join(buildDir, 'cmake');
    const html = fs.readFileSync(path.join(cm, 'app.html'), 'utf8').replace('<title>Zinc</title>',
      `<title>${name.replace(/[<&]/g, '')}</title>\n<link rel="icon" href="favicon.png">`);
    fs.writeFileSync(path.join(out, 'index.html'), html);
    for (const f of ['app.js', 'app.wasm']) fs.copyFileSync(path.join(cm, f), path.join(out, f));
    fs.copyFileSync(iconFile, path.join(out, 'favicon.png'));
    bin = path.join(out, 'app.wasm');
    files['README.txt'] = `${name} ${version} (wasm) — built with Zinc.\nServe this directory over HTTP (file:// cannot load .wasm), e.g.\n  python3 -m http.server -d . 8080\nthen open http://localhost:8080/\n`;
  } else if (target === 'esp32') {  // firmware images + esptool flash script (offsets from ESP-IDF's flasher_args.json)
    const b = path.join(buildDir, 'idf', 'build');
    const fa = JSON.parse(fs.readFileSync(path.join(b, 'flasher_args.json'), 'utf8')) as { flash_files: Record<string, string>; write_flash_args: string[]; extra_esptool_args?: { chip?: string } };
    const parts: string[] = [];
    for (const [off, f] of Object.entries(fa.flash_files)) { fs.copyFileSync(path.join(b, f), path.join(out, path.basename(f))); parts.push(`${off} ${path.basename(f)}`); }
    bin = path.join(out, path.basename(fa.flash_files['0x10000'] ?? Object.values(fa.flash_files).pop()!));
    files['flash.sh'] = `#!/bin/sh\n# usage: ./flash.sh /dev/ttyUSB0   (pip install esptool)\nset -e\nPORT="\${1:?usage: flash.sh <serial port>}"\nESPTOOL=$(command -v esptool || command -v esptool.py)\ncd "$(dirname "$0")"\n"$ESPTOOL" --chip ${fa.extra_esptool_args?.chip ?? 'esp32'} -p "$PORT" -b 460800 --before default_reset --after hard_reset write_flash ${fa.write_flash_args.join(' ')} ${parts.join(' ')}\n`;
    files['README.txt'] = `${name} ${version} (esp32 firmware) — built with Zinc (ESP-IDF).\nFlash: ./flash.sh <serial port>   (needs esptool: pip install esptool)\nSerial console: 115200 baud, e.g. python3 -m serial.tools.miniterm <port> 115200\n`;
  } else if (target === 'macos' && (gui || p.icon)) {  // Name.app bundle (generated icon unless zinc.json has one)
    const exeIn = macBundle(p, exe, out, iconFile);
    if (exeIn) bin = exeIn; else copyExe(bin);
    files['run.sh'] = `#!/bin/sh\nexec "$(dirname "$0")/${name}.app/Contents/MacOS/${name}" "$@"\n`;
  } else {
    copyExe(bin);
  }
  if (target === 'macos' && process.platform === 'darwin') {
    spawnSync('strip', [bin]);
    // ad-hoc signature (Apple Silicon refuses unsigned code); ZINC_SIGN_IDENTITY="Developer ID Application: ..." signs
    // for distribution with the hardened runtime, ready for notarization (xcrun notarytool, see the guide)
    const ident = process.env.ZINC_SIGN_IDENTITY;
    const what = bin.includes('.app/') ? path.join(out, `${name}.app`) : bin;
    const r = spawnSync('codesign', ['--force', '--sign', ident ?? '-', ...(ident ? ['--options', 'runtime', '--timestamp'] : []), what], { encoding: 'utf8' });
    if (r.status !== 0) console.error(`zinc export: codesign failed: ${r.stderr}`);
  }
  if (!['wasm', 'esp32', 'ps1', 'ps2'].includes(target)) files['run.sh'] ??= `#!/bin/sh\ncd "$(dirname "$0")" && exec ./${name} "$@"\n`;
  if (target === 'ps1') for (const f of ['app.bin', 'app.cue']) {  // bootable CD image next to the PS-EXE
    const src = path.join(path.dirname(exe), f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(out, f === 'app.bin' ? `${name}.bin` : `${name}.cue`));
    if (f === 'app.cue' && fs.existsSync(path.join(out, `${name}.cue`))) fs.writeFileSync(path.join(out, `${name}.cue`), fs.readFileSync(path.join(out, `${name}.cue`), 'utf8').replace(/"app\.bin"/, `"${name}.bin"`));
  }
  if (target === 'linux' || target === 'rpi1') {
    files[`${name}.service`] = serviceUnit(name);
    if (gui || p.icon) {
      files[`${name}.desktop`] = `[Desktop Entry]\nType=Application\nName=${name}\nExec=/opt/${name}/${name}\nIcon=/opt/${name}/icon.png\nTerminal=false\nCategories=Utility;\nX-Zinc-Version=${version}\n`;
      fs.copyFileSync(iconFile, path.join(out, 'icon.png'));
    }
    files['deploy.sh'] = deployScript(name);
  }
  if (target === 'rmpp') {  // an AppLoad app directory (docs/targets/remarkable-paper-pro.md)
    const dir = `/home/root/xovi/exthome/appload/${name}`;
    files['external.manifest.json'] = JSON.stringify({ name, application: name, workingDirectory: dir, qtfb: true, disablesWindowedMode: true }, null, 2) + '\n';
    files['deploy.sh'] = `#!/bin/sh\n# usage: ./deploy.sh [root@10.11.99.1]  (developer mode + xovi/AppLoad installed on the tablet)\nset -e\nHOST="\${1:-root@10.11.99.1}"\nssh "$HOST" "mkdir -p ${dir}"\nscp -q "$(dirname "$0")/${name}" "$(dirname "$0")/external.manifest.json" "$(dirname "$0")/icon.png" "$HOST:${dir}/"\necho "installed in ${dir}: open AppLoad on the tablet, tap reload, then launch '${name}'"\n`;
    fs.copyFileSync(iconFile, path.join(out, 'icon.png'));
  }
  for (const [f, c] of Object.entries(files)) { fs.writeFileSync(path.join(out, f), c); if (f.endsWith('.sh')) fs.chmodSync(path.join(out, f), 0o755); }
  const size = fs.statSync(bin).size;
  console.log(`exported ${path.relative(process.cwd(), out)} (${(size / 1024).toFixed(1)} KiB ${target === 'esp32' ? 'firmware' : target === 'wasm' ? 'wasm' : 'executable'})`);
  return out;
}

/** Groups a service may need for devices (framebuffer / DRM, input, GPIO, SPI, I2C, sound, USB cameras); deploy.sh
 *  keeps the ones the device has (systemd refuses to start a unit that names a missing group). */
const DEVICE_GROUPS = 'video render input tty gpio spi i2c audio plugdev';

/** systemd unit for linux / rpi1 (docs/guide/08-security.md): the program runs as a transient unprivileged user
 *  (DynamicUser) with no capabilities, a read-only system, its own writable state directory (/var/lib/<name>, also the
 *  working directory and the zinc:storage file) and device access through groups only. A service that must bind a
 *  port below 1024 adds AmbientCapabilities=CAP_NET_BIND_SERVICE (and the same in CapabilityBoundingSet). */
export function serviceUnit(name: string): string {
  return `[Unit]
Description=${name} (Zinc)
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=/opt/${name}/${name}
DynamicUser=yes
SupplementaryGroups=${DEVICE_GROUPS}
StateDirectory=${name}
WorkingDirectory=/var/lib/${name}
Environment=ZINC_STORAGE=/var/lib/${name}/zinc.storage
# secrets: EnvironmentFile=/etc/${name}.env (root-owned, mode 600), never this file
NoNewPrivileges=yes
CapabilityBoundingSet=
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectKernelLogs=yes
ProtectControlGroups=yes
ProtectClock=yes
ProtectHostname=yes
RestrictSUIDSGID=yes
RestrictRealtime=yes
RestrictNamespaces=yes
LockPersonality=yes
SystemCallArchitectures=native
UMask=0077
Restart=on-failure
RestartSec=2

[Install]
WantedBy=multi-user.target
`;
}

/** deploy.sh for linux / rpi1: stages in a fresh private directory on the device (mktemp: no predictable /tmp path
 *  another user could plant first), installs root-owned under /opt/<name> (the unprivileged service cannot rewrite
 *  its own binary), keeps the device groups that exist there, enables the unit. `name` is a checked plain word. */
export function deployScript(name: string): string {
  return String.raw`#!/bin/sh
# usage: ./deploy.sh pi@raspberrypi.local
set -e
HOST="${'$'}{1:?usage: deploy.sh user@host}"
TMP=$(ssh "$HOST" mktemp -d)
rsync -az --delete "$(dirname "$0")/" "$HOST:$TMP/"
ssh "$HOST" "set -e
G=; for g in ${DEVICE_GROUPS}; do getent group \$g >/dev/null && G=\"\$G \$g\" || true; done
sudo mkdir -p /opt/${name}
sudo rsync -a --delete --chown=root:root --chmod=Du=rwx,Dgo=rx,Fu=rwX,Fgo=rX $TMP/ /opt/${name}/
rm -rf $TMP
sed \"s/^SupplementaryGroups=.*/SupplementaryGroups=\$G/\" /opt/${name}/${name}.service | sudo tee /etc/systemd/system/${name}.service >/dev/null
if [ -f /opt/${name}/${name}.desktop ]; then sudo cp /opt/${name}/${name}.desktop /usr/share/applications/; fi
sudo systemctl daemon-reload
sudo systemctl enable --now ${name}
sudo systemctl restart ${name}"
`;
}

/** Writes (or refreshes) `dir/Name.app` around `exe`: Info.plist, the icon as .icns, the executable. Returns the
 *  executable inside the bundle (zinc run starts it, so the Dock shows the app's name and icon), or null. */
export function macBundle(p: Project, exe: string, dir: string, icon: string): string | null {
  const name = p.name, version = p.version ?? '0.1.0', id = p.id ?? `dev.zinc.${name.replace(/[^A-Za-z0-9.-]/g, '-')}`;
  const app = path.join(dir, `${name}.app`, 'Contents');
  const bin = path.join(app, 'MacOS', name);
  fs.mkdirSync(path.dirname(bin), { recursive: true });
  fs.mkdirSync(path.join(app, 'Resources'), { recursive: true });
  fs.rmSync(bin, { force: true });
  fs.copyFileSync(exe, bin, fs.constants.COPYFILE_FICLONE);   // APFS clone: no extra disk, keeps the signature
  fs.chmodSync(bin, 0o755);
  // the icon is converted again only when its picture changed
  const icns = path.join(app, 'Resources', 'icon.icns');
  const hasIcon = fs.existsSync(icon) && ((fs.existsSync(icns) && fs.statSync(icns).mtimeMs >= fs.statSync(icon).mtimeMs) || macIcns(icon, icns));
  const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const kv: [string, string][] = [['CFBundleName', name], ['CFBundleDisplayName', name], ['CFBundleIdentifier', id], ['CFBundleExecutable', name],
    ['CFBundleVersion', version], ['CFBundleShortVersionString', version], ['CFBundlePackageType', 'APPL'], ['CFBundleInfoDictionaryVersion', '6.0'],
    ['LSMinimumSystemVersion', '11.0'], ...(hasIcon ? [['CFBundleIconFile', 'icon']] as [string, string][] : [])];
  fs.writeFileSync(path.join(app, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
${kv.map(([k, v]) => `  <key>${k}</key><string>${esc(v)}</string>`).join('\n')}
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
`);
  fs.writeFileSync(path.join(app, 'PkgInfo'), 'APPL????');
  return bin;
}

/** icon.png -> .icns with sips + iconutil (macOS only); false when the tools are missing or fail. */
function macIcns(png: string, dest: string): boolean {
  if (process.platform !== 'darwin') { console.error('zinc export: .icns needs macOS (sips, iconutil); bundle has no icon'); return false; }
  const set = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'zinc-icon-')), 'icon.iconset');
  fs.mkdirSync(set);
  for (const s of [16, 32, 128, 256, 512]) for (const scale of [1, 2]) {
    const px = s * scale;
    const r = spawnSync('sips', ['-s', 'format', 'png', '-z', String(px), String(px), png, '--out', path.join(set, `icon_${s}x${s}${scale === 2 ? '@2x' : ''}.png`)], { encoding: 'utf8' });
    if (r.status !== 0) { console.error(`zinc export: sips failed on ${png}: ${r.stderr}`); return false; }
  }
  if (spawnSync('iconutil', ['-c', 'icns', set, '-o', dest]).status !== 0) { console.error('zinc export: iconutil failed'); return false; }
  return true;
}

/**
 * UI-20 / docs/dev-mode.md: rebuild on every save (in process, the compiler stays warm), then per target:
 *  - macos on macOS, linux on Linux: hot reload — the host (runtime/dev_host.cpp) keeps the window and loads the new
 *    program library in place ("reload <path>" on fd 3, answered by "ready <ms>");
 *  - wasm: serve.mjs pushes a reload to the page (server-sent events) when the build changes;
 *  - --device user@host (rpi1, linux): copy the binary and assets, restart it over ssh (DevTools port forwarded);
 *  - sim and targets run through docker/QEMU: restart the process.
 */
export function dev(o: Opts, build: () => Built | null) {
  const name = o.project.name, assets = o.project.assets && fs.existsSync(o.project.assets) ? o.project.assets : undefined;
  if (['esp32', 'ps1', 'ps2'].includes(o.target)) {
    console.error(`zinc dev: not available on ${o.target} (no process to reload); use zinc build / zinc run and flash. See docs/dev-mode.md`);
    process.exit(2);
  }
  if (o.device && !['rpi1', 'linux'].includes(o.target)) { console.error('zinc dev: --device needs --target rpi1 or linux'); process.exit(2); }
  let child: ChildProcess | null = null;
  let host = '', hostStamp = 0, version = 0, savedAt = 0, buildMs = 0;
  // F12 in the program window saves the frame on screen there (runtime/gfx.cpp)
  const shots = path.join(o.project.dir, 'build', 'shots');
  fs.mkdirSync(shots, { recursive: true });
  const env = { ZINC_SHOT_DIR: shots, ...process.env, ...(assets ? { ZINC_ASSETS: assets } : {}) };
  const stop = () => { if (child) { child.removeAllListeners('exit'); child.kill(); child = null; } };
  const onExit = (c: ChildProcess) => c.on('exit', code => { if (child === c) { child = null; console.error(`zinc dev: program exited (${code}), waiting for changes...`); } });

  const startHost = (b: Built) => {
    host = b.exe[0]; hostStamp = fs.statSync(host).mtimeMs;
    const c = spawn(host, [b.lib!, ...o.rest], { stdio: ['inherit', 'inherit', 'inherit', 'pipe'], env: { ...env, ZINC_DEV_FD: '3' } });
    let buf = '';
    (c.stdio[3] as NodeJS.ReadableStream).on('data', (d: Buffer) => {
      buf += d.toString();
      for (let nl; (nl = buf.indexOf('\n')) >= 0; buf = buf.slice(nl + 1)) {
        const m = /^ready ([\d.]+)/.exec(buf.slice(0, nl));
        if (m && savedAt) console.error(`zinc dev: v${version} on screen — save→screen ${Date.now() - savedAt} ms (build ${buildMs} ms, load+first frame ${m[1]} ms)`);
      }
    });
    onExit(c);
    child = c;
  };
  const hot = (b: Built) => {
    // each version gets its own file: a fresh image (and fresh statics) even if the old one is not unloaded
    const hotDir = path.join(b.dir, 'hot');
    fs.mkdirSync(hotDir, { recursive: true });
    for (const f of fs.readdirSync(hotDir)) if (f !== `app-${version - 1}.so`) fs.rmSync(path.join(hotDir, f), { force: true });
    const lib = path.join(hotDir, `app-${++version}.so`);
    fs.copyFileSync(b.lib!, lib);
    if (child && fs.statSync(b.exe[0]).mtimeMs === hostStamp) (child.stdio[3] as NodeJS.WritableStream).write(`reload ${lib}\n`);
    else { stop(); startHost({ ...b, lib }); }
  };
  const device = (b: Built) => {
    // ponytail: restart, not hot reload, on devices; the binary is small and scp is fast on a LAN
    const q = (x: string) => `'${x.replace(/'/g, `'\\''`)}'`;  // one shell word on the device
    const exe = path.join(b.dir, 'cmake/app'), dest = `zinc-dev/${name.replace(/[^A-Za-z0-9._-]/g, '_')}`;
    const sh = (cmd: string, args: string[]) => spawnSync(cmd, args, { stdio: 'inherit' }).status === 0;
    stop();
    if (!sh('ssh', [o.device!, `mkdir -p ${q(dest)}`]) || !sh('rsync', ['-az', exe, ...(assets ? [assets] : []), `${o.device}:${dest}/`])) { console.error('zinc dev: copy to device failed'); return; }
    const c = spawn('ssh', ['-tt', '-L', '9229:127.0.0.1:9229', o.device!, `cd ${q(dest)} && ${assets ? `ZINC_ASSETS=${q(path.basename(assets))} ` : ''}exec ./app`], { stdio: 'inherit' });
    onExit(c);
    child = c;
    console.error(`zinc dev: running on ${o.device} (${Date.now() - savedAt} ms after save)`);
  };
  const external = new Map<string, fs.FSWatcher>();
  const stopGuest = async () => {
    const previous = child; if (!previous) return;
    child = null; previous.removeAllListeners('exit');
    await new Promise<void>(resolve => {
      const kill = setTimeout(() => previous.kill('SIGKILL'), 250);
      previous.once('exit', () => { clearTimeout(kill); resolve(); });
      previous.kill();
    });
  };
  let building = false, dirty = false;
  const cycle = async () => {
    if (building) { dirty = true; return; }
    building = true;
    try {
      // A fresh guest runtime must not observe a partially rewritten module graph during rebuild.
      // A guest may handle SIGTERM; bound graceful shutdown before resorting to SIGKILL.
      if (o.engine && o.engine !== 'native') await stopGuest();
      const t = Date.now();
      const b = build();
      buildMs = Date.now() - t;
      if (!b) { console.error('zinc dev: build failed, waiting for changes...'); return; }
      // Imported modules and native libraries can live outside the project watcher.
      const outside = new Set((b.watch ?? []).map(file => path.resolve(file)).filter(file => !file.startsWith(path.resolve(o.project.dir) + path.sep)));
      for (const [file, watcher] of external) if (!outside.has(file)) { watcher.close(); external.delete(file); }
      for (const file of outside) if (!external.has(file)) external.set(file, fs.watch(path.dirname(file), (_event, name) => {
        if (name === path.basename(file)) schedule();
      }));
      if (b.lib) return hot(b);
      if (o.device) return device(b);
      if (o.target === 'wasm' && child) { fs.writeFileSync(path.join(b.dir, 'cmake/.zinc-reload'), String(Date.now())); return; }  // serve.mjs reloads the page
      stop();
      child = spawn(b.exe[0], [...b.exe.slice(1), ...o.rest], { stdio: 'inherit', env: { ...env, ZINC_DEV: '1' } });
      onExit(child);
      console.error(`zinc dev: running (${new Date().toLocaleTimeString()}, build ${buildMs} ms)`);
    } finally { building = false; if (dirty) { dirty = false; schedule(); } }
  };
  let timer: NodeJS.Timeout | null = null;
  const schedule = () => {
    if (!timer) savedAt = Date.now();
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; cycle(); }, 30);
  };
  fs.watch(o.project.dir, { recursive: true }, (_e, f) => {
    if (!f || /(^|\/)(build|dist|node_modules)(\/|$)/.test(f) || f.split('/').some(p => p.startsWith('.'))) return;
    schedule();
  });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, async () => {
    if (o.engine && o.engine !== 'native') await stopGuest(); else stop();
    process.exit(0);
  });
  savedAt = Date.now();
  cycle();
}

/** Live view of zinc:telemetry JSON lines sent to udp://host:port. */
export function monitor(port: number) {
  const sock = dgram.createSocket('udp4');
  const state = new Map<string, unknown>();
  let perf: { fps?: number; frame_ms?: number; live_objects?: number; draw_cmds?: number } = {};
  let last = 0;
  // datagrams are untrusted text for a terminal: control characters (escape sequences) are shown as \uXXXX
  const clean = (v: unknown) => String(v).replace(/[\x00-\x1f\x7f-\x9f]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  sock.on('message', buf => { try { show(buf); } catch { /* malformed: ignored */ } });
  const show = (buf: Buffer) => {
    let m: { type: string; payload: Record<string, unknown> };
    try { m = JSON.parse(buf.toString()); } catch { return; }
    const p = Object(m?.payload) as Record<string, unknown>;
    if (m.type === 'hello') console.log(`\x1b[36m● connected\x1b[0m platform=${clean(p.platform)} version=${clean(p.version)}`);
    else if (m.type === 'log') console.log(`\x1b[2m[${clean(p.level)}]\x1b[0m ${clean(p.message)}`);
    else if (m.type === 'metric' || m.type === 'event') console.log(`\x1b[35m${m.type}\x1b[0m ${clean(p.name)} = ${clean(JSON.stringify(p.value ?? p.data))}`);
    else if (m.type === 'perf_frame') perf = p;
    else if (m.type === 'state_snapshot') for (const [k, v] of Object.entries(Object(p.vars))) state.set(clean(k), v);
    const now = Date.now();
    if (now - last > 1000 && (perf.fps !== undefined || state.size)) {
      last = now;
      const vars = [...state].map(([k, v]) => `${k}=${clean(JSON.stringify(v))}`).join('  ');
      console.log(`\x1b[33m▮\x1b[0m fps ${clean(perf.fps ?? '-')}  frame ${clean(perf.frame_ms ?? '-')} ms  objects ${clean(perf.live_objects ?? '-')}  draws ${clean(perf.draw_cmds ?? '-')}  ${vars}`);
    }
  };
  // this machine by default; ZINC_MONITOR_HOST=0.0.0.0 to receive from devices on the LAN
  const host = process.env.ZINC_MONITOR_HOST ?? '127.0.0.1';
  sock.bind(port, host, () => console.log(`zinc monitor: listening on udp://${host}:${port} (run your app with ZINC_TELEMETRY=udp://${host === '0.0.0.0' ? '<this machine>' : host}:${port})`));
}
