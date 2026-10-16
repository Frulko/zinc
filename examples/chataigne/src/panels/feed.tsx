// Talking to Chataigne: the chat (/zinc/chat "text" both ways, as bubbles) and the log of received messages.
import * as ui from 'zinc:ui';
import { createSignal, createNodeRef } from 'zinc:ui/solid';
import { Card, CardHeader, CardTitle, CardContent, Button, Switch, captionText, mutedText, theme } from 'zinc:ui/kit';
import { chat, ChatLine, log, LogLine, showStreams, setShowStreams, stamp } from '../state';
import { sendChat } from '../link';

const [draft, setDraft] = createSignal<string>('');

const chatRef = createNodeRef();
let seen: i32 = 0, settle: i32 = 0;

/** Called every frame: keeps the newest bubble in view, one frame after it arrives (once it is laid out). */
export function followChat(): void {
  const n = chat().length;
  if (n !== seen) { seen = n; settle = 2; }
  if (settle > 0) { settle--; if (settle === 0) ui.scrollTo(chatRef.node, 0, 100000); }
}

function submit(): void {
  sendChat(draft());
  setDraft('');
}

function Bubble(props: { line: ChatLine }): i32 {
  const l = props.line;
  return <View className={`flex-col gap-1 ${l.mine ? 'items-end' : 'items-start'}`}>
    <View className={`max-w-[240px] px-3 py-2 rounded-xl ${l.mine ? 'bg-indigo-600' : `bg-${theme().muted}`}`}>
      <Text className={`text-sm ${l.mine ? 'text-white' : `text-${theme().foreground}`}`}>{l.text}</Text>
    </View>
    <Text className={captionText()}>{`${l.mine ? 'You' : 'Chataigne'} · ${stamp(l.time)}`}</Text>
  </View>;
}

export function ChatCard(): i32 {
  return <Card className="grow">
    <CardHeader title="Chat" description="Type to Chataigne; its answers land here." />
    <CardContent className="grow">
      <ScrollView ref={chatRef} className="grow">
        <View className="flex-col gap-3 pr-3">
          <Show when={chat().length === 0}><Text className={mutedText()}>No messages yet. Say hi.</Text></Show>
          {chat().map((l: ChatLine) => <Bubble line={l} />)}
        </View>
      </ScrollView>
      <View className="flex-row gap-2">
        <Input className={`grow h-9 px-3 rounded-md border border-${theme().border} bg-${theme().card} text-sm text-${theme().foreground} focus:border-indigo-500`}
          placeholder="Message (try: go, blackout)" value={draft()} onInput={(v: string) => setDraft(v)}
          onKeyDown={(e: ui.KeyEvent) => { if (e.key === 'Enter') { submit(); e.preventDefault(); } }} />
        <Button label="Send" onClick={submit} />
      </View>
    </CardContent>
  </Card>;
}

export function LogCard(): i32 {
  return <Card className="h-[240px]">
    <View className="flex-row items-center justify-between px-5">
      <CardTitle text="Incoming" />
      <Switch checked={showStreams} onChange={setShowStreams} label="Meters and faders" />
    </View>
    <CardContent className="grow">
      <ScrollView className={`grow rounded-md bg-${theme().muted} p-2`}>
        <View className="flex-col gap-0.5">
          {log().map((l: LogLine) =>
            <Text className={`font-mono text-xs text-${theme().foreground}`}>{`${stamp(l.time)}  ${l.address}  ${l.args}`}</Text>)}
        </View>
      </ScrollView>
    </CardContent>
  </Card>;
}
