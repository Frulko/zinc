// Project tooling: zinc init, zinc export, zinc dev (rebuild + restart on save), zinc monitor (telemetry viewer).
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as dgram from 'node:dgram';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { ZINC_ROOT, STD_MODULES, LIB_FILES } from './frontend.ts';
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
  fs.rmSync(link, { recursive: true, force: true });
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
  const out = path.join(p.dir, 'dist', `${name}-${target}`);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const report = path.join(buildDir, 'report.json');
  const gui = fs.existsSync(report) && JSON.parse(fs.readFileSync(report, 'utf8')).usesGfx === true;
  if (p.icon && !fs.existsSync(p.icon)) throw new Error(`zinc.json icon not found: ${p.icon}`);
  const files: Record<string, string> = {
    'README.txt': `${name} ${version} (${target}) — built with Zinc.\nRun: ./run.sh\nThe executable is self-contained: assets are embedded.\n`,
  };
  let bin = path.join(out, name);
  const copyExe = (to: string) => { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(exe, to); fs.chmodSync(to, 0o755); };

  if (target === 'wasm') {  // a static site: index.html + app.js + app.wasm (+ favicon)
    const cm = path.join(buildDir, 'cmake');
    const html = fs.readFileSync(path.join(cm, 'app.html'), 'utf8').replace('<title>Zinc</title>',
      `<title>${name.replace(/[<&]/g, '')}</title>${p.icon ? '\n<link rel="icon" href="favicon.png">' : ''}`);
    fs.writeFileSync(path.join(out, 'index.html'), html);
    for (const f of ['app.js', 'app.wasm']) fs.copyFileSync(path.join(cm, f), path.join(out, f));
    if (p.icon) fs.copyFileSync(p.icon, path.join(out, 'favicon.png'));
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
  } else if (target === 'macos' && (gui || p.icon)) {  // Name.app bundle
    const app = path.join(out, `${name}.app`, 'Contents');
    bin = path.join(app, 'MacOS', name);
    copyExe(bin);
    fs.mkdirSync(path.join(app, 'Resources'), { recursive: true });
    const icns = p.icon ? macIcns(p.icon, path.join(app, 'Resources', 'icon.icns')) : false;
    const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const kv: [string, string][] = [['CFBundleName', name], ['CFBundleDisplayName', name], ['CFBundleIdentifier', id], ['CFBundleExecutable', name],
      ['CFBundleVersion', version], ['CFBundleShortVersionString', version], ['CFBundlePackageType', 'APPL'], ['CFBundleInfoDictionaryVersion', '6.0'],
      ['LSMinimumSystemVersion', '11.0'], ...(icns ? [['CFBundleIconFile', 'icon']] as [string, string][] : [])];
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
    files[`${name}.service`] = `[Unit]\nDescription=${name} (Zinc)\nAfter=network-online.target\nWants=network-online.target\n\n[Service]\nExecStart=/opt/${name}/${name}\nWorkingDirectory=/opt/${name}\nRestart=on-failure\nRestartSec=2\n\n[Install]\nWantedBy=multi-user.target\n`;
    if (gui || p.icon) {
      files[`${name}.desktop`] = `[Desktop Entry]\nType=Application\nName=${name}\nExec=/opt/${name}/${name}\n${p.icon ? `Icon=/opt/${name}/icon.png\n` : ''}Terminal=false\nCategories=Utility;\nX-Zinc-Version=${version}\n`;
      if (p.icon) fs.copyFileSync(p.icon, path.join(out, 'icon.png'));
    }
    files['deploy.sh'] = `#!/bin/sh\n# usage: ./deploy.sh pi@raspberrypi.local\nset -e\nHOST="\${1:?usage: deploy.sh user@host}"\nrsync -az --delete "$(dirname "$0")/" "$HOST:/tmp/${name}/"\nssh "$HOST" "sudo mkdir -p /opt/${name} && sudo rsync -a /tmp/${name}/ /opt/${name}/ && sudo cp /opt/${name}/${name}.service /etc/systemd/system/ && { [ ! -f /opt/${name}/${name}.desktop ] || sudo cp /opt/${name}/${name}.desktop /usr/share/applications/; } && sudo systemctl daemon-reload && sudo systemctl enable --now ${name} && sudo systemctl restart ${name}"\n`;
  }
  if (target === 'rmpp') {  // an AppLoad app directory (docs/targets/remarkable-paper-pro.md)
    const dir = `/home/root/xovi/exthome/appload/${name}`;
    files['external.manifest.json'] = JSON.stringify({ name, application: name, workingDirectory: dir, qtfb: true, disablesWindowedMode: true }, null, 2) + '\n';
    files['deploy.sh'] = `#!/bin/sh\n# usage: ./deploy.sh [root@10.11.99.1]  (developer mode + xovi/AppLoad installed on the tablet)\nset -e\nHOST="\${1:-root@10.11.99.1}"\nssh "$HOST" "mkdir -p ${dir}"\nscp -q "$(dirname "$0")/${name}" "$(dirname "$0")/external.manifest.json" "$(dirname "$0")/icon.png" "$HOST:${dir}/"\necho "installed in ${dir}: open AppLoad on the tablet, tap reload, then launch '${name}'"\n`;
    if (p.icon) fs.copyFileSync(p.icon, path.join(out, 'icon.png'));
    else fs.writeFileSync(path.join(out, 'icon.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64'));
  }
  for (const [f, c] of Object.entries(files)) { fs.writeFileSync(path.join(out, f), c); if (f.endsWith('.sh')) fs.chmodSync(path.join(out, f), 0o755); }
  const size = fs.statSync(bin).size;
  console.log(`exported ${path.relative(process.cwd(), out)} (${(size / 1024).toFixed(1)} KiB ${target === 'esp32' ? 'firmware' : target === 'wasm' ? 'wasm' : 'executable'})`);
  return out;
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
  const env = { ...process.env, ...(assets ? { ZINC_ASSETS: assets } : {}) };
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
    const exe = path.join(b.dir, 'cmake/app'), dest = `zinc-dev/${name}`;
    const sh = (cmd: string, args: string[]) => spawnSync(cmd, args, { stdio: 'inherit' }).status === 0;
    stop();
    if (!sh('ssh', [o.device!, `mkdir -p ${dest}`]) || !sh('rsync', ['-az', exe, ...(assets ? [assets] : []), `${o.device}:${dest}/`])) { console.error('zinc dev: copy to device failed'); return; }
    const c = spawn('ssh', ['-tt', '-L', '9229:127.0.0.1:9229', o.device!, `cd ${dest} && ${assets ? `ZINC_ASSETS=${path.basename(assets)} ` : ''}exec ./app`], { stdio: 'inherit' });
    onExit(c);
    child = c;
    console.error(`zinc dev: running on ${o.device} (${Date.now() - savedAt} ms after save)`);
  };
  const cycle = () => {
    const t = Date.now();
    const b = build();
    buildMs = Date.now() - t;
    if (!b) { console.error('zinc dev: build failed, waiting for changes...'); return; }
    if (b.lib) return hot(b);
    if (o.device) return device(b);
    if (o.target === 'wasm' && child) { fs.writeFileSync(path.join(b.dir, 'cmake/.zinc-reload'), String(Date.now())); return; }  // serve.mjs reloads the page
    stop();
    child = spawn(b.exe[0], [...b.exe.slice(1), ...o.rest], { stdio: 'inherit', env: { ...env, ZINC_DEV: '1' } });
    onExit(child);
    console.error(`zinc dev: running (${new Date().toLocaleTimeString()}, build ${buildMs} ms)`);
  };
  let timer: NodeJS.Timeout | null = null;
  fs.watch(o.project.dir, { recursive: true }, (_e, f) => {
    if (!f || /(^|\/)(build|dist|node_modules)(\/|$)/.test(f) || f.split('/').some(p => p.startsWith('.'))) return;
    if (!timer) savedAt = Date.now();
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; cycle(); }, 30);
  });
  process.on('SIGINT', () => { stop(); process.exit(0); });
  savedAt = Date.now();
  cycle();
}

