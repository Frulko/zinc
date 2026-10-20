// The centre: the open conversations as tabs, the current one's folder, agent and configuration, its items and the
// composer. A configuration file or a tool's whole output opened from the chat takes the pane's place.
//
// The list shows the conversation's window (services/chat.ts): scrolled near its top it reads older items from disk,
// near its end newer ones; the item on screen keeps its place while the window moves.
import { createSignal, createNodeRef, onMount } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { Icon } from 'zinc:icons';
import { Chat } from '../services/chat';
import { Item } from '../services/transcript';
import { Attachment, A_IMAGE, A_FOLDER, relative, mention, typedMention, filesUnder, complete } from '../services/attach';
import { IDLE, STOPPING } from '../services/turn';
import { ConfigFile, shortPath, projectConfigOf } from '../services/discovery';
import { agents, agent, selectAgent, current, openChat, closeTab, tabs, send, stopCurrent, viewed, viewedOutput, detailOpen,
  toggleDetail, viewFile, viewOutput, AgentInfo } from '../state';
import { FileRow } from './SidePanel';
import { FileViewer, OutputViewer } from './FileViewer';
import { SettingsBar, menuOpen, closeMenu } from './SettingsBar';
import { ItemRow } from './ItemView';
import { enter, enterOpacity, enterY } from './motion';
import { BACKGROUND, SURFACE, BAR, SURFACE_HOVER, SELECTED, BORDER, TEXT, MUTED, FAINT, ACCENT, bg, fg, bd, color } from '../theme';

/** How close to an end of the list (px) the view must come to read the next items. */
const NEAR = 240;

const logRef = createNodeRef();

/** Every frame: what the shown conversation received joins its window, and while the view follows the conversation it
 *  scrolls whenever the last item ends below it (as laid out last frame: new rows, a paragraph that grew). */
export function followChat(): void {
  const c = current();
  if (c === null || logRef.node < 0) return;
  const chat = c as Chat;
  chat.flush();
  const w = chat.window();
  if (!chat.following || w.length === 0) return;
  const last = w[w.length - 1];
  if (last.ref.node < 0) return;
  const view = ui.screenBox(logRef.node), box = ui.screenBox(last.ref.node);
  if (box[1] + box[3] > view[1] + view[3] + 0.5) ui.scrollTo(logRef.node, 0, 1000000);   // clamped to the end
}

/** The y of `it` relative to the top of the view (negative above it); `it` must be drawn (`it.ref.node >= 0`). */
function yOf(it: Item): number {
  const box = ui.screenBox(it.ref.node);
  return ui.toLocal(logRef.node, box[0], box[1])[1];
}

/** Runs `change` (the window moves) and scrolls so that `anchor` stays where it was on screen. */
function keepPlace(anchor: Item, change: () => void): void {
  if (anchor.ref.node < 0) { change(); return; }
  const before = yOf(anchor);
  change();
  if (anchor.ref.node < 0) return;
  const after = yOf(anchor);
  if (after !== before) ui.scrollTo(logRef.node, 0, ui.scrollTop(logRef.node) + after - before);
}

/** The view moved: read the items it reaches, and follow the conversation again once it is back at the end. */
function onLogScroll(chat: Chat): void {
  const w = chat.window();
  if (w.length === 0 || logRef.node < 0) return;
  const view = ui.screenBox(logRef.node);
  const top = ui.toLocal(logRef.node, view[0], view[1])[1];
  const bottom = ui.toLocal(logRef.node, view[0], view[1] + view[3])[1];
  const first = w[0], last = w[w.length - 1];
  if (last.ref.node < 0) return;   // drawn at the next frame
  const lastBox = ui.screenBox(last.ref.node);
  const lastEnd = ui.toLocal(logRef.node, lastBox[0], lastBox[1] + lastBox[3])[1];
  if (chat.hasOlder() && first.ref.node >= 0 && yOf(first) > top - NEAR) keepPlace(first, () => chat.loadOlder());
  else if (chat.hasNewer() && lastEnd < bottom + NEAR) keepPlace(last, () => chat.loadNewer());
  else chat.following = !chat.hasNewer() && lastEnd <= bottom + 4;   // only at the very end: a step up stops the following
}

