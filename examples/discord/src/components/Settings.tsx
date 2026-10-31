// The settings, in place of the messages, in two panes as Discord has them. Servers: which servers show, one switch per server; a server
// joined after the choice was made comes off and marked new. Voice & audio: the microphone and the speakers, their volumes, the input mode
// (voice activity with its sensitivity over a live meter, or push-to-talk on a chosen key), the camera's quality, the ultra low data mode and each user's volume. Both stay on this
// machine (state.ts, call.ts), never sent to Discord. Account safety: AccountSafety.tsx.
import { Icon } from 'zinc:icons';
import { Switch, Slider, Tabs } from 'zinc:ui/kit';
import { rect } from 'zinc:gfx';
import { AudioDevice } from 'zinc:discord-voice';
import { store, Guild } from '../state';
import { VoiceSettings, decibels } from '../call';
import { MUTED } from './ChannelList';
import { Avatar } from './Avatar';
import { AccountSafety } from './AccountSafety';
import { cdnPicture, iconKey } from '../services/cdn';
import { BG_MAIN, BG_SIDE, BG_HOVER, BG_SELECTED, BG_ACCENT, TEXT_MAIN, TEXT_MUTED, TEXT_STRONG } from '../constants';

function Row(p: { g: Guild }) {
  const g = p.g;
  return <View className="h-[48] flex-row items-center gap-3">
    <Avatar picture={g.icon !== '' ? cdnPicture(iconKey(g.id, g.icon)) : -1} name={g.name} size={32} round={true} />
    <Text className={`grow basis-0 text-[15px] ${TEXT_MAIN}`} numberOfLines={1}>{g.name}</Text>
    {store.isNew(g) ? <View className={`px-1.5 rounded ${BG_ACCENT}`}><Text className="text-white text-[11px] font-bold">NEW</Text></View> : null}
    <Switch checked={() => store.shown(g)} onChange={(on: boolean) => store.setShown(g.id, on)} accessibilityLabel={g.name} />
  </View>;
}

function Servers() {
  return <View className="px-6 py-4">
    <View className="pb-3 flex-row items-center gap-2">
      <Text className={`grow basis-0 text-sm ${TEXT_MUTED}`}>Only the servers switched on show in the sidebar, count unread messages and notify. Direct messages always show. This choice stays on this computer.</Text>
      <View className={`px-2 py-1 rounded ${BG_HOVER}`} onPress={() => store.setAllShown(false)} aria-label="Hide all servers">
        <Text className={`text-sm ${TEXT_MAIN}`}>Hide all</Text>
      </View>
      <View className={`px-2 py-1 rounded ${BG_HOVER}`} onPress={() => store.setAllShown(true)} aria-label="Show all servers">
        <Text className={`text-sm ${TEXT_MAIN}`}>Show all</Text>
      </View>
    </View>
    {store.guilds.map((g: Guild) => <Row key={g.id} g={g} />)}
  </View>;
}

const Heading = (p: { text: string }) => <Text className={`pt-5 pb-2 text-xs font-bold uppercase ${TEXT_MUTED}`}>{p.text}</Text>;

/** One device to choose ('' the system's default), checked when it is the one in use. */
function Device(p: { d: AudioDevice; on: boolean; pick: (id: string) => void }) {
  return <View className={`h-[32] px-2 flex-row items-center gap-2 rounded ${p.on ? BG_SELECTED : BG_HOVER}`} onPress={() => p.pick(p.d.id)}
    aria-label={p.d.name} aria-selected={p.on ? 'true' : 'false'}>
    <Text className={`grow basis-0 text-sm ${p.on ? TEXT_STRONG : TEXT_MAIN}`} numberOfLines={1}>{p.d.name}</Text>
    {p.on ? <Icon name="check" size={16} color={() => 0x23a55a} /> : null}
  </View>;
}
function Devices(p: { title: string; list: AudioDevice[]; chosen: string; pick: (id: string) => void }) {
  const all: AudioDevice[] = [{ id: '', name: 'Default' }];
  for (const d of p.list) all.push(d);
  return <View className="grow basis-0">
    <Heading text={p.title} />
    {all.map((d: AudioDevice) => <Device key={d.id} d={d} on={d.id === p.chosen} pick={p.pick} />)}
  </View>;
}
function Volume(p: { label: string; value: () => number; set: (v: number) => void }) {
  return <View className="grow basis-0">
    <Heading text={p.label} />
    <View className="flex-row items-center gap-3">
      <Slider value={p.value} onChange={p.set} min={0} max={200} step={5} className="grow basis-0" />
      <Text className={`w-[44] text-sm ${TEXT_MAIN}`}>{`${Math.round(p.value())}%`}</Text>
    </View>
  </View>;
}

