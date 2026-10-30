// What the site publishes from ../docs. Everything else (reports, decisions, working notes) stays on GitHub:
// links to it are rewritten to GitHub blobs by rehypeDocLinks (astro.config.mjs).
export const dirs = ['learn', 'start', 'guide', 'reference', 'plugins', 'targets'];
export const top = [
  'ui-kit', 'ui', 'plugins', 'boards', 'studio', 'dev-mode', 'licenses',
  'nuxt-ui', 'react-native', 'templates', 'diagnostics', 'zapp', 'desktop-integration',
  'engines', 'diagnostics-vs-tsc', 'cheatsheet', 'figma-ui', 'zpk', 'ir-format',
];
export const patterns = [...dirs.map((d) => `${d}/*.md`), `{${top.join(',')}}.md`];
/** rel: a path inside docs/ with slashes, e.g. "guide/02-language.md". */
export const isPublished = (rel) => {
  const parts = rel.split('/');
  return parts.length === 1 ? top.includes(parts[0].replace(/\.md$/, '')) : parts.length === 2 && dirs.includes(parts[0]) && rel.endsWith('.md');
};
/** The route of a published doc: learn/README is the index of /docs/learn/. */
export const slugOf = (rel) => rel.replace(/\.md$/, '').toLowerCase().replace(/^learn\/readme$/, 'learn');
