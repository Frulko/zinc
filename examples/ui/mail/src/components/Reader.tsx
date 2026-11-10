import { Button, Badge, Separator, EmptyState, theme } from 'zinc:ui/kit';
import { Mailbox } from '../state';
import { Folder } from '../data';
export function Reader(p: { model: Mailbox; onReply: () => void; onBack: () => void; compact: boolean }): i32 {
  return <View className="flex-col gap-5">
    <Show when={p.compact}><Button label="Back to messages" variant="outline" size="sm" onClick={p.onBack} /></Show>
    <Show when={p.model.selected() === null}><EmptyState title="Choose a message" description="Open a message from the list to read it here." icon="inbox" /></Show>
    <Show when={p.model.selected() !== null}>
      <View className="flex-row flex-wrap gap-2">
        <Button label={p.model.selected()?.starred ? 'Unstar' : 'Star'} pressed={p.model.selected()?.starred ?? false} size="sm" variant="outline" onClick={p.model.toggleStar} />
        <Button label={p.model.selected()?.unread ? 'Mark read' : 'Mark unread'} size="sm" variant="outline" onClick={p.model.toggleRead} />
        <Button label={p.model.selected()?.folder === Folder.Archive ? 'Move to Inbox' : 'Archive'} size="sm" variant="outline" onClick={p.model.archive} />
      </View>
      <Separator />
      <Text className={`text-[22px] font-medium text-${theme().foreground}`}>{p.model.selected()?.subject ?? ''}</Text>
      <View className="flex-col gap-2"><Text className={`text-[13px] font-medium text-${theme().foreground}`}>{p.model.selected()?.name ?? ''}</Text><Text className={`text-[12px] text-${theme().mutedForeground}`}>{'From: ' + (p.model.selected()?.from ?? '')}</Text><Text className={`text-[12px] text-${theme().mutedForeground}`}>{'To: ' + (p.model.selected()?.to ?? '')}</Text><Text className={`text-[12px] text-${theme().mutedForeground}`}>{p.model.selected()?.date ?? ''}</Text></View>
      <Text className={`text-[13px] leading-[22px] text-${theme().foreground}`}>{p.model.selected()?.body ?? ''}</Text>
      <View className="flex-row gap-3 items-center"><Button label="Reply" onClick={p.onReply} /><Badge label="Local copy only" /></View>
    </Show>
  </View>;
}