/** The sensitivity: the microphone's level now as a bar (-100 to 0 dB), green above the threshold (what would be sent), yellow under it,
 *  and the threshold's mark. Drawn each frame while it shows. */
function Meter() {
  return <Canvas className="h-[8] rounded" onDraw={(x: i32, y: i32, w: i32, h: i32) => {
    const call = store.call, at = (db: number): number => Math.round(w * (db + 100) / 100);
    const level = Math.round(decibels(call.level())), gate = call.settings.sensitivity;   // whole dB: the same bar for a steady voice
    rect(x, y, w, h, 0x4e5058);
    rect(x, y, at(level), h, level >= gate ? 0x23a55a : 0xf0b232);
    rect(x + at(gate) - 1, y - 2, 2, h + 4, 0xffffff);
  }} />;
}

function Voice() {
  const call = store.call, s = call.settings;
  const set = (f: (s: VoiceSettings) => void): void => { call.set(f); };   // kept, given to the call, shown again
  // who can be turned up or down: the users of the call, and those already set
  const users: string[] = [];
  for (const id of call.members(call.channelId)) if (id !== store.me.id) users.push(id);
  for (const id of s.users.keys()) if (users.indexOf(id) < 0) users.push(id);
  return <View className="px-6 pb-6">
    <View className="flex-row gap-6">
      <Devices title="Input device" list={call.inputs()} chosen={s.input} pick={(id: string) => set((v: VoiceSettings): void => { v.input = id; })} />
      <Devices title="Output device" list={call.outputs()} chosen={s.output} pick={(id: string) => set((v: VoiceSettings): void => { v.output = id; })} />
    </View>
    <View className="flex-row gap-6">
      <Volume label="Input volume" value={() => s.inputVolume} set={(n: number) => set((v: VoiceSettings): void => { v.inputVolume = n; })} />
      <Volume label="Output volume" value={() => s.outputVolume} set={(n: number) => set((v: VoiceSettings): void => { v.outputVolume = n; })} />
    </View>
    <Heading text="Input mode" />
    <Tabs items={['Voice Activity', 'Push to Talk']} selected={() => s.mode === 'ptt' ? 1 : 0} onSelect={(i: i32) => set((v: VoiceSettings): void => { v.mode = i === 1 ? 'ptt' : 'voice'; })} className="w-[320]" />
    {s.mode === 'voice' ? <View>
      <Heading text="Input sensitivity" />
      <Text className={`pb-2 text-sm ${TEXT_MUTED}`}>{`Nothing is sent while the microphone stays under ${s.sensitivity} dB. Speak to see the bar: green is sent.`}</Text>
      <Slider value={() => s.sensitivity} onChange={(n: number) => set((v: VoiceSettings): void => { v.sensitivity = n; })} min={-100} max={0} step={1} />
      <View className="pt-1 pr-4"><Meter /></View>
    </View> : <View>
      <Heading text="Shortcut" />
      <View className="flex-row items-center gap-3">
        <View className={`px-3 h-[32] justify-center rounded ${BG_SIDE}`}><Text className={`text-sm ${TEXT_STRONG}`}>{call.recordingKey ? 'Press a key…' : s.pttKey}</Text></View>
        <View className={`px-3 h-[32] justify-center rounded ${BG_ACCENT}`} onPress={() => { call.recordingKey = true; store.changed(); }} aria-label="Record keybind">
          <Text className="text-sm text-white">{call.recordingKey ? 'Recording' : 'Record keybind'}</Text>
        </View>
      </View>
      <Text className={`pt-2 text-sm ${TEXT_MUTED}`}>Nothing is sent unless the key is held.</Text>
    </View>}
    <Heading text="Camera quality" />
    <Tabs items={['360p', '720p']} selected={() => s.camera === 720 ? 1 : 0} onSelect={(i: i32) => set((v: VoiceSettings): void => { v.camera = i === 1 ? 720 : 360; })} className="w-[200]" />
    <Text className={`pt-2 text-sm ${TEXT_MUTED}`}>From the next time the camera is turned on. Go Live's quality is chosen when sharing.</Text>
    <Heading text="Poor connection" />
    <View className="gap-2">
      <Switch checked={() => s.lowData} onChange={(on: boolean) => call.setLowData(on)} label="Ultra low data" />
      <Switch checked={() => s.autoLowData} onChange={(on: boolean) => set((v: VoiceSettings): void => { v.autoLowData = on; })} label="Switch on after 5 poor seconds" />
    </View>
    <Text className={`pt-2 text-sm ${TEXT_MUTED}`}>Voice at 10 kbit/s, the camera at a quarter of its size and 5 frames a second, Go Live at half its size and 5 frames a second.</Text>
    {users.length > 0 ? <Heading text="User volume" /> : null}
    {users.map((id: string) => <View key={id} className="h-[36] flex-row items-center gap-3">
      <Text className={`w-[140] text-sm ${TEXT_MAIN}`} numberOfLines={1}>{store.userName(id)}</Text>
      <Slider value={() => call.userVolume(id)} onChange={(n: number) => call.setUserVolume(id, n)} min={0} max={200} step={5} className="grow basis-0" />
      <Text className={`w-[44] text-sm ${TEXT_MAIN}`}>{`${call.userVolume(id)}%`}</Text>
    </View>)}
  </View>;
}

