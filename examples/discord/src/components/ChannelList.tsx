// The channels of the open server (categories as headers, each channel's active threads under it, forums open on their posts) or the DMs,
// unread ones in white with their count of mentions, a DM with the person's avatar and presence; a voice channel joins its call when pressed (and shows it, CallView.tsx) and lists who is in it (a green ring:
// speaking), a DM has a call button (green while it rings us). At the bottom the call bar while in a call, and the user with mute, deafen
// and log out.
import { Icon } from 'zinc:icons';
import { Tooltip } from 'zinc:ui/kit';
import { tr } from '../i18n';
import { store, Channel } from '../state';
import { Avatar, Status } from './Avatar';
import { cdnPicture, avatarKey } from '../services/cdn';
import { CH_CATEGORY, CH_VOICE, CH_DM, CH_GROUP_DM, isThread, BG_SIDE, SB_SELECTED, SB_SELECTED_TEXT, SB_HOVER, SB_TEXT, SB_MUTED, SB_STRONG, TEXT_ERROR, TEXT_SUCCESS, TEXT_WARNING, channelsW, MENTION_BG, SPEAKING_RING, VOICE_AVATAR } from '../constants';
import { color } from '../theme';
import * as guard from '../safety/index';
import { Bars } from './CallView';

function icon(c: Channel): string {
  return c.type === CH_VOICE ? 'volume-2' : c.type === CH_GROUP_DM ? 'users' : c.type === CH_DM ? 'at-sign' : isThread(c.type) ? 'message-square' : c.forum() ? 'messages-square' : 'hash';
}
/** A forum's posts are listed in the forum, not here. */
export function listed(c: Channel): boolean { if (!isThread(c.type)) return true; const p = store.findChannel(c.parentId); return p === null || !p.forum(); }
export const MUTED = (): i32 => color('sidebarMuted');

/** The red count of unread mentions. */
export function Badge(p: { n: i32 }) {
  return <View className={`min-w-[16] h-[16] px-1 rounded-full items-center justify-center ${MENTION_BG}`}>
    <Text className="text-white text-[11px] font-bold">{p.n > 99 ? '99+' : `${p.n}`}</Text>
  </View>;
}

/** A DM's person: their avatar and presence. */
function DmAvatar(p: { c: Channel }) {
  const id = p.c.recipientId, hash = store.avatarOf(id), s = store.presenceOf(id);
  return <View>
    <Avatar picture={hash !== '' ? cdnPicture(avatarKey(id, hash)) : -1} name={p.c.name} size={20} round={true} />
    <Status status={s.status} mobile={s.mobile} offline={true} ring="border-[var(--dc-sidebar)]" />
  </View>;
}

function Row(p: { c: Channel }) {
  const c = p.c;
  if (c.type === CH_CATEGORY) return <Text className={`px-2 pt-4 pb-1 text-xs font-bold uppercase ${SB_MUTED}`}>{c.name}</Text>;
  const on = c.id === store.channelId, open = c.readable(), unread = open && !on && store.unread(c.id), mentions = store.mentions(c.id);
  return <View className={`mx-2 px-2 h-[32] flex-row items-center gap-1.5 rounded ${isThread(c.type) ? 'ml-6' : ''} ${on ? SB_SELECTED : SB_HOVER}`} aria-label={c.name}
    onPress={() => { if (open || c.type === CH_VOICE) store.selectChannel(c.id); if (c.type === CH_VOICE) store.joinCall(c.id, c.guildId); }}>
    {c.type === CH_DM && c.recipientId !== '' ? <DmAvatar c={c} /> : <Icon name={icon(c)} size={18} color={MUTED} />}
    <Text className={`grow text-[15px] ${on ? `${SB_SELECTED_TEXT} font-semibold` : unread ? `${SB_STRONG} font-semibold` : open ? SB_TEXT : SB_MUTED}`} numberOfLines={1}>{c.name}</Text>
    {mentions > 0 ? <Badge n={mentions} /> : null}
    {c.type === CH_DM || c.type === CH_GROUP_DM ? <Tooltip label={tr('discord.channels.call', ['name', c.name])}><View className="p-0.5 rounded hover:bg-[var(--dc-sidebar-selected)]" aria-label={tr('discord.channels.call', ['name', c.name])} onPress={() => store.joinCall(c.id, '')}>
      <Icon name="phone" size={16} color={() => store.call.ringing.has(c.id) || store.call.members(c.id).length > 0 ? color('success') : color('muted')} />
    </View></Tooltip> : null}
  </View>;
}

/** Who is in a voice channel: their avatar, ringed in green while they speak. */
function Voices(p: { c: Channel }) {
  const users = store.call.members(p.c.id);
  if (users.length === 0) return null;
  return <View className="pl-9 pr-2 pb-1 gap-[2]">{users.map((id: string) => {
    const name = store.userName(id), hash = store.avatarOf(id), talking = store.call.speaking.has(id);
    return <View key={id} className="h-[28] flex-row items-center gap-2" aria-label={talking ? tr('discord.channels.speaking', ['name', name]) : name}>
      <View className={`rounded-full border-2 ${talking ? SPEAKING_RING : 'border-transparent'}`}>
        <Avatar picture={hash !== '' ? cdnPicture(avatarKey(id, hash)) : -1} name={name} size={VOICE_AVATAR} round={true} />
      </View>
      <Text className={`grow text-sm ${talking ? SB_STRONG : SB_MUTED}`} numberOfLines={1}>{name}</Text>
    </View>;
  })}</View>;
}

