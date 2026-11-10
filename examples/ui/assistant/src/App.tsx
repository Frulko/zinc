import { createSignal, createNodeRef } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { env } from 'zinc:sys';
import { Button, ModelPicker, ContextMeter, Switch, theme, setTheme, LIGHT, DARK, captionText } from 'zinc:ui/kit';
import { createConversation } from './state';
import { models } from './data';
import { ChatSidebar } from './ChatSidebar';
import { Conversation } from './Conversation';

export function App(): i32 {
  const chat = createConversation();
  const [chats, setChats] = createSignal(false);
  const [dark, setDark] = createSignal(env('ASSISTANT_DARK') === '1');
  const header = createNodeRef();
  const returnToChat = (): void => {
    setChats(false);
    ui.focusNode(header.node);
  };
  const selectTopic = (id: string): void => { chat.selectTopic(id); returnToChat(); };
  const newChat = (): void => { chat.newChat(); returnToChat(); };
  return <View className={`h-full w-full flex-col bg-${theme().background}`}>
    <View className={`px-4 py-2 border-b border-${theme().border}`}>
      <Text className={captionText()}>Local scripted assistant · no AI model, backend or network</Text>
    </View>
    <View className="flex-row flex-1 min-h-0">
      <View className={`hidden md:flex w-[250px] shrink-0 border-r border-${theme().border}`}><ChatSidebar topic={chat.topic} onSelect={selectTopic} onNew={newChat} /></View>
      <Show when={chats()}>
        <View className="md:hidden flex-col flex-1 min-w-0">
          <Button label="Back to chat" variant="ghost" onClick={returnToChat} />
          <ChatSidebar topic={chat.topic} onSelect={selectTopic} onNew={newChat} />
        </View>
      </Show>
      <View className={(chats() ? 'hidden md:flex ' : 'flex ') + 'flex-col flex-1 min-w-0 min-h-0'}>
        <View className="flex-col gap-3 p-4 md:px-6">
          <View className="flex-row flex-wrap items-center gap-3">
            <View className="md:hidden"><Button label="Chats" variant="outline" size="sm" onClick={() => setChats(true)} /></View>
            <Text ref={header} tabIndex={-1} className={`grow text-[17px] font-medium text-${theme().foreground}`}>Fieldnotes assistant</Text>
            <Switch label="Dark" checked={dark} onChange={(value: boolean) => { setDark(value); setTheme(value ? DARK : LIGHT); }} />
          </View>
          <View className="flex-row gap-3 items-end">
            <View className="flex-1 min-w-0"><ModelPicker label="Local script" items={models} value={chat.model} onChange={chat.setModel} disabled={chat.busy()} /></View>
            <ContextMeter used={() => chat.question().length + chat.answer().length + chat.draft().length} limit={4000} unit="characters" label="Local text size" />
          </View>
        </View>
        <Conversation chat={chat} />
      </View>
    </View>
  </View>;
}
