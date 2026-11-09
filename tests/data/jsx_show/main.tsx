/** @jsxHelpers zinc:ui/kit/host */
import { Show } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { state, cleanup, cleanupCount } from './model';
let toggle: (value: boolean) => void = (value: boolean) => {};
let replace: (value: string[]) => void = (value: string[]) => {};
let disposed = 0;
function Row(p: { label: string }): i32 {
  cleanup(() => { disposed++; });
  return <Text>{p.label}</Text>;
}
export function App(): i32 {
  const [shown, setShown] = state<boolean>(true);
  const [items, setItems] = state<string[]>(['A', 'B']);
  toggle = setShown; replace = setItems;
  const rows: string[][] = [['nestedA'], ['nestedB']];
  return <View>
    <Show when={shown()} fallback={<Text>fallback</Text>}>{items().map((label: string) => <Row label={label} />)}</Show>
    <Show when={shown()}><Text>first</Text><Text>second</Text>{[1, 2].map((n: i32) => n + 10)}</Show>
    <Show when={shown()}><Text>single</Text></Show>
    <Show when={true}>{[7, 8]}</Show>
    <Show when={true}>{rows.map((row: string[]) => <View>{row.map((label: string) => <Text>{label}</Text>)}</View>)}</Show>
    <Show when={true} />
  </View>;
}
function texts(h: i32): string[] {
  const node = ui.inspectNode(h), out: string[] = [];
  if (node === null) return out;
  if (node.text !== '') out.push(node.text);
  for (const child of node.children) for (const text of texts(child)) out.push(text);
  return out;
}
function expect(want: string, cleanups: i32): void {
  cleanups = cleanupCount(cleanups);
  const got = texts(ui.rootNode()).join('|');
  if (got !== want || disposed !== cleanups) throw new Error('want ' + want + '/' + cleanups + ', got ' + got + '/' + disposed);
}
let frame = 0;
export function advance(dt: number): void {
  frame++;
  if (frame === 2) { expect('A|B|first|second|11,12|single|7,8|nestedA|nestedB', 0); toggle(false); }
  if (frame === 3) { expect('fallback|7,8|nestedA|nestedB', 2); toggle(true); }
  if (frame === 4) { expect('A|B|first|second|11,12|single|7,8|nestedA|nestedB', 2); replace(['C']); }
  if (frame === 5) { expect('C|first|second|11,12|single|7,8|nestedA|nestedB', 4); toggle(false); }
  if (frame === 6) { expect('fallback|7,8|nestedA|nestedB', 5); toggle(true); }
  if (frame === 7) { expect('C|first|second|11,12|single|7,8|nestedA|nestedB', 5); console.log('show children: ok'); }
}
