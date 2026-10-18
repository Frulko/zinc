// @zinc/vite: build and develop a Zinc app for the web with Vite (docs/targets/web.md, "Vite and other bundlers").
//
// Zinc's own steps stay Zinc's: `zinc dev <root> --target web --prepare <dir>` runs the transform (TSX with className, react-native imports, StyleSheet, `zinc:*` modules, plugin `web`
// entries, the browsers check) and writes the program as plain ES modules (<dir>/stage) next to the web host (<dir>/site: runtime.js, native.js, dom.js, wasm). This plugin hands them to
// Vite: Vite resolves the npm packages (its own resolver and pre-bundling), serves the modules, hot-updates them, and bundles, splits, hashes and minifies the build.
// No build step: this file is the package. ESM, Vite 5 and later (tested with 8).
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

const V_MAIN = 'virtual:zinc', V_ENTRY = 'virtual:zinc-entry', V_HOT = 'virtual:zinc-hot';
const CODE = /\.(?:[cm]?[jt]sx?|json)$/;

/** @param {{ zinc?: string, render?: 'canvas' | 'dom', browsers?: string }} [options] zinc: the binary (default $ZINC, else `zinc` on PATH); render and browsers as zinc.json targets.web */
export default function zinc(options = {}) {
  let root = '', base = '/', isBuild = false, dir = '', server = null, timer = null;
  let stage = null, config = null, page = '';
  const emitted = { native: '', dom: '', wasm: new Map(), assets: new Map() };
  const bin = () => options.zinc || process.env.ZINC || 'zinc';
  const stageDir = () => path.join(dir, 'stage');
  const siteDir = () => path.join(dir, 'site');
  const urlOf = (file) => '/' + path.relative(root, file).split(path.sep).join('/');   // a file under the project root, as the dev server serves it

  function prepare() {
    mkdirSync(dir, { recursive: true });
    const args = ['dev', root, '--target', 'web', '--prepare', dir];
    if (isBuild) args.push('--build');
    if (options.render) args.push('--render', options.render);
    if (options.browsers) args.push('--browsers', options.browsers);
    const r = spawnSync(bin(), args, { encoding: 'utf8', env: { ...process.env, ZINC_BACKGROUND: '1' } });
    if (r.error) throw new Error(r.error.code === 'ENOENT' ? `@zinc/vite: the zinc binary was not found (${bin()}). Put zinc on PATH, set ZINC, or pass { zinc: '/path/to/zinc' }.` : String(r.error));
    if (r.status !== 0) throw new Error(`zinc could not prepare the app:\n${(r.stderr || r.stdout).trim()}`);
    for (const l of r.stderr.split('\n')) if (/^warning W0\d+/.test(l)) console.warn('[zinc] ' + l);   // W0601 to W0603: what the browsers cannot run
    stage = JSON.parse(readFileSync(path.join(stageDir(), 'stage.json'), 'utf8'));
    page = readFileSync(path.join(siteDir(), 'index.html'), 'utf8');
    config = JSON.parse(/<script id="zinc-config" type="application\/json">([\s\S]*?)<\/script>/.exec(page)[1].replace(/\\u003c/g, '<'));
  }
  const entryFile = () => path.join(stageDir(), stage.entry);

  // ---- the hot reload bridge: Zinc's own hot records (what lib/std/solid.ts and react.ts listen to) on top of Vite's events
  const moduleOf = new Map();   // staged file (absolute) -> { name, user }
  const real = (p) => { try { return realpathSync(p); } catch { return p; } };
  function indexModules() {   // user: a file of the project (the engine's lib/std, the plugins and packages are not)
    moduleOf.clear();
    const here = real(root) + path.sep;
    for (const m of stage.modules) moduleOf.set(path.join(stageDir(), m.file), { ...m, user: real(m.name).startsWith(here) && !m.name.includes('/node_modules/') });
  }
  const refreshable = (t) => !/(?:^|\n)export\s+(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*(?!\s*(?:async\s*)?(?:function|\(|[A-Za-z_$][\w$]*\s*=>))/.test(t) && !/(?:^|\n)export\s+(?:default\s+)?class\s/.test(t) && !/(?:^|\n)export\s+default\s+(?!function)/.test(t);
  function hotTransform(code, file) {
    const m = moduleOf.get(file);
    if (!m) return null;
    const key = path.relative(stageDir(), file).split(path.sep).join('/');
    if (!m.user) return code.includes('import.meta.hot') ? code.replaceAll('import.meta.hot', `globalThis.__zincHot(${JSON.stringify(key)})`) : null;   // the engine's own modules: Zinc's records
    if (file === entryFile() || !refreshable(code)) return null;   // the entry and modules that export state: a change reloads the page (no accept boundary)
    const names = new Set();
    for (const x of code.matchAll(/(?:^|\n)export\s+(?:async\s+)?function\*?\s+([A-Za-z_$][\w$]*)|(?:^|\n)export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function|\(|[A-Za-z_$][\w$]*\s*=>)/g)) names.add(x[1] || x[2]);
    const out = code.replace(/(\nexport\s+)const(\s+)/g, '$1let$2');
    const all = [...code.matchAll(/(?:^|\n)export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)].map((x) => x[1]);   // what the module exports: the components' '@hot:<name>' keys
    return out + '\n' + [...names].map((n) => `${n} = globalThis.__zincRefresh(${JSON.stringify(key)}, ${JSON.stringify(n)}, ${n});`).join('\n') + `\n(globalThis.__zincExports ||= {})[${JSON.stringify(key)}] = ${JSON.stringify(all)};\nif (import.meta.hot) import.meta.hot.accept();\n`;
  }
  const HOT_CLIENT = `
class HotModule {
  constructor(file, data) { this.file = file; this.data = data; this.accepted = false; this.acceptors = []; this.disposers = []; this.before = []; this.after = []; }
  accept(cb) { this.accepted = true; if (cb) this.acceptors.push(cb); }
  dispose(cb) { this.disposers.push(cb); }
  on(event, cb) { if (event === 'beforeUpdate') this.before.push(cb); else if (event === 'afterUpdate') this.after.push(cb); else throw new Error("import.meta.hot.on: no event '" + event + "' (beforeUpdate, afterUpdate)"); }
  off(event, cb) { const l = event === 'beforeUpdate' ? this.before : this.after; const i = l.indexOf(cb); if (i >= 0) l.splice(i, 1); }
}
const records = new Map(), datas = new Map(), families = new Map();
globalThis.__zincHot = (file) => { let r = records.get(file); if (!r) { if (!datas.has(file)) datas.set(file, {}); records.set(file, r = new HotModule(file, datas.get(file))); } return r; };
globalThis.__zincRefresh = (file, name, fn) => {
  if (typeof fn !== 'function') return fn;
  const key = file + '::' + name;
  let f = families.get(key);
  if (!f) { f = { impl: fn, wrapper: null }; f.wrapper = function (...args) { return f.impl.apply(this, args); }; Object.defineProperty(f.wrapper, 'name', { value: fn.name || name }); families.set(key, f); } else f.impl = fn;
  Object.assign(f.wrapper, fn);
  return f.wrapper;
};
let mods = [];
const keyOf = (u) => decodeURIComponent(u.path.replace(/\\?.*$/, '')).replace(/^.*\\/\\.zinc\\/vite\\/stage\\//, '');
if (import.meta.hot) {
  import.meta.hot.on('vite:beforeUpdate', (p) => {
    const files = p.updates.map(keyOf);
    mods = files.concat(files.flatMap((k) => ((globalThis.__zincExports || {})[k] || []).map((n) => '@hot:' + n)));
    for (const r of records.values()) for (const cb of r.before.slice()) cb(mods);
    for (const k of mods) { const r = records.get(k); if (!r) continue; for (const cb of r.disposers) cb(); records.delete(k); }
  });
  import.meta.hot.on('vite:afterUpdate', () => {
    for (const k of mods) { const r = records.get(k); if (r) for (const cb of r.acceptors) cb(); }
    for (const r of records.values()) for (const cb of r.after.slice()) cb(mods);
    globalThis.__zincUpdates = (globalThis.__zincUpdates || 0) + 1;
  });
}
`;

  // ---- the page: the host's markup, the import map, the config, and the app's script
  function pageParts(urls) {
    const style = /<style>[\s\S]*?<\/style>/.exec(page)?.[0] || '';
    const bodyStart = page.indexOf('<body>') + 6, cfgAt = page.indexOf('<script id="zinc-config"');
    const body = page.slice(bodyStart, cfgAt);
    const cfg = { ...config, dev: false, entry: './unused', domModule: config.domModule ? urls.dom : undefined };
    cfg.wasm = (config.wasm || []).map((w) => ({ ...w, url: urls.wasm.get(w.name) }));
    cfg.assets = (config.assets || []).map((a) => ({ ...a, url: urls.assets.get(a.name) }));
    const json = JSON.stringify(cfg).replace(/</g, '\\u003c');
    return {
      head: `${style}\n<script type="importmap">${JSON.stringify({ imports: { 'zinc:native': urls.native } })}</script>\n`,
      body: `${body}<script id="zinc-config" type="application/json">${json}</script>\n`,
    };
  }

  return {
    name: 'zinc',
    enforce: 'pre',
    config(c, env) {
      return {
        build: { target: 'esnext' },   // the web host awaits at its top level
        optimizeDeps: { entries: [c.root ? path.join(c.root, 'index.html') : 'index.html', '.zinc/vite/stage/**/*.js'] },
      };
    },
    configResolved(c) {
      root = c.root;
      base = c.base || '/';
      isBuild = c.command === 'build';
      dir = path.join(root, '.zinc', 'vite');
    },
    buildStart() {
      prepare();
      indexModules();
      if (!isBuild) return;
      // a production build: the host's files and the project's assets are emitted with content hashes, the page's config points at them
      const emit = (name, file) => this.getFileName(this.emitFile({ type: 'asset', name, source: readFileSync(file) }));
      emitted.native = base + emit('zinc-native.js', path.join(siteDir(), 'native.js'));
      emitted.dom = config.domModule ? base + emit('zinc-dom.js', path.join(siteDir(), 'dom.js')) : '';
      emitted.wasm = new Map((config.wasm || []).map((w) => [w.name, base + emit(path.basename(w.url), path.join(siteDir(), path.basename(w.url)))]));
      emitted.assets = new Map((config.assets || []).map((a) => [a.name, base + emit(path.basename(a.name), path.join(root, a.name))]));
    },
    configureServer(s) {
      server = s;
      s.watcher.add(stageDir());
      const code = (f) => f.startsWith(root + path.sep) && !f.startsWith(dir + path.sep) && !f.includes(path.sep + 'node_modules' + path.sep) && !f.includes(path.sep + 'dist' + path.sep) && !f.includes(path.sep + '.git' + path.sep);
      const changed = (f) => {
        if (!code(f)) return;
        clearTimeout(timer);
        timer = setTimeout(() => {
          try {
            prepare();
            indexModules();
            if (!CODE.test(f)) s.ws.send({ type: 'full-reload' });   // an asset or the zinc.json: the host files may have changed
          } catch (e) {
            s.config.logger.error(e.message);
            s.ws.send({ type: 'error', err: { message: e.message, stack: '', plugin: 'zinc' } });
          }
        }, 40);
      };
      s.watcher.on('change', changed).on('add', changed).on('unlink', changed);
    },
    resolveId(id) {
      // the build leaves it to the page's import map; the dev server rewrites every import to a URL of its own (it ignores `external`), so it gets the file the import map names
      if (id === 'zinc:native') return isBuild ? { id, external: true } : path.join(siteDir(), 'native.js');
      if (id === V_MAIN || id === V_ENTRY || id === V_HOT) return '\0' + id;
    },
    load(id) {
      if (id === '\0' + V_HOT) return HOT_CLIENT;
      if (id === '\0' + V_ENTRY) return `globalThis.__zincLoadEntry = () => import(${JSON.stringify(entryFile())});\n`;
      if (id === '\0' + V_MAIN) return `${isBuild ? '' : `import ${JSON.stringify(V_HOT)};\n`}import ${JSON.stringify(V_ENTRY)};\nimport ${JSON.stringify(path.join(siteDir(), 'runtime.js'))};\n`;
    },
    async handleHotUpdate({ file, read, server: s }) {   // Zinc's rule: a module that exports state (or classes, or is the entry) cannot be swapped alone: the page reloads
      if (!file.startsWith(stageDir() + path.sep) || !file.endsWith('.js')) return;
      const m = moduleOf.get(file);
      if (m && m.user && (file === entryFile() || !refreshable(await read()))) { s.ws.send({ type: 'full-reload' }); return []; }
    },
    transform(code, id) {
      if (isBuild) return null;
      const file = id.split('?')[0];
      return file.startsWith(stageDir() + path.sep) ? hotTransform(code, file) : null;
    },
    transformIndexHtml: { order: 'pre', handler(html) {
      const dev = !isBuild;
      const urls = dev
        ? { native: urlOf(path.join(siteDir(), 'native.js')), dom: urlOf(path.join(siteDir(), 'dom.js')), wasm: new Map((config.wasm || []).map((w) => [w.name, urlOf(path.join(siteDir(), path.basename(w.url)))])), assets: new Map((config.assets || []).map((a) => [a.name, base + a.name])) }
        : { native: emitted.native, dom: emitted.dom, wasm: emitted.wasm, assets: emitted.assets };
      const parts = pageParts(urls);
      return html.replace(/<head[^>]*>/, (m) => m + '\n' + parts.head).replace(/<body[^>]*>/, (m) => m + '\n' + parts.body).replace('</body>', `<script type="module">import ${JSON.stringify(V_MAIN)};</script>\n</body>`);
    } },
  };
}
