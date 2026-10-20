// One item of a conversation: the user's message, the header of an answer (agent, settings, live status), a
// paragraph, the model's reasoning, or a tool call as a card that opens on its input and output. A subagent's items
// are indented under its agent call, one step per level.
import { createNodeRef, createSignal, createEffect, onCleanup } from 'zinc:ui/solid';
import { Icon } from 'zinc:icons';
import { Item, K_USER, K_TURN, K_TEXT, K_TOOL, S_RUNNING, S_DONE, S_ERROR, S_STOPPED } from '../services/transcript';
import { toolIcon } from '../services/tools';
import { isAgentTool } from '../services/agents';
import { Chat } from '../services/chat';
import { pick, viewOutput } from '../state';
import { parse } from '../services/markdown';
import { Markdown, CopyButton } from './Markdown';
import { enter, enterOpacity, enterY, Spinner, still } from './motion';
import { Usage, usageLabel, activityText, summaryText } from '../services/usage';
import {
  SURFACE, SURFACE_HOVER, BORDER, TEXT, MUTED, FAINT, USER_BUBBLE, ERROR, SUCCESS, WARN, CODE, ACCENT, bg, fg, bd, color,
  sizeLabel, duration,
} from '../theme';

/** An item older than this is shown in place, without its entrance (a conversation opened again). */
const FRESH_MS = 600;
/** Indentation of one subagent level, px. */
const INDENT = 18;

/** Running (a spinner), done, failed or interrupted. */
export function StatusIcon(props: { item: Item; size: number }): i32 {
  const it = props.item;
  const running = (): boolean => it.status() === S_RUNNING;
  return <View className="w-[16] items-center">
    {running() && <Spinner size={props.size} color={() => color(ACCENT)} active={running} />}
    {it.status() === S_DONE && <Icon name="circle-check" size={props.size} color={() => color(SUCCESS)} />}
    {it.status() === S_ERROR && <Icon name="circle-x" size={props.size} color={() => color(ERROR)} />}
    {it.status() === S_STOPPED && <Icon name="ban" size={props.size} color={() => color(WARN)} />}
  </View>;
}

/** How long it ran, once it ended. */
export function took(it: Item): string { return it.status() === S_RUNNING || it.ended === 0 ? '' : duration(it.ended - it.started); }

/** `… 1.2 MB more · Show all` under a text whose whole is on disk. */
export function ShowAll(props: { item: Item }): i32 {
  const it = props.item;
  const sp = it.spill;
  if (sp === null) return <View />;
  return <View className="flex-row items-center gap-2">
    <Text className={`text-[11px] ${fg(FAINT)}`}>{`… ${sizeLabel(it.hidden(), false)} more on disk`}</Text>
    <View className={`px-2 h-[20] rounded items-center justify-center cursor-pointer hover:${bg(SURFACE_HOVER)}`} onPress={() => viewOutput(sp)}>
      <Text className={`text-[11px] font-semibold ${fg(ACCENT)}`}>Show all</Text>
    </View>
  </View>;
}

function UserBubble(props: { item: Item }): i32 {
  return <View className="flex-row justify-end">
    <View className={`max-w-[640] px-3 py-2 rounded-lg ${bg(USER_BUBBLE)}`}>
      <Text className={`select-text text-[14px] whitespace-pre-wrap ${fg(TEXT)}`}>{props.item.text()}</Text>
    </View>
  </View>;
}

function TurnHeader(props: { item: Item; chat: Chat }): i32 {
  const it = props.item;
  const running = (): boolean => it.status() === S_RUNNING;
  const end = (): string => {
    const u = it.usage();
    return u === null ? '' : usageLabel(u as Usage);
  };
  return <View className="flex-col gap-1 mt-2">
    <View className="flex-row items-center gap-2">
      <View className="w-[8] h-[8] rounded-full" style={{ backgroundColor: props.chat.agent.color }} />
      <Text className={`text-[12px] font-semibold ${fg(TEXT)}`}>{it.name}</Text>
      <Text className={`text-[11px] ${fg(FAINT)}`}>{it.text()}</Text>
      <Text className={`grow text-[11px] ${fg(FAINT)}`}>{end()}</Text>
      <CopyButton text={() => props.chat.answer(it)} label="Copy answer" />
    </View>
    <ActivityLine item={it} chat={props.chat} />
    {it.detail() !== '' && <Text className={`select-text text-[12px] whitespace-pre-wrap ${fg(ERROR)}`}>{it.detail()}</Text>}
  </View>;
}

