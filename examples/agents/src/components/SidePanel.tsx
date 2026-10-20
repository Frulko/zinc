// The side panel of the activity picked in the activity bar, as in VS Code:
// - Conversations, organised like Orca: each folder, then its conversations (agent, title, status, how long ago),
//   with a search box and « + » for a new one;
// - Folders: the ones offered, and a field to add one;
// - Agents: the CLIs found with their configuration under ~;
// - Settings: the colour scheme, where conversations are kept and what the app holds in memory.
import { createSignal } from 'zinc:ui/solid';
import { Icon } from 'zinc:icons';
import { ConfigFile, shortPath } from '../services/discovery';
import { Chat, WINDOW_MAX, WINDOW_CHARS } from '../services/chat';
import { S_ERROR, S_STOPPED, OUTPUT_HEAD, TEXT_CAP } from '../services/transcript';
import { LINE_CAP } from '../services/stream';
import {
  AgentInfo, agents, agent, selectAgent, folders, folder, selectFolder, addFolder, viewFile, viewed, chats, current, openChat,
  newChat, activity, ACT_CHATS, ACT_FOLDERS, ACT_AGENTS, schemeChoice, setSchemeChoice, now, DATA_DIR, limitsRefresh, setLimitsRefresh,
} from '../state';
import { Limit, resetsIn, REFRESH_MIN, REFRESH_MAX } from '../services/usage';
import { SURFACE, SURFACE_HOVER, SELECTED, BORDER, TEXT, MUTED, FAINT, ERROR, WARN, ACCENT, bg, fg, bd, color, sizeLabel, ago } from '../theme';

const TITLES = ['CONVERSATIONS', 'FOLDERS', 'AGENTS', 'SETTINGS'];

function SectionTitle(props: { text: string }): i32 {
  return <Text className={`text-[11px] font-semibold mt-4 mb-1 px-2 ${fg(FAINT)}`}>{props.text}</Text>;
}

/** A configuration file: opens in the main pane; a file holding credentials is listed, never opened. */
export function FileRow(props: { file: ConfigFile }): i32 {
  const f = props.file;
  return <View className={`flex-row items-center gap-2 h-[24] px-2 rounded ${f.secret ? '' : 'cursor-pointer'} ${viewed() === f ? bg(SELECTED) : ''} hover:${bg(SURFACE_HOVER)}`}
    onPress={() => { if (!f.secret) viewFile(f); }}>
    <Icon name={f.secret ? 'lock' : f.isDirectory ? 'folder' : 'file-text'} size={13} color={() => color(FAINT)} />
    <Text className={`grow shrink min-w-0 truncate text-[12px] ${fg(f.secret ? FAINT : MUTED)}`}>{f.label}</Text>
    <Text className={`text-[11px] ${fg(FAINT)}`}>{f.secret ? 'secret' : sizeLabel(f.size, f.isDirectory)}</Text>
  </View>;
}

function name(path: string): string { const i = path.lastIndexOf('/'); return i < 0 ? path : path.slice(i + 1); }

/** The status dot's colour class: running (accent), failed (red), interrupted (amber), idle (grey). */
export function statusDot(c: Chat): string {
  if (c.busy()) return bg(ACCENT);
  const o = c.outcome();
  return bg(o === S_ERROR ? ERROR : o === S_STOPPED ? WARN : FAINT);
}

function ConversationRow(props: { chat: Chat }): i32 {
  const c = props.chat;
  const on = (): boolean => current() === c;
  return <View className={`flex-row items-center gap-2 h-[40] pl-6 pr-2 rounded-md cursor-pointer ${on() ? bg(SELECTED) : ''} hover:${bg(on() ? SELECTED : SURFACE_HOVER)}`}
    onPress={() => openChat(c)}>
    <View className={`w-[7] h-[7] rounded-full ${statusDot(c)}`} />
    <View className="grow shrink min-w-0 flex-col">
      <Text className={`truncate text-[12px] ${fg(on() ? TEXT : MUTED)}`}>{c.title() === '' ? 'New conversation' : c.title()}</Text>
      <View className="flex-row items-center gap-1">
        <View className="w-[6] h-[6] rounded-full" style={{ backgroundColor: c.agent.color }} />
        <Text className={`text-[10px] ${fg(FAINT)}`}>{c.busy() ? `${c.agent.name} · running` : c.agent.name}</Text>
      </View>
    </View>
    <Text className={`text-[10px] ${fg(FAINT)}`}>{ago(c.updated(), now())}</Text>
  </View>;
}

