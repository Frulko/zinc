// The Threads view of Zinc Inspector: the program's workers (zinc:worker) as Zinc.getThreads lists them, refreshed every second while the view
// is open: state, the messages waiting each way, the messages posted each way, the worker's live heap blocks, its CPU time and what ended it.
import { createSignal } from 'zinc:ui/solid';
import { ThreadInfo, threadsOf } from './model';
import { call, view } from './state';
import { Btn } from './widgets';

export const [threads, setThreads] = createSignal<ThreadInfo[]>([]);
let polling = false;

export async function loadThreads(): Promise<void> { setThreads(threadsOf(await call('Zinc.getThreads', '{}'))); }

/** Starts the refresh once; it stops itself when another view is open, and the tab starts it again. */
export function watchThreads(): void {
  if (polling) return;
  polling = true;
  const tick = async (): Promise<void> => {
    if (view() !== 'threads') { polling = false; return; }
    await loadThreads();
    setTimeout(() => { tick(); }, 1000);
  };
  tick();
}

export function threadLine(t: ThreadInfo): string {
  return t.name + ': ' + t.state + ', queued ' + t.queuedIn + ' in / ' + t.queuedOut + ' out, messages ' + t.messagesIn + ' in / ' + t.messagesOut + ' out, ' +
    t.liveBlocks + ' live blocks, CPU ' + Math.round(t.cpuMs) + ' ms' + (t.error.length > 0 ? ', error: ' + t.error : '');
}

function Cell(p: { text: string; width: string }): i32 { return <Text className={'text-xs font-mono text-slate-800 ' + p.width}>{p.text}</Text>; }

function Row(p: { t: ThreadInfo }): i32 {
  const state = p.t.state === 'running' ? 'text-emerald-700' : p.t.state === 'ended' ? 'text-slate-500' : 'text-rose-700';
  return <View className="flex-col px-2 py-1 border-b">
    <View className="flex-row items-center gap-2">
      <Text className="text-xs font-medium text-slate-900 w-64">{p.t.name}</Text>
      <Text className={'text-xs w-20 ' + state}>{p.t.state}</Text>
      <Cell text={p.t.queuedIn + ' / ' + p.t.queuedOut} width="w-20" />
      <Cell text={p.t.messagesIn + ' / ' + p.t.messagesOut} width="w-24" />
      <Cell text={'' + p.t.liveBlocks} width="w-20" />
      <Cell text={Math.round(p.t.cpuMs) + ' ms'} width="w-20" />
    </View>
    {p.t.error.length > 0 ? <Text className="text-xs text-rose-700">{p.t.error}</Text> : <View />}
  </View>;
}

export function ThreadsView(): i32 {
  return <View className="flex-col flex-1 min-h-0">
    <View className="flex-row flex-wrap items-center gap-2 p-1 border-b">
      <Btn label="Refresh" onClick={() => { loadThreads(); }} />
      <Text className="text-xs text-slate-500">{threads().length === 0 ? 'no worker running (the main thread only)' : threads().length + (threads().length === 1 ? ' worker' : ' workers')}</Text>
    </View>
    <View className="flex-col flex-1 min-h-0 overflow-x-auto">
    <View className="flex-row items-center gap-2 px-2 py-1 border-b bg-slate-50">
      <Text className="text-xs text-slate-500 w-64">thread</Text>
      <Text className="text-xs text-slate-500 w-20">state</Text>
      <Text className="text-xs text-slate-500 w-20">queued in/out</Text>
      <Text className="text-xs text-slate-500 w-24">messages in/out</Text>
      <Text className="text-xs text-slate-500 w-20">live blocks</Text>
      <Text className="text-xs text-slate-500 w-20">CPU</Text>
    </View>
    <ScrollView className="flex-1"><View className="flex-col">{threads().map((t: ThreadInfo) => <Row t={t} />)}</View></ScrollView>
    </View>
  </View>;
}