/** Under a turn's header, as Claude Code does: while it runs, a spinner, what the agent does (`Reading src/app.ts…`, a rotating
 *  verb while it thinks), how long and how many tools; once over, `Used 12 tools · 3 agents · 41 s`, red when a tool failed or the
 *  turn did not end well. A click shows or folds the conversation's tool and subagent cards. */
function ActivityLine(props: { item: Item; chat: Chat }): i32 {
  const it = props.item, c = props.chat;
  const running = (): boolean => it.status() === S_RUNNING;
  // a clock for the elapsed time and the verb, ticking only while the turn runs
  const [tick, setTick] = createSignal<number>(Date.now());
  let timer: i32 = -1;
  createEffect(() => {
    if (running() && timer < 0) timer = setInterval(() => setTick(Date.now()), 1000);
    else if (!running() && timer >= 0) { clearInterval(timer); timer = -1; }
  });
  onCleanup(() => { if (timer >= 0) clearInterval(timer); });
  const live = (): string => {
    const elapsed = tick() - it.started;
    const a = c.active();
    const what = a === null ? activityText('', '', elapsed) : activityText((a as Item).name, (a as Item).text(), elapsed);
    const n = c.turnTools();
    return `${what} · ${Math.max(0, Math.floor(elapsed / 1000))} s${n > 0 ? ` · ${n === 1 ? '1 tool' : `${n} tools`}` : ''}`;
  };
  const bad = (): boolean => it.failed > 0 || it.status() === S_ERROR || it.status() === S_STOPPED;
  const marker = (): string => {
    const parts: string[] = [];
    if (it.failed > 0) parts.push(it.failed === 1 ? '1 failed' : `${it.failed} failed`);
    if (it.status() === S_STOPPED) parts.push('interrupted');
    else if (it.status() === S_ERROR) parts.push('error');
    return parts.join(' · ');
  };
  const shown = (): boolean => running() || it.tools > 0 || bad();
  return <View className={`flex-row items-center gap-2 h-[24] px-1 -ml-1 rounded self-start cursor-pointer hover:${bg(SURFACE_HOVER)} ${shown() ? '' : 'hidden'}`}
    aria-label={c.showTools() ? 'Hide tools' : 'Show tools'} onPress={() => c.setShowTools(!c.showTools())}>
    {running()
      ? <Spinner size={13} color={() => color(ACCENT)} active={running} />
      : <Icon name={c.showTools() ? 'chevron-down' : 'chevron-right'} size={12} color={() => color(FAINT)} />}
    <Text className={`text-[12px] ${fg(running() ? TEXT : MUTED)}`}>{running() ? live() : summaryText(it.tools, it.agents, took(it))}</Text>
    {!running() && bad() && <View className={`w-[7] h-[7] rounded-full ${bg(ERROR)}`} />}
    {!running() && bad() && <Text className={`text-[12px] ${fg(ERROR)}`}>{marker()}</Text>}
  </View>;
}

function Paragraph(props: { item: Item }): i32 {
  const it = props.item;
  const sub = it.depth > 0;
  // streaming: plain text as it comes; finished: its markdown, parsed once (at most its TEXT_CAP head)
  return <View className="flex-col gap-1 max-w-[760]">
    {it.status() === S_RUNNING
      ? <Text className={`select-text ${sub ? 'text-[12px]' : 'text-[14px]'} whitespace-pre-wrap ${fg(sub ? MUTED : TEXT)}`}>{it.text()}</Text>
      : <Markdown blocks={parse(it.text())} small={sub} />}
    <ShowAll item={it} />
  </View>;
}

