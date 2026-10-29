// The Info window (iTunes' Get Info), over the page: the song (or "N songs"), its tabs (Details, Artwork, Options, Sorting, File) and
// the fields of the tab shown. Several songs: a value they do not share is an empty field that says "Mixed", and each field has a box
// that an edit ticks; only the ticked fields are written ("N fields will be applied"). One song: Previous and Next. OK writes (one job,
// one save: editor.ts), Cancel or Escape closes. Opened by "Get Info" in a song's menu, Cmd+I, or the Songs page's Get Info button.
import * as ui from 'zinc:ui';
import * as ipod from 'zinc:ipod';
import * as dialog from 'zinc:system/dialog';
import { createSignal, onCleanup } from 'zinc:ui/solid';
import { Icon } from 'zinc:icons';
import { InfoField, TABS, TAB_NAMES, TAB_ARTWORK, TAB_FILE, MIXED, infoTracks, infoTab, setInfoTab, shownValue, isApplied,
  setField, toggleApplied, newCover, pickCover, pendingCount, okInfo, closeInfo, stepInfo, canStep, rowsOf } from '../editor';
import { notice, remoteOpen } from '../actions';
import { allowChanges } from '../state';
import { choose } from '../menus';
import { useCover, releaseCover } from '../services/covers';
import { Button } from './Button';
import { count, bytes, duration, longDuration } from '../format';
import { bg, bd, fg, color, CARD, BORDER, HOVER, TRACK, TEXT, MUTED, FAINT, ACCENT, ERROR, MEDIA_KINDS, MEDIA_NAMES, INFO_WIDTH, INFO_HEIGHT,
  INFO_LABEL_WIDTH, INFO_COVER_SIZE } from '../constants';

/** A box: on, off, or mixed (a dash). */
function Box(props: { on: () => boolean; mixed: () => boolean; onToggle: () => void }): i32 {
  const lit = (): boolean => props.on() || props.mixed();
  return <View className={`items-center justify-center w-[16] h-[16] rounded-[4] border shrink-0 cursor-pointer ${lit() ? `${bg(ACCENT)} ${bd(ACCENT)}` : `${bg(CARD)} ${bd(BORDER)}`}`}
    onPointerDown={(e: ui.PointerEvent) => props.onToggle()}>
    {props.on() ? <Icon name="check" size={12} color={() => 0xffffff} strokeWidth={3} />
      : props.mixed() ? <Icon name="minus" size={12} color={() => 0xffffff} strokeWidth={3} /> : <View />}
  </View>;
}

function Stars(props: { value: () => string; onPick: (n: i32) => void }): i32 {
  const n = (): i32 => props.value() === MIXED ? -1 : Number(props.value()) as i32;
  const one = (k: i32): i32 => <View className="cursor-pointer" onPointerDown={(e: ui.PointerEvent) => props.onPick(n() === k ? 0 : k)}>
    <Icon name="star" size={16} color={() => color(k <= n() ? ACCENT : FAINT)} strokeWidth={2} />
  </View>;
  return <View className="flex-row items-center gap-1">{one(1)}{one(2)}{one(3)}{one(4)}{one(5)}
    {n() < 0 ? <Text className={`text-[12px] ml-1 ${fg(MUTED)}`}>Mixed</Text> : <View />}</View>;
}

