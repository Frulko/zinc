// The docs for AI assistants (llmstxt.org): llms.txt (title, summary, links by section), llms-full.txt (every page in one file) and a
// Markdown copy beside every docs page (docs/x/index.md next to docs/x/index.html), in each language. Run by the site build
// (astro.config.mjs, astro:build:done) and by tests/t0/site_llms.sh: `node site/llms.mjs <out dir>`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirs, top, isPublished, slugOf, groupsOf } from './docs-map.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DOCS = path.resolve(HERE, '../docs');
export const SITE = 'https://frulko.github.io/zinc/';
export const LANGS = ['en', 'fr', 'es', 'it', 'de'];
const REPO = 'https://github.com/Frulko/zinc/blob/main/';
const pre = (lang) => (lang === 'en' ? '' : `${lang}/`);
/** Where the Markdown copy of a published doc lives, relative to the site root ("fr/docs/guide/02-language/index.md"). */
export const mdPath = (lang, rel) => `${pre(lang)}docs/${slugOf(rel)}/index.md`;

/** The published docs, as paths inside docs/ ("guide/02-language.md"). */
export function published(docs = DOCS) {
  const out = top.map((t) => `${t}.md`).filter((f) => fs.existsSync(path.join(docs, f)));
  for (const d of dirs) {
    if (!fs.existsSync(path.join(docs, d))) continue;
    for (const f of fs.readdirSync(path.join(docs, d))) if (isPublished(`${d}/${f}`)) out.push(`${d}/${f}`);
  }
  return out;
}

// A page's text for an assistant: no frontmatter, links made absolute (a doc to its Markdown copy in the same language, an image to
// the copied assets, anything else to GitHub), as rehypeDocLinks does for the HTML pages.
function markdownOf(rel, lang, docs) {
  const tr = lang !== 'en' && path.join(docs, 'i18n', lang, rel);
  const src = tr && fs.existsSync(tr) ? tr : path.join(docs, rel);
  const text = fs.readFileSync(src, 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '');
  const dir = path.dirname(path.join(docs, rel));
  return text.replace(/(!?)\]\(([^)\s]+)\)/g, (m, img, v) => {
    if (/^(https?:|mailto:|data:|#|\/)/.test(v)) return m;
    const [p, hash] = v.split('#');
    const abs = path.resolve(dir, p);
    const inDocs = abs.startsWith(docs + path.sep);
    const r = path.relative(inDocs ? docs : path.resolve(docs, '..'), abs).split(path.sep).join('/');
    const h = hash ? `#${hash}` : '';
    if (img) return `${img}](${SITE}docs-assets/${r})`;
    if (inDocs && p.endsWith('.md') && isPublished(r)) return `](${SITE}${mdPath(lang, r)}${h})`;
    return `](${REPO}${inDocs ? 'docs/' : ''}${r}${h})`;
  });
}

const titleOf = (md, rel) => /^# (.+)$/m.exec(md)?.[1].trim() ?? slugOf(rel);
// The first sentence of the first paragraph, for the link's note.
function noteOf(md) {
  const para = md.replace(/^# .+$/m, '').split(/\n\s*\n/).map((p) => p.trim()).find((p) => p && !/^[#>|`!<-]/.test(p) && !/^\*\*/.test(p) && !/^The project is in /.test(p));
  if (!para) return '';
  const s = para.replace(/\s+/g, ' ').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  const one = /^(.+?[.!?])(\s|$)/.exec(s)?.[1] ?? s;
  return one.length > 200 ? `${one.slice(0, 197)}...` : one;
}

/** Writes llms.txt, llms-full.txt and the Markdown copies of every language under out (the built site's root). */
export function writeLlms(out, docs = DOCS) {
  const rels = published(docs);
  const byId = new Map(rels.map((r) => [r.replace(/\.md$/, '').toLowerCase(), r]));
  for (const lang of LANGS) {
    const s = { ...readJson(path.join(HERE, 'src/i18n/en.json')), ...readJson(path.join(HERE, `src/i18n/${lang}.json`)) };
    const pages = new Map();
    for (const rel of rels) {
      const md = markdownOf(rel, lang, docs);
      pages.set(rel, md);
      const f = path.join(out, mdPath(lang, rel));
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, md);
    }
    const head = `# Zinc\n\n> ${s['site.description']}\n\n` +
      'Zinc is a strict, typed subset of TypeScript: one program runs natively on a desktop, a Raspberry Pi, an ESP32, a console or the web, ' +
      'with no browser inside. Every link below is the Markdown copy of a docs page; the HTML page is the same URL without index.md.\n';
    const groups = groupsOf([...byId.keys()]);
    // The plugins and the concepts are the long tail an assistant can skip: the "Optional" section of llmstxt.org.
    const main = groups.filter(([g]) => g !== 'plugins' && g !== 'concepts');
    const opt = groups.filter(([g]) => g === 'plugins' || g === 'concepts');
    const list = (ids) => ids.map((id) => {
      const rel = byId.get(id), md = pages.get(rel), n = noteOf(md);
      return `- [${titleOf(md, rel)}](${SITE}${mdPath(lang, rel)})${n ? `: ${n}` : ''}`;
    }).join('\n');
    let txt = head;
    for (const [g, ids] of main) txt += `\n## ${s['docs.group.' + g] ?? g}\n\n${list(ids)}\n`;
    txt += `\n## Optional\n\n${opt.map(([, ids]) => list(ids)).join('\n')}\n`;
    fs.mkdirSync(path.join(out, pre(lang)), { recursive: true });
    fs.writeFileSync(path.join(out, pre(lang), 'llms.txt'), txt);
    const full = groups.flatMap(([, ids]) => ids.map((id) => byId.get(id)))
      .map((rel) => `<!-- ${SITE}${mdPath(lang, rel)} -->\n\n${pages.get(rel).trim()}\n`).join('\n---\n\n');
    fs.writeFileSync(path.join(out, pre(lang), 'llms-full.txt'), `${head}\n---\n\n${full}`);
  }
  return rels.length;
}

function readJson(f) {
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return {}; }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = process.argv[2];
  if (!out) { console.error('usage: node site/llms.mjs <out dir>'); process.exit(2); }
  console.log(`llms: ${writeLlms(path.resolve(out))} pages x ${LANGS.length} languages`);
}