function Tab(props: { chat: Chat }): i32 {
  const c = props.chat;
  const on = (): boolean => current() === c;
  return <View className={`flex-row items-center gap-2 h-full pl-3 pr-1 border-r cursor-pointer ${bd(BORDER)} ${on() ? bg(BACKGROUND) : ''} hover:${bg(on() ? BACKGROUND : SURFACE_HOVER)}`}
    onPress={() => openChat(c)}>
    <View className="w-[7] h-[7] rounded-full" style={{ backgroundColor: c.agent.color }} />
    <Text className={`max-w-[160] truncate text-[12px] ${fg(on() ? TEXT : MUTED)}`}>{c.title() === '' ? 'New conversation' : c.title()}</Text>
    <View className={`w-[20] h-[20] rounded items-center justify-center hover:${bg(SELECTED)}`} onPress={() => closeTab(c)}>
      <Icon name={c.busy() ? 'circle-stop' : 'x'} size={12} color={() => c.busy() ? color(ACCENT) : color(FAINT)} />
    </View>
  </View>;
}

function TabsBar(): i32 {
  return <View className={`flex-row items-center h-[36] shrink-0 border-b ${bg(BAR)} ${bd(BORDER)}`}>
    <View className="grow shrink min-w-0 flex-row h-full">
      {tabs().map((c: Chat) => <Tab chat={c} />)}
    </View>
    <View className={`w-[32] h-[28] mr-1 rounded items-center justify-center cursor-pointer hover:${bg(SURFACE_HOVER)}`} onPress={toggleDetail}>
      <Icon name={detailOpen() ? 'panel-right-close' : 'panel-right-open'} size={16} color={() => color(MUTED)} />
    </View>
  </View>;
}

function AgentTab(props: { info: AgentInfo }): i32 {
  const on = (): boolean => agent() === props.info;
  return <View className={`flex-row items-center gap-2 h-[26] px-3 rounded-md cursor-pointer transition-colors duration-150 ${on() ? bg(SELECTED) : ''} hover:${bg(SURFACE_HOVER)}`}
    onPress={() => selectAgent(props.info)}>
    <View className="w-[8] h-[8] rounded-full" style={{ backgroundColor: props.info.agent.color }} />
    <Text className={`text-[12px] ${fg(on() ? TEXT : MUTED)}`}>{props.info.agent.name}</Text>
  </View>;
}

/** The attachments of the next message, as chips: a × drops one and its reference. */
function Chips(props: { chat: Chat }): i32 {
  const c = props.chat;
  return <View className="flex-row flex-wrap gap-1 px-3 pt-2">
    {c.attachments().map((a: Attachment) =>
      <View className={`flex-row items-center gap-1 h-[24] pl-2 pr-1 rounded-md border ${bg(SURFACE)} ${bd(BORDER)}`}>
        <Icon name={a.kind === A_IMAGE ? 'image' : a.kind === A_FOLDER ? 'folder' : 'file'} size={12} color={() => color(MUTED)} />
        <Text className={`max-w-[220] truncate text-[12px] ${fg(TEXT)}`}>{label(a, c.folder)}</Text>
        <View className={`w-[18] h-[18] rounded items-center justify-center cursor-pointer hover:${bg(SURFACE_HOVER)}`} aria-label="Remove" onPress={() => c.detach(a)}>
          <Icon name="x" size={11} color={() => color(FAINT)} />
        </View>
      </View>)}
  </View>;
}
/** An image's number and name, a path in the folder as its reference shows it, another one by its name. */
function label(a: Attachment, folder: string): string {
  const name = a.path.slice(a.path.lastIndexOf('/') + 1), rel = relative(a.path, folder);
  return a.kind === A_IMAGE ? `Image #${a.n} · ${name}` : rel === a.path ? name : rel;
}

