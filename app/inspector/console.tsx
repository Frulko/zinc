// The Console of Zinc Inspector: the program's console lines (Runtime.consoleAPICalled; those from before the attach replayed), the last
// 200, errors in red, filtered by text; a long line wraps (its height is the splitter's above it).
import { createSignal } from 'zinc:ui/solid';
import { consoleLine } from './model';
import { Field } from './widgets';
import { consoleH } from './state';

export const [logs, setLogs] = createSignal<string[]>([]);
const [filter, setFilter] = createSignal<string>('');

export function onConsole(params: any): void {
  const l = logs().slice(logs().length > 199 ? logs().length - 199 : 0);
  l.push(consoleLine(params));
  setLogs(l);
}

export function ConsolePane(): i32 {
  return <View className="flex-col bg-slate-50 overflow-hidden" style={{ height: consoleH() }}>
    <View className="flex-row flex-wrap items-center gap-2 px-2 py-1">
      <Text className="text-xs font-medium text-slate-600">Console</Text>
      <Field value={filter} width="w-40" onInput={(v: string) => { setFilter(v); }} onChange={(v: string) => {}} />
    </View>
    <ScrollView className="flex-1">
      <View className="flex-col px-2">{logs().filter((l: string) => filter().length === 0 || l.toLowerCase().indexOf(filter().toLowerCase()) >= 0).map((l: string) =>
        <Text className={'text-xs font-mono break-all ' + (l.startsWith('error') ? 'text-red-700' : 'text-slate-800')}>{l}</Text>)}</View>
    </ScrollView>
  </View>;
}
