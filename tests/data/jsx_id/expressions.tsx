import * as ui from 'zinc:ui';
import { equal } from 'zinc:assert';
import { createSignal, createNodeRef } from 'zinc:ui/solid';
import { attr } from './probe';
const host = createNodeRef(), list = createNodeRef(), ternary = createNodeRef(), template = createNodeRef();
const nullableHost = createNodeRef(), nullableList = createNodeRef(), numberId = createNodeRef();
const [step, setStep] = createSignal<i32>(0);
let calls: i32 = 0;
function composed(prefix: string, n: i32): string { calls++; return prefix + n; }
function optional(n: i32): string | null | undefined { calls++; return n === 1 ? null : n === 2 ? undefined : 'optional'; }
export function App(): i32 {
  return <View>
    <View ref={host} id={composed('host-', step()) + '-end'} />
    <VirtualList ref={list} count={1} itemHeight={20} id={composed('list-', step()) + '-end'}>{(i: i32) => <Text>{i}</Text>}</VirtualList>
    <View ref={ternary} id={step() === 0 ? 'before' : 'after'} />
    <VirtualList ref={template} count={1} itemHeight={20} id={`template-${step()}`}>{(i: i32) => <Text>{i}</Text>}</VirtualList>
    <View ref={nullableHost} id={optional(step())} />
    <VirtualList ref={nullableList} count={1} itemHeight={20} id={optional(step())}>{(i: i32) => <Text>{i}</Text>}</VirtualList>
    <View ref={numberId} id={42} />
  </View>;
}
let frame: i32 = 0;
export function advance(dt: number): void {
  frame++;
  if (frame < 2 || frame > 5) return;
  const n = frame - 2;
  equal(attr(host.node, 'id'), 'host-' + n + '-end', 'composed host id');
  equal(attr(list.node, 'id'), 'list-' + n + '-end', 'composed virtual id');
  equal(attr(ternary.node, 'id'), n === 0 ? 'before' : 'after', 'nonnull ternary id');
  equal(attr(template.node, 'id'), 'template-' + n, 'template virtual id');
  equal(attr(nullableHost.node, 'id'), n === 1 || n === 2 ? '' : 'optional', 'nullable host id');
  equal(attr(nullableList.node, 'id'), n === 1 || n === 2 ? '' : 'optional', 'nullable virtual id');
  equal(attr(numberId.node, 'id'), '42', 'existing String conversion');
  equal(calls, (n + 1) * 4, 'each ID expression evaluated once per update');
  if (n < 3) setStep(n + 1); else console.log('jsx-id expressions: pass');
}
