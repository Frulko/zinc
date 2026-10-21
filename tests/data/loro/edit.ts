// zinc:loro end to end (tests/t1/loro.sh): one document edited through every container, peers that edit concurrently
// and sync by updates, events, history, presence; then the files Node's loro-crdt reads (LORO_DIR) and the fixture it wrote.
import { LoroDoc, LoroMap, LoroList, LoroText, LoroEventBatch, VersionVector, EphemeralStore, EphemeralStoreEvent, Change, OpId } from 'loro-crdt';
import { env } from 'zinc:sys';
import { readBytes, writeBytes, writeText, exists } from 'zinc:fs';

function json(v: unknown): string { return JSON.stringify(v); }

// ---- one document, every container
const a = new LoroDoc();
a.setPeerId(1);
a.setRecordTimestamp(false);
a.configTextStyle({ bold: { expand: 'after' }, link: { expand: 'none' } });
const seen: string[] = [];
a.subscribe((e: LoroEventBatch) => { seen.push(`${e.by}:${e.events.map((x) => `${x.path.length > 0 ? x.path[0] : '?'}`).join(',')}`); });
let localUpdates = 0;
a.subscribeLocalUpdates((u: u8[]) => { if (u.length > 0) localUpdates++; });

const meta = a.getMap('meta');
meta.set('title', 'Carnet');
meta.set('version', 3);
meta.set('props', { color: 'blue', sizes: [1, 2.5], ok: true, none: null });
const nested = meta.setContainer('nested', new LoroMap()) as LoroMap;
nested.set('k', 'v');
const tags = meta.setContainer('tags', new LoroList()) as LoroList;
tags.push('a');
tags.insert(0, 'z');
const inner = tags.insertContainer(2, new LoroMap()) as LoroMap;
inner.set('q', 2);
const text = a.getText('text');
text.insert(0, 'Hello 😀 world');
text.mark({ start: 0, end: 5 }, 'bold', true);
text.mark({ start: 9, end: 14 }, 'link', 'https://loro.dev');
const tree = a.getTree('blocks');
const root = tree.createNode();
root.data.set('id', 'page');
const p1 = root.createNode();
p1.data.set('id', 'p1');
const p2 = root.createNode();
p2.data.set('id', 'p2');
const p3 = root.createNode(0);
p3.data.set('id', 'p3');
const body = p1.data.setContainer('text', new LoroText()) as LoroText;
body.insert(0, 'first paragraph');
a.commit({ message: 'seed' });
console.log('json', json(a.toJSON()));
console.log('get', meta.get('title'), meta.get('version'), meta.get('nested') instanceof LoroMap, meta.get('tags') instanceof LoroList, meta.get('missing') === undefined, meta.keys().join(','), meta.size);
console.log('list', tags.length, json(tags.toArray().map((x) => x instanceof LoroMap ? 'map' : x)), tags.get(2) instanceof LoroMap);
console.log('text', text.toString(), text.length, json(text.toDelta()));
const rootParent = root.parent();
console.log('tree', tree.roots().length, json(root.children()!.map((n) => n.data.get('id'))), p1.parent()!.id === root.id, rootParent === undefined, p3.index());

// moves and deletes
p2.move(root, 0);
p3.move(p1);
tree.delete(p1.id);
text.unmark({ start: 9, end: 14 }, 'link');
text.delete(5, 3);
meta.delete('version');
tags.delete(0, 1);
a.commit({ message: 'edit', origin: 'test' });
const goneChildren = p1.children();
const unknownNode = tree.getNodeByID('99@99');
console.log('after', json(root.children()!.map((n) => n.data.get('id'))), tree.isNodeDeleted(p1.id), tree.isNodeDeleted(p2.id), goneChildren === undefined, tree.nodes().length, unknownNode === undefined);
console.log('text', json(text.toDelta()));
console.log('events', seen.join(' '), 'updates', localUpdates);

// ---- history
const changes = a.getAllChanges();
const list: Change[] = changes.get('1')!;
console.log('changes', changes.size, list.length, json(list.map((c) => `${c.counter}+${c.length} ${c.message}`)));
const first = list[0];
const at: OpId[] = [{ peer: '1', counter: first.counter + first.length - 1 }];
const latest = a.frontiers();
a.checkout(at);
console.log('checkout', a.isDetached(), text.toString(), json(tree.nodes().map((n) => tree.isNodeDeleted(n.id) ? 'x' : `${n.data.get('id')}`).sort((x, y) => x < y ? -1 : 1)));
a.checkoutToLatest();
console.log('latest', a.isDetached(), text.toString(), json(a.frontiers()) === json(latest), seen[seen.length - 1]);

