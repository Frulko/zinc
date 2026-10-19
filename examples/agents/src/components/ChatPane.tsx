// The main pane: the chat of the selected agent in the selected folder, with the folder's own configuration for that
// agent above it. A configuration file opened from the sidebar takes the pane's place.
import { createSignal, createNodeRef } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { Icon } from 'zinc:icons';
import { Chat, Message } from '../services/chat';
import { ConfigFile, shortPath, projectConfigOf } from '../services/discovery';
import { agents, agent, selectAgent, folder, currentChat, send, viewed, AgentInfo } from '../state';
import { FileRow } from './Sidebar';
import { FileViewer } from './FileViewer';
import { BACKGROUND, SURFACE, SURFACE_HOVER, SELECTED, BORDER, TEXT, MUTED, FAINT, USER_BUBBLE, ERROR, bg, fg, bd } from '../theme';

const logRef = createNodeRef();
let shownRevision: i32 = -1;
let shownChat: Chat | null = null;

/** Keeps the end of the chat in view while it grows (called every frame; scrolls only when the chat changed). */
export function followChat(): void {
  const c = currentChat();
  if (c === null || logRef.node < 0) return;
  const chat = c as Chat;
  if (chat === shownChat && chat.revision() === shownRevision) return;
  shownChat = chat;
  shownRevision = chat.revision();
  ui.scrollTo(logRef.node, 0, 1000000);   // clamped to the end
}

function AgentTab(props: { info: AgentInfo }): i32 {
  const on = (): boolean => agent() === props.info;
  return <View className={`flex-row items-center gap-2 h-[28] px-3 rounded-md cursor-pointer ${on() ? bg(SELECTED) : ''} hover:${bg(SURFACE_HOVER)}`}
    onPress={() => selectAgent(props.info)}>
    <View className="w-[8] h-[8] rounded-full" style={{ backgroundColor: props.info.agent.color }} />
    <Text className={`text-[12px] ${fg(on() ? TEXT : MUTED)}`}>{props.info.agent.name}</Text>
  </View>;
}

function Bubble(props: { m: Message; name: string }): i32 {
  const m = props.m;
  if (m.fromUser) {
    return <View className="flex-row justify-end">
      <View className={`max-w-[640] px-3 py-2 rounded-lg ${bg(USER_BUBBLE)}`}>
        <Text className={`text-[14px] whitespace-pre-wrap ${fg(TEXT)}`}>{m.text()}</Text>
      </View>
    </View>;
  }
  return <View className="flex-col gap-1 max-w-[760]">
    <Text className={`text-[11px] font-semibold ${fg(FAINT)}`}>{m.streaming() ? props.name + ' …' : props.name}</Text>
    <Text className={`text-[14px] whitespace-pre-wrap ${fg(TEXT)}`}>{m.text()}</Text>
    {m.error() !== '' && <Text className={`text-[12px] whitespace-pre-wrap ${fg(ERROR)}`}>{m.error()}</Text>}
  </View>;
}

function Composer(props: { chat: Chat }): i32 {
  const [draft, setDraft] = createSignal('');
  const installed = (): boolean => agent().binary !== '';
  const submit = (): void => {
    if (props.chat.busy() || !installed()) return;
    send(draft());
    setDraft('');
  };
  return <View className={`flex-row items-center gap-2 p-3 border-t ${bd(BORDER)}`} onSubmit={submit}>
    <Input className={`grow h-[36] px-3 rounded-md text-[14px] border ${bg(SURFACE)} ${fg(TEXT)} ${bd(BORDER)}`}
      value={draft()} onInput={setDraft}
      placeholder={installed() ? `Ask ${agent().agent.name} about ${shortPath(props.chat.folder)}` : `${agent().agent.name} is not installed`} />
    {props.chat.busy()
      ? <View className={`flex-row items-center gap-2 h-[36] px-3 rounded-md cursor-pointer ${bg(SELECTED)}`} onPress={() => props.chat.stop()}>
          <Icon name="square" size={14} color={() => TEXT} /><Text className={`text-[13px] ${fg(TEXT)}`}>Stop</Text>
        </View>
      : <View className={`flex-row items-center gap-2 h-[36] px-3 rounded-md cursor-pointer ${bg(SELECTED)} hover:${bg(SURFACE_HOVER)}`} onPress={submit}>
          <Icon name="send" size={14} color={() => TEXT} /><Text className={`text-[13px] ${fg(TEXT)}`}>Send</Text>
        </View>}
  </View>;
}

function ChatView(props: { chat: Chat }): i32 {
  const c = props.chat;
  const local = projectConfigOf(c.agent, c.folder);
  return <View className="grow min-w-0 flex-col">
    <View className={`flex-col gap-1 px-4 py-2 border-b ${bd(BORDER)}`}>
      <Text className={`text-[12px] ${fg(FAINT)}`}>{local.length === 0 ? `no ${c.agent.name} configuration in this folder` : `${c.agent.name} configuration in this folder`}</Text>
      {local.length > 0 && <View className="flex-row flex-wrap gap-1">{local.map((f: ConfigFile) => <View className="w-[260]"><FileRow file={f} /></View>)}</View>}
    </View>
    <ScrollView ref={logRef} className="grow min-w-0 flex-col gap-4 px-6 py-4">
      {c.messages().length === 0 && <Text className={`text-[13px] ${fg(FAINT)}`}>
        {`Each message runs ${c.agent.binary} in this folder, read-only, and streams its answer here. The conversation resumes from one message to the next.`}
      </Text>}
      {c.messages().map((m: Message) => <Bubble m={m} name={c.agent.name} />)}
    </ScrollView>
    <Composer chat={c} />
  </View>;
}

export function ChatPane(): i32 {
  return <View className={`grow shrink min-w-0 flex-col ${bg(BACKGROUND)}`}>
    <View className={`flex-row items-center gap-2 h-[48] px-4 border-b ${bd(BORDER)}`}>
      <Icon name="folder" size={16} color={() => MUTED} />
      <Text className={`grow shrink min-w-0 truncate text-[14px] font-semibold ${fg(TEXT)}`}>{folder() === '' ? 'No folder' : shortPath(folder())}</Text>
      {agents.map((a: AgentInfo) => <AgentTab info={a} />)}
    </View>
    {viewed() !== null && <FileViewer file={viewed() as ConfigFile} />}
    {viewed() === null && folder() === '' && <View className="grow items-center justify-center">
      <Text className={`text-[14px] ${fg(FAINT)}`}>Add a folder on the left to start a chat in it.</Text>
    </View>}
    {viewed() === null && folder() !== '' && <ChatView chat={currentChat() as Chat} />}
  </View>;
}
