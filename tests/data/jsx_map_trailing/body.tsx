/** @jsxHelpers zinc:ui/kit/host */
import * as ui from 'zinc:ui';
import { renderSlot } from 'zinc:ui/kit/host';
import { imported, importedCalls } from './rows';
import { equal, ok } from 'zinc:assert';
let sourceCalls: i32 = 0, inlineCalls: i32 = 0, namedCalls: i32 = 0, nestedCalls: i32 = 0;
function items(): i32[] { sourceCalls++; return [0, 1]; }
function named(n: i32): i32 { namedCalls++; return <Button aria-label={'named' + n}><Text>{n}</Text></Button>; }
function wrap(make: () => i32): i32 { return make(); }
export function App(): i32 {
  return <View>
    <View aria-label="direct-a">{items().map((n: i32) => <Button aria-label={'direct' + n}><Text>{n}</Text></Button>)}</View>
    <View aria-label="direct-b">{items().map((n: i32) => <Button aria-label={'direct' + n}><Text>{n}</Text></Button>, /* trailing */)}</View>
    <View aria-label="block-a">{[0, 1].map((n: i32) => { inlineCalls++; const node = <Button aria-label={'block' + n}><Text>{n}</Text></Button>; return node; })}</View>
    <View aria-label="block-b">{[0, 1].map((n: i32) => { inlineCalls++; const node = <Button aria-label={'block' + n}><Text>{n}</Text></Button>; return node; },)}</View>
    <View aria-label="named-a">{[0, 1].map(named)}</View>
    <View aria-label="named-b">{[0, 1].map(named,)}</View>
    <View aria-label="import-a">{[0, 1].map(imported)}</View>
    <View aria-label="import-b">{[0, 1].map(imported,)}</View>
    <View aria-label="indexed-a">{[3, 4].map((n: i32, index: i32) => <Button aria-label={'index' + n + ':' + index}><Text>{n}</Text></Button>)}</View>
    <View aria-label="indexed-b">{[3, 4].map((n: i32, index: i32) => <Button aria-label={'index' + n + ':' + index}><Text>{n}</Text></Button>,)}</View>
    <View aria-label="nested-a">{[0, 1].map((row: i32) => <View>{[0, 1].map((col: i32) => renderSlot(() => { nestedCalls++; return (<Button aria-label={'cell' + row + ':' + col}><Text>{col}</Text></Button>); }))}</View>)}</View>
    <View aria-label="nested-b">
      {[0, 1].map((row: i32) => (
        <View>{[0, 1].map((col: i32) =>
          renderSlot(() => {
            nestedCalls++;
            return (<Button aria-label={'cell' + row + ':' + col}><Text>{col}</Text></Button>);
          },),
        )}</View>
      ),)}
    </View>
    <View aria-label="conditional-a">{true ? [0, 1].map((n: i32) => <Button aria-label={'cond' + n}><Text>{n}</Text></Button>) : <View />}</View>
    <View aria-label="conditional-b">{true ? [0, 1].map((n: i32) => <Button aria-label={'cond' + n}><Text>{n}</Text></Button>,) : <View />}</View>
    <View aria-label="wrapped-a">{wrap(() => <Button aria-label="wrapped"><Text>wrapped</Text></Button>)}</View>
    <View aria-label="wrapped-b">{wrap(() => <Button aria-label="wrapped"><Text>wrapped</Text></Button>,)}</View>
    <View aria-label="numbers-a">{[0, 1].map((n: i32) => n + 10)}</View>
    <View aria-label="numbers-b">{[0, 1].map((n: i32) => n + 10,)}</View>
  </View>;
}
function find(h: i32, label: string): i32 {
  const n = ui.inspectNode(h); if (n === null) return -1;
  if (n.label === label) return h;
  for (const child of n.children) { const got = find(child, label); if (got >= 0) return got; }
  return -1;
}
function labels(h: i32): string {
  const n = ui.inspectNode(h); if (n === null) return '';
  let result = n.label === '' ? '' : n.label + ',';
  for (const child of n.children) result += labels(child);
  return result;
}
function texts(h: i32): string {
  const n = ui.inspectNode(h); if (n === null) return '';
  let result = n.text;
  for (const child of n.children) result += texts(child);
  return result;
}
function pair(name: string, expected: string): void {
  const a = find(ui.rootNode(), name + '-a'), b = find(ui.rootNode(), name + '-b');
  ok(a >= 0 && b >= 0, name + ' groups');
  const left = ui.inspectNode(a), right = ui.inspectNode(b);
  if (left === null || right === null) throw new Error(name + ' missing nodes');
  let x = '', y = '';
  for (const child of left.children) x += labels(child);
  for (const child of right.children) y += labels(child);
  equal(x, expected, name + ' control'); equal(y, expected, name + ' trailing');
  equal(texts(a), texts(b), name + ' text content');
}
export function verify(): void {
  pair('direct', 'direct0,direct1,'); pair('block', 'block0,block1,');
  pair('named', 'named0,named1,'); pair('import', 'imported0,imported1,');
  pair('indexed', 'index3:0,index4:1,'); pair('nested', 'cell0:0,cell0:1,cell1:0,cell1:1,');
  pair('conditional', 'cond0,cond1,'); pair('wrapped', 'wrapped,');
  equal(texts(find(ui.rootNode(), 'numbers-a')), '10,11'); equal(texts(find(ui.rootNode(), 'numbers-b')), '10,11');
  equal(sourceCalls, 2, 'receiver evaluated once'); equal(inlineCalls, 4, 'block callback once'); equal(namedCalls, 4, 'named callback once');
  equal(importedCalls(), 4, 'imported callback once'); equal(nestedCalls, 8, 'nested callback once');
  console.log('jsx map trailing: pass');
}