/** The control of a field, by its kind. */
function Control(props: { f: InfoField }): i32 {
  const f = props.f, key = f.key;
  const v = (): string => shownValue(key);
  const text = (): string => v() === MIXED ? '' : v();
  const hint = (): string => v() === MIXED ? 'Mixed' : '';
  const width = f.width > 0 ? f.width : -1;
  if (f.kind === 'check') return <View className="flex-row items-center gap-2 h-[28]">
    <Box on={() => v() === 'true'} mixed={() => v() === MIXED} onToggle={() => setField(key, v() === 'true' ? 'false' : 'true')} />
    <Text className={`text-[13px] ${fg(TEXT)}`}>{f.label}</Text>
  </View>;
  if (f.kind === 'rating') return <Stars value={v} onPick={(n: i32) => setField(key, `${n}`)} />;
  if (f.kind === 'media') {
    const name = (): string => { if (v() === MIXED) return 'Mixed'; const i = MEDIA_KINDS.indexOf(v()); return i >= 0 ? MEDIA_NAMES[i] : v(); };
    return <View className={`flex-row items-center gap-1 h-[26] px-2 rounded-[6] border cursor-pointer ${bg(CARD)} ${bd(BORDER)} hover:${bg(HOVER)}`}
      style={{ width: width }} onPointerDown={async (e: ui.PointerEvent): Promise<void> => {
        const picked = await choose(e, MEDIA_KINDS, MEDIA_NAMES);
        if (picked !== '') setField(key, picked);
      }}>
      <Text className={`grow text-[13px] ${fg(TEXT)}`} numberOfLines={1}>{name()}</Text>
      <Icon name="chevron-down" size={12} color={() => color(MUTED)} strokeWidth={2} />
    </View>;
  }
  if (f.kind === 'area') return <View className={`flex-row px-2 py-1 rounded-[6] border grow ${bg(CARD)} ${bd(BORDER)}`} style={{ height: 64 }}>
    <TextArea className={`grow text-[13px] ${fg(TEXT)}`} value={text()} placeholder={hint()} onInput={(s: string) => setField(key, s)} />
  </View>;
  return <View className={`flex-row items-center h-[26] px-2 rounded-[6] border ${width < 0 ? 'grow' : ''} ${bg(CARD)} ${bd(BORDER)}`} style={{ width: width }}>
    <Input className={`grow text-[13px] ${fg(TEXT)}`} value={text()} placeholder={f.kind === 'time' && hint() === '' ? 'm:ss' : hint()} onInput={(s: string) => setField(key, s)} />
  </View>;
}

/** A field of a row: the apply box (several songs), the label (the first field's in the label column), the control. */
function Cell(props: { f: InfoField; multi: boolean; first: boolean }): i32 {
  const f = props.f;
  const ink = (): string => props.multi && !isApplied(f.key) ? fg(FAINT) : fg(MUTED);
  return <View className={`flex-row gap-2 ${f.kind === 'area' ? 'items-start' : 'items-center'} ${f.width > 0 ? '' : 'grow basis-0'}`}>
    {props.multi ? <Box on={() => isApplied(f.key)} mixed={() => false} onToggle={() => toggleApplied(f.key)} /> : <View />}
    {props.first ? <Text className={`text-[12px] text-right ${ink()}`} style={{ width: INFO_LABEL_WIDTH }}>{f.kind === 'check' ? '' : f.label}</Text>
      : <Text className={`text-[12px] ${ink()}`}>{f.label}</Text>}
    <Control f={f} />
  </View>;
}
function Row(props: { fields: InfoField[]; multi: boolean }): i32 {
  return <View className="flex-row items-center gap-3 min-h-[30]">{props.fields.map((f: InfoField, i: i32) => <Cell f={f} multi={props.multi} first={i === 0} />)}</View>;
}

/** The cover of a track (cache key track:<id>), read while shown. */
function TrackCover(props: { id: string; size: i32 }): i32 {
  const [img, setImg] = createSignal<i32>(-1);
  const key = `track:${props.id}`;
  useCover(key, props.id, props.size * 2, setImg);
  onCleanup(() => releaseCover(key, props.size * 2));
  return <View className={`items-center justify-center rounded-[6] overflow-hidden ${bg(TRACK)}`} style={{ width: props.size, height: props.size }}>
    {img() >= 0 ? <Image image={img()} className="w-full h-full object-cover" /> : <Icon name="music" size={Math.round(props.size * 0.35)} color={() => color(MUTED)} strokeWidth={1.5} />}
  </View>;
}

