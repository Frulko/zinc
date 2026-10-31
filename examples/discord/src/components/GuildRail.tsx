// The column of servers: the DM button on top, then one round icon per server (its picture from the CDN, its initials until then), a
// white mark when it has unread channels and the count of mentions.
import { Tooltip } from 'zinc:ui/kit';
import { store, Guild } from '../state';
import { tr } from '../i18n';
import { Badge } from './ChannelList';
import { Avatar, initials } from './Avatar';
import { cdnPicture, iconKey } from '../services/cdn';
import { BG_RAIL, BG_ACCENT, SB_STRONG, RAIL_W } from '../constants';

function Pill(p: { label: string; dm?: boolean; picture: i32; on: boolean; unread: boolean; mentions: i32; onPress: () => void }) {
  return <View className="w-full items-center">
    {p.unread && !p.on ? <View className="absolute left-0 top-[20] w-[4] h-[8] rounded-r bg-white" /> : null}
    <Tooltip label={p.label} placement="right">{p.picture >= 0 ? <View onPress={p.onPress} aria-label={p.label}><Avatar picture={p.picture} name={p.label} size={48} round={!p.on} /></View>
      : <View className={`w-12 h-12 items-center justify-center ${p.on ? `rounded-2xl ${BG_ACCENT}` : 'rounded-full bg-[var(--dc-sidebar)] hover:rounded-2xl hover:bg-[var(--dc-accent)]'}`}
        onPress={p.onPress} aria-label={p.label}>
        <Text className={`${p.on ? 'text-white' : SB_STRONG} text-sm font-semibold`}>{p.dm ? tr('discord.rail.dm_short') : initials(p.label)}</Text>
      </View>}</Tooltip>
    {p.mentions > 0 ? <View className="absolute right-[10] -bottom-0.5"><Badge n={p.mentions} /></View> : null}
  </View>;
}

export function GuildRail() {
  return <ScrollView className={`w-[${RAIL_W}] ${BG_RAIL}`} showsVerticalScrollIndicator={false}>
    <View className="items-center gap-2 py-3">
      <Pill label={tr('discord.rail.dm')} dm={true} picture={-1} on={store.guildId === ''} unread={false} mentions={store.dmMentions()} onPress={() => store.selectGuild('')} />
      <View className="w-8 h-[2] rounded bg-[var(--dc-hover)]" />
      {store.shownGuilds().map((g: Guild) => <Pill key={g.id} label={g.name} picture={g.icon !== '' ? cdnPicture(iconKey(g.id, g.icon)) : -1} on={store.guildId === g.id}
        unread={store.guildUnread(g)} mentions={store.guildMentions(g)} onPress={() => store.selectGuild(g.id)} />)}
    </View>
  </ScrollView>;
}
