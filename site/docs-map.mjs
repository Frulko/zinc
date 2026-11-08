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
/** The docs navigation: [group, ids] in order (Learn, Start, Guides, Targets, Reference, Plugins, Concepts), from the published ids
 *  ("guide/02-language", lower-cased like the collection's). Shared by the sidebar (DocPage.astro) and llms.txt (llms.mjs). */
export const groupsOf = (ids) => {
  const dir = (p) => ids.filter((x) => x.startsWith(`${p}/`)).sort((x, y) => (/\/readme$/.test(x) ? -1 : /\/readme$/.test(y) ? 1 : x.localeCompare(y)));
  const only = (list) => list.filter((x) => ids.includes(x));
  return [
    ['learn', dir('learn')],
    ['start', only(['start/choose', ...dir('start').filter((x) => x !== 'start/choose')])],
    ['guides', [...dir('guide'), ...only(['ui-kit', 'nuxt-ui', 'react-native', 'templates', 'boards', 'dev-mode', 'desktop-integration', 'zapp', 'studio', 'figma-ui'])]],
    ['targets', dir('targets')],
    ['reference', [...only(['reference/syntax', 'diagnostics', 'cheatsheet']), ...dir('reference').filter((x) => x !== 'reference/syntax'), ...only(['ui', 'plugins', 'zpk', 'licenses'])]],
    ['plugins', dir('plugins')],
    ['concepts', only(['engines', 'diagnostics-vs-tsc', 'ir-format'])],
  ].map(([g, l]) => [g, [...new Set(l)]]).filter(([, l]) => l.length > 0);
};
