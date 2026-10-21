// The loro-crdt side of tests/t1/loro.sh: Node with the npm package loro-crdt (LORO_CRDT names a directory whose node_modules has it).
//   node node.mjs check <dir>    reads the snapshot and the updates edit.ts wrote, checks Node gets the same JSON, then edits the
//                                document as peer 9 and writes that update (node.update) and the JSON it expects (node-after.json)
//   node node.mjs after <dir>    checks the JSON edit.ts wrote after importing node.update (zinc-after.json) is node-after.json
//   node node.mjs fixture <dir>  writes the committed fixture: node.snapshot, then node.update on top of it
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const { LoroDoc, VersionVector } = createRequire(join(process.env.LORO_CRDT ?? process.cwd(), 'package.json'))('loro-crdt');
const [mode, dir] = process.argv.slice(2);
const sorted = (v) => Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])])) : v;
const canon = (v) => JSON.stringify(sorted(v));
const read = (f) => readFileSync(join(dir, f));
let failed = 0;
function same(what, got, want) {
  if (canon(got) === canon(want)) console.log(`node: ${what}: same`);
  else { failed = 1; console.log(`node: ${what}: differs\n  node ${canon(got)}\n  zinc ${canon(want)}`); }
}

if (mode === 'check') {
  const doc = new LoroDoc();
  doc.import(read('zinc.snapshot'));
  same('snapshot', doc.toJSON(), JSON.parse(read('zinc.json')));
  const b = new LoroDoc();
  b.import(read('zinc-b.updates'));
  same('updates of three peers', b.toJSON(), JSON.parse(read('zinc-b.json')));
  // a peer of Node's edits the document Zinc made, and sends only what Zinc does not have
  const zincVersion = VersionVector.decode(read('zinc.version'));
  doc.setPeerId(9);
  doc.getText('text').insert(0, 'Node: ');
  doc.getText('text').mark({ start: 0, end: 4 }, 'bold', true);
  doc.getMap('meta').set('from', 'node');
  const page = doc.getTree('blocks').roots()[0];
  page.createNode(0).data.set('id', 'n1');
  doc.commit({ message: 'from node' });
  writeFileSync(join(dir, 'node.update'), doc.export({ mode: 'update', from: zincVersion }));
  writeFileSync(join(dir, 'node-after.json'), JSON.stringify(doc.toJSON()));
} else if (mode === 'after') {
  same('node update imported by zinc', JSON.parse(read('zinc-after.json')), JSON.parse(read('node-after.json')));
} else if (mode === 'fixture') {
  const doc = new LoroDoc();
  doc.setPeerId(7);
  doc.configTextStyle({ bold: { expand: 'after' } });
  doc.getText('text').insert(0, 'Written by loro-crdt');
  doc.getText('text').mark({ start: 11, end: 20 }, 'bold', true);
  const m = doc.getMap('meta');
  m.set('title', 'node fixture');
  m.set('n', 42);
  const node = doc.getTree('blocks').createNode();
  node.data.set('id', 'root');
  doc.commit();
  writeFileSync(join(dir, 'node.snapshot'), doc.export({ mode: 'snapshot' }));
  const v = doc.oplogVersion();
  doc.setPeerId(8);
  doc.getText('text').insert(0, '» ');
  m.set('n', 43);
  node.createNode().data.set('id', 'child');
  doc.commit();
  writeFileSync(join(dir, 'node.update'), doc.export({ mode: 'update', from: v }));
  console.log(canon(doc.toJSON()));
} else {
  console.error('usage: node node.mjs check|after|fixture <dir>');
  failed = 2;
}
process.exit(failed);
