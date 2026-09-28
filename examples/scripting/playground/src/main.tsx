// Script playground: live-coded JavaScript (zinc:script) driving a Zinc canvas. The editor on the left is a kit-styled
// code textarea; its script runs in a sandboxed QuickJS context that can only draw through the functions the host
// exposes (rect, circle, ring, line, text, color, clear, time, width, height). Run with the button or ⌘/Ctrl+Enter,
// or let auto-run re-run it 400 ms after each edit. Errors show in the console with their line, marked in the gutter.
//
//   zinc run examples/scripting/playground
import { createSignal, createEffect, render, For } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { Button, Switch, Tabs, Badge, heading, mutedText, captionText, setTheme, DARK } from 'zinc:ui/kit';
import { run, drawFrame, logs, errorLine, stats, LogLine } from './runner';
import { NAMES, SAMPLES } from './samples';
import { env } from 'zinc:sys';

setTheme(DARK);
// ZINC_DEMO=<sample number> opens another sample (screenshots)
const first: i32 = Math.max(0, Math.min(SAMPLES.length - 1, parseInt(env('ZINC_DEMO') || '0') | 0));
const [sample, setSample] = createSignal<i32>(first);
const [code, setCode] = createSignal<string>(SAMPLES[first]);
const [auto, setAuto] = createSignal<boolean>(true);
let pending: i32 = -1;

function runNow(): void { run(code()); }
function edited(v: string): void {
  setCode(v);
  if (!auto()) return;
  if (pending >= 0) clearTimeout(pending);
  pending = setTimeout(() => { pending = -1; runNow(); }, 400);
}
function pick(i: i32): void { setSample(i); setCode(SAMPLES[i]); runNow(); }

/** Offset of the start of 1-based line n in s. */
function lineStart(s: string, n: i32): i32 {
  let at = 0;
  for (let l = 1; l < n; l++) { const k = s.indexOf('\n', at); if (k < 0) return s.length; at = k + 1; }
  return at;
}

function Editor(): i32 {
  const ed = <TextArea class="grow font-mono text-sm rounded-none border-0 pl-[14] pt-[10] bg-zinc-950 text-zinc-100 focus:border-zinc-950"
    lineNumbers wrap={false} value={code()} onInput={edited} highlight={(line: string) => ui.tsHighlight(line)} />;
  ui.setEditColors(ed, [0x52525b, 0xd4d4d8, -2, 0x3730a3, 0xa5b4fc, 0x27272a]);
  // the failing line: red background, a dot in the gutter, a squiggle under the code
  createEffect(() => {
    const n = errorLine(), s = code();
    if (n <= 0) { ui.setMarks(ed, []); return; }
    const a = lineStart(s, n), k = s.indexOf('\n', a), b = k < 0 ? s.length : k;
    let first = a;
    while (first < b && s.charCodeAt(first) === 32) first++;
    ui.setMarks(ed, [a, b, 0x7f1d1d, ui.MARK_LINE, first, b, 0xf87171, ui.MARK_SQUIGGLE, a, a, 0xef4444, ui.MARK_GUTTER]);
  });
  return ed;
}

function Console(): i32 {
  return <View class="h-[190px] flex-col bg-zinc-950 border-t border-zinc-800">
    <View class="flex-row items-center gap-2 px-4 h-9 border-b border-zinc-800">
      <Text class="text-xs font-semibold tracking-wider text-zinc-400">CONSOLE</Text>
      <View class="grow" />
      <Text class={captionText()}>{stats()}</Text>
    </View>
    <View class="flex-col px-4 py-2 gap-1 grow overflow-hidden justify-end">
      <For each={logs().slice(Math.max(0, logs().length - 8))}>{(l: LogLine) =>
        <Text class={`font-mono text-xs ${l.error ? 'text-red-400' : 'text-zinc-300'}`}>{(l.error ? '✕ ' : '› ') + l.text}</Text>}
      </For>
    </View>
  </View>;
}

function App(): i32 {
  return <View class="h-full flex-col bg-zinc-950">
    <View class="flex-row items-center gap-4 px-5 h-14 border-b border-zinc-800 bg-zinc-900">
      <Text class={heading(4)}>Script playground</Text>
      <Badge label="QuickJS" variant="accent" />
      <Tabs items={NAMES} selected={sample} onSelect={pick} class="w-[360px]" />
      <View class="grow" />
      <Switch checked={auto} onChange={setAuto} label="Auto-run" />
      <Button label="Run  ⌘↵" onClick={runNow} />
    </View>
    <View class="grow flex-row">
      <View class="w-[540px] flex-col border-r border-zinc-800"><Editor /></View>
      <View class="grow flex-col">
        <Canvas class="grow" onDraw={drawFrame} />
        <Console />
      </View>
    </View>
  </View>;
}

ui.onKey((e: ui.KeyEvent) => {
  if (e.key === 'Enter' && e.primary) { runNow(); e.preventDefault(); }
});

runNow();
render(App, 0x09090b, null);
