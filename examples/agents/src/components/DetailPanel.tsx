// The right panel: the current turn's subagents and tools, live, and one of them in full when it is picked (from this
// list or from a card's panel button). Folded with the button at the right of the tabs.
import { Icon } from 'zinc:icons';
import { Chat, PANEL_TOOLS } from '../services/chat';
import { Item, S_RUNNING } from '../services/transcript';
import { toolIcon } from '../services/tools';
import { current, picked, pick } from '../state';
import { StatusIcon, ToolBody, took } from './ItemView';
import { SURFACE, SURFACE_HOVER, SELECTED, BORDER, TEXT, MUTED, FAINT, ACCENT, bg, fg, bd, color } from '../theme';

function Title(props: { text: string }): i32 {
  return <Text className={`text-[11px] font-semibold mt-3 mb-1 px-2 ${fg(FAINT)}`}>{props.text}</Text>;
}

function CallRow(props: { item: Item }): i32 {
  const it = props.item;
  return <View className={`flex-row items-center gap-2 h-[26] px-2 rounded cursor-pointer ${picked() === it ? bg(SELECTED) : ''} hover:${bg(SURFACE_HOVER)}`}
    style={{ marginLeft: it.depth * 12 }} onPress={() => pick(it)}>
    <Icon name={toolIcon(it.name)} size={13} color={() => color(MUTED)} />
    <Text className={`text-[12px] ${fg(TEXT)}`}>{it.name}</Text>
    <Text className={`grow shrink min-w-0 truncate text-[11px] font-mono ${fg(FAINT)}`}>{it.text()}</Text>
    <Text className={`text-[10px] ${fg(FAINT)}`}>{took(it)}</Text>
    <StatusIcon item={it} size={12} />
  </View>;
}

function AgentRow(props: { item: Item }): i32 {
  const it = props.item;
  return <View className={`flex-col px-2 py-1 rounded cursor-pointer ${picked() === it ? bg(SELECTED) : ''} hover:${bg(SURFACE_HOVER)}`}
    style={{ marginLeft: it.depth * 12 }} onPress={() => pick(it)}>
    <View className="flex-row items-center gap-2">
      <Icon name="bot" size={14} color={() => color(ACCENT)} />
      <Text className={`grow shrink min-w-0 truncate text-[12px] font-semibold ${fg(TEXT)}`}>{it.text() === '' ? it.name : it.text()}</Text>
      <StatusIcon item={it} size={12} />
    </View>
    <Text className={`text-[11px] pl-[22] ${fg(FAINT)}`}>{it.note() === '' ? (it.status() === S_RUNNING ? 'starting' : '') : it.note()}</Text>
  </View>;
}

/** One call in full: its name, status, how long it ran, its input and output. */
function Picked(props: { item: Item }): i32 {
  const it = props.item;
  return <View className={`flex-col gap-2 m-2 p-3 rounded-md border ${bd(BORDER)}`}>
    <View className="flex-row items-center gap-2">
      <Icon name={toolIcon(it.name)} size={15} color={() => color(TEXT)} />
      <Text className={`grow shrink min-w-0 truncate text-[13px] font-semibold ${fg(TEXT)}`}>{it.name}</Text>
      <Text className={`text-[11px] ${fg(FAINT)}`}>{took(it)}</Text>
      <StatusIcon item={it} size={14} />
      <View className={`w-[20] h-[20] rounded items-center justify-center cursor-pointer hover:${bg(SURFACE_HOVER)}`} onPress={() => pick(null)}>
        <Icon name="x" size={12} color={() => color(FAINT)} />
      </View>
    </View>
    {it.text() !== '' && <Text className={`text-[12px] font-mono ${fg(MUTED)}`}>{it.text()}</Text>}
    {it.note() !== '' && <Text className={`text-[11px] ${fg(FAINT)}`}>{it.note()}</Text>}
    <ToolBody item={it} />
  </View>;
}

function TurnLists(props: { chat: Chat }): i32 {
  const c = props.chat;
  return <View className="flex-col">
    {c.panelAgents().length > 0 && <Title text={`AGENTS · ${c.panelAgents().length}`} />}
    {c.panelAgents().map((a: Item) => <AgentRow item={a} />)}
    <Title text={c.turnTools() > PANEL_TOOLS ? `TOOLS · the last ${PANEL_TOOLS} of ${c.turnTools()}` : `TOOLS · ${c.turnTools()}`} />
    {c.turnTools() === 0 && <Text className={`text-[12px] px-2 ${fg(FAINT)}`}>The tools of the turn show here as they run.</Text>}
    <For each={c.panelTools()}>{(t: Item, i: i32) => <CallRow item={t} />}</For>
  </View>;
}

export function DetailPanel(): i32 {
  return <View className={`w-[320] shrink-0 flex-col border-l ${bg(SURFACE)} ${bd(BORDER)}`}>
    <View className="flex-row items-center h-[36] px-3 shrink-0">
      <Text className={`grow text-[11px] font-semibold ${fg(MUTED)}`}>THIS TURN</Text>
    </View>
    <ScrollView className="grow flex-col px-1 pb-3">
      {picked() !== null && <Picked item={picked() as Item} />}
      {current() !== null && <TurnLists chat={current() as Chat} />}
    </ScrollView>
  </View>;
}
