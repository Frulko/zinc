// Log viewer (bottom): build output and the running app's console, with level filters, a text filter and
// automatic scrolling to the end.
import { createSignal, createNodeRef, For } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { LogLine, LEVELS, logLines, clearLog } from '../runner';
import { IconButton, PanelHeader, Icon, HSep, C_SOFT } from './kit';

const [hidden, setHidden] = createSignal<string[]>([]);
const [filter, setFilter] = createSignal<string>('');
const scroller = createNodeRef();
let follow = 0;      // frames left to keep the end in view (the height is known after the next layout)
let seen = 0;

function visible(): LogLine[] {
  const h = hidden(), f = filter().toLowerCase();
  return logLines().filter((l: LogLine) => h.indexOf(l.level === 'studio' ? 'build' : l.level === 'debug' ? 'log' : l.level) < 0 && (f === '' || l.text.toLowerCase().includes(f)));
}
function toggle(level: string): void {
  const h = hidden().slice(), i = h.indexOf(level);
  if (i >= 0) h.splice(i, 1); else h.push(level);
  setHidden(h);
}
function levelClass(level: string): string {
  if (level === 'error') return 'text-red-600';
  if (level === 'warn') return 'text-amber-600';
  if (level === 'info') return 'text-sky-700';
  if (level === 'studio') return 'text-violet-600';
  if (level === 'build') return 'text-zinc-400';
  return 'text-zinc-500';
}
function Row(l: LogLine): i32 {
  return <view class={l.level === 'error' ? 'flex-row gap-3 px-3 py-[1] bg-red-50' : l.level === 'warn' ? 'flex-row gap-3 px-3 py-[1] bg-amber-50' : 'flex-row gap-3 px-3 py-[1]'}>
    <text class="text-[11] font-mono text-zinc-400">{l.time}</text>
    <text class={`w-[44] text-[11] font-mono ${levelClass(l.level)}`}>{l.level.toUpperCase()}</text>
    <text class={l.level === 'build' ? 'text-[12] font-mono text-zinc-500' : 'text-[12] font-mono text-zinc-800'}>{l.text}</text>
  </view>;
}
function Chip(level: string): i32 {
  return <button class={hidden().indexOf(level) < 0 ? 'h-[22] px-2 rounded-md bg-zinc-900 cursor-pointer' : 'h-[22] px-2 rounded-md border border-zinc-200 bg-white hover:bg-zinc-50 cursor-pointer'}
    onClick={() => toggle(level)}>
    <text class={hidden().indexOf(level) < 0 ? 'text-[11] font-medium text-white' : 'text-[11] font-medium text-zinc-500'}>{level}</text>
  </button>;
}

/** Keeps the newest line in view (call every frame). */
export function tickLogs(): void {
  const n = logLines().length;
  if (n !== seen) { seen = n; follow = 2; }
  if (follow > 0 && scroller.node >= 0) { ui.scrollTo(scroller.node, 0, 10000000); follow--; }
}

export function LogPanel(): i32 {
  return <view class="flex-col h-[200] bg-white">
    <HSep />
    <PanelHeader title="Log" icon="terminal">
      <view class="flex-row items-center gap-1">
        <For each={LEVELS}>{(l: string, _i: i32) => Chip(l)}</For>
        <view class="flex-row items-center gap-1 ml-2 px-2 h-[24] w-[180] rounded-md border border-zinc-200">
          <Icon name="search" color={C_SOFT} size={12} />
          <input class="grow h-[22] text-[12] text-zinc-900 bg-white border-0" placeholder="Filter" value={filter()} onInput={(v: string) => setFilter(v)} />
        </view>
        <IconButton icon="clear" onClick={() => clearLog()} />
      </view>
    </PanelHeader>
    <scroll ref={scroller} class="grow py-1 bg-white">
      <For each={visible()}>{(l: LogLine, _i: i32) => Row(l)}</For>
    </scroll>
  </view>;
}
