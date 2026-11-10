// The playground's existing path -> source map, also used by Atelier. No server stores the program.
export const PROJECT_LINK_LIMIT: i32 = 8192;
export const PROJECT_SOURCE_LIMIT: i32 = 1048576;
export function projectFiles(value: any): any {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected project files.');
  const paths = Object.keys(value);
  if (paths.length === 0 || paths.length > 128) throw new Error('A link needs 1 to 128 source files.');
  let size: i32 = 0, code = false;
  for (const path of paths) {
    if (path.length > 240 || /[\u0000-\u001f\u007f\\:]/.test(path) || path.split('/').some((part: string) => part === '' || part === '.' || part === '..' || part.startsWith('.')) || path === '__proto__' || path === 'constructor' || path === 'prototype') throw new Error('Invalid project path: ' + path);
    if (!(path.endsWith('.ts') || path.endsWith('.tsx') || path.endsWith('.js') || path.endsWith('.json')) || typeof value[path] !== 'string') throw new Error('Links hold source and JSON files only.');
    size += value[path].length;
    if (size > PROJECT_SOURCE_LIMIT) throw new Error('The project is too large for a link.');
    if (path.endsWith('.ts') || path.endsWith('.tsx') || path.endsWith('.js')) code = true;
  }
  if (!code) throw new Error('The link has no program.');
  return value;
}
export function projectLink(files: any): string {
  const link = 'https://frulko.github.io/zinc/play/#files-json/' + encodeURIComponent(JSON.stringify(projectFiles(files)));
  if (link.length > PROJECT_LINK_LIMIT) throw new Error('The program is too large for a link. Share the .zapp file instead.');
  return link;
}
export function projectLinkFiles(link: string): any {
  if (link.length > PROJECT_LINK_LIMIT) throw new Error('The link is too long.');
  const at = link.indexOf('#files-json/');
  if (at < 0) throw new Error('Expected a /play/ source link.');
  return projectFiles(JSON.parse(decodeURIComponent(link.slice(at + 12))));
}
