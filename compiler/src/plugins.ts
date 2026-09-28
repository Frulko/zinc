// Plugins (PLG): optional features live outside the core, one directory each, and are only compiled into programs
// that use them. Two kinds:
//  - module plugins: `import ... from 'zinc:video'` resolves to the plugin's Zinc entry (index.ts); native code goes
//    through the usual spec mechanism (native/<name>.spec.ts + <name>.<target>.cpp + <name>.sim.ts, NAT-01..09);
//  - display plugins: picked by zinc.json `display` (per target), they register a HalDisplay (runtime/include/hal.h).
// Search path: <zinc>/plugins/*, <project>/plugins/*, then zinc.json "pluginDirs". See docs/plugins.md.
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface PluginTarget {
  sources?: string[];        // extra C++ files, relative to the plugin directory
  pkg?: string[];            // pkg-config modules (host / docker builds)
  frameworks?: string[];     // Apple frameworks
  libs?: string[];           // plain -l libraries
  defines?: string[];
  flags?: string[];          // extra compile flags
  linkFlags?: string[];
  packages?: string[];       // system packages installed into the target's SDK image (apk on rpi1, apt on linux)
  idf?: string[];            // ESP-IDF REQUIRES
  idfComponents?: Record<string, string>;  // ESP Component Registry dependencies (name -> version)
}
export interface Plugin {
  name: string;
  dir: string;
  description: string;
  kind: 'module' | 'display';
  module?: string;           // import specifier, e.g. zinc:video
  entry?: string;            // absolute path of the Zinc entry
  modules?: Record<string, string>;  // extra import specifiers -> absolute paths (e.g. three/addons/...)
  targets: Record<string, PluginTarget>;
  options: Record<string, string | number | boolean>;
}

const ZINC_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');

/** Directory holding zinc.json for a source path (up to three levels), or the entry's own directory. */
export function projectDir(entry: string): string {
  let dir = path.dirname(path.resolve(entry));
  for (let i = 0; i < 3; i++) { if (fs.existsSync(path.join(dir, 'zinc.json'))) return dir; dir = path.dirname(dir); }
  return path.dirname(path.resolve(entry));
}
function projectJson(dir: string): Record<string, any> {
  const f = path.join(dir, 'zinc.json');
  return fs.existsSync(f) ? withBoard(JSON.parse(fs.readFileSync(f, 'utf8'))) : {};
}

/** zinc.json `"board": "<id>"` (docs/boards.md): boards/<id>.json supplies defaults the project overrides. `all` applies
 *  to every target (and sim), `targets.<id>` to one target, `plugins` to plugin options; display objects merge key by key. */
export function withBoard(j: Record<string, any>): Record<string, any> {
  if (!j.board) return j;
  const f = path.join(ZINC_ROOT, 'boards', `${j.board}.json`);
  if (!fs.existsSync(f)) throw new Error(`zinc.json: unknown board '${j.board}' (see ${path.join(ZINC_ROOT, 'boards')})`);
  const b = JSON.parse(fs.readFileSync(f, 'utf8'));
  const merge = (...xs: Record<string, any>[]) => {
    const o: Record<string, any> = {};
    for (const x of xs) for (const [k, v] of Object.entries(x ?? {}))
      o[k] = k === 'display' && typeof v === 'object' && typeof o[k] === 'object' ? { ...o[k], ...v } : k === 'plugins' ? mergePlugins(o[k], v as Record<string, any>) : v;
    return o;
  };
  const mergePlugins = (a: Record<string, any> = {}, c: Record<string, any> = {}) =>
    Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(c)])].map(k => [k, { ...a[k], ...c[k] }]));
  const ids = new Set(['sim', 'macos', ...Object.keys(b.targets ?? {}), ...Object.keys(j.targets ?? {})]);
  const targets = Object.fromEntries([...ids].map(t => [t, merge(b.all, b.targets?.[t], j.targets?.[t])]));
  return { ...j, targets, plugins: mergePlugins(b.plugins, j.plugins) };
}

const cache = new Map<string, Plugin[]>();
/** Every plugin visible from a project; project plugins shadow bundled ones of the same name. */
export function discover(projDir: string): Plugin[] {
  const hit = cache.get(projDir);
  if (hit) return hit;
  const j = projectJson(projDir);
  const roots = [path.join(ZINC_ROOT, 'plugins'), path.join(projDir, 'plugins'), ...((j.pluginDirs ?? []) as string[]).map(d => path.resolve(projDir, d))];
  const byName = new Map<string, Plugin>();
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const d of fs.readdirSync(root).sort()) {
      const dir = path.join(root, d), f = path.join(dir, 'plugin.json');
      if (!fs.existsSync(f)) continue;
      const p = JSON.parse(fs.readFileSync(f, 'utf8'));
      byName.set(p.name ?? d, {
        name: p.name ?? d, dir, description: p.description ?? '', kind: p.kind ?? 'module', module: p.module,
        entry: p.module ? path.join(dir, p.entry ?? 'index.ts') : undefined,
        modules: Object.fromEntries(Object.entries((p.modules ?? {}) as Record<string, string>).map(([k, v]) => [k, path.join(dir, v)])), targets: p.targets ?? {}, options: p.options ?? {},
      });
    }
  }
  const all = [...byName.values()];
  cache.set(projDir, all);
  return all;
}

