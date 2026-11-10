import { List, ListItem, Badge, EmptyState, theme } from 'zinc:ui/kit';
import { Mailbox } from '../state';
import { Message, Folder } from '../data';
export function MessageList(p: { model: Mailbox; onOpen: () => void }): i32 {
  const message = (id: string): Message => p.model.messages().find((mail: Message) => mail.id === id) as Message;
  return <ScrollView className="grow min-h-0"><View className="p-3 flex-col gap-3">
    <Show when={p.model.visible().length === 0}><EmptyState title={p.model.query().trim() === '' ? 'This folder is empty' : 'No matching messages'} description={p.model.query().trim() === '' ? 'Try another folder or compose a local message.' : 'Search sender, recipient, subject or message text.'} action={p.model.query().trim() === '' ? 'Open Inbox' : 'Clear search'} onAction={() => { if (p.model.query().trim() === '') p.model.navigate(Folder.Inbox); else p.model.setQuery(''); }} icon="inbox" /></Show>
    <List className="border-0 p-0 rounded-none"><For each={p.model.visible().map((mail: Message) => mail.id)}>{(id: string) => <ListItem title={message(id).subject} description={(message(id).folder === Folder.Sent ? 'To ' + message(id).to : message(id).name) + ' · ' + message(id).date} selected={() => p.model.selectedId() === id} onClick={() => { p.model.select(id); p.onOpen(); }}>
      <View className="flex-col gap-1"><Show when={message(id).unread}><Badge label="Unread" /></Show><Show when={message(id).starred}><Text className={`text-[11px] text-${theme().mutedForeground}`}>Starred</Text></Show></View>
    </ListItem>}</For></List>
  </View></ScrollView>;
}
