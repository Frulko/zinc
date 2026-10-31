// The call, as Discord shows it in place of a voice channel's messages (or above a DM's): a tile per participant, ringed in green while they
// speak, with their mute and deafen, and their camera when it is on (ours from our camera, the others' decoded at the tile's size); the
// call's name, state and duration on top; mute, deafen, the camera, Go Live and disconnect at the bottom. A Go Live stream is a tile of its
// own (LIVE): ours shows our capture; another's shows "Watch Stream" until pressed, then the stream, and a press fills the call view with it.
// The connection's quality is three bars by the call's state, as Discord has them (green, yellow, red); pressed, they open the CallStats
// panel with the ultra low data switches.
import { Icon } from 'zinc:icons';
import { CallStats, Switch } from 'zinc:ui/kit';
import { store } from '../state';
import { VoiceSettings } from '../call';
import { Avatar } from './Avatar';
import { cdnPicture, avatarKey } from '../services/cdn';
import { v, color } from '../theme';
import { BG_STAGE, BG_TILE, BG_ACCENT, TEXT_MUTED, TEXT_SUCCESS, TEXT_WARNING, SPEAKING_RING, CALL_AVATAR, TILE_W, TILE_H, FULL_W, FULL_H } from '../constants';

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
  return <View className={`w-[${TILE_W}] h-[${TILE_H}] rounded-lg border-2 overflow-hidden ${talking ? SPEAKING_RING : `border-${v('stageTile')}`} ${BG_TILE} items-center justify-center`}
    aria-label={`${name}${video ? ', camera on' : ''}${talking ? ', speaking' : ''}${mute ? ', muted' : ''}${deaf ? ', deafened' : ''}`}>
    {img >= 0 ? <Image image={img} className="absolute inset-0 object-cover" />
      : <Avatar picture={hash !== '' ? cdnPicture(avatarKey(id, hash)) : -1} name={name} size={CALL_AVATAR} round={true} />}
    <View className="absolute left-2 bottom-2 px-1.5 py-0.5 rounded flex-row items-center gap-1 bg-[#1e1f22]">
      <Text className="text-white text-xs font-semibold" numberOfLines={1}>{name}</Text>
      {mute ? <Icon name="mic-off" size={12} color={() => color('danger')} /> : null}
      {deaf ? <Icon name="headphone-off" size={12} color={() => color('danger')} /> : null}
    </View>
  </View>;
}

/** Someone's Go Live stream: ours (the capture), the watched one (pressed: the full view), or a "Watch Stream" button. */
function StreamTile(p: { id: string }) {
  const call = store.call, id = p.id, me = id === store.me.id, name = store.userName(id);
  const watched = call.watching !== null && call.watching.user === id, img = call.streamOf(id);
  return <View className={`w-[${TILE_W}] h-[${TILE_H}] rounded-lg border-2 border-${v('stageTile')} overflow-hidden bg-black items-center justify-center`}
    onPress={() => { if (watched) call.focus(true); else if (!me) call.watchStream(id); }}
    aria-label={me ? 'Your stream' : watched ? `${name}'s stream, open in full view` : `Watch ${name}'s stream`}>
    {img >= 0 ? <Image image={img} className="absolute inset-0 object-contain" />
      : <View className={`px-3 py-1.5 rounded ${me || watched ? '' : BG_ACCENT}`}><Text className="text-white text-sm font-semibold">{me || watched ? 'Connecting…' : 'Watch Stream'}</Text></View>}
    <View className="absolute left-2 bottom-2 px-1.5 py-0.5 rounded flex-row items-center gap-1 bg-[#1e1f22]">
      <View className={`px-1 rounded-sm bg-${v('danger')}`}><Text className="text-white text-[10px] font-bold">LIVE</Text></View>
      <Text className="text-white text-xs font-semibold" numberOfLines={1}>{me ? 'Your stream' : name}</Text>
    </View>
  </View>;
}

/** The watched stream filling the call view; a press goes back to the tiles. */
function FullStream() {
  const call = store.call, w = call.watching, img = w !== null ? call.streamOf(w.user) : -1;
  return <View className="grow basis-0 items-center justify-center px-4" onPress={() => call.focus(false)} aria-label="Back to the call">
    <View className={`w-[${FULL_W}] h-[${FULL_H}] max-w-full bg-black rounded-lg overflow-hidden`}>
      {img >= 0 ? <Image image={img} className="absolute inset-0 object-contain" /> : null}
    </View>
  </View>;
}

const QUALITY_COLOR: Map<string, string> = new Map<string, string>([['good', v('success')], ['fair', v('warning')], ['poor', v('danger')], ['unknown', v('faint')]]);
/** The connection's quality as Discord's bars: three for good, two for fair, one for poor (lit in its colour). */
export function Bars() {
  const call = store.call, q = call.quality.last.quality, lit = q === 'good' ? 3 : q === 'fair' ? 2 : q === 'poor' ? 1 : 0;
  const lit_ = QUALITY_COLOR.get(q) ?? v('faint');
  return <View className="h-[24] px-1 flex-row items-end gap-[2] rounded hover:bg-[var(--dc-hover)]" onPress={() => call.toggleStats()}
    aria-label={`Connection ${q === 'unknown' ? 'being measured' : q}${call.lowData() ? ', ultra low data' : ''}, show the call's statistics`}>
    {[0, 1, 2].map((i: i32) => <View key={`${i}`} className={`w-[4] h-[${6 + i * 5}] mb-[4] rounded-sm bg-${i < lit ? lit_ : v('faint')}`} />)}
  </View>;
}

