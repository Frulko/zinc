import { defineConfig } from 'astro/config';
import path from 'node:path';
import { isPublished, slugOf } from './docs-map.mjs';

const REPO = 'https://github.com/Frulko/zinc/blob/main/';
const DOCS = path.resolve('../docs');
const BASE = '/zinc';
const I18N = path.join(DOCS, 'i18n');

// Docs are read straight from ../docs: rewrite their relative links to site routes,
// GitHub blobs (source files) or copied images.
function rehypeDocLinks() {
  return (tree, file) => {
    // docs/i18n/<lang>/learn/x.md keeps the links of docs/learn/x.md: they are resolved from the English place, and a link to a doc
    // stays in the language (/zinc/fr/docs/...). A page of that language not translated yet shows the English one with a notice.
    const fromI18n = file.path.startsWith(I18N + path.sep) ? path.relative(I18N, file.path).split(path.sep) : null;
    const pre = fromI18n ? `/${fromI18n[0]}` : '';
    const dir = fromI18n ? path.dirname(path.join(DOCS, ...fromI18n.slice(1))) : path.dirname(file.path);
    const walk = (n) => {
      if (n.type === 'element') {
        const attr = n.tagName === 'a' ? 'href' : n.tagName === 'img' ? 'src' : null;
        const v = attr && n.properties?.[attr];
        if (typeof v === 'string' && !/^(https?:|mailto:|data:|#|\/)/.test(v)) {
          const [p, hash = ''] = v.split('#');
          const abs = path.resolve(dir, p);
          const inDocs = abs.startsWith(DOCS + path.sep);
          const rel = path.relative(inDocs ? DOCS : path.resolve('..'), abs);
          if (attr === 'src') n.properties.src = `${BASE}/docs-assets/${rel}`;
          else if (inDocs && p.endsWith('.md') && isPublished(rel.split(path.sep).join('/'))) n.properties.href = `${BASE}${pre}/docs/${slugOf(rel.split(path.sep).join('/'))}/${hash && '#' + hash}`;
          else n.properties.href = REPO + rel + (hash && '#' + hash);
        }
      }
      n.children?.forEach(walk);
    };
    walk(tree);
  };
}

export default defineConfig({
  // Routes: English has no prefix, the others /zinc/fr/... (src/pages/[lang]/, src/i18n/, docs/i18n/README.md).
  i18n: { defaultLocale: 'en', locales: ['en', 'fr', 'es', 'it', 'de'], routing: { prefixDefaultLocale: false } },
  site: 'https://frulko.github.io',
  base: BASE,
  trailingSlash: 'always',
  markdown: { rehypePlugins: [rehypeDocLinks], shikiConfig: { themes: { light: 'github-light', dark: 'github-dark' }, defaultColor: false } },
});
