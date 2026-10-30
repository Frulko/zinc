// The call, as Discord shows it in place of a voice channel's messages (or above a DM's): a tile per participant, ringed in green while they
// speak, with their mute and deafen, and their camera when it is on (ours from our camera, the others' decoded at the tile's size); the
// call's name, state and duration on top; mute, deafen, the camera and disconnect at the bottom.
import { Icon } from 'zinc:icons';
import { store } from '../state';
import { Avatar } from './Avatar';
import { cdnPicture, avatarKey } from '../services/cdn';
import { BG_SIDE, TEXT_MUTED, TEXT_STRONG, SPEAKING_RING, CALL_AVATAR, TILE_W, TILE_H } from '../constants';

/** 75 -> "1:15", 3725 -> "1:02:05". */
export function duration(seconds: number): string {
  const s = Math.floor(seconds), two = (n: number): string => n < 10 ? `0${n}` : `${n}`;
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
  return h > 0 ? `${h}:${two(m)}:${two(s % 60)}` : `${m}:${two(s % 60)}`;
}

function Tile(p: { id: string }) {
  const call = store.call, id = p.id, me = id === store.me.id;
  const name = store.userName(id), hash = store.avatarOf(id);
  const f = call.flagsOf(id), mute = me ? call.mute || call.deaf : f.mute, deaf = me ? call.deaf : f.deaf;
  const talking = call.speaking.has(id) && !mute, video = call.hasVideo(id), img = video ? call.videoOf(id) : -1;
  return <View className={`w-[${TILE_W}] h-[${TILE_H}] rounded-lg border-2 overflow-hidden ${talking ? SPEAKING_RING : 'border-[#2b2d31]'} ${BG_SIDE} items-center justify-center`}
    aria-label={`${name}${video ? ', camera on' : ''}${talking ? ', speaking' : ''}${mute ? ', muted' : ''}${deaf ? ', deafened' : ''}`}>
    {img >= 0 ? <Image image={img} className="absolute inset-0 object-cover" />
      : <Avatar picture={hash !== '' ? cdnPicture(avatarKey(id, hash)) : -1} name={name} size={CALL_AVATAR} round={true} />}
    <View className="absolute left-2 bottom-2 px-1.5 py-0.5 rounded flex-row items-center gap-1 bg-[#1e1f22]">
      <Text className="text-white text-xs font-semibold" numberOfLines={1}>{name}</Text>
      {mute ? <Icon name="mic-off" size={12} color={() => 0xf23f43} /> : null}
      {deaf ? <Icon name="headphone-off" size={12} color={() => 0xf23f43} /> : null}
    </View>
  </View>;
}

/** A round button of the bar: red when its state is on (mute, deafen) or for hanging up. */
function Round(p: { icon: string; label: string; red: boolean; onPress: () => void }) {
  return <View className={`w-[48] h-[48] rounded-full items-center justify-center ${p.red ? 'bg-[#f23f43]' : 'bg-[#2b2d31] hover:bg-[#35373c]'}`}
    onPress={p.onPress} aria-label={p.label}>
    <Icon name={p.icon} size={22} color={() => 0xffffff} />
  </View>;
}

export function CallView(p: { compact: boolean }) {
  const call = store.call, c = store.findChannel(call.channelId);
  const label = call.state === 'connected' ? (call.e2ee() ? 'Voice Connected · End-to-end encrypted' : 'Voice Connected') : call.state === 'reconnecting' ? 'Reconnecting…' : 'Connecting…';
  const time = call.since > 0 ? duration((Date.now() - call.since) / 1000) : '';
  return <View className={`${p.compact ? 'h-[320]' : 'grow basis-0'} bg-[#111214]`}>
    <View className="h-[48] px-4 flex-row items-center gap-2">
      <Icon name="volume-2" size={20} color={() => 0x949ba4} />
      <Text className={`grow font-semibold ${TEXT_STRONG}`} numberOfLines={1}>{c !== null ? c.name : ''}</Text>
      <Text className={`text-sm ${call.state === 'connected' ? 'text-[#23a55a]' : 'text-[#f0b232]'}`}>{label}</Text>
      <Text className={`text-sm ${TEXT_MUTED}`} aria-label="Call duration">{time}</Text>
    </View>
    <View className="grow basis-0 items-center justify-center px-4">
      <View className="flex-row flex-wrap justify-center gap-4">{call.members(call.channelId).map((id: string) => <Tile key={id} id={id} />)}</View>
    </View>
    <View className="h-[80] flex-row items-center justify-center gap-4">
      <Round icon={call.mute || call.deaf ? 'mic-off' : 'mic'} label={call.mute ? 'Unmute' : 'Mute'} red={call.mute || call.deaf} onPress={() => call.toggleMute()} />
      <Round icon={call.deaf ? 'headphone-off' : 'headphones'} label={call.deaf ? 'Undeafen' : 'Deafen'} red={call.deaf} onPress={() => call.toggleDeaf()} />
      <Round icon={call.video ? 'video' : 'video-off'} label={call.video ? 'Turn Off Camera' : 'Turn On Camera'} red={false} onPress={() => { call.toggleVideo(); }} />
      <Round icon="phone-off" label="Disconnect" red={true} onPress={() => call.leave()} />
    </View>
  </View>;
}