/** The codecs and the pictures of the call, and the ultra low data state: "opus · VP8 1280×720 30 fps · ultra low data". */
export function codecLine(): string {
  const call = store.call, q = call.quality.last;
  const video = q.videoCodec !== '' ? ` · ${q.videoCodec}${q.video !== '' ? ` ${q.video}` : ''}` : '';
  const room = q.availableKbps > 0 ? ` · ${Math.round(q.availableKbps)} kbit/s available` : '';
  return `${q.audioCodec === '' ? 'opus' : q.audioCodec}${video}${room}${call.lowData() ? ` · ultra low data${call.autoLow ? ' (poor connection)' : ''}` : ''}`;
}

/** The call's statistics (zinc:ui/kit's CallStats over the connections' RTCP reports: MOS, loss, round trip, jitter, bit rates), the codecs
 *  and the ultra low data switches; `at` places it (under the call's header, or above the call bar of the channel list). */
export function StatsPanel(p: { at: string }) {
  const call = store.call, s = call.settings;
  return <View className={`absolute ${p.at} w-[340]`}>
    <CallStats sample={() => call.quality.last} history={() => call.quality.history}>
      <View className="gap-2 pt-1">
        <Text className={`text-xs ${TEXT_MUTED}`}>{codecLine()}</Text>
        <Switch checked={() => call.lowData()} onChange={(on: boolean) => call.setLowData(on)} label="Ultra low data" />
        <Switch checked={() => s.autoLowData} onChange={(on: boolean) => call.set((v: VoiceSettings): void => { v.autoLowData = on; })} label="Switch on when poor" />
      </View>
    </CallStats>
  </View>;
}

/** A round button of the bar: red when its state is on (mute, deafen) or for hanging up. */
function Round(p: { icon: string; label: string; red: boolean; onPress: () => void }) {
  return <View className={`w-[48] h-[48] rounded-full items-center justify-center ${p.red ? `bg-${v('danger')}` : `${BG_TILE} hover:bg-${v('faint')}`}`}
    onPress={p.onPress} aria-label={p.label}>
    <Icon name={p.icon} size={22} color={() => 0xffffff} />
  </View>;
}

export function CallView(p: { compact: boolean }) {
  const call = store.call, c = store.findChannel(call.channelId);
  const label = call.state === 'connected' ? (call.e2ee() ? 'Voice Connected · End-to-end encrypted' : 'Voice Connected') : call.state === 'reconnecting' ? 'Reconnecting…' : 'Connecting…';
  const time = call.since > 0 ? duration((Date.now() - call.since) / 1000) : '';
  return <View className={`${p.compact ? 'h-[320]' : 'grow basis-0'} ${BG_STAGE}`}>
    <View className="h-[48] px-4 flex-row items-center gap-2">
      <Icon name="volume-2" size={20} color={() => 0x949ba4} />
      <Text className="grow font-semibold text-white" numberOfLines={1}>{c !== null ? c.name : ''}</Text>
      {call.state === 'connected' ? <Bars /> : null}
      <Text className={`text-sm ${call.state === 'connected' ? TEXT_SUCCESS : TEXT_WARNING}`}>{label}</Text>
      <Text className="text-sm text-[#949ba4]" aria-label="Call duration">{time}</Text>
    </View>
    {call.focused ? <FullStream /> : <View className="grow basis-0 items-center justify-center px-4">
      <View className="flex-row flex-wrap justify-center gap-4">
        {call.members(call.channelId).map((id: string) => <Tile key={id} id={id} />)}
        {call.members(call.channelId).filter((id: string) => id === store.me.id ? call.sharing !== null : call.live.has(id)).map((id: string) => <StreamTile key={`live-${id}`} id={id} />)}
      </View>
    </View>}
    <View className="h-[80] flex-row items-center justify-center gap-4">
      <Round icon={call.mute || call.deaf ? 'mic-off' : 'mic'} label={call.mute ? 'Unmute' : 'Mute'} red={call.mute || call.deaf} onPress={() => call.toggleMute()} />
      <Round icon={call.deaf ? 'headphone-off' : 'headphones'} label={call.deaf ? 'Undeafen' : 'Deafen'} red={call.deaf} onPress={() => call.toggleDeaf()} />
      <Round icon={call.video ? 'video' : 'video-off'} label={call.video ? 'Turn Off Camera' : 'Turn On Camera'} red={false} onPress={() => { call.toggleVideo(); }} />
      <Round icon={call.sharing !== null ? 'screen-share-off' : 'screen-share'} label={call.sharing !== null ? 'Stop Streaming' : 'Share Your Screen'} red={false}
        onPress={() => { if (call.sharing !== null) call.stopLive(); else call.shareScreen(); }} />
      {call.watching !== null ? <Round icon="eye-off" label="Stop Watching" red={false} onPress={() => call.stopWatching()} /> : null}
      <Round icon="phone-off" label="Disconnect" red={true} onPress={() => call.leave()} />
    </View>
    {call.statsOpen && call.state === 'connected' ? <StatsPanel at="top-[48] right-4" /> : null}
  </View>;
}
