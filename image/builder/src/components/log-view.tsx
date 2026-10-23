// The last lines a build printed, in a monospace scroll view; the lines for apps ("::step"...) stand out.
import { For, Show, createNodeRef } from 'zinc:ui/solid';
import { scrollTo } from 'zinc:ui';
import { Icon } from 'zinc:icons';
import { PROTOCOL_STEP, PROTOCOL_ERROR } from '../constants';

export type LogViewProps = { lines: () => string[] };

function colorOf(line: string): string {
  if (line.startsWith(PROTOCOL_ERROR)) return '#ffb7a8';
  if (line.startsWith(PROTOCOL_STEP)) return '#c5dda8';
  return '#a1b19d';
}

export function LogView(p: LogViewProps): i32 {
  const area = createNodeRef();
  return <View className="flex-col grow basis-0 min-h-[120px] rounded-[8px] overflow-hidden bg-[#17291f] border border-[#3b5040]">
    <View className="flex-row items-center shrink-0 h-10 px-3 gap-2 border-b border-[#304535]">
      <Icon name="terminal" size={14} color={() => 0x879e7e} /><Text className="font-mono text-[10px] text-[#a7bc99]">BUILD OUTPUT</Text>
      <View className="grow" />
      <Button aria-label="Latest output" className="flex-row items-center gap-1.5 py-1 px-2 rounded-md bg-[#2d4433] hover:bg-[#3b5441]" onClick={() => scrollTo(area.node, 0, 10000000)}><Icon name="arrow-down" size={12} color={() => 0xbad69f} /><Text className="text-[10px] text-[#c5dda8]">Latest output</Text></Button>
    </View>
    <ScrollView ref={area} stickToBottom aria-label="Build output" className="grow basis-0 min-h-0">
      <View className="flex-col p-3 gap-1">
        <Show when={p.lines().length === 0}><View className="flex-col gap-2 py-4"><Text className="font-mono text-xs text-[#8da081]">Waiting for the first line…</Text><Text className="text-xs text-[#70876a]">Build progress will appear here. Scroll up to read; use Latest output to follow again.</Text></View></Show>
        <For each={p.lines()}>{(line: string, i: i32) => <Text className={`font-mono text-xs leading-[18px] text-[${colorOf(line)}]`}>{line}</Text>}</For>
      </View>
    </ScrollView>
  </View>;
}