// Escape: closes an open menu, then a viewer, else stops the running turn. The root's onKeyDown takes it before a focused field
// (which would only drop the focus), the message field's own handler after its completion, ui.onKey when nothing has the focus.
export function escape(e: ui.KeyEvent): void {
  if (e.key !== 'Escape') return;
  if (menuOpen()) closeMenu();
  else if (viewed() !== null) viewFile(null);
  else if (viewedOutput() !== null) viewOutput(null);
  else if (!stopCurrent()) return;
  e.preventDefault();
}

/** Paths shown by the `@` completion. */
const COMPLETIONS = 8;
/** At most this many paths of the folder are indexed for it (read once per conversation, on the first `@`). */
const INDEX_MAX = 5000;

/** The `@` completion: the folder's files that hold the word typed after `@`, over the field. */
function Completions(props: { anchor: i32; paths: () => string[]; at: () => i32; pick: (p: string) => void }): i32 {
  const ref = createNodeRef();
  onMount(() => { ui.openLayer(ref.node, { priority: 200 }); ui.anchor(ref.node, props.anchor, 'top-start', 4); });
  return <View ref={ref} className={`flex-col w-[420] py-1 rounded-md border ${bg(BAR)} ${bd(BORDER)}`}>
    {props.paths().map((p: string, i: i32) =>
      <View className={`flex-row items-center gap-2 h-[24] px-2 cursor-pointer ${i === props.at() ? bg(SELECTED) : ''} hover:${bg(SURFACE_HOVER)}`}
        onPress={() => props.pick(p)}>
        <Icon name={p.endsWith('/') ? 'folder' : 'file'} size={12} color={() => color(MUTED)} />
        <Text className={`grow shrink min-w-0 truncate text-[12px] ${fg(TEXT)}`}>{p}</Text>
      </View>)}
  </View>;
}