function Thinking(props: { item: Item }): i32 {
  const it = props.item;
  return <View className="flex-col gap-1 max-w-[760] cursor-pointer" onPress={() => it.setOpen(!it.open())}>
    <View className="flex-row items-center gap-2">
      <Icon name="brain" size={13} color={() => color(FAINT)} />
      <Text className={`grow shrink min-w-0 truncate text-[12px] ${fg(FAINT)}`}>{it.open() ? 'Thinking' : `Thinking: ${it.text()}`}</Text>
    </View>
    {it.open() && <Text className={`select-text text-[12px] whitespace-pre-wrap ${fg(MUTED)}`}>{it.text()}</Text>}
  </View>;
}

/** The input and output of a tool call, as an open card and the detail panel show them. */
export function ToolBody(props: { item: Item }): i32 {
  const it = props.item;
  return <View className="flex-col gap-2">
    {it.detail() !== '' && <Text className={`select-text font-mono text-[11px] whitespace-pre-wrap ${fg(MUTED)}`}>{it.detail()}</Text>}
    {it.output() !== '' && <View className={`rounded p-2 ${bg(CODE)}`}>
      <Text className={`select-text font-mono text-[11px] whitespace-pre-wrap ${fg(it.status() === S_ERROR ? ERROR : TEXT)}`}>{it.output()}</Text>
    </View>}
    {it.output() === '' && it.status() !== S_RUNNING && <Text className={`text-[11px] ${fg(FAINT)}`}>no output</Text>}
    <ShowAll item={it} />
  </View>;
}

function ToolCard(props: { item: Item }): i32 {
  const it = props.item;
  const agentCall = isAgentTool(it.name);
  return <View className={`flex-col max-w-[760] rounded-md border ${bd(BORDER)} ${bg(SURFACE)}`}>
    <View className={`flex-row items-center gap-2 h-[30] px-2 rounded-md cursor-pointer transition-colors duration-150 hover:${bg(SURFACE_HOVER)}`}
      onPress={() => it.setOpen(!it.open())}>
      <Icon name={it.open() ? 'chevron-down' : 'chevron-right'} size={12} color={() => color(FAINT)} />
      <Icon name={toolIcon(it.name)} size={14} color={() => color(agentCall ? ACCENT : MUTED)} />
      <Text className={`text-[12px] font-semibold ${fg(TEXT)}`}>{it.name}</Text>
      <Text className={`grow shrink min-w-0 truncate text-[12px] font-mono ${fg(MUTED)}`}>{it.text()}</Text>
      {agentCall && <Text className={`text-[11px] ${fg(FAINT)}`}>{it.note()}</Text>}
      <Text className={`text-[11px] ${fg(FAINT)}`}>{it.status() === S_RUNNING && still() ? 'running' : took(it)}</Text>
      <View className={`h-[20] px-1 rounded items-center justify-center cursor-pointer hover:${bg(SURFACE_HOVER)}`} onPress={() => pick(it)}>
        <Icon name="panel-right-open" size={13} color={() => color(FAINT)} />
      </View>
      <StatusIcon item={it} size={14} />
    </View>
    {it.open() && <View className="px-3 pb-3"><ToolBody item={it} /></View>}
  </View>;
}

export function ItemRow(props: { item: Item; chat: Chat }): i32 {
  const it = props.item;
  const fresh = Date.now() - it.started < FRESH_MS;
  if (fresh) enter(it.ref, 8);
  const inner = (): i32 => {
    if (it.kind === K_USER) return <UserBubble item={it} />;
    if (it.kind === K_TURN) return <TurnHeader item={it} chat={props.chat} />;
    if (it.kind === K_TOOL) return <ToolCard item={it} />;
    if (it.kind === K_TEXT) return <Paragraph item={it} />;
    return <Thinking item={it} />;
  };
  // a subagent's items hang under a guide line, one indentation per level
  // a turn's tool and subagent cards fold into its activity line unless the conversation shows them
  const folded = (): boolean => (it.kind === K_TOOL || it.depth > 0) && !props.chat.showTools();
  return <View ref={it.ref} className={`flex-col ${it.depth > 0 ? `border-l pl-3 ${bd(BORDER)}` : ''} ${folded() ? 'hidden' : ''}`}
    style={{ marginLeft: it.depth > 0 ? (it.depth - 1) * INDENT + 10 : 0, opacity: fresh ? enterOpacity() : 1, translateY: fresh ? enterY(8) : 0 }}>
    {inner()}
  </View>;
}
