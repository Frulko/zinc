// The column of servers: the DM button on top, then one round icon per server (its picture from the CDN, its initials until then), a
// white mark when it has unread channels and the count of mentions.
import { store, Guild } from '../state';
import { Badge } from './ChannelList';
import { Avatar, initials } from './Avatar';
import { cdnPicture, iconKey } from '../services/cdn';
import { BG_RAIL, BG_ACCENT, RAIL_W } from '../constants';

function Pill(p: { label: string; picture: i32; on: boolean; unread: boolean; mentions: i32; onPress: () => void }) {
  return <View className="w-full items-center">
    {p.unread && !p.on ? <View className="absolute left-0 top-[20] w-[4] h-[8] rounded-r bg-white" /> : null}
    {p.picture >= 0 ? <View onPress={p.onPress} aria-label={p.label}><Avatar picture={p.picture} name={p.label} size={48} round={!p.on} /></View>
      : <View className={`w-12 h-12 items-center justify-center ${p.on ? `rounded-2xl ${BG_ACCENT}` : 'rounded-full bg-[#313338] hover:rounded-2xl hover:bg-[#5865f2]'}`}
        onPress={p.onPress} aria-label={p.label}>
        <Text className="text-white text-sm font-semibold">{p.label === 'Direct messages' ? 'DM' : initials(p.label)}</Text>
      </View>}
    {p.mentions > 0 ? <View className="absolute right-[10] -bottom-0.5"><Badge n={p.mentions} /></View> : null}
  </View>;
}

export function GuildRail() {
  return <ScrollView className={`w-[${RAIL_W}] ${BG_RAIL}`} showsVerticalScrollIndicator={false}>
    <View className="items-center gap-2 py-3">
      <Pill label="Direct messages" picture={-1} on={store.guildId === ''} unread={false} mentions={store.dmMentions()} onPress={() => store.selectGuild('')} />
      <View className="w-8 h-[2] rounded bg-[#35363c]" />
      {store.shownGuilds().map((g: Guild) => <Pill key={g.id} label={g.name} picture={g.icon !== '' ? cdnPicture(iconKey(g.id, g.icon)) : -1} on={store.guildId === g.id}
        unread={store.guildUnread(g)} mentions={store.guildMentions(g)} onPress={() => store.selectGuild(g.id)} />)}
    </View>
  </ScrollView>;
}