async function chooseImage(): Promise<void> {
  const o = new dialog.OpenOptions();
  o.title = 'Choose a cover';
  o.filters = [new dialog.Filter('Images', ['png', 'jpg', 'jpeg'])];
  const picked = await dialog.open(o);
  if (picked !== null && (picked as string[]).length > 0) pickCover((picked as string[])[0]);
}

function ArtworkTab(props: { tracks: ipod.Track[] }): i32 {
  const t = props.tracks;
  let withCover = '';
  for (const x of t) if (withCover === '' && x.artwork) withCover = x.id;
  return <View className="flex-col gap-3 items-start">
    {withCover !== '' ? <TrackCover id={withCover} size={INFO_COVER_SIZE} />
      : <View className={`items-center justify-center rounded-[6] ${bg(TRACK)}`} style={{ width: INFO_COVER_SIZE, height: INFO_COVER_SIZE }}>
          <Text className={`text-[12px] ${fg(MUTED)}`}>No cover</Text></View>}
    <Text className={`text-[12px] ${fg(MUTED)}`}>{newCover() !== '' ? `New cover: ${newCover().slice(newCover().lastIndexOf('/') + 1)}`
      : t.length > 1 ? 'A cover chosen here is given to every selected song' : 'A PNG or JPEG image'}</Text>
    {remoteOpen() ? <Text className={`text-[12px] ${fg(ERROR)}`}>A remote iPod's daemon does not take covers yet</Text>
      : <Button icon="image" label="Choose image…" onPress={() => { chooseImage(); }} />}
  </View>;
}

function date(s: number): string {
  if (s <= 0) return '—';
  const d = new Date(s * 1000), p = (n: number): string => n < 10 ? `0${n}` : `${n}`;
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}
function Fact(props: { label: string; value: string }): i32 {
  return <View className="flex-row gap-2 items-start min-h-[24]">
    <Text className={`text-[12px] text-right ${fg(MUTED)}`} style={{ width: INFO_LABEL_WIDTH }}>{props.label}</Text>
    <Text className={`grow basis-0 text-[13px] ${fg(TEXT)}`}>{props.value}</Text>
  </View>;
}

function FileTab(props: { tracks: ipod.Track[] }): i32 {
  const ts = props.tracks;
  if (ts.length > 1) {
    let size = 0, ms = 0;
    for (const t of ts) { size += t.size; ms += t.durationMs; }
    return <View className="flex-col">
      <Fact label="Songs" value={`${ts.length}`} /><Fact label="Size" value={bytes(size)} /><Fact label="Time" value={longDuration(ms)} />
    </View>;
  }
  const t = ts[0];
  return <View className="flex-col">
    <Fact label="Kind" value={t.kind !== '' ? t.kind : t.mediaType} /><Fact label="Where" value={t.path} />
    <Fact label="Size" value={bytes(t.size)} /><Fact label="Time" value={duration(t.durationMs)} />
    <Fact label="Bit rate" value={t.bitrate > 0 ? `${t.bitrate} kbps` : '—'} /><Fact label="Sample rate" value={t.sampleRate > 0 ? `${t.sampleRate / 1000} kHz` : '—'} />
    <Fact label="Date added" value={date(t.added)} /><Fact label="Date modified" value={date(t.modified)} />
    <Fact label="Plays" value={`${t.playCount}`} /><Fact label="Last played" value={date(t.lastPlayed)} />
    <Fact label="Skips" value={`${t.skipCount}`} /><Fact label="Last skipped" value={date(t.lastSkipped)} />
    <Fact label="Cover" value={t.artwork ? 'yes' : 'no'} />
  </View>;
}

function Tabs(): i32 {
  return <View className={`flex-row self-center rounded-[7] p-[2] ${bg(TRACK)}`}>
    {TABS.map((tab: string, i: i32) => <View className={`px-3 h-[24] justify-center rounded-[6] cursor-pointer ${infoTab() === tab ? bg(CARD) : ''}`}
      onPointerDown={(e: ui.PointerEvent) => setInfoTab(tab)}>
      <Text className={`text-[12px] ${infoTab() === tab ? `font-semibold ${fg(TEXT)}` : fg(MUTED)}`}>{TAB_NAMES[i]}</Text>
    </View>)}
  </View>;
}