function Composer(props: { chat: Chat }): i32 {
  const c = props.chat;
  const installed = (): boolean => agent().binary !== '';
  const field = createNodeRef();
  const [at, setAt] = createSignal<i32>(0);
  let index: string[] | null = null;
  const matches = (): string[] => {
    const w = typedMention(c.draft());
    if (w === null) return [];
    if (index === null) index = filesUnder(c.folder, INDEX_MAX);
    return complete(index as string[], w, COMPLETIONS);
  };
  const pickPath = (p: string): void => {
    const d = c.draft();
    c.setDraft(d.slice(0, d.lastIndexOf('@')) + mention(p) + ' ');
    setAt(0);
  };
  const keys = (e: ui.KeyEvent): void => {
    const m = matches();
    if (m.length === 0) { escape(e); return; }   // this handler hides the root's from the field
    if (e.key === 'ArrowDown') { setAt((at() + 1) % m.length); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { setAt((at() + m.length - 1) % m.length); e.preventDefault(); }
    else if (e.key === 'Enter' || e.key === 'Tab') { pickPath(m[Math.min(at(), m.length - 1)]); e.preventDefault(); }
    else if (e.key === 'Escape') { c.setDraft(c.draft() + ' '); e.preventDefault(); }
  };
  const submit = (): void => {
    if (c.busy() || !installed()) return;
    send(c.draft());
  };
  return <View className={`flex-col shrink-0 border-t ${bd(BORDER)}`}>
    <SettingsBar info={agent()} />
    {c.attachments().length > 0 && <Chips chat={c} />}
    <View className="flex-row items-center gap-2 p-3" onSubmit={submit}>
      <Input ref={field} className={`grow h-[36] px-3 rounded-md text-[14px] border ${bg(SURFACE)} ${fg(TEXT)} ${bd(BORDER)}`}
        value={c.draft()} onInput={(v: string) => { c.setDraft(v); setAt(0); }} onKeyDown={keys}
        placeholder={installed() ? `Ask ${agent().agent.name} about ${shortPath(c.folder)} · @ for a file, or drop one here` : `${agent().agent.name} is not installed`} />
      {props.chat.phase() === IDLE
        ? <View className={`flex-row items-center gap-2 h-[36] px-3 rounded-md cursor-pointer transition-colors duration-150 ${bg(SELECTED)} hover:${bg(SURFACE_HOVER)}`} onPress={submit}>
            <Icon name="send" size={14} color={() => color(TEXT)} /><Text className={`text-[13px] ${fg(TEXT)}`}>Send</Text>
          </View>
        : <View className={`flex-row items-center gap-2 h-[36] px-3 rounded-md cursor-pointer ${bg(SELECTED)}`} onPress={() => stopCurrent()}>
            <Icon name="square" size={14} color={() => color(TEXT)} />
            <Text className={`text-[13px] ${fg(TEXT)}`}>{props.chat.phase() === STOPPING ? 'Stopping…' : 'Stop'}</Text>
            <Text className={`text-[11px] ${fg(FAINT)}`}>Esc</Text>
          </View>}
    </View>
    {matches().length > 0 && <Completions anchor={field.node} paths={matches} at={at} pick={pickPath} />}
  </View>;
}

function ChatView(props: { chat: Chat }): i32 {
  const c = props.chat;
  const local = projectConfigOf(c.agent, c.folder);
  const ref = createNodeRef();
  enter(ref, 4);
  return <View ref={ref} className="grow min-w-0 min-h-0 flex-col" style={{ opacity: enterOpacity(), translateY: enterY(4) }}>
    <View className={`flex-col gap-1 px-4 py-2 border-b shrink-0 ${bd(BORDER)}`}>
      <View className="flex-row items-center gap-2">
        <Icon name="folder" size={14} color={() => color(MUTED)} />
        <Text className={`grow shrink min-w-0 truncate text-[13px] font-semibold ${fg(TEXT)}`}>{shortPath(c.folder)}</Text>
        {agents.map((a: AgentInfo) => <AgentTab info={a} />)}
      </View>
      <View className="flex-row flex-wrap items-center gap-1">
        <Text className={`text-[11px] mr-1 ${fg(FAINT)}`}>{local.length === 0 ? `no ${c.agent.name} configuration in this folder` : `${c.agent.name} configuration:`}</Text>
        {local.map((f: ConfigFile) => <View className="w-[220]"><FileRow file={f} /></View>)}
      </View>
    </View>
    <ScrollView ref={logRef} className="grow min-w-0 flex-col gap-3 px-6 py-4" onScroll={(e: ui.ResponderEvent, g: ui.GestureState) => onLogScroll(c)}>
      {c.count === 0 && c.window().length === 0 && <Text className={`text-[13px] ${fg(FAINT)}`}>
        {`Each message runs ${c.agent.binary} in this folder with the settings below and streams its answer here. The conversation resumes from one message to the next; Escape stops a turn.`}
      </Text>}
      {c.hasOlder() && <Text className={`text-[11px] ${fg(FAINT)}`}>{`${c.window()[0].seq} earlier items on disk: scroll up to read them`}</Text>}
      <For each={c.window()}>{(it: Item, i: i32) => <ItemRow item={it} chat={c} />}</For>
    </ScrollView>
    {menuOpen() && <View className="absolute inset-0" onPress={closeMenu} />}
    <Composer chat={c} />
  </View>;
}

export function ChatPane(): i32 {
  return <View className={`grow shrink min-w-0 flex-col ${bg(BACKGROUND)}`}>
    <TabsBar />
    {viewed() !== null && <FileViewer file={viewed() as ConfigFile} />}
    {viewed() === null && viewedOutput() !== null && <OutputViewer />}
    {viewed() === null && viewedOutput() === null && current() === null && <View className="grow items-center justify-center">
      <Text className={`text-[14px] ${fg(FAINT)}`}>Add a folder on the left to start a conversation in it.</Text>
    </View>}
    {viewed() === null && viewedOutput() === null && current() !== null && <ChatView chat={current() as Chat} />}
  </View>;
}