/** Where the call is, its state, push-to-talk and hanging up. */
function CallBar() {
  const call = store.call;
  if (call.channelId === '' && call.error === '') return null;
  const c = store.findChannel(call.channelId), g = store.findGuild(call.guildId);
  const where = c === null ? '' : g !== null ? `${c.name} / ${g.name}` : c.name;
  const label = call.state === 'connected' ? tr('discord.call.connected') : call.state === 'reconnecting' ? tr('discord.call.reconnecting') : call.state === 'closed' ? tr('discord.call.closed') : tr('discord.call.connecting');
  return <View className="px-2 py-2 flex-row items-center gap-1 bg-[var(--dc-footer)] border-b border-[var(--dc-divider)]">
    {call.state === 'connected' ? <Bars /> : null}
    <View className="grow basis-0">
      {call.channelId !== '' ? <Text className={`text-sm font-semibold ${call.state === 'connected' ? TEXT_SUCCESS : TEXT_WARNING}`}>{call.e2ee() ? tr('discord.call.with_e2ee', ['state', label]) : label}</Text> : null}
      {call.channelId !== '' ? <Text className={`text-xs ${SB_MUTED}`} numberOfLines={1}>{where}</Text> : null}
      {call.error !== '' ? <Text className={`text-xs ${TEXT_ERROR}`}>{call.error}</Text> : null}
    </View>
    {call.channelId !== '' ? <View className={`px-1.5 py-0.5 rounded ${call.ptt ? 'bg-[var(--dc-accent)]' : SB_HOVER}`} onPress={() => call.setPushToTalk(!call.ptt)}
      aria-label={call.ptt ? tr('discord.channels.ptt_on', ['key', call.settings.pttKey]) : tr('discord.channels.ptt_off')}>
      <Text className={`text-xs ${call.ptt ? 'text-[var(--dc-accent-text)]' : SB_MUTED}`}>{tr('discord.channels.ptt')}</Text>
    </View> : null}
    {call.channelId !== '' ? <Tooltip label={tr('discord.call.disconnect')}><View className={`p-1 rounded ${SB_HOVER}`} onPress={() => call.leave()} aria-label={tr('discord.call.disconnect')}>
      <Icon name="phone-off" size={18} color={MUTED} />
    </View></Tooltip> : null}
  </View>;
}

/** Safe mode's shield: lit while it is on (chosen, or started by Discord pushing back); a press switches the chosen one. */
function SafeMode() {
  const on = guard.safeModeOn(), end = guard.safeModeEnd();
  const label = end > 0 ? tr('discord.channels.safe_until', ['time', guard.clock(end)]) : on ? tr('discord.channels.safe_on') : tr('discord.channels.safe_off');
  return <Tooltip label={label}><View className={`p-1 rounded ${on ? 'bg-[var(--dc-accent-soft)]' : SB_HOVER}`} onPress={() => guard.chooseSafeMode(!guard.safeModeChosen())} aria-label={label}>
    <Icon name={on ? 'shield-check' : 'shield'} size={18} color={() => guard.safeModeOn() ? color('accentSoftText') : color('muted')} />
  </View></Tooltip>;
}

export function ChannelList() {
  const g = store.findGuild(store.guildId);
  return <View className={`w-[${channelsW()}] ${BG_SIDE}`}>
    <View className="h-[48] px-4 justify-center border-b border-[var(--dc-footer)]">
      <Text className={`font-semibold ${SB_STRONG}`} numberOfLines={1}>{g !== null ? g.name : tr('discord.rail.dm')}</Text>
    </View>
    <ScrollView className="grow">
      <View className="py-2 gap-[2]">{store.channels().filter(listed).map((c: Channel) => c.type === CH_VOICE
        ? <View key={c.id}><Row c={c} /><Voices c={c} /></View> : <Row key={c.id} c={c} />)}</View>
    </ScrollView>
    <CallBar />
    <View className="min-h-[52] px-3 py-2 flex-row flex-wrap items-center gap-1 bg-[var(--dc-footer)]">
      <Text className={`grow min-w-[56] text-sm font-semibold ${store.call.speaking.has(store.me.id) ? TEXT_SUCCESS : SB_STRONG}`} numberOfLines={1}>{store.me.name}</Text>
      <Tooltip label={store.call.mute ? tr('discord.call.unmute') : tr('discord.call.mute')}><View className={`p-1 rounded ${SB_HOVER}`} onPress={() => store.call.toggleMute()} aria-label={store.call.mute ? tr('discord.call.unmute') : tr('discord.call.mute')}>
        <Icon name={store.call.mute || store.call.deaf ? 'mic-off' : 'mic'} size={18} color={() => store.call.mute || store.call.deaf ? color('danger') : color('muted')} />
      </View></Tooltip>
      <Tooltip label={store.call.deaf ? tr('discord.call.undeafen') : tr('discord.call.deafen')}><View className={`p-1 rounded ${SB_HOVER}`} onPress={() => store.call.toggleDeaf()} aria-label={store.call.deaf ? tr('discord.call.undeafen') : tr('discord.call.deafen')}>
        <Icon name={store.call.deaf ? 'headphone-off' : 'headphones'} size={18} color={() => store.call.deaf ? color('danger') : color('muted')} />
      </View></Tooltip>
      <SafeMode />
      <Tooltip label={tr('discord.channels.settings')}><View className={`p-1 rounded ${SB_HOVER}`} onPress={() => store.showSettings(!store.settingsOpen)} aria-label={tr('discord.channels.settings')}>
        <Icon name="settings" size={18} color={MUTED} />
      </View></Tooltip>
      <Tooltip label={tr('discord.channels.log_out')}><View className={`p-1 rounded ${SB_HOVER}`} onPress={() => store.logout()} aria-label={tr('discord.channels.log_out')}>
        <Icon name="log-out" size={18} color={MUTED} />
      </View></Tooltip>
    </View>
  </View>;
}