function FolderGroup(props: { path: string; list: Chat[] }): i32 {
  const [open, setOpen] = createSignal(true);
  return <View className="flex-col">
    <View className={`flex-row items-center gap-1 h-[28] px-1 rounded cursor-pointer hover:${bg(SURFACE_HOVER)}`} onPress={() => setOpen(!open())}>
      <Icon name={open() ? 'chevron-down' : 'chevron-right'} size={12} color={() => color(FAINT)} />
      <Icon name={open() ? 'folder-open' : 'folder'} size={14} color={() => color(props.path === folder() ? TEXT : MUTED)} />
      <Text className={`grow shrink min-w-0 truncate text-[12px] font-semibold ${fg(TEXT)}`}>{name(props.path)}</Text>
      <Text className={`text-[10px] ${fg(FAINT)}`}>{`${props.list.length}`}</Text>
      <View className={`w-[20] h-[20] rounded items-center justify-center hover:${bg(SELECTED)}`} onPress={() => newChat(props.path, agent())}>
        <Icon name="plus" size={13} color={() => color(MUTED)} />
      </View>
    </View>
    {open() && <View className="flex-col">{props.list.map((c: Chat) => <ConversationRow chat={c} />)}</View>}
  </View>;
}

function Conversations(): i32 {
  const [query, setQuery] = createSignal('');
  /** Folders that have conversations, the selected one first; each with its conversations matching the search. */
  const groups = (): string[] => {
    const q = query().trim().toLowerCase();
    const out: string[] = folder() !== '' ? [folder()] : [];
    for (const c of chats()) if (out.indexOf(c.folder) < 0 && (q === '' || c.title().toLowerCase().indexOf(q) >= 0)) out.push(c.folder);
    return out;
  };
  const listOf = (path: string): Chat[] => {
    const q = query().trim().toLowerCase();
    return chats().filter((c: Chat) => c.folder === path && (c.title() !== '' || c === current())
      && (q === '' || c.title().toLowerCase().indexOf(q) >= 0 || name(c.folder).toLowerCase().indexOf(q) >= 0));
  };
  return <View className="grow min-h-0 flex-col">
    <View className="flex-row items-center gap-2 px-2 pb-2">
      <View className={`grow flex-row items-center gap-2 h-[28] px-2 rounded border ${bg(SURFACE)} ${bd(BORDER)}`}>
        <Icon name="search" size={13} color={() => color(FAINT)} />
        <Input className={`grow h-[26] text-[12px] bg-transparent border-0 p-0 ${fg(TEXT)}`} value={query()} onInput={setQuery} placeholder="Search conversations" />
      </View>
      <View className={`w-[28] h-[28] rounded items-center justify-center cursor-pointer border ${bd(BORDER)} hover:${bg(SURFACE_HOVER)}`}
        onPress={() => { if (folder() !== '') newChat(folder(), agent()); }}>
        <Icon name="plus" size={14} color={() => color(TEXT)} />
      </View>
    </View>
    <ScrollView className="grow flex-col px-2 pb-3">
      {groups().length === 0 && <Text className={`text-[12px] px-2 ${fg(FAINT)}`}>No folder yet: add one in Folders.</Text>}
      {groups().map((p: string) => <FolderGroup path={p} list={listOf(p)} />)}
    </ScrollView>
  </View>;
}

function FolderRow(props: { path: string }): i32 {
  const count = (): i32 => chats().filter((c: Chat) => c.folder === props.path && c.title() !== '').length;
  return <View className={`flex-row items-center gap-2 h-[28] px-2 rounded-md cursor-pointer ${folder() === props.path ? bg(SELECTED) : ''} hover:${bg(SURFACE_HOVER)}`}
    onPress={() => selectFolder(props.path)}>
    <Icon name="folder" size={14} color={() => color(folder() === props.path ? TEXT : FAINT)} />
    <Text className={`grow shrink min-w-0 truncate text-[12px] ${fg(folder() === props.path ? TEXT : MUTED)}`}>{shortPath(props.path)}</Text>
    {count() > 0 && <Text className={`text-[10px] ${fg(FAINT)}`}>{`${count()}`}</Text>}
  </View>;
}

