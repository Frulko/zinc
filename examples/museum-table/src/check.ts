// Checks project files without opening a window: one line per file with what it holds, or the field at fault.
//   zinc run examples/museum-table/src/check.ts -- [--save copy.json] project.json...
// `--save` writes the canonical form of the next file there (what the editor's Save writes). Exit code 1 when a file is refused.
import { args, exit } from 'zinc:sys';
import { readText, writeText } from 'zinc:fs';
import { parseProject, serializeProject, unreachable, assetFiles, Media, Sequence } from './project';

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
    const lost = unreachable(p);
    if (lost.length > 0) console.log(`${name}: no link leads to ${lost.join(', ')}`);
    if (save.length > 0) { writeText(save, canonical); save = ''; }
  } catch (e) {
    console.log(`${name}: ${e.message}`);
    refused = true;
  }
}
if (refused) exit(1);
