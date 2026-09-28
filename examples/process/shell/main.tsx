// Process runner: starts commands with zinc:process and streams their output into a scrolling list.
//   node compiler/bin/zinc.mjs run examples/process/shell     (from the zinc checkout: the commands use relative paths)
import { createSignal, render, For, NodeRef } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import * as proc from 'zinc:process';
import * as sys from 'zinc:sys';

class Line {
  text: string; err: boolean;
  constructor(text: string, err: boolean) { this.text = text; this.err = err; }
}
class Cmd {
  label: string; cmd: string; args: string[];
  constructor(label: string, cmd: string, args: string[]) { this.label = label; this.cmd = cmd; this.args = args; }
}
const CMDS: Cmd[] = [
  new Cmd('zinc plugins', 'node', ['compiler/bin/zinc.mjs', 'plugins']),
  new Cmd('ls -la', 'ls', ['-la']),
  new Cmd('stream', 'sh', ['-c', 'for i in 1 2 3 4 5 6 7 8 9 10; do echo "tick $i"; sleep 0.3; done; echo done >&2']),
  new Cmd('fail', 'sh', ['-c', 'echo "about to fail" >&2; exit 7']),
];
const MAX_LINES = 400;  // ponytail: plain list capped; a VirtualList once it exposes its node for auto-scroll

const [lines, setLines] = createSignal<Line[]>([]);
const [status, setStatus] = createSignal<string>('idle');
const [running, setRunning] = createSignal<boolean>(false);
let current: proc.Process | null = null;
let buf: Line[] = [];
let follow = 0;  // frames left to keep the end in view (the new content height is known after the next layout)
const log = new NodeRef();

function add(text: string, err: boolean): void {
  buf.push(new Line(text, err));
  if (buf.length > MAX_LINES) buf = buf.slice(buf.length - MAX_LINES);
  setLines(buf.slice());
  follow = 2;
}
function start(c: Cmd): void {
  if (current !== null) current.kill(9);
  buf = [];
  add('$ ' + c.cmd + ' ' + c.args.join(' '), false);
  const t0 = Date.now();
  try {
    const p = proc.spawn(c.cmd, c.args, {});
    current = p;
    setRunning(true);
    setStatus(`${c.label}: running, pid ${p.pid}`);
    p.onStdout((l: string) => { add(l, false); });
    p.onStderr((l: string) => { add(l, true); });
    p.onExit((code: i32) => {
      if (current === p) { current = null; setRunning(false); }
      setStatus(`${c.label}: exit code ${code} after ${Math.round(Date.now() - t0)} ms`);
    });
  } catch (e) { cannotStart(c, e); }
}
function cannotStart(c: Cmd, e: Error): void {
  add(e.message, true);
  setStatus(`${c.label}: cannot start`);
}

function App(): i32 {
  return <view class="flex-col h-full bg-slate-950">
    <view class="flex-row items-center gap-2 px-3 h-12 bg-slate-900">
      <For each={CMDS}>{(c: Cmd, _i: i32) =>
        <button class="px-3 h-8 rounded bg-slate-700 active:bg-slate-500" onClick={() => { start(c); }}>
          <text class="text-sm text-white">{c.label}</text>
        </button>}
      </For>
      <view class="grow"></view>
      <button class={running() ? 'px-3 h-8 rounded bg-red-600 active:bg-red-400' : 'px-3 h-8 rounded bg-slate-800'}
        onClick={() => { if (current !== null) current.kill(); }}>
        <text class="text-sm">Kill</text>
      </button>
    </view>
    <scroll ref={log} class="grow p-3 bg-slate-950">
      <For each={lines()}>{(l: Line, _i: i32) =>
        <text class={l.err ? 'text-xs text-red-400' : 'text-xs text-slate-200'}>{l.text}</text>}
      </For>
    </scroll>
    <view class="flex-row items-center px-3 h-7 bg-slate-900">
      <text class="text-xs text-emerald-400">{status()}</text>
    </view>
  </view>;
}

render(App, 0x020617, (_dt: number) => {
  if (follow > 0 && log.node >= 0) { ui.scrollTo(log.node, 0, 1000000); follow--; }
});
// SHELL_CMD=<index> picks the command started at launch (scripted screenshots)
const first = sys.env('SHELL_CMD');
start(CMDS[first === '' ? 2 : parseInt(first)]);