/** A field to add a folder by its path; Enter adds it, a path that is not a folder turns the field red. */
function AddFolder(): i32 {
  const [typed, setTyped] = createSignal('');
  const [wrong, setWrong] = createSignal(false);
  const submit = (): void => {
    if (addFolder(typed())) { setTyped(''); setWrong(false); } else setWrong(true);
  };
  return <View className="px-1 mb-1" onSubmit={submit}>
    <Input className={`w-full h-[28] px-2 rounded text-[12px] border ${bg(SURFACE)} ${fg(TEXT)} ${bd(wrong() ? ERROR : BORDER)}`}
      value={typed()} onInput={(v: string) => { setTyped(v); setWrong(false); }} placeholder="Add a folder: ~/path/to/project" />
  </View>;
}

function Folders(): i32 {
  return <ScrollView className="grow flex-col px-2 pb-3">
    <AddFolder />
    {folders().map((p: string) => <FolderRow path={p} />)}
  </ScrollView>;
}

function AgentRow(props: { info: AgentInfo }): i32 {
  const a = props.info;
  const status = (): string => a.binary === '' ? 'not installed' : a.version() !== '' ? a.version() : 'installed';
  return <View className="flex-col">
    <View className={`flex-row items-center gap-2 h-[34] px-2 rounded-md cursor-pointer ${agent() === a ? bg(SELECTED) : ''} hover:${bg(SURFACE_HOVER)}`}
      onPress={() => selectAgent(a)}>
      <View className="w-[8] h-[8] rounded-full" style={{ backgroundColor: a.agent.color }} />
      <Text className={`grow text-[13px] font-semibold ${fg(TEXT)}`}>{a.agent.name}</Text>
      <Text className={`text-[11px] ${fg(a.binary === '' ? ERROR : FAINT)}`}>{status()}</Text>
    </View>
    {a.binary !== '' && <Limits info={a} />}
    {agent() === a && <View className="flex-col pl-3">
      {a.config.length === 0 && <Text className={`text-[12px] px-2 ${fg(FAINT)}`}>no configuration in ~</Text>}
      {a.config.map((f: ConfigFile) => <FileRow file={f} />)}
    </View>}
  </View>;
}

/** The plan's usage windows as the CLI tells them: a bar, the share used and when it resets; « unknown » when it does not. */
function Limits(props: { info: AgentInfo }): i32 {
  const a = props.info;
  const list = (): Limit[] => { const l = a.limits(); return l === null ? [] : l as Limit[]; };
  const checked = (): string => a.checking() ? 'checking…' : a.limitsAt() === 0 ? '' : `checked ${ago(a.limitsAt(), now())}${ago(a.limitsAt(), now()) === 'now' ? '' : ' ago'}`;
  return <View className="flex-col gap-1 pl-6 pr-2 pb-2">
    {list().map((x: Limit) => <View className="flex-col gap-1">
      <View className="flex-row items-center gap-2">
        <Text className={`grow text-[11px] ${fg(MUTED)}`}>{x.name}</Text>
        <Text className={`text-[11px] ${fg(x.used >= 90 ? ERROR : x.used >= 70 ? WARN : TEXT)}`}>{`${Math.round(x.used)}% used`}</Text>
      </View>
      <View className={`h-[4] rounded-full ${bg(SELECTED)}`}>
        <View className={`h-[4] rounded-full ${bg(x.used >= 90 ? ERROR : x.used >= 70 ? WARN : ACCENT)}`} style={{ width: `${Math.max(2, Math.min(100, x.used))}%` }} />
      </View>
      <Text className={`text-[10px] ${fg(FAINT)}`}>{resetsIn(x.resets, now())}</Text>
    </View>)}
    {a.limits() === null && a.limitsAt() > 0 && <Text className={`text-[11px] ${fg(FAINT)}`}>Usage limits: unknown (the CLI does not expose them)</Text>}
    <View className="flex-row items-center gap-1">
      <Text className={`grow text-[10px] ${fg(FAINT)}`}>{checked()}</Text>
      <View className={`flex-row items-center gap-1 h-[20] px-1 rounded cursor-pointer hover:${bg(SURFACE_HOVER)}`} aria-label="Refresh limits" onPress={() => a.refreshLimits()}>
        <Icon name="refresh-cw" size={11} color={() => color(FAINT)} />
        <Text className={`text-[10px] ${fg(MUTED)}`}>Refresh</Text>
      </View>
    </View>
  </View>;
}

