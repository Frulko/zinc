// The raw build output in a drawer: the last lines in a monospace scroll view, following the bottom until you scroll up.
import { For, Show, createNodeRef } from 'zinc:ui/solid';
import { scrollTo } from 'zinc:ui';
import { Icon } from 'zinc:icons';
import { PROTOCOL_STEP, PROTOCOL_ERROR } from '../constants';

export type LogViewProps = { lines: () => string[]; open?: () => boolean; onToggle?: () => void };

function colorOf(line: string): string {
  if (line.startsWith(PROTOCOL_ERROR)) return '#d70015';
  if (line.startsWith(PROTOCOL_STEP)) return '#007aff';
  return '#6e6e73';
}

export function LogView(p: LogViewProps): i32 {
  const area = createNodeRef();
  const open = (): boolean => p.open === undefined ? true : p.open();
  return <View className="flex-col rounded-[8px] overflow-hidden bg-white border border-[#e3e3e8]">
    <View className="flex-row items-center shrink-0 h-11 px-3 gap-2">
      <Button aria-label="Details" className="flex-row items-center justify-start gap-1.5 grow py-1" onClick={() => { if (p.onToggle !== undefined) p.onToggle(); }}>
        <Icon name={open() ? 'chevron-down' : 'chevron-right'} size={14} color={() => 0x6e6e73} />
        <Text className="text-[13px] font-semibold text-[#1d1d1f]">Details</Text>
        <Text className="text-xs text-[#8e8e93]">{p.lines().length + ' lines'}</Text>
      </Button>
      <Show when={open()}><Button aria-label="Latest output" className="flex-row items-center gap-1.5 py-1 px-2 rounded-md hover:bg-[#f2f2f7]" onClick={() => scrollTo(area.node, 0, 10000000)}><Icon name="arrow-down" size={12} color={() => 0x007aff} /><Text className="text-xs text-[#007aff]">Latest output</Text></Button></Show>
    </View>
    <Show when={open()}><View className="h-[240px] border-t border-[#ececf0] bg-[#fafafc]">
      <ScrollView ref={area} stickToBottom aria-label="Build output" className="grow basis-0 min-h-0">
        <View className="flex-col p-3 gap-1">
          <Show when={p.lines().length === 0}><View className="flex-col gap-2 py-4"><Text className="font-mono text-xs text-[#8e8e93]">Waiting for the first line…</Text><Text className="text-xs text-[#8e8e93]">Scroll up to read; use Latest output to follow again.</Text></View></Show>
          <For each={p.lines()}>{(line: string, i: i32) => <Text className={`font-mono text-xs leading-[18px] text-[${colorOf(line)}]`}>{line}</Text>}</For>
        </View>
      </ScrollView>
    </View></Show>
  </View>;
}