// ---- concurrent text edits from two peers, synced by updates
const b = new LoroDoc();
b.setPeerId(2);
b.import(a.export({ mode: 'snapshot' }));
const c = LoroDoc.fromSnapshot(a.export({ mode: 'snapshot' }));
c.setPeerId(3);
const bv = b.oplogVersion();
const cv = c.oplogVersion();
b.getText('text').insert(0, '[B] ');
b.getText('text').insert(b.getText('text').length, ' (b)');
c.getText('text').insert(5, ' from C');
c.getMap('meta').set('title', 'Carnet C');
b.getMap('meta').set('title', 'Carnet B');
b.commit();
c.commit();
const fromB = b.export({ mode: 'update', from: cv });
const fromC = c.export({ mode: 'update', from: bv });
b.import(fromC);
c.import(fromB);
console.log('converge', b.getText('text').toString() === c.getText('text').toString(), json(b.toJSON()) === json(c.toJSON()));
console.log('merged', b.getText('text').toString(), b.getMap('meta').get('title'));

// live sync: every local update of b is imported by d
const d = LoroDoc.fromSnapshot(b.export({ mode: 'snapshot' }));
b.subscribeLocalUpdates((u: u8[]) => { d.import(u); });
let remote = 0;
d.subscribe((e: LoroEventBatch) => { if (e.by === 'import') remote++; });
b.getText('text').insert(0, '>');
b.commit();
b.getTree('blocks').createNode().data.set('id', 'live');
b.commit();
console.log('live', json(d.toJSON()) === json(b.toJSON()), remote);

// version vectors
const vv = b.version();
const vv2 = VersionVector.decode(vv.encode());
const peers: string[] = [];
vv2.toJSON().forEach((n: number, p: string) => { peers.push(`${p}:${n}`); });
console.log('vv', peers.sort((x, y) => x < y ? -1 : 1).join(' '), json(a.frontiersToVV(a.frontiers()).toJSON().get('1')));

// errors are LoroErrors, the document stays usable
let caught = '';
try { text.insert(999, 'x'); } catch (e) { caught = e instanceof Error ? e.name : 'other'; }
let caught2 = '';
try { a.import([1, 2, 3]); } catch (e) { caught2 = e instanceof Error ? e.name : 'other'; }
console.log('errors', caught, caught2, text.toString());

// ---- presence
const s1 = new EphemeralStore(30000);
const s2 = new EphemeralStore(30000);
const changed: string[] = [];
s2.subscribe((e: EphemeralStoreEvent) => { changed.push(`${e.by}+${e.added.join(',')}~${e.updated.join(',')}-${e.removed.join(',')}`); });
s1.set('alice', { cursor: 3, name: 'Alice' });
s2.apply(s1.encodeAll());
s1.set('bob', { cursor: 0, name: 'Bob' });
s2.apply(s1.encode('bob'));
s2.delete('bob');
console.log('presence', json(s2.get('alice')), s2.keys().join(','), json(s2.getAllStates()), changed.join(' '));

// ---- the files Node's loro-crdt reads (tests/data/loro/node.mjs), and the fixture it wrote
const dir = env('LORO_DIR');
if (dir !== '') {
  writeBytes(dir + '/zinc.snapshot', a.export({ mode: 'snapshot' }));
  writeBytes(dir + '/zinc.version', a.oplogVersion().encode());
  writeText(dir + '/zinc.json', json(a.toJSON()));
  writeText(dir + '/zinc-b.json', json(b.toJSON()));
  writeBytes(dir + '/zinc-b.updates', b.export({ mode: 'update' }));
  if (exists(dir + '/node.update')) {   // a peer of Node's edited the snapshot above: its update lands here
    a.import(readBytes(dir + '/node.update'));
    writeText(dir + '/zinc-after.json', json(a.toJSON()));
  }
}
const fixture = env('LORO_FIXTURE');
if (fixture !== '') {   // a document Node made: a snapshot, then an update on top of it
  const n = LoroDoc.fromSnapshot(readBytes(fixture + '/node.snapshot'));
  console.log('fixture snapshot', json(n.toJSON()));
  n.import(readBytes(fixture + '/node.update'));
  console.log('fixture update', json(n.toJSON()));
  console.log('fixture text', n.getText('text').toString(), json(n.getText('text').toDelta()));
}
