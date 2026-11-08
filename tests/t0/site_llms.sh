#!/bin/sh
# The docs for AI assistants (site/llms.mjs): every page site/docs-map.mjs publishes is linked from llms.txt and has its Markdown copy
# (docs/<slug>/index.md) in each language, and llms-full.txt holds it. No site build: the generator runs alone into a scratch dir.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
node site/llms.mjs "$tmp" >/dev/null || { echo "site/llms.mjs failed"; exit 1; }
node --input-type=module - "$tmp" <<'JS' || exit 1
import fs from 'node:fs';
import path from 'node:path';
import { isPublished, dirs, top } from './site/docs-map.mjs';
import { SITE, LANGS, mdPath } from './site/llms.mjs';
const out = process.argv[2];
// The published pages straight from docs-map.mjs over docs/, not from the generator's own list.
const rels = [...top.map((t) => `${t}.md`), ...dirs.flatMap((d) => (fs.existsSync(`docs/${d}`) ? fs.readdirSync(`docs/${d}`).map((f) => `${d}/${f}`) : []))]
  .filter((r) => isPublished(r) && fs.existsSync(`docs/${r}`));
let bad = 0;
for (const lang of LANGS) {
  const p = lang === 'en' ? '' : `${lang}/`;
  const txt = fs.readFileSync(path.join(out, p, 'llms.txt'), 'utf8');
  const full = fs.readFileSync(path.join(out, p, 'llms-full.txt'), 'utf8');
  if (!txt.startsWith('# Zinc\n\n> ')) { console.log(`${lang}: llms.txt has no title and summary`); bad++; }
  for (const r of rels) {
    const url = SITE + mdPath(lang, r);
    if (!fs.existsSync(path.join(out, mdPath(lang, r)))) { console.log(`${lang}: no Markdown copy of ${r}`); bad++; }
    if (!txt.includes(`](${url})`)) { console.log(`${lang}: llms.txt misses ${r}`); bad++; }
    if (!full.includes(`<!-- ${url} -->`)) { console.log(`${lang}: llms-full.txt misses ${r}`); bad++; }
  }
}
if (rels.length < 50) { console.log(`only ${rels.length} published pages found`); bad++; }
process.exit(bad ? 1 : 0);
JS
echo "site_llms: ok"
