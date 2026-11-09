// The starters of the playground (/play/, ZN-774.30), read at build time: one per template of `zinc new` (/play/new/<template>/) and one per
// lesson sample (/play/learn/<lesson>/). A starter is its code files (path -> text) with its zinc.json; assets and tests stay out.
import fs from 'node:fs';
import path from 'node:path';
import { examples, sources } from './catalog';

const ROOT = path.resolve('..');
export type Starter = { name: string; title: string; line: string; files: Record<string, string>; plugins: string[] };   // plugins: the plugin modules it imports

const CODE = /\.(ts|tsx|json)$/;
const listCode = (dir: string, rel = ''): string[] => fs.readdirSync(path.join(dir, rel), { withFileTypes: true }).flatMap((n) => {
  const r = rel ? `${rel}/${n.name}` : n.name;
  return n.isDirectory() ? (rel === '' && n.name !== 'src' ? [] : listCode(dir, r)) : rel === '' && n.name !== 'zinc.json' ? [] : CODE.test(n.name) ? [r] : [];
});

// The modules plugins provide (plugins/*/plugin.json): the compiler in the page has no plugins yet, so a sample that imports one stays out.
const pluginModules = new Set(fs.readdirSync(path.join(ROOT, 'plugins')).flatMap((p) => {
  try { const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'plugins', p, 'plugin.json'), 'utf8')).module; return typeof m === 'string' ? [m] : []; } catch { return []; }
}));
const pluginsOf = (files: Record<string, string>) => [...new Set(Object.values(files).flatMap((t) => [...t.matchAll(/from\s+['"](zinc:[^'"]+)['"]/g)].map((m) => m[1])))].filter((m) => pluginModules.has(m));

// templates/<name>/: zinc new fills {{name}}, {{id}} and {{ident}}; the playground names every sketch "sketch". The plugin starter is not a program.
export const templates: Starter[] = fs.readdirSync(path.join(ROOT, 'templates')).sort().flatMap((name) => {
  const dir = path.join(ROOT, 'templates', name);
  let info: any;
  try { info = JSON.parse(fs.readFileSync(path.join(dir, 'template.json'), 'utf8')); } catch { return []; }
  const files: Record<string, string> = {};
  for (const f of listCode(dir)) files[f] = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\{\{(name|id|ident)\}\}/g, 'sketch');
  if (files[info.entry ?? 'src/main.ts'] === undefined) return [];   // the plugin starter: its example lives outside src/
  return [{ name, title: name, line: info.description ?? '', files, plugins: pluginsOf(files) }];
});

// the lesson samples of docs/learn (the graded examples that live there) that the page can compile
export const lessons: Starter[] = examples.filter((e) => e.path === `docs/learn/samples/${e.name}`).map((e) => {
  const files: Record<string, string> = {};
  for (const { file, text } of sources(e)) files[file] = text;
  return { name: e.name, title: e.title, line: e.line, files, plugins: pluginsOf(files) };
}).filter((l) => l.plugins.length === 0);

// The anchor of each diagnostic on the docs page docs/diagnostics.md ("## Z0104: Wrong number of arguments"), as the markdown renderer slugs it.
export const explain: Record<string, string> = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, 'docs/diagnostics.md'), 'utf8').split('\n').filter((l) => /^## [A-Z]\d{4}:/.test(l))
    .map((l) => { const h = l.slice(3); return [h.slice(0, 5), h.toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-')]; }));
