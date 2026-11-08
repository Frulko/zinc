// Ten known queries in each language against the built site's Pagefind index: the expected page is among the first three results.
// Run after `pnpm build` (astro build, then pagefind): `node search-check.mjs [dist]`. The browser's pagefind.js runs in Node: its
// fetches are answered from dist and its language is the page's (document's lang), as on the site.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const dist = path.resolve(process.argv[2] ?? 'dist');
const BASE = '/zinc/';
// [query, the route the first three results must hold, without the language prefix]
const QUERIES = [
  ['gfx', 'docs/reference/gfx/'],
  ['stage', 'docs/reference/stage/'],
  ['onClick', 'docs/reference/ui-events/'],
  ['Z0103', 'docs/diagnostics/'],
  ['pointerX', 'docs/reference/gfx/'],
  ['addChild', 'docs/reference/stage/'],
  ['quickjs', 'docs/guide/11-quickjs-bundle/'],
  ['zapp', 'docs/zapp/'],
  ['react native', 'docs/react-native/'],
  ['cheat sheet', 'docs/cheatsheet/'],
];
const LANGS = ['en', 'fr', 'es', 'it', 'de'];
// The site's ranking (search.json, given to the search box by Base.astro): whether a page has the word, not how often, so the reference
// page of a name wins over a long guide that repeats it; the reference pages weigh 3 (DocPage.astro).
const RANKING = JSON.parse(fs.readFileSync(new URL('./search.json', import.meta.url), 'utf8')).ranking;

globalThis.fetch = async (url) => {
  const p = new URL(url, 'http://localhost' + BASE).pathname;
  const f = path.join(dist, p.startsWith(BASE) ? p.slice(BASE.length) : p);
  try { return new Response(fs.readFileSync(f)); } catch { return new Response(null, { status: 404 }); }
};
globalThis.window = { location: { origin: 'http://localhost', href: 'http://localhost' + BASE } };

let bad = 0;
for (const lang of LANGS) {
  globalThis.document = { currentScript: null, querySelector: (s) => (s === 'html' ? { getAttribute: (a) => (a === 'lang' ? lang : null) } : null) };
  // a fresh module per language: pagefind.js keeps its instance and language once loaded
  const pf = await import(`${pathToFileURL(path.join(dist, 'pagefind/pagefind.js')).href}?${lang}`);
  await pf.options({ basePath: `${BASE}pagefind/`, ranking: RANKING });
  await pf.init();
  const pre = lang === 'en' ? '' : `${lang}/`;
  for (const [q, want] of QUERIES) {
    const r = await pf.search(q);
    const urls = (await Promise.all(r.results.slice(0, 3).map((x) => x.data()))).map((d) => d.url);
    const expect = `${BASE}${pre}${want}`;
    if (!urls.includes(expect)) { bad++; console.log(`${lang}: "${q}" does not find ${expect} in the first three: ${urls.join(' ') || 'nothing'}`); }
  }
  await pf.destroy?.();
}
console.log(`search: ${LANGS.length * QUERIES.length - bad} of ${LANGS.length * QUERIES.length} queries find their page`);
process.exit(bad ? 1 : 0);
