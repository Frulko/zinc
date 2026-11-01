// The column of servers: the DM button on top, then one round icon per server (its picture from the CDN, its initials until then), a
// white mark when it has unread channels and the count of mentions. Slack's layout (theme.ts): square workspace icons, an outline on the open
// one; Teams': an activity rail (Chat, Teams) with the servers' icons under it.
import { Icon } from 'zinc:icons';
import { Tooltip } from 'zinc:ui/kit';
import { store, Guild } from '../state';
import { tr } from '../i18n';
import { Badge } from './ChannelList';
import { Avatar, initials } from './Avatar';
import { cdnPicture, iconKey } from '../services/cdn';
import { BG_RAIL, BG_ACCENT, SB_STRONG, SB_MUTED, SB_HOVER, railW } from '../constants';
import { isSlack, isTeams, color } from '../theme';

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

function DiscordRail() {
  return <ScrollView className={`w-[${railW()}] ${BG_RAIL}`} showsVerticalScrollIndicator={false}>
    <View className="items-center gap-2 py-3">
      <Pill label={tr('discord.rail.dm')} dm={true} picture={-1} on={store.guildId === ''} unread={false} mentions={store.dmMentions()} onPress={() => store.selectGuild('')} />
      <View className="w-8 h-[2] rounded bg-[var(--dc-hover)]" />
      {store.shownGuilds().map((g: Guild) => <Pill key={g.id} label={g.name} picture={g.icon !== '' ? cdnPicture(iconKey(g.id, g.icon)) : -1} on={store.guildId === g.id}
        unread={store.guildUnread(g)} mentions={store.guildMentions(g)} onPress={() => store.selectGuild(g.id)} />)}
    </View>
  </ScrollView>;
}

/** Slack: a 36 px rounded square, the open workspace outlined in white; the direct messages are a button of their own. */
function Workspace(p: { label: string; dm?: boolean; picture: i32; on: boolean; mentions: i32; onPress: () => void }) {
  return <View className="w-full items-center">
    <Tooltip label={p.label} placement="right"><View className={`p-[2] rounded-[11] border-2 ${p.on ? 'border-[var(--dc-sidebar-strong)]' : 'border-[var(--dc-rail)]'}`} onPress={p.onPress} aria-label={p.label}>
      {p.dm ? <View className="w-[36] h-[36] rounded-[8] items-center justify-center bg-[var(--dc-sidebar-selected)]"><Icon name="message-square" size={20} color={() => color('sidebarStrong')} /></View>
        : <Avatar picture={p.picture} name={p.label} size={36} round={false} />}
    </View></Tooltip>
    {p.mentions > 0 ? <View className="absolute right-[6] -bottom-0.5"><Badge n={p.mentions} /></View> : null}
  </View>;
}

function SlackRail() {
  return <ScrollView className={`w-[${railW()}] ${BG_RAIL}`} showsVerticalScrollIndicator={false}>
    <View className="items-center gap-2 py-3">
      {store.shownGuilds().map((g: Guild) => <Workspace key={g.id} label={g.name} picture={g.icon !== '' ? cdnPicture(iconKey(g.id, g.icon)) : -1} on={store.guildId === g.id}
        mentions={store.guildMentions(g)} onPress={() => store.selectGuild(g.id)} />)}
      <Workspace label={tr('discord.rail.dm')} dm={true} picture={-1} on={store.guildId === ''} mentions={store.dmMentions()} onPress={() => store.selectGuild('')} />
    </View>
  </ScrollView>;
}

/** An item of Teams' activity rail: an icon over its name; the open one has the accent bar at its left. */
function Activity(p: { icon: string; label: string; on: boolean; mentions: i32; onPress: () => void }) {
  return <View className={`w-full h-[56] items-center justify-center rounded ${p.on ? 'bg-[var(--dc-sidebar-hover)]' : SB_HOVER}`} onPress={p.onPress} aria-label={p.label}>
    {p.on ? <View className={`absolute left-0 top-[12] bottom-[12] w-[3] rounded-full ${BG_ACCENT}`} /> : null}
    <Icon name={p.icon} size={22} color={() => p.on ? color('accent') : color('sidebarMuted')} />
    <Text className={`text-[10px] ${p.on ? `${SB_STRONG} font-semibold` : SB_MUTED}`}>{p.label}</Text>
    {p.mentions > 0 ? <View className="absolute right-[8] top-[6]"><Badge n={p.mentions} /></View> : null}
  </View>;
}

function TeamsRail() {
  const first = store.shownGuilds()[0];
  return <ScrollView className={`w-[${railW()}] ${BG_RAIL}`} showsVerticalScrollIndicator={false}>
    <View className="items-center gap-1 py-2 px-1">
      <Activity icon="message-square" label={tr('discord.layout.chat')} on={store.guildId === ''} mentions={store.dmMentions()} onPress={() => store.selectGuild('')} />
      <Activity icon="users" label={tr('discord.layout.teams')} on={store.guildId !== ''} mentions={0} onPress={() => { if (store.guildId === '' && first !== undefined) store.selectGuild(first.id); }} />
      <View className="w-8 h-[1] my-1 bg-[var(--dc-divider)]" />
      {store.shownGuilds().map((g: Guild) => <Tooltip key={g.id} label={g.name} placement="right"><View className={`p-[2] rounded-full border-2 ${store.guildId === g.id ? 'border-[var(--dc-accent)]' : 'border-[var(--dc-rail)]'}`}
        aria-label={g.name} onPress={() => store.selectGuild(g.id)}>
        <Avatar picture={g.icon !== '' ? cdnPicture(iconKey(g.id, g.icon)) : -1} name={g.name} size={32} round={true} />
      </View></Tooltip>)}
    </View>
  </ScrollView>;
}

export function GuildRail() { return isSlack() ? <SlackRail /> : isTeams() ? <TeamsRail /> : <DiscordRail />; }
