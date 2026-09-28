import { defineConfig } from 'astro/config';
import path from 'node:path';

const REPO = 'https://github.com/Frulko/zinc/blob/main/';
const DOCS = path.resolve('../docs');
const BASE = '/zinc';

// Docs are read straight from ../docs: rewrite their relative links to site routes,
// GitHub blobs (source files) or copied images.
function rehypeDocLinks() {
  return (tree, file) => {
    const dir = path.dirname(file.path);
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
          else if (inDocs && p.endsWith('.md')) n.properties.href = `${BASE}/docs/${rel.slice(0, -3).toLowerCase()}/${hash && '#' + hash}`;
          else n.properties.href = REPO + rel + (hash && '#' + hash);
        }
      }
      n.children?.forEach(walk);
    };
    walk(tree);
  };
}

export default defineConfig({
  site: 'https://frulko.github.io',
  base: BASE,
  trailingSlash: 'always',
  markdown: { rehypePlugins: [rehypeDocLinks], shikiConfig: { theme: 'github-light' } },
});
