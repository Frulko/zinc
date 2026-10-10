// Checks project files without opening a window: one line per file with what it holds, or the field at fault.
//   zinc run examples/museum-table/src/check.ts -- [--save copy.json] project.json...
// `--save` writes the canonical form of the next file there (what the editor's Save writes). Exit code 1 when a file is refused.
import { args, exit } from 'zinc:sys';
import { readText, writeText } from 'zinc:fs';
import { parseProject, serializeProject, copyProject, unreachable, assetFiles, Project, Text, Colours, View } from './project';

/** Changes every object of `p` that a careless copy could share with its source. */
function scramble(p: Project): void {
  const text = (t: Text): void => { for (const lang of t.keys()) t.set(lang, (t.get(lang) ?? '') + '!'); };
  const colours = (c: Colours): void => { c.background ^= 0xffffff; c.paper ^= 0xffffff; c.ink ^= 0xffffff; c.text ^= 0xffffff; c.muted ^= 0xffffff; c.accent ^= 0xffffff; };
  const view = (v: View): void => { v.yaw += 1; v.pitch += 1; v.distance += 1; v.fov += 1; };
  text(p.title); p.languages.push('xx'); colours(p.theme); p.accessibility.textSizes.push(9); colours(p.accessibility.highContrast);
  p.table.width += 1; p.kiosk.attractAfter += 1;
  for (const m of p.media) {
    text(m.title); text(m.date); text(m.medium); text(m.description); text(m.audioDescription); text(m.text); text(m.transcript);
    m.credit.source += '!'; view(m.view);
    for (const q of m.points) { text(q.title); text(q.text); q.at[0] += 1; view(q.view); }
    m.points.pop();
  }
  for (const s of p.sequences) {
    text(s.title); text(s.text);
    for (const it of s.items) it.x += 1;
    for (const l of s.links) { text(l.label); l.x += 1; }
    s.items.pop(); s.links.pop();
  }
  for (const r of p.presentations) { text(r.title); r.path.push('x'); }
  p.media.pop(); p.sequences.pop(); p.presentations.pop();
}

let refused = false, save = '';
const a = args();
for (let i = 0; i < a.length; i++) {
  if (a[i] === '--save' && i + 1 < a.length) { save = a[++i]; continue; }
  const name = a[i].slice(a[i].lastIndexOf('/') + 1);
  try {
    const source = readText(a[i]);
    const p = parseProject(source);
    const canonical = serializeProject(p);
    const kinds = new Map<string, i32>();
    for (const m of p.media) kinds.set(m.kind, (kinds.get(m.kind) ?? 0) + 1);
    const media: string[] = [];
    for (const k of kinds.keys()) media.push(`${kinds.get(k) ?? 0} ${k}`);
    let items = 0, links = 0, points = 0;
    for (const s of p.sequences) { items += s.items.length; links += s.links.length; }
    for (const m of p.media) points += m.points.length;
    console.log(`${name}: ok, "${p.id}" version ${p.version}, languages ${p.languages.join(' ')}, media: ${media.join(', ')}; ${p.sequences.length} sequences, ${items} items, ` +
      `${links} links, ${points} points, ${p.presentations.length} presentations, ${assetFiles(p).length} files, ${canonical === source ? 'canonical' : 'not canonical'}`);
    // a copy says the same and shares nothing: changing all of it leaves the source as it was
    const copy = copyProject(p);
    const same = serializeProject(copy) === canonical;
    scramble(copy);
    if (!same || serializeProject(p) !== canonical || serializeProject(copy) === canonical) { console.log(`${name}: copyProject gives another project or shares objects with its source`); refused = true; }
    const lost = unreachable(p);
    if (lost.length > 0) console.log(`${name}: no link leads to ${lost.join(', ')}`);
    if (save.length > 0) { writeText(save, canonical); save = ''; }
  } catch (e) {
    console.log(`${name}: ${e.message}`);
    refused = true;
  }
}
if (refused) exit(1);
