// The graded examples (learn/catalog.txt, the one list `zinc examples` and Atelier read), for the gallery (pages/examples/).
// Each runs from public/play/<name>/, its `zinc export --target web` written by tools/site-examples; its sources are read here, at build time.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('..');   // the site builds from site/
const CODE = /\.(ts|tsx|js|jsx|json)$/;

export type Example = {
  name: string; stars: number; module: string; path: string; title: string; line: string; lesson: string;
  lessonPage: string;   // the docs/learn page of the lesson, without .md
  width: number; height: number;   // its window (zinc.json app.window), the size the frame gives it
  missing: string[];    // native sides with no browser backend: it runs at home only
};
export const modules = ['drawing', 'scene', 'canvas', 'interface'];

const lessons = fs.readdirSync(path.join(ROOT, 'docs/learn')).filter((f) => /^\d\d-.*\.md$/.test(f));
const exported = new Map(fs.readFileSync(path.join(ROOT, 'site/public/play/examples.txt'), 'utf8').split('\n')
  .filter((l) => l.trim() && !l.startsWith('#')).map((l) => { const [n, , ...m] = l.split(' '); return [n, m] as [string, string[]]; }));

export const examples: Example[] = fs.readFileSync(path.join(ROOT, 'learn/catalog.txt'), 'utf8').split('\n')
  .filter((l) => l.trim() && !l.startsWith('#'))
  .map((l) => {
    const [name, stars, module, p, title, line, lesson] = l.split('|');
    let width = 640, height = 400;
    try { const w = JSON.parse(fs.readFileSync(path.join(ROOT, p, 'zinc.json'), 'utf8')).app?.window; if (w?.width) width = w.width; if (w?.height) height = w.height; } catch {}
    if (!exported.has(name)) throw new Error(`${name} is not exported: run tools/site-examples`);
    const lessonPage = lesson ? (lessons.find((f) => f.startsWith(lesson + '-')) ?? '').replace(/\.md$/, '') : '';
    return { name, stars: Number(stars), module, path: p, title, line, lesson, lessonPage, width, height, missing: exported.get(name)! };
  });

// The files shown beside the program: its code, the entry first (assets and build folders left out).
export function sources(e: Example): { file: string; text: string }[] {
  const dir = path.join(ROOT, e.path), out: string[] = [];
  const walk = (d: string) => {
    for (const n of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (n.isDirectory()) { if (!['assets', 'build', 'node_modules', 'dist', '.zinc'].includes(n.name)) walk(path.join(d, n.name)); }
      else if (CODE.test(n.name)) out.push(path.relative(dir, path.join(d, n.name)));
    }
  };
  walk(dir);
  out.sort((a, b) => Number(/(^|\/)main\.tsx?$/.test(b)) - Number(/(^|\/)main\.tsx?$/.test(a)));
  return out.map((file) => ({ file, text: fs.readFileSync(path.join(dir, file), 'utf8') }));
}

export const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(4 - n);
