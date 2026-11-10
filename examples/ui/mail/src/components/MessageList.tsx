import { List, ListItem, Badge, EmptyState, theme } from 'zinc:ui/kit';
import { Mailbox } from '../state';
import { Message, Folder } from '../data';
export function MessageList(p: { model: Mailbox; onOpen: () => void }): i32 {
  return <ScrollView className="grow min-h-0"><View className="p-3 flex-col gap-3">
    <Show when={p.model.visible().length === 0}><EmptyState title={p.model.query().trim() === '' ? 'This folder is empty' : 'No matching messages'} description={p.model.query().trim() === '' ? 'Try another folder or compose a local message.' : 'Search sender, recipient, subject or message text.'} action={p.model.query().trim() === '' ? 'Open Inbox' : 'Clear search'} onAction={() => { if (p.model.query().trim() === '') p.model.navigate(Folder.Inbox); else p.model.setQuery(''); }} icon="inbox" /></Show>
    <List className="border-0 p-0 rounded-none">{p.model.visible().map((mail: Message) => <ListItem title={mail.subject} description={(mail.folder === Folder.Sent ? 'To ' + mail.to : mail.name) + ' · ' + mail.date} selected={() => p.model.selectedId() === mail.id} onClick={() => { p.model.select(mail.id); p.onOpen(); }}>
      <View className="flex-col gap-1"><Show when={mail.unread}><Badge label="Unread" /></Show><Show when={mail.starred}><Text className={`text-[11px] text-${theme().mutedForeground}`}>Starred</Text></Show></View>
    </ListItem>)}</List>
  </View></ScrollView>;
}
