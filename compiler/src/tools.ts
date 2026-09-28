// Project tooling: zinc init, zinc export, zinc dev (rebuild + restart on save), zinc monitor (telemetry viewer).
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as dgram from 'node:dgram';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { ZINC_ROOT } from './frontend.ts';

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

export function initProject(dir: string, template: string) {
  const files = TEMPLATES[template];
  if (!files) throw new Error(`unknown template '${template}' (${Object.keys(TEMPLATES).join(', ')})`);
  if (fs.existsSync(dir) && fs.readdirSync(dir).length) throw new Error(`${dir} is not empty`);
  const name = path.basename(path.resolve(dir));
  const all: Record<string, string> = {
    'zinc.json': JSON.stringify({ name, entry: 'src/main.ts', assets: 'assets', targets: {} }, null, 2) + '\n',
    ...files,
    'assets/.gitkeep': '',
    '.gitignore': 'build/\ndist/\n',
    'README.md': `# ${name}\n\nA Zinc app (${template} template).\n\n\`\`\`sh\nzinc run            # native build + run\nzinc run --target sim\nzinc dev            # rebuild and restart on save\nzinc export --target macos\n\`\`\`\n`,
  };
  for (const [f, c] of Object.entries(all)) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), c);
  }
  console.log(`created ${dir} (${template}); next: cd ${dir} && zinc run`);
}

/** DEV-11: dist/<name>-<target>/ with the executable (assets embedded), scripts and a service unit. */
export function exportApp(name: string, target: string, exe: string, projectDir: string): string {
  const out = path.join(projectDir, 'dist', `${name}-${target}`);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const bin = path.join(out, name);
  fs.copyFileSync(exe, bin);
  fs.chmodSync(bin, 0o755);
  if (target === 'macos' || target === 'linux') spawnSync('strip', target === 'macos' ? ['-x', bin] : [bin]);
  const files: Record<string, string> = {
    'README.txt': `${name} (${target}) — built with Zinc.\nRun: ./${name}\nThe executable is self-contained: assets are embedded.\n`,
    'run.sh': `#!/bin/sh\ncd "$(dirname "$0")" && exec ./${name} "$@"\n`,
  };
  if (target === 'linux' || target === 'rpi1') {
    files[`${name}.service`] = `[Unit]\nDescription=${name} (Zinc)\nAfter=network-online.target\n\n[Service]\nExecStart=/opt/${name}/${name}\nWorkingDirectory=/opt/${name}\nRestart=on-failure\n\n[Install]\nWantedBy=multi-user.target\n`;
    files['deploy.sh'] = `#!/bin/sh\n# usage: ./deploy.sh pi@raspberrypi.local\nset -e\nHOST="\${1:?usage: deploy.sh user@host}"\nrsync -az --delete "$(dirname "$0")/" "$HOST:/tmp/${name}/"\nssh "$HOST" "sudo mkdir -p /opt/${name} && sudo rsync -a /tmp/${name}/ /opt/${name}/ && sudo cp /opt/${name}/${name}.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now ${name}"\n`;
  }
  for (const [f, c] of Object.entries(files)) { fs.writeFileSync(path.join(out, f), c); if (f.endsWith('.sh')) fs.chmodSync(path.join(out, f), 0o755); }
  const size = fs.statSync(bin).size;
  console.log(`exported ${path.relative(process.cwd(), out)} (${(size / 1024).toFixed(1)} KiB executable)`);
  return out;
}

/** UI-20: rebuild and restart on every save. */
export function dev(buildArgs: string[], projectDir: string, assetsDir?: string) {
  let child: ChildProcess | null = null;
  let timer: NodeJS.Timeout | null = null;
  const restart = () => {
    if (child) { child.kill(); child = null; }
    const b = spawnSync(process.execPath, [path.join(ZINC_ROOT, 'compiler/bin/zinc.mjs'), 'build', ...buildArgs, '--print-exe'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
    if (b.status !== 0) { console.error('zinc dev: build failed, waiting for changes...'); return; }
    const exe = b.stdout.trim().split('\n').pop()!.split(' ');
    child = spawn(exe[0], exe.slice(1), { stdio: 'inherit', env: { ...process.env, ...(assetsDir ? { ZINC_ASSETS: assetsDir } : {}) } });
    console.error(`zinc dev: running (${new Date().toLocaleTimeString()})`);
  };
  fs.watch(projectDir, { recursive: true }, (_e, f) => {
    if (!f || f.startsWith('build') || f.startsWith('dist') || f.includes('/build/')) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(restart, 150);
  });
  restart();
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