function Body(props: { tab: string; tracks: ipod.Track[] }): i32 {
  if (props.tab === TAB_FILE) return <FileTab tracks={props.tracks} />;
  if (props.tab === TAB_ARTWORK) return <ArtworkTab tracks={props.tracks} />;
  const multi = props.tracks.length > 1;
  return <View className="flex-col gap-1.5">{rowsOf(props.tab).map((r: InfoField[]) => <Row fields={r} multi={multi} />)}</View>;
}

export function InfoSheet(): i32 {
  const ts = (): ipod.Track[] => infoTracks();
  const multi = (): boolean => ts().length > 1;
  const first = (): ipod.Track => ts()[0];
  return <View className="absolute inset-0">
    <View className="absolute inset-0 bg-black/30" onPointerDown={(e: ui.PointerEvent) => closeInfo()} />
    <View className="absolute inset-0 items-center justify-center">
      <View className={`flex-col rounded-[12] border overflow-hidden ${bg(CARD)} ${bd(BORDER)}`} style={{ width: INFO_WIDTH, height: INFO_HEIGHT, shadowLevel: 4 }}>
        <View className={`flex-row items-center gap-3 px-5 pt-4 pb-3`}>
          {multi() ? <View className={`items-center justify-center w-[48] h-[48] rounded-[6] ${bg(TRACK)}`}><Icon name="list-music" size={22} color={() => color(MUTED)} strokeWidth={1.5} /></View>
            : first().artwork ? <TrackCover id={first().id} size={48} /> : <View className={`items-center justify-center w-[48] h-[48] rounded-[6] ${bg(TRACK)}`}><Icon name="music" size={20} color={() => color(MUTED)} strokeWidth={1.5} /></View>}
          <View className="grow basis-0 flex-col min-w-0">
            <Text className={`text-[15px] font-semibold ${fg(TEXT)}`} numberOfLines={1}>{multi() ? count(ts().length, 'song', 'songs') : (first().title !== '' ? first().title : 'Untitled')}</Text>
            <Text className={`text-[12px] ${fg(MUTED)}`} numberOfLines={1}>{multi() ? 'Only the ticked fields are written' : `${first().artist}${first().album !== '' ? ` · ${first().album}` : ''}`}</Text>
          </View>
        </View>
        <Tabs />
        <View className="grow basis-0 min-h-0 px-5 pt-4 overflow-hidden"><Body tab={infoTab()} tracks={ts()} /></View>
        {notice() !== '' ? <Text className={`text-[12px] px-5 pb-1 ${fg(ERROR)}`}>{notice()}</Text> : <View />}
        <View className={`flex-row items-center gap-2 px-5 py-3 border-t ${bd(BORDER)}`}>
          {multi() ? <Text className={`text-[12px] ${fg(MUTED)}`}>{pendingCount() === 0 ? 'Edit a field to change it on every song' : `${count(pendingCount(), 'field', 'fields')} will be applied`}</Text>
            : <View className="flex-row gap-2">
                <Button icon="chevron-left" label="Previous" disabled={!canStep(-1)} onPress={() => stepInfo(-1)} />
                <Button icon="chevron-right" label="Next" disabled={!canStep(1)} onPress={() => stepInfo(1)} />
              </View>}
          <View className="grow" />
          {!allowChanges() && pendingCount() > 0 ? <Text className={`text-[12px] ${fg(ERROR)}`}>Turn on Allow changes to write</Text> : <View />}
          <Button icon="x" label="Cancel" onPress={() => closeInfo()} />
          <Button icon="check" label="OK" accent={true} onPress={() => okInfo()} />
        </View>
      </View>
    </View>
  </View>;
}
