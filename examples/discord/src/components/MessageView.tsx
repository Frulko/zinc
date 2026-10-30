// The open channel: its name, the connection state and the messages, newest at the bottom (the view follows the end as messages come).
// Writing comes with ZN-867, images and the member list with ZN-868.
import { Icon } from 'zinc:icons';
import { store, Message } from '../state';
import { BG_MAIN, TEXT_MAIN, TEXT_MUTED, TEXT_STRONG, TEXT_ERROR } from '../constants';

const LINK = (): i32 => 0x00a8fc;
function time(iso: string): string { return iso.length >= 16 ? iso.slice(0, 10) + ' ' + iso.slice(11, 16) : iso; }

function Row(p: { m: Message; head: boolean }) {
  const m = p.m;
  return <View className={`px-4 ${p.head ? 'pt-4' : 'pt-[2]'} hover:bg-[#2e3035]`}>
    {m.replyTo !== '' ? <Text className={`text-xs ${TEXT_MUTED}`} numberOfLines={1}>{'↱ ' + m.replyTo}</Text> : null}
    {p.head ? <View className="flex-row items-end gap-2">
      <Text className={`font-semibold ${TEXT_STRONG}`}>{m.author}</Text>
      <Text className={`text-xs ${TEXT_MUTED}`}>{time(m.timestamp)}</Text>
    </View> : null}
    {m.content !== '' ? <Text className={`text-[15px] ${TEXT_MAIN}`}>{m.content + (m.edited ? ' (edited)' : '')}</Text> : null}
    {m.attachments.map((f: string) => <View key={f} className="flex-row items-center gap-1"><Icon name="paperclip" size={14} color={LINK} /><Text className="text-sm text-[#00a8fc]">{f}</Text></View>)}
  </View>;
}

export function MessageView() {
  const c = store.findChannel(store.channelId);
  const list = store.messages.get(store.channelId);
  const banner = store.stage === 'reconnecting' ? 'Connection lost, reconnecting…' : store.stage === 'failed' ? 'Disconnected.' : '';
  return <View className={`grow ${BG_MAIN}`}>
    <View className="h-[48] px-4 flex-row items-center border-b border-[#26272b]">
      <Text className={`grow font-semibold ${TEXT_STRONG}`} numberOfLines={1}>{c !== null ? (c.guildId !== '' ? '# ' : '@ ') + c.name : ''}</Text>
    </View>
    {banner !== '' ? <Text className="px-4 py-1 text-sm text-white bg-[#da373c]">{banner}</Text> : null}
    {store.error !== '' ? <Text className={`px-4 py-1 text-sm ${TEXT_ERROR}`}>{store.error}</Text> : null}
    <ScrollView className="grow" stickToBottom>
      <View className="pb-6">
        {list === undefined ? <Text className={`p-4 ${TEXT_MUTED}`}>{c === null ? 'No channel open.' : 'Loading…'}</Text>
          : list.map((m: Message, i: i32) => <Row key={m.id} m={m} head={i === 0 || list[i - 1].authorId !== m.authorId} />)}
      </View>
    </ScrollView>
  </View>;
}
