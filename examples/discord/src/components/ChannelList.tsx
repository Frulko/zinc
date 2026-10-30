// The channels of the open server (categories as headers, each channel's active threads under it, forums open on their posts) or the DMs,
// unread ones in white with their count of mentions, a DM with the person's avatar and presence; a voice channel joins its call when pressed (and shows it, CallView.tsx) and lists who is in it (a green ring:
// speaking), a DM has a call button (green while it rings us). At the bottom the call bar while in a call, and the user with mute, deafen
// and log out.
import { Icon } from 'zinc:icons';
import { store, Channel } from '../state';
import { Avatar, Status } from './Avatar';
import { cdnPicture, avatarKey } from '../services/cdn';
import { CH_CATEGORY, CH_VOICE, CH_DM, CH_GROUP_DM, isThread, BG_SIDE, BG_SELECTED, BG_HOVER, TEXT_MAIN, TEXT_MUTED, TEXT_STRONG, TEXT_ERROR, CHANNELS_W, MENTION_BG, SPEAKING_RING, VOICE_AVATAR } from '../constants';
import { color } from '../theme';

function icon(c: Channel): string {
  return c.type === CH_VOICE ? 'volume-2' : c.type === CH_GROUP_DM ? 'users' : c.type === CH_DM ? 'at-sign' : isThread(c.type) ? 'message-square' : c.forum() ? 'messages-square' : 'hash';
}
/** A forum's posts are listed in the forum, not here. */
export function listed(c: Channel): boolean { if (!isThread(c.type)) return true; const p = store.findChannel(c.parentId); return p === null || !p.forum(); }
export const MUTED = (): i32 => color('muted');

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
    <Status status={s.status} mobile={s.mobile} offline={true} ring="border-[#2b2d31]" />
  </View>;
}

function Row(p: { c: Channel }) {
  const c = p.c;
  if (c.type === CH_CATEGORY) return <Text className={`px-2 pt-4 pb-1 text-xs font-bold uppercase ${TEXT_MUTED}`}>{c.name}</Text>;
  const on = c.id === store.channelId, open = c.readable(), unread = open && !on && store.unread(c.id), mentions = store.mentions(c.id);
  return <View className={`mx-2 px-2 h-[32] flex-row items-center gap-1.5 rounded ${isThread(c.type) ? 'ml-6' : ''} ${on ? BG_SELECTED : BG_HOVER}`} aria-label={c.name}
    onPress={() => { if (open || c.type === CH_VOICE) store.selectChannel(c.id); if (c.type === CH_VOICE) store.joinCall(c.id, c.guildId); }}>
    {c.type === CH_DM && c.recipientId !== '' ? <DmAvatar c={c} /> : <Icon name={icon(c)} size={18} color={MUTED} />}
    <Text className={`grow text-[15px] ${on || unread ? `${TEXT_STRONG} font-semibold` : open ? TEXT_MAIN : TEXT_MUTED}`} numberOfLines={1}>{c.name}</Text>
    {mentions > 0 ? <Badge n={mentions} /> : null}
    {c.type === CH_DM || c.type === CH_GROUP_DM ? <View className="p-0.5 rounded hover:bg-[var(--dc-selected)]" aria-label={`Call ${c.name}`} onPress={() => store.joinCall(c.id, '')}>
      <Icon name="phone" size={16} color={() => store.call.ringing.has(c.id) || store.call.members(c.id).length > 0 ? 0x23a55a : color('muted')} />
    </View> : null}
  </View>;
}

/** Who is in a voice channel: their avatar, ringed in green while they speak. */
function Voices(p: { c: Channel }) {
  const users = store.call.members(p.c.id);
  if (users.length === 0) return null;
  return <View className="pl-9 pr-2 pb-1 gap-[2]">{users.map((id: string) => {
    const name = store.userName(id), hash = store.avatarOf(id), talking = store.call.speaking.has(id);
    return <View key={id} className="h-[28] flex-row items-center gap-2" aria-label={talking ? `${name}, speaking` : name}>
      <View className={`rounded-full border-2 ${talking ? SPEAKING_RING : 'border-transparent'}`}>
        <Avatar picture={hash !== '' ? cdnPicture(avatarKey(id, hash)) : -1} name={name} size={VOICE_AVATAR} round={true} />
      </View>
      <Text className={`grow text-sm ${talking ? TEXT_STRONG : TEXT_MUTED}`} numberOfLines={1}>{name}</Text>
    </View>;
  })}</View>;
}

