// The pane at the right of the messages when it does not show the member list: the open channel's pinned messages (a click jumps to one,
// the pin unpins it when allowed), or a thread or forum post read beside its channel (its messages and what they carry; the button at the
// top opens it as the channel, to write in it).
import { Icon } from 'zinc:icons';
import { store, Message } from '../state';
import { Markdown } from './Markdown';
import { Content } from './Content';
import { Avatar } from './Avatar';
import { cdnPicture, avatarKey } from '../services/cdn';
import { BG_SURFACE, BG_MAIN, BG_HOVER, TEXT_MAIN, TEXT_MUTED, TEXT_STRONG, MEMBER_AVATAR, paneW, ROW_ESTIMATE } from '../constants';
import { color } from '../theme';

const MUTED = (): i32 => color('icon');
function time(iso: string): string { return iso.length >= 16 ? iso.slice(0, 10) + ' ' + iso.slice(11, 16) : iso; }

/** A message in the pane: its author, time, text and content; `jump` (a pin): a click shows it in the channel, the cross unpins it. */
function PaneMessage(p: { m: Message; jump: boolean }) {
  const m = p.m, hash = store.avatarOf(m.authorId);
  return <View className={`px-3 py-2 flex-row gap-3 rounded ${p.jump ? BG_HOVER : ''}`} aria-label={`${m.author}: ${m.content}`}
    onPress={() => { if (p.jump) store.jumpTo(m.id); }}>
    <Avatar picture={hash !== '' ? cdnPicture(avatarKey(m.authorId, hash)) : -1} name={m.author} size={MEMBER_AVATAR} round={true} />
    <View className="grow basis-0">
      <View className="flex-row items-center gap-2">
        <Text className={`grow font-semibold text-sm ${TEXT_STRONG}`} numberOfLines={1}>{m.author}</Text>
        {p.jump && store.canPin(m.channelId) ? <View className="p-0.5 rounded hover:bg-[var(--dc-selected)]" aria-label="Unpin" onPress={() => { store.pin(m); }}>
          <Icon name="x" size={14} color={MUTED} />
        </View> : null}
      </View>
      <Text className={`text-[11px] ${TEXT_MUTED}`}>{m.system !== '' ? m.system : time(m.timestamp)}</Text>
      {m.content !== '' ? <Markdown text={m.content} revealed={store.revealed.has(m.id)} size="text-sm" /> : null}
      <Content m={m} />
    </View>
  </View>;
}

function Header(p: { title: string; icon: string; open: string }) {
  return <View className="h-[48] px-3 flex-row items-center gap-2 border-b border-[var(--dc-divider)]">
    <Icon name={p.icon} size={18} color={MUTED} />
    <Text className={`grow font-semibold ${TEXT_STRONG}`} numberOfLines={1}>{p.title}</Text>
    {p.open !== '' ? <View className="p-1 rounded hover:bg-[var(--dc-selected)]" aria-label="Open as a channel" onPress={() => store.selectChannel(p.open)}>
      <Icon name="arrow-right" size={16} color={MUTED} />
    </View> : null}
    <View className="p-1 rounded hover:bg-[var(--dc-selected)]" aria-label="Close" onPress={() => { if (store.pane === 'pins') store.togglePins(); else store.openThread(''); }}>
      <Icon name="x" size={16} color={MUTED} />
    </View>
  </View>;
}

export function SidePane() {
  if (store.pane === 'pins') {
    const pins = store.pins.get(store.channelId);
    return <View className={`w-[${paneW()}] h-full overflow-hidden ${BG_SURFACE}`}>
      <Header title="Pinned messages" icon="pin" open="" />
      {pins === undefined ? <Text className={`p-4 ${TEXT_MUTED}`}>Loading…</Text>
        : pins.length === 0 ? <Text className={`p-4 ${TEXT_MUTED}`}>This channel has no pinned messages yet.</Text>
        : <ScrollView className="grow"><View className="p-2 gap-1">{pins.map((m: Message) => <PaneMessage key={m.id} m={m} jump={true} />)}</View></ScrollView>}
    </View>;
  }
  const id = store.threadId, t = store.findChannel(id), list = store.messages.get(id);
  return <View className={`w-[${paneW()}] h-full overflow-hidden ${BG_MAIN} border-l border-[var(--dc-divider)]`}>
    <Header title={t !== null ? t.name : 'Thread'} icon="message-square" open={id} />
    {list === undefined ? <Text className={`p-4 ${TEXT_MUTED}`}>Loading…</Text>
      : <VirtualList count={list.length} estimatedItemHeight={ROW_ESTIMATE} className="grow" stickToBottom>
        {(i: i32) => <PaneMessage key={list[i].id} m={list[i]} jump={false} />}
      </VirtualList>}
    <Text className={`px-3 py-2 text-xs ${TEXT_MAIN}`} numberOfLines={1}>{store.typingText(id)}</Text>
  </View>;
}