/** Module specifier -> entry file, for the TypeScript `paths` option. */
export function modulePaths(projDir: string): Record<string, string[]> {
  return Object.fromEntries(discover(projDir).filter(p => p.module && p.entry)
    .flatMap(p => [[p.module!, [p.entry!]], ...Object.entries(p.modules ?? {}).map(([k, v]) => [k, [v]])]));
}

/** Display plugin chosen for a target: zinc.json `display` (string or { driver, ...options }), per-target override;
 *  ZINC_DISPLAY (`zinc run --display remote`) overrides both for one build. */
function displayOf(projDir: string, target: string): { driver: string; opts: Record<string, unknown> } | undefined {
  const j = projectJson(projDir);
  const d = process.env.ZINC_DISPLAY || (j.targets?.[target]?.display ?? j.display);
  if (!d) return undefined;
  if (typeof d === 'string') return { driver: d, opts: {} };
  const { driver, ...opts } = d;
  return driver ? { driver, opts } : undefined;
}

export interface ActivePlugins { plugins: Plugin[]; errors: string[] }
/** Plugins a program needs on `target`: imported module plugins plus the configured display driver. */
export function activePlugins(projDir: string, sourceFiles: string[], target: string): ActivePlugins {
  const all = discover(projDir);
  const files = new Set(sourceFiles.map(f => path.resolve(f)));
  const used = all.filter(p => p.entry && files.has(p.entry));
  const errors: string[] = [];
  const disp = displayOf(projDir, target);
  if (disp && target !== 'sim') {
    const p = all.find(x => x.name === disp.driver || x.name === `display-${disp.driver}`);
    if (!p) errors.push(`display driver '${disp.driver}' not found (zinc plugins lists them)`);
    else used.push(p);
  }
  for (const p of used) {
    if (!p.targets[target] && !(target === 'sim' && p.kind === 'module'))
      errors.push(`plugin '${p.name}' is not available on target '${target}' (available: ${Object.keys(p.targets).join(', ') || 'none'})`);
  }
  return { plugins: used, errors };
}

/** Options for a plugin: plugin.json defaults, zinc.json `plugins.<name>`, and display options. */
export function optionsOf(p: Plugin, projDir: string, target: string): Record<string, unknown> {
  const j = projectJson(projDir);
  const disp = displayOf(projDir, target);
  return { ...p.options, ...(j.plugins?.[p.name] ?? {}), ...(j.targets?.[target]?.plugins?.[p.name] ?? {}), ...(p.kind === 'display' && disp ? disp.opts : {}) };
}
/** Options as C++ defines: ZP_<PLUGIN>_<KEY>. */
export function optionDefines(p: Plugin, projDir: string, target: string): string[] {
  const id = (s: string) => s.replace(/[^A-Za-z0-9]/g, '_').toUpperCase();
  return Object.entries(optionsOf(p, projDir, target)).map(([k, v]) =>
    `ZP_${id(p.name)}_${id(k)}=${typeof v === 'string' ? JSON.stringify(v) : typeof v === 'boolean' ? (v ? 1 : 0) : v}`);
}

/** Merged native build settings of the active plugins for one target. */
export function buildSettings(active: Plugin[], projDir: string, target: string) {
  const out = { sources: [] as string[], includes: [] as string[], pkg: [] as string[], frameworks: [] as string[], libs: [] as string[], defines: [] as string[], flags: [] as string[], linkFlags: [] as string[], packages: [] as string[], idf: [] as string[], idfComponents: {} as Record<string, string> };
  for (const p of active) {
    const t = p.targets[target] ?? {};
    out.sources.push(...(t.sources ?? []).map(s => path.join(p.dir, s)));
    out.includes.push(p.dir);
    out.pkg.push(...t.pkg ?? []); out.frameworks.push(...t.frameworks ?? []); out.libs.push(...t.libs ?? []);
    out.defines.push(...t.defines ?? [], ...optionDefines(p, projDir, target), `ZP_${p.name.replace(/[^A-Za-z0-9]/g, '_').toUpperCase()}=1`);
    out.flags.push(...t.flags ?? []); out.linkFlags.push(...t.linkFlags ?? []);
    out.packages.push(...t.packages ?? []); out.idf.push(...t.idf ?? []);
    Object.assign(out.idfComponents, t.idfComponents ?? {});
  }
  for (const k of ['includes', 'pkg', 'frameworks', 'libs', 'packages', 'idf'] as const) out[k] = [...new Set(out[k])];
  return out;
}
export type BuildSettings = ReturnType<typeof buildSettings>;

/** `zinc plugins`: the toolbox, with availability per target. */
export function listPlugins(projDir: string): string {
  const rows = discover(projDir).map(p => `  ${(p.module ?? `display: ${p.name.replace(/^display-/, '')}`).padEnd(24)} ${Object.keys(p.targets).join(',').padEnd(34)} ${p.description}`);
  return rows.length ? `plugin (import / display)  targets                             description\n${rows.join('\n')}` : 'no plugins found';
}
