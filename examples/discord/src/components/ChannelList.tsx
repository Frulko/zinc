// The channels of the open server (categories as headers, voice and forum channels listed but not opened yet) or the DMs, unread ones in
// white with their count of mentions, and the user at the bottom with the log-out button.
import { Icon } from 'zinc:icons';
import { store, Channel } from '../state';
import { CH_CATEGORY, CH_VOICE, CH_DM, CH_GROUP_DM, BG_SIDE, BG_SELECTED, BG_HOVER, TEXT_MAIN, TEXT_MUTED, TEXT_STRONG, CHANNELS_W, MENTION_BG } from '../constants';

function icon(c: Channel): string { return c.type === CH_VOICE ? 'volume-2' : c.type === CH_GROUP_DM ? 'users' : c.type === CH_DM ? 'at-sign' : 'hash'; }
export const MUTED = (): i32 => 0x949ba4;

/** The red count of unread mentions. */
export function Badge(p: { n: i32 }) {
  return <View className={`min-w-[16] h-[16] px-1 rounded-full items-center justify-center ${MENTION_BG}`}>
    <Text className="text-white text-[11px] font-bold">{p.n > 99 ? '99+' : `${p.n}`}</Text>
  </View>;
}

function Row(p: { c: Channel }) {
  const c = p.c;
  if (c.type === CH_CATEGORY) return <Text className={`px-2 pt-4 pb-1 text-xs font-bold uppercase ${TEXT_MUTED}`}>{c.name}</Text>;
  const on = c.id === store.channelId, open = c.readable(), unread = open && !on && store.unread(c.id), mentions = store.mentions(c.id);
  return <View className={`mx-2 px-2 h-[32] flex-row items-center gap-1.5 rounded ${on ? BG_SELECTED : BG_HOVER}`} aria-label={c.name}
    onPress={() => { if (open) store.selectChannel(c.id); }}>
    <Icon name={icon(c)} size={18} color={MUTED} />
    <Text className={`grow text-[15px] ${on || unread ? `${TEXT_STRONG} font-semibold` : open ? TEXT_MAIN : TEXT_MUTED}`} numberOfLines={1}>{c.name}</Text>
    {mentions > 0 ? <Badge n={mentions} /> : null}
  </View>;
}

export function ChannelList() {
  const g = store.findGuild(store.guildId);
  return <View className={`w-[${CHANNELS_W}] ${BG_SIDE}`}>
    <View className="h-[48] px-4 justify-center border-b border-[#1f2023]">
      <Text className={`font-semibold ${TEXT_STRONG}`} numberOfLines={1}>{g !== null ? g.name : 'Direct messages'}</Text>
    </View>
    <ScrollView className="grow">
      <View className="py-2 gap-[2]">{store.channels().map((c: Channel) => <Row key={c.id} c={c} />)}</View>
    </ScrollView>
    <View className="h-[52] px-3 flex-row items-center gap-2 bg-[#232428]">
      <Text className={`grow text-sm font-semibold ${TEXT_STRONG}`} numberOfLines={1}>{store.me.name}</Text>
      <View className={`p-1 rounded ${BG_HOVER}`} onPress={() => store.showSettings(!store.settingsOpen)} aria-label="Settings">
        <Icon name="settings" size={18} color={MUTED} />
      </View>
      <View className={`px-2 py-1 rounded ${BG_HOVER}`} onPress={() => store.logout()} aria-label="Log out">
        <Text className={`text-xs ${TEXT_MUTED}`}>Log out</Text>
      </View>
    </View>
  </View>;
}
