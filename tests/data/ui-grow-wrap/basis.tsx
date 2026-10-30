// A text that grows from a width of 0 in a row (Tailwind's `flex-1 w-0`, the width as its flex-basis): it wraps at the width it gets, with
// or without style runs, and the row is as tall as its lines; two such columns still share the row equally (the basis stays 0).
import { render, createNodeRef, NodeRef, onMount } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { quit } from 'zinc:gfx';
const LONG = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen';
const rows: NodeRef[] = [];
function Row(p: { runs: boolean; twice: boolean }): i32 {
  const r = createNodeRef(), t = createNodeRef();
  rows.push(r);
  if (p.runs) onMount(() => { ui.setTextRuns(t.node, [4, ui.RUN_BOLD, 0xff0000]); });
  return <View ref={r} className="flex-row items-start w-full">
    <View className="w-3 h-4" />
    <Text ref={t} className="flex-1 w-0 text-xs break-words">{LONG}</Text>
    {p.twice ? <Text className="flex-1 w-0 text-xs">{LONG}</Text> : <Text className="ml-1 text-xs">end</Text>}
  </View>;
}
let f = 0;
render(() => <View className="flex-col w-[200px]">
  <Row runs={false} twice={false} />
  <Row runs={true} twice={false} />
  <Row runs={false} twice={true} />
</View>, 0xffffff, (dt: number) => {
  if (++f !== 3) return;
  for (const r of rows) {
    const n = ui.inspectNode(r.node) as ui.UiNode, out: string[] = [];
    for (const c of n.children) { const k = ui.inspectNode(c) as ui.UiNode; if (k.tag === ui.TEXT) out.push(Math.round(k.lw) + ' wide, ' + k.lines.length + ' lines'); }
    console.log('row ' + Math.round(n.lh) + ' px high: ' + out.join(' | '));
  }
  quit();
});