/** Live view of zinc:telemetry JSON lines sent to udp://host:port. */
export function monitor(port: number) {
  const sock = dgram.createSocket('udp4');
  const state = new Map<string, unknown>();
  let perf: { fps?: number; frame_ms?: number; live_objects?: number; draw_cmds?: number } = {};
  let last = 0;
  sock.on('message', buf => {
    let m: { type: string; payload: Record<string, unknown> };
    try { m = JSON.parse(buf.toString()); } catch { return; }
    const p = m.payload;
    if (m.type === 'hello') console.log(`\x1b[36m● connected\x1b[0m platform=${p.platform} version=${p.version}`);
    else if (m.type === 'log') console.log(`\x1b[2m[${p.level}]\x1b[0m ${p.message}`);
    else if (m.type === 'metric' || m.type === 'event') console.log(`\x1b[35m${m.type}\x1b[0m ${p.name} = ${JSON.stringify(p.value ?? p.data)}`);
    else if (m.type === 'perf_frame') perf = p;
    else if (m.type === 'state_snapshot') for (const [k, v] of Object.entries(p.vars as object)) state.set(k, v);
    const now = Date.now();
    if (now - last > 1000 && (perf.fps !== undefined || state.size)) {
      last = now;
      const vars = [...state].map(([k, v]) => `${k}=${JSON.stringify(v)}`).join('  ');
      console.log(`\x1b[33m▮\x1b[0m fps ${perf.fps ?? '-'}  frame ${perf.frame_ms ?? '-'} ms  objects ${perf.live_objects ?? '-'}  draws ${perf.draw_cmds ?? '-'}  ${vars}`);
    }
  });
  sock.bind(port, () => console.log(`zinc monitor: listening on udp://0.0.0.0:${port} (run your app with ZINC_TELEMETRY=udp://127.0.0.1:${port})`));
}