function Agents(): i32 {
  return <ScrollView className="grow flex-col px-2 pb-3">
    {agents.map((a: AgentInfo) => <AgentRow info={a} />)}
  </ScrollView>;
}

function SchemeButton(props: { value: string; label: string; icon: string }): i32 {
  const on = (): boolean => schemeChoice() === props.value;
  return <View className={`grow flex-row items-center justify-center gap-1 h-[28] rounded cursor-pointer ${on() ? bg(SELECTED) : ''} hover:${bg(SURFACE_HOVER)}`}
    onPress={() => setSchemeChoice(props.value)}>
    <Icon name={props.icon} size={13} color={() => color(on() ? TEXT : MUTED)} />
    <Text className={`text-[12px] ${fg(on() ? TEXT : MUTED)}`}>{props.label}</Text>
  </View>;
}

function Line(props: { text: string }): i32 {
  return <Text className={`text-[12px] px-2 py-1 ${fg(MUTED)}`}>{props.text}</Text>;
}

function Step(props: { icon: string; label: string; onPress: () => void; off: boolean }): i32 {
  return <View className={`w-[24] h-[24] rounded items-center justify-center border ${bd(BORDER)} ${props.off ? '' : `cursor-pointer hover:${bg(SURFACE_HOVER)}`}`}
    aria-label={props.label} onPress={() => { if (!props.off) props.onPress(); }}>
    <Icon name={props.icon} size={12} color={() => color(props.off ? FAINT : TEXT)} />
  </View>;
}

function Settings(): i32 {
  return <ScrollView className="grow flex-col px-2 pb-3">
    <SectionTitle text="THEME" />
    <View className={`flex-row gap-1 p-1 mx-1 rounded-md border ${bd(BORDER)}`}>
      <SchemeButton value="dark" label="Dark" icon="moon" />
      <SchemeButton value="light" label="Light" icon="sun" />
      <SchemeButton value="auto" label="System" icon="monitor" />
    </View>
    <SectionTitle text="USAGE LIMITS" />
    <View className="flex-row items-center gap-2 px-2 py-1">
      <Text className={`grow text-[12px] ${fg(MUTED)}`}>Check every</Text>
      <Step icon="minus" label="Less often" onPress={() => setLimitsRefresh(limitsRefresh() - 1)} off={limitsRefresh() <= REFRESH_MIN} />
      <Text className={`w-[44] text-center text-[12px] ${fg(TEXT)}`}>{`${limitsRefresh()} min`}</Text>
      <Step icon="plus" label="More often" onPress={() => setLimitsRefresh(limitsRefresh() + 1)} off={limitsRefresh() >= REFRESH_MAX} />
    </View>
    <Line text="Each agent's plan limits, as its CLI tells them without a model call; a turn's own report updates them too. The app never reads a login file." />
    <SectionTitle text="CONVERSATIONS" />
    <Line text={`Kept in ${shortPath(DATA_DIR)}/chats`} />
    <Line text="The agent keeps the context in its own session: the app sends only the new message." />
    <SectionTitle text="MEMORY" />
    <Line text={`At most ${WINDOW_MAX} items and ${sizeLabel(WINDOW_CHARS, false)} of text in memory per conversation shown; the rest is read from disk when you scroll to it.`} />
    <Line text={`A paragraph keeps ${sizeLabel(TEXT_CAP, false)}, a tool's output ${sizeLabel(OUTPUT_HEAD, false)}; Show all reads the whole from disk.`} />
    <Line text={`An output line longer than ${sizeLabel(LINE_CAP, false)} goes to disk unread.`} />
  </ScrollView>;
}

export function SidePanel(): i32 {
  return <View className={`w-[280] shrink-0 flex-col border-r ${bg(SURFACE)} ${bd(BORDER)}`}>
    <View className="flex-row items-center h-[36] px-3 shrink-0">
      <Text className={`grow text-[11px] font-semibold ${fg(MUTED)}`}>{TITLES[activity()]}</Text>
    </View>
    {activity() === ACT_CHATS && <Conversations />}
    {activity() === ACT_FOLDERS && <Folders />}
    {activity() === ACT_AGENTS && <Agents />}
    {activity() > ACT_AGENTS && <Settings />}
  </View>;
}