function Tab(p: { id: string; label: string }) {
  const on = store.settingsTab === p.id;
  return <View className={`px-2.5 h-[32] justify-center rounded ${on ? BG_SELECTED : BG_HOVER}`} onPress={() => store.showSettingsTab(p.id)} aria-label={p.label}>
    <Text className={`text-[15px] ${on ? TEXT_STRONG : TEXT_MUTED}`}>{p.label}</Text>
  </View>;
}

export function Settings() {
  const voice = store.settingsTab === 'voice', safety = store.settingsTab === 'safety';
  return <View className={`grow basis-0 flex-row ${BG_MAIN}`}>
    <View className={`w-[180] px-2 py-4 gap-[2] ${BG_SIDE}`}>
      <Text className={`px-2.5 pb-1 text-xs font-bold uppercase ${TEXT_MUTED}`}>Settings</Text>
      <Tab id="servers" label="Servers" />
      <Tab id="voice" label="Voice & audio" />
      <Tab id="safety" label="Account safety" />
    </View>
    <View className="grow basis-0">
      <View className="h-[48] px-4 flex-row items-center border-b border-[#1f2023]">
        <Text className={`grow font-semibold ${TEXT_STRONG}`}>{voice ? 'Voice & audio' : safety ? 'Account safety' : 'Servers'}</Text>
        <View className={`p-1 rounded ${BG_HOVER}`} onPress={() => store.showSettings(false)} aria-label="Close the settings">
          <Icon name="x" size={20} color={MUTED} />
        </View>
      </View>
      <ScrollView className="grow">{voice ? <Voice /> : safety ? <AccountSafety /> : <Servers />}</ScrollView>
    </View>
  </View>;
}
