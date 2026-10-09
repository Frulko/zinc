import * as fs from 'node:fs';
import * as path from 'node:path';
import * as http from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assetPath, validateDocument, generateUI, previewSource, type UIDocument } from './ui-document.ts';
import { unzipUI, zipUI } from './ui-package.ts';
const enc = new TextEncoder();
const LIMIT = 33 * 1024 * 1024;
const marker = '.zinc-ui-generated.json';
const cli = fileURLToPath(new URL('../bin/zinc.mjs', import.meta.url));
const hash = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
function noSymlink(file: string): void {
  let p = path.resolve(file);
  for (;;) { try { if (fs.lstatSync(p).isSymbolicLink()) throw new Error(`refusing symlink ${p}`); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; } const parent = path.dirname(p); if (parent === p) break; p = parent; }
}
export async function readUI(file: string): Promise<{ document: UIDocument; assets: Map<string, Uint8Array> }> {
  if (fs.statSync(file).size > LIMIT) throw new Error('UI input exceeds 33 MiB');
  const data = fs.readFileSync(file);
  if (file.endsWith('.zip')) return unpackUI(data);
  const document = validateDocument(JSON.parse(data.toString('utf8'))), assets = new Map<string, Uint8Array>(); let size = data.length;
  for (const name of document.assets ?? []) {
    assetPath(name); const f = path.join(path.dirname(file), 'assets', name); noSymlink(f);
    size += fs.statSync(f).size; if (size > LIMIT) throw new Error('UI assets exceed 33 MiB'); assets.set(name, fs.readFileSync(f));
  }
  return { document, assets };
}
export async function unpackUI(data: Uint8Array): Promise<{ document: UIDocument; assets: Map<string, Uint8Array> }> {
  const files = await unzipUI(data), manifest = files.get('manifest.json'), source = files.get('design.zui.json');
  if (!manifest || !source) throw new Error('ZIP needs manifest.json and design.zui.json');
  const m = JSON.parse(new TextDecoder().decode(manifest));
  if (m.format !== 'zinc-ui-package/1' || m.document !== 'design.zui.json') throw new Error('unsupported UI package');
  const document = validateDocument(JSON.parse(new TextDecoder().decode(source))), assets = new Map<string, Uint8Array>();
  for (const name of document.assets ?? []) { const bytes = files.get('assets/' + name); if (!bytes) throw new Error(`missing asset ${name}`); assets.set(name, bytes); }
  if (files.size !== assets.size + 2) throw new Error('unreferenced archive files');
  return { document, assets };
}
export async function packUI(document: UIDocument, assets: Map<string, Uint8Array>): Promise<Uint8Array> {
  validateDocument(document);
  const files = new Map<string, Uint8Array>([
    ['manifest.json', enc.encode(JSON.stringify({ format: 'zinc-ui-package/1', document: 'design.zui.json' }))],
    ['design.zui.json', enc.encode(JSON.stringify(document))],
  ]);
  for (const name of document.assets ?? []) { const data = assets.get(name); if (!data) throw new Error(`missing asset ${name}`); files.set('assets/' + name, data); }
  return zipUI(files);
}
/** Only owned, unmodified generated files are replaced. Business code lives outside this directory. */
export function writeUI(dir: string, document: UIDocument, assets: Map<string, Uint8Array>): void {
  validateDocument(document); noSymlink(dir); dir = path.resolve(dir);
  const config = { name: document.name, entry: 'src/main.tsx', assets: 'assets', targets: Object.fromEntries(['macos', 'linux', 'sim', 'wasm'].map(t => [t, { width: document.width, height: document.height }])) };
  const files = new Map<string, Uint8Array>([
    ['design.zui.json', enc.encode(JSON.stringify(document, null, 2) + '\n')],
    ['src/design.tsx', enc.encode(generateUI(document))], ['src/main.tsx', enc.encode(previewSource(document))],
    ['zinc.json', enc.encode(JSON.stringify(config, null, 2) + '\n')],
  ]);
  for (const name of document.assets ?? []) { const bytes = assets.get(name); if (!bytes) throw new Error(`missing asset ${name}`); files.set('assets/' + name, bytes); }
  const mf = path.join(dir, marker); noSymlink(mf);
  const previous: Record<string, string> = fs.existsSync(mf) ? JSON.parse(fs.readFileSync(mf, 'utf8')) : {};
  for (const name of new Set([...Object.keys(previous), ...files.keys()])) {
    if (!['design.zui.json', 'src/design.tsx', 'src/main.tsx', 'zinc.json'].includes(name)) { if (!name.startsWith('assets/')) throw new Error('invalid generated-file manifest'); assetPath(name.slice(7)); }
    const file = path.join(dir, name); noSymlink(file);
    if (fs.existsSync(file) && (!previous[name] || hash(fs.readFileSync(file)) !== previous[name])) throw new Error(`generated file was edited or is not owned: ${file}`);
  }
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, bytes] of files) {
    const file = path.join(dir, name); fs.mkdirSync(path.dirname(file), { recursive: true });
    if (fs.existsSync(file) && previous[name] === hash(bytes)) continue;
    const temp = file + '.' + randomBytes(6).toString('hex') + '.tmp';
    fs.writeFileSync(temp, bytes, { flag: 'wx' }); fs.renameSync(temp, file);
  }
  for (const name of Object.keys(previous)) if (!files.has(name) && fs.existsSync(path.join(dir, name))) fs.unlinkSync(path.join(dir, name));
  const temp = mf + '.' + randomBytes(6).toString('hex') + '.tmp'; fs.writeFileSync(temp, JSON.stringify(Object.fromEntries([...files].map(([name, data]) => [name, hash(data)])), null, 2), { flag: 'wx' }); fs.renameSync(temp, mf);
}
function buildWasm(dir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, 'build', dir, '--target', 'wasm'], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000 });
    let log = '';
    const output = (data: Buffer) => { process.stderr.write(data); log = (log + data.toString()).slice(-12000); };
    child.stdout.on('data', output); child.stderr.on('data', output);
    child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(log || `WASM build failed (${code})`)));
  });
}
export function serveUI(dir: string, port = 7331): http.Server {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('invalid port');
  dir = path.resolve(dir); noSymlink(dir);
  const token = randomBytes(24).toString('hex'); let busy = false;
  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS'); res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (req.method === 'GET' && url.pathname.startsWith(`/preview/${token}/`)) {
        const name = url.pathname.slice(`/preview/${token}/`.length);
        if (!['app.html', 'app.js', 'app.wasm'].includes(name)) { res.writeHead(404); res.end(); return; }
        const file = path.join(dir, 'build/wasm/cmake', name); noSymlink(file);
        if (!fs.existsSync(file)) throw new Error('preview not built yet');
        res.setHeader('Content-Type', name.endsWith('.html') ? 'text/html' : name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
        fs.createReadStream(file).pipe(res); return;
      }
      if (req.headers.authorization !== `Bearer ${token}`) { res.writeHead(401); res.end('Pair with the URL printed by zinc ui serve.'); return; }
      if (req.method !== 'POST' || !['/import', '/preview'].includes(url.pathname)) { res.writeHead(404); res.end(); return; }
      if (busy) { res.writeHead(409); res.end('An import/build is already running.'); return; }
      busy = true;
      try {
        const chunks: Buffer[] = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > LIMIT) throw new Error('request exceeds 33 MiB'); chunks.push(chunk); }
        const { document, assets } = await unpackUI(Buffer.concat(chunks)); writeUI(dir, document, assets);
        if (url.pathname === '/preview') await buildWasm(dir);
        res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ name: document.name, preview: `/preview/${token}/app.html?v=${Date.now()}` }));
      } finally { busy = false; }
    } catch (error) { if (!res.headersSent) res.writeHead(400); res.end((error as Error).message); }
  });
  server.requestTimeout = 30000;
  server.listen(port, '127.0.0.1', () => {
    const address = server.address() as { port: number };
    console.log(`Zinc UI: ${dir}\nPaste this pairing URL in the Figma plugin: http://localhost:${address.port}/#${token}`);
  });
  return server;
}
export async function uiCommand(args: string[]): Promise<void> {
  const [cmd, file] = args;
  const flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  if (cmd === 'serve' && file) { serveUI(file, Number(flag('--port') ?? 7331)); return; }
  if (!file || !['check', 'code', 'import', 'pack'].includes(cmd)) throw new Error('Usage: zinc ui check|code <design.zui.json|zip>\n       zinc ui import <file> --out <generated-project>\n       zinc ui pack <design.zui.json> --out <design.zui.zip>\n       zinc ui serve <generated-project> [--port 7331]');
  const { document, assets } = await readUI(file);
  if (cmd === 'check') { console.log(`${document.name}: valid zinc-ui/1 (${document.components.length} components)`); return; }
  if (cmd === 'code') { process.stdout.write(generateUI(document)); return; }
  const out = flag('--out'); if (!out) throw new Error('--out is required');
  if (cmd === 'pack') { noSymlink(out); fs.writeFileSync(out, await packUI(document, assets), { flag: 'wx' }); }
  else writeUI(out, document, assets);
  console.log(`Zinc UI: wrote ${out}`);
}
