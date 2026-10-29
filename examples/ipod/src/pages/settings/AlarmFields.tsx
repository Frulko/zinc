// The Settings card "Wake-up alarm" (services/alarm.ts): on or off, the time and the days, what plays (a daily mix of For you, a
// playlist, a Genius list, a radio from the song playing), where (this computer or a Sonos group) and the fade-in. Saved at once.
import * as ui from 'zinc:ui';
import * as ipod from 'zinc:ipod';
import { Switch } from 'zinc:ui/kit';
import { AppConfig, loadConfig } from '../../services/config';
import { alarm, saveAlarm, parseTime } from '../../services/alarm';
import { outputs, findSpeakers, searching, OutputChoice } from '../../services/sonos';
import { current } from '../../services/player';
import { library } from '../../state';
import { forYou } from '../../forYou';
import { geniusDrafts } from '../../drafts';
import { bg, bd, fg, CARD, BORDER, HOVER, TEXT, MUTED, FAINT, ACCENT, ERROR } from '../../constants';

export const ALARM_NOTE = 'Music to wake up to, its volume rising slowly. It sounds only while this app is open. If the Mac sleeps at that time, it sounds when the Mac wakes within 10 minutes; later, it is skipped (a line in Logs).';

const DAYS: string[] = ['1', '2', '3', '4', '5', '6', '0'];   // Monday first (JavaScript's numbers: 0 is Sunday)
const DAY_NAMES: string[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const KINDS: string[] = ['mix', 'playlist', 'genius', 'radio'];
const KIND_NAMES: string[] = ['Daily mix', 'Playlist', 'Genius list', 'Radio'];

function edit(f: (c: AppConfig) => void): void { const c = loadConfig(); f(c); saveAlarm(c); }

function Chip(props: { label: string; on: boolean; onPress: () => void }): i32 {
  return <View className={`h-[26] px-2.5 justify-center rounded-[6] border cursor-pointer ${props.on ? `${bg(ACCENT)} ${bd(ACCENT)}` : `${bg(CARD)} ${bd(BORDER)} hover:${bg(HOVER)}`}`}
    onPointerDown={(e: ui.PointerEvent) => props.onPress()}>
    <Text className={`text-[12px] ${props.on ? 'text-white font-semibold' : fg(TEXT)}`} numberOfLines={1}>{props.label}</Text>
  </View>;
}

class Choice { id: string; name: string; constructor(id: string, name: string) { this.id = id; this.name = name; } }

/** What the kind chosen can play: the daily mixes, the playlists, the Genius lists (a radio is from the song playing). */
function choices(kind: string): Choice[] {
  const out: Choice[] = [];
  if (kind === 'mix') {
    const data = forYou();
    if (data !== null) for (const sh of data.shelves) if (sh.id === 'daily') for (const c of sh.cards) out.push(new Choice(c.title, c.title));
    if (out.length === 0) for (let i = 1; i <= 5; i++) out.push(new Choice(`Daily Mix ${i}`, `Daily Mix ${i}`));
  } else if (kind === 'playlist') {
    const lib = library();
    if (lib !== null) for (const p of lib.playlists) if (!p.master && !p.podcasts) out.push(new Choice(p.id, p.name));
  } else if (kind === 'genius') for (const d of geniusDrafts()) out.push(new Choice(d.id, d.name));
  return out;
}

export function AlarmFields(): i32 {
  const field = `h-[28] px-2.5 rounded-[7] border text-[13px] ${bg(CARD)} ${bd(BORDER)} ${fg(TEXT)}`;
  const label = `w-[64] text-[12px] ${fg(MUTED)}`;
  const num = (v: string, lo: number, hi: number): number => { const n = parseFloat(v); return isNaN(n) ? -1 : Math.max(lo, Math.min(hi, n)); };
  const timeBad = (): boolean => parseTime(alarm().alarmTime) === null;
  const pickKind = (k: string): void => edit((c: AppConfig) => {
    if (c.alarmPlay === k) return;
    c.alarmPlay = k;
    const first = choices(k);
    c.alarmItem = first.length > 0 ? first[0].id : ''; c.alarmItemName = first.length > 0 ? first[0].name : '';
  });
  const useSong = (): void => {
    const t = current();
    if (t === null) return;
    const tr = t as ipod.Track;
    edit((c: AppConfig) => { c.alarmItem = tr.id; c.alarmItemName = `Radio · ${tr.title !== '' ? tr.title : 'Untitled'}`; });
  };
  return <View className="flex-col gap-3">
    <Switch checked={() => alarm().alarmOn} onChange={(v: boolean) => edit((c: AppConfig) => { c.alarmOn = v; })} label="Wake me up" />
    <View className="flex-row items-center gap-2">
      <Text className={label}>Time</Text>
      <Input className={`${field} w-[80]`} value={alarm().alarmTime} onInput={(v: string) => edit((c: AppConfig) => { c.alarmTime = v; })} placeholder="07:00" />
      {timeBad() ? <Text className={`text-[11px] ${fg(ERROR)}`}>A time as 07:30</Text> : <View />}
    </View>
    <View className="flex-row items-center gap-1.5">
      <Text className={label}>Days</Text>
      {DAYS.map((d: string, i: i32) => <Chip label={DAY_NAMES[i]} on={alarm().alarmDays.indexOf(d) >= 0}
        onPress={() => edit((c: AppConfig) => { c.alarmDays = c.alarmDays.indexOf(d) >= 0 ? c.alarmDays.split(d).join('') : c.alarmDays + d; })} />)}
    </View>
    <View className="flex-row items-center gap-1.5">
      <Text className={label}>Play</Text>
      {KINDS.map((k: string, i: i32) => <Chip label={KIND_NAMES[i]} on={alarm().alarmPlay === k} onPress={() => pickKind(k)} />)}
    </View>
    <View className="flex-row flex-wrap items-center gap-1.5 pl-[70]">
      {alarm().alarmPlay === 'radio'
        ? <View className="flex-row items-center gap-2">
            <Chip label="Use the song playing" on={false} onPress={useSong} />
            <Text className={`text-[12px] ${fg(FAINT)}`} numberOfLines={1}>{alarm().alarmItemName !== '' ? alarm().alarmItemName : 'No song chosen'}</Text>
          </View>
        : choices(alarm().alarmPlay).length === 0
          ? <Text className={`text-[12px] ${fg(FAINT)}`}>{alarm().alarmPlay === 'genius' ? 'No Genius list yet: make one from a song' : 'No playlist on this iPod'}</Text>
          : <View className="flex-row flex-wrap gap-1.5">{choices(alarm().alarmPlay).map((ch: Choice, i: i32) => <Chip label={ch.name} on={alarm().alarmItem === ch.id || (alarm().alarmItem === '' && i === 0)}
              onPress={() => edit((c: AppConfig) => { c.alarmItem = ch.id; c.alarmItemName = ch.name; })} />)}</View>}
    </View>
    <View className="flex-row flex-wrap items-center gap-1.5">
      <Text className={label}>On</Text>
      <Chip label="This computer" on={alarm().alarmOutput === ''} onPress={() => edit((c: AppConfig) => { c.alarmOutput = ''; c.alarmOutputName = ''; })} />
      {outputs().map((o: OutputChoice) => <Chip label={o.name} on={alarm().alarmOutput === o.id} onPress={() => edit((c: AppConfig) => { c.alarmOutput = o.id; c.alarmOutputName = o.name; })} />)}
      {alarm().alarmOutput !== '' && outputs().length === 0 ? <Chip label={alarm().alarmOutputName} on={true} onPress={() => {}} /> : <View />}
      <Chip label={searching() ? 'Looking…' : 'Find Sonos'} on={false} onPress={() => { findSpeakers(); }} />
    </View>
    <View className="flex-row items-center gap-2">
      <Text className={label}>Fade in</Text>
      <Input className={`${field} w-[56]`} value={`${alarm().alarmFadeMin}`} onInput={(v: string) => { const n = num(v, 0, 60); if (n >= 0) edit((c: AppConfig) => { c.alarmFadeMin = n; }); }} placeholder="5" />
      <Text className={`text-[12px] ${fg(MUTED)}`}>min, volume from</Text>
      <Input className={`${field} w-[52]`} value={`${alarm().alarmFrom}`} onInput={(v: string) => { const n = num(v, 0, 100); if (n >= 0) edit((c: AppConfig) => { c.alarmFrom = n; }); }} placeholder="5" />
      <Text className={`text-[12px] ${fg(MUTED)}`}>to</Text>
      <Input className={`${field} w-[52]`} value={`${alarm().alarmTo}`} onInput={(v: string) => { const n = num(v, 0, 100); if (n >= 0) edit((c: AppConfig) => { c.alarmTo = n; }); }} placeholder="30" />
      <Text className={`text-[12px] ${fg(MUTED)}`}>%</Text>
    </View>
    <View className={`flex-row items-center gap-2 pt-3 border-t ${bd(BORDER)}`}>
      <Text className={label}>Sleep</Text>
      <Text className={`text-[12px] ${fg(MUTED)}`}>The sleep timer (the moon in the bar) fades the music out over</Text>
      <Input className={`${field} w-[52]`} value={`${alarm().sleepFadeS}`} onInput={(v: string) => { const n = num(v, 1, 600); if (n >= 0) edit((c: AppConfig) => { c.sleepFadeS = n; }); }} placeholder="60" />
      <Text className={`text-[12px] ${fg(MUTED)}`}>s</Text>
    </View>
  </View>;
}