/** Where the call is, its state, push-to-talk and hanging up. */
function CallBar() {
  const call = store.call;
  if (call.channelId === '' && call.error === '') return null;
  const c = store.findChannel(call.channelId), g = store.findGuild(call.guildId);
  const where = c === null ? '' : g !== null ? `${c.name} / ${g.name}` : c.name;
  const label = call.state === 'connected' ? 'Voice Connected' : call.state === 'reconnecting' ? 'Reconnecting…' : call.state === 'closed' ? 'Disconnected' : 'Connecting…';
  return <View className="px-3 py-2 flex-row items-center gap-2 bg-[var(--dc-footer)] border-b border-[var(--dc-divider)]">
    <View className="grow basis-0">
      {call.channelId !== '' ? <Text className={`text-sm font-semibold ${call.state === 'connected' ? 'text-[#23a55a]' : 'text-[#f0b232]'}`}>{call.e2ee() ? `${label} · End-to-end encrypted` : label}</Text> : null}
      {call.channelId !== '' ? <Text className={`text-xs ${TEXT_MUTED}`} numberOfLines={1}>{where}</Text> : null}
      {call.error !== '' ? <Text className={`text-xs ${TEXT_ERROR}`}>{call.error}</Text> : null}
    </View>
    {call.channelId !== '' ? <View className={`px-1.5 py-0.5 rounded ${call.ptt ? 'bg-[var(--dc-accent)]' : BG_HOVER}`} onPress={() => call.setPushToTalk(!call.ptt)}
      aria-label={call.ptt ? `Push to talk on (hold ${call.settings.pttKey})` : 'Push to talk off'}>
      <Text className={`text-xs ${call.ptt ? 'text-white' : TEXT_MUTED}`}>PTT</Text>
    </View> : null}
    {call.channelId !== '' ? <View className={`p-1 rounded ${BG_HOVER}`} onPress={() => call.leave()} aria-label="Disconnect">
      <Icon name="phone-off" size={18} color={MUTED} />
    </View> : null}
  </View>;
}

export function ChannelList() {
  const g = store.findGuild(store.guildId);
  return <View className={`w-[${CHANNELS_W}] ${BG_SIDE}`}>
    <View className="h-[48] px-4 justify-center border-b border-[var(--dc-divider)]">
      <Text className={`font-semibold ${TEXT_STRONG}`} numberOfLines={1}>{g !== null ? g.name : 'Direct messages'}</Text>
    </View>
    <ScrollView className="grow">
      <View className="py-2 gap-[2]">{store.channels().filter(listed).map((c: Channel) => c.type === CH_VOICE
        ? <View key={c.id}><Row c={c} /><Voices c={c} /></View> : <Row key={c.id} c={c} />)}</View>
    </ScrollView>
    <CallBar />
    <View className="h-[52] px-3 flex-row items-center gap-1 bg-[var(--dc-footer)]">
      <Text className={`grow text-sm font-semibold ${store.call.speaking.has(store.me.id) ? 'text-[#23a55a]' : TEXT_STRONG}`} numberOfLines={1}>{store.me.name}</Text>
      <View className={`p-1 rounded ${BG_HOVER}`} onPress={() => store.call.toggleMute()} aria-label={store.call.mute ? 'Unmute' : 'Mute'}>
        <Icon name={store.call.mute || store.call.deaf ? 'mic-off' : 'mic'} size={18} color={() => store.call.mute || store.call.deaf ? 0xf23f43 : color('muted')} />
      </View>
      <View className={`p-1 rounded ${BG_HOVER}`} onPress={() => store.call.toggleDeaf()} aria-label={store.call.deaf ? 'Undeafen' : 'Deafen'}>
        <Icon name={store.call.deaf ? 'headphone-off' : 'headphones'} size={18} color={() => store.call.deaf ? 0xf23f43 : color('muted')} />
      </View>
      <View className={`p-1 rounded ${BG_HOVER}`} onPress={() => store.showSettings(!store.settingsOpen)} aria-label="Settings">
        <Icon name="settings" size={18} color={MUTED} />
      </View>
      <View className={`px-2 py-1 rounded ${BG_HOVER}`} onPress={() => store.logout()} aria-label="Log out">
        <Text className={`text-xs ${TEXT_MUTED}`}>Log out</Text>
      </View>
    </View>
  </View>;
}
