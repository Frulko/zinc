// The smart playlist editor, as iTunes' dialog: a name, "Match all/any of the following rules", one row per rule (field ▾, condition ▾,
// the value: text with the library's values in a menu, a number in its unit, stars, a date or "in the last N days/weeks/months", a media
// kind, a playlist; − and +), "Limit to N songs/minutes/hours/MB/GB selected by …", "Live updating", and for a new one the templates.
// Under it, the preview: how many songs, how long, how big, and the songs (smart.ts evaluates the rules on the library at each change),
// with Play (through the queue) and Save to iPod. The menus are the system's own (menus.ts choose).
import * as ui from 'zinc:ui';
import * as ipod from 'zinc:ipod';
import { For } from 'zinc:ui/solid';
import { Icon } from 'zinc:icons';
import { playlists, scrollKey } from '../../state';
import { remoteOpen } from '../../actions';
import { choose } from '../../menus';
import { Button } from '../../components/Button';
import { TrackTable } from '../../components/TrackTable';
import { busy } from '../../services/transfers';
import { SmartEdit, FIELDS, FieldInfo, fieldInfo, actionsOf, actionLabel, MEDIA_NAMES, DATE_UNITS, LIMIT_TYPES, LIMIT_SORTS, LIMIT_SORT_NAMES,
  rows, edits, touched, replaceRow, addRowAfter, setField, setAction, setPicked, suggests, suggestions, previewTracks, templates,
  applyTemplate, playPreview, saveSmart, closeEditor } from '../../smart';
import { count, longDuration, bytes } from '../../format';
import { bg, bd, fg, color, CARD, BORDER, HOVER, TEXT, MUTED, FAINT, ACCENT } from '../../constants';

/** A popup button: the choice shown and a chevron; the menu opens where it is pressed. */
function Popup(props: { label: () => string; width: i32; onPress: (e: ui.PointerEvent) => void }): i32 {
  return <View className={`flex-row items-center gap-1 h-[26] px-2 rounded-[6] border shrink-0 cursor-pointer ${bg(CARD)} ${bd(BORDER)} hover:${bg(HOVER)}`}
    style={{ width: props.width }} onPointerDown={(e: ui.PointerEvent) => { if (e.button === 0) props.onPress(e); }}>
    <Text className={`grow text-[12px] ${fg(TEXT)}`} numberOfLines={1}>{props.label()}</Text>
    <Icon name="chevron-down" size={12} color={() => color(MUTED)} strokeWidth={2} />
  </View>;
}

function Field(props: { value: string; width: i32; onInput: (v: string) => void; placeholder?: string }): i32 {
  return <View className={`flex-row items-center h-[26] px-2 rounded-[6] border shrink-0 ${bg(CARD)} ${bd(BORDER)}`} style={{ width: props.width }}>
    <Input className={`grow text-[12px] ${fg(TEXT)}`} value={props.value} onInput={props.onInput} placeholder={props.placeholder !== undefined ? props.placeholder as string : ''} />
  </View>;
}

function Check(props: { on: () => boolean; onToggle: () => void }): i32 {
  return <View className={`items-center justify-center w-[16] h-[16] rounded-[4] border cursor-pointer ${props.on() ? `${bg(ACCENT)} ${bd(ACCENT)}` : `${bg(CARD)} ${bd(BORDER)}`}`}
    onPointerDown={(e: ui.PointerEvent) => props.onToggle()}>
    {props.on() ? <Icon name="check" size={12} color={() => 0xffffff} strokeWidth={3} /> : <View />}
  </View>;
}

function Words(props: { text: string }): i32 { return <Text className={`text-[12px] ${fg(TEXT)}`}>{props.text}</Text>; }

/** Five stars; a click on the n-th gives n. */
function Stars(props: { value: number; onPick: (n: number) => void }): i32 {
  const one = (n: number): i32 => <View className="cursor-pointer" onPointerDown={(e: ui.PointerEvent) => props.onPick(n)}>
    <Icon name="star" size={15} color={() => color(n <= props.value ? ACCENT : FAINT)} strokeWidth={2} />
  </View>;
  return <View className="flex-row items-center gap-0.5 shrink-0">{one(1)}{one(2)}{one(3)}{one(4)}{one(5)}</View>;
}

function num(n: number): string { return `${Math.round(n * 100) / 100}`; }
function parsed(v: string, scale: number): number { const n = Number(v.trim()); return v.trim() === '' || isNaN(n) ? 0 : n * scale; }
function pad2(n: number): string { return n < 10 ? `0${n}` : `${n}`; }
function day(s: number): string { const d = new Date(s * 1000); return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`; }
/** "2024-05-01" → Unix seconds at midnight UTC; -1 when it is not a date. */
function dayValue(v: string): number {
  const p = v.trim().split('-');
  if (p.length !== 3) return -1;
  const y = Number(p[0]), m = Number(p[1]), d = Number(p[2]);
  return isNaN(y) || isNaN(m) || isNaN(d) || m < 1 || m > 12 || d < 1 || d > 31 ? -1 : Date.UTC(y, m - 1, d) / 1000;
}

/** The value part of a row, by the field's kind and the condition. */
function Value(props: { r: ipod.SmartRule; info: FieldInfo }): i32 {
  const r = props.r, info = props.info, range = r.action === 'inRange' || r.action === 'notInRange';
  if (info.kind === 'text') return <View className="flex-row items-center gap-1">
    <Field value={r.text} width={suggests(r.field) ? 196 : 220} onInput={(v: string) => { r.text = v; touched(); }} />
    {suggests(r.field) ? <View className={`items-center justify-center w-[22] h-[26] rounded-[6] cursor-pointer hover:${bg(HOVER)}`}
      onPointerDown={async (e: ui.PointerEvent): Promise<void> => {
        const vs = suggestions(r.field, r.text);
        const picked = vs.length > 0 ? await choose(e, vs, vs) : '';
        if (picked !== '') setPicked(r, picked, r.value, r.value2, r.units);
      }}><Icon name="list-filter" size={14} color={() => color(MUTED)} strokeWidth={2} /></View> : <View />}
  </View>;
  if (info.kind === 'rating') return <View className="flex-row items-center gap-2">
    <Stars value={r.value} onPick={(n: number) => setPicked(r, '', n, r.value2, '')} />
    {range ? <Words text="to" /> : <View />}
    {range ? <Stars value={r.value2} onPick={(n: number) => setPicked(r, '', r.value, n, '')} /> : <View />}
  </View>;
  if (info.kind === 'media') {
    const k = (): string => { for (let i = 0; i < ipod.MEDIA_BITS.length; i++) if (ipod.MEDIA_BITS[i] === r.value) return MEDIA_NAMES[i]; return `0x${r.value.toString(16)}`; };
    return <Popup label={k} width={140} onPress={async (e: ui.PointerEvent): Promise<void> => {
      const ids: string[] = [];
      for (const b of ipod.MEDIA_BITS) ids.push(`${b}`);
      const picked = await choose(e, ids, MEDIA_NAMES);
      if (picked !== '') setPicked(r, '', Number(picked), 0, '');
    }} />;
  }
  if (info.kind === 'playlist') {
    const name = (): string => { for (const p of playlists()) if (p.id === r.text) return p.name; return 'a playlist'; };
    return <Popup label={name} width={200} onPress={async (e: ui.PointerEvent): Promise<void> => {
      const ids: string[] = [], names: string[] = [];
      for (const p of playlists()) { ids.push(p.id); names.push(p.name); }
      const picked = ids.length > 0 ? await choose(e, ids, names) : '';
      if (picked !== '') setPicked(r, picked, 0, 0, '');
    }} />;
  }
  if (info.kind === 'date' && (r.action === 'inTheLast' || r.action === 'notInTheLast')) return <View className="flex-row items-center gap-1.5">
    <Field value={num(r.value)} width={56} onInput={(v: string) => { r.value = parsed(v, 1); touched(); }} />
    <Popup label={() => r.units} width={88} onPress={async (e: ui.PointerEvent): Promise<void> => {
      const picked = await choose(e, DATE_UNITS, DATE_UNITS);
      if (picked !== '') setPicked(r, '', r.value, 0, picked);
    }} />
  </View>;
  if (info.kind === 'date') {
    const set = (v: string, second: boolean): void => { const s = dayValue(v); if (s < 0) return; if (second) r.value2 = s; else r.value = s; touched(); };
    return <View className="flex-row items-center gap-1.5">
      <Field value={day(r.value)} width={100} placeholder="YYYY-MM-DD" onInput={(v: string) => set(v, false)} />
      {range ? <Words text="to" /> : <View />}
      {range ? <Field value={day(r.value2)} width={100} placeholder="YYYY-MM-DD" onInput={(v: string) => set(v, true)} /> : <View />}
    </View>;
  }
  return <View className="flex-row items-center gap-1.5">
    <Field value={num(r.value / info.scale)} width={72} onInput={(v: string) => { r.value = parsed(v, info.scale); touched(); }} />
    {range ? <Words text="to" /> : <View />}
    {range ? <Field value={num(r.value2 / info.scale)} width={72} onInput={(v: string) => { r.value2 = parsed(v, info.scale); touched(); }} /> : <View />}
    {info.unit !== '' ? <Text className={`text-[12px] ${fg(MUTED)}`}>{info.unit}</Text> : <View />}
  </View>;
}

function RoundButton(props: { plus: boolean; onPress: () => void }): i32 {
  return <View className={`items-center justify-center w-[22] h-[22] rounded-full border cursor-pointer ${bg(CARD)} ${bd(BORDER)} hover:${bg(HOVER)}`}
    onPointerDown={(e: ui.PointerEvent) => props.onPress()}>
    {props.plus ? <Icon name="plus" size={12} color={() => color(TEXT)} strokeWidth={2.5} /> : <Icon name="minus" size={12} color={() => color(TEXT)} strokeWidth={2.5} />}
  </View>;
}

/** One rule: field ▾, condition ▾, value, − (not on the last row left) and +. */
function RuleRow(props: { r: ipod.SmartRule }): i32 {
  const r = props.r, found = fieldInfo(r.field);
  const info = found !== null ? found as FieldInfo : new FieldInfo(r.field, r.field, 'text', '', 1);
  return <View className="flex-row items-center gap-2 h-[32]">
    <Popup label={() => info.label} width={124} onPress={async (e: ui.PointerEvent): Promise<void> => {
      const ids: string[] = [], names: string[] = [];
      for (const x of FIELDS) { ids.push(x.key); names.push(x.label); }
      const picked = await choose(e, ids, names);
      if (picked !== '') setField(r, picked);
    }} />
    <Popup label={() => actionLabel(info.kind, r.action)} width={136} onPress={async (e: ui.PointerEvent): Promise<void> => {
      const ids = actionsOf(info.kind);
      const picked = await choose(e, ids, ids.map((a: string) => actionLabel(info.kind, a)));
      if (picked !== '') setAction(r, picked);
    }} />
    <View className="grow flex-row items-center min-w-0"><Value r={r} info={info} /></View>
    {rows().length > 1 ? <RoundButton plus={false} onPress={() => replaceRow(r, null)} /> : <View className="w-[22]" />}
    <RoundButton plus={true} onPress={() => addRowAfter(r)} />
  </View>;
}

function Chip(props: { label: string; onPress: () => void }): i32 {
  return <View className={`h-[24] px-2.5 justify-center rounded-full border cursor-pointer ${bg(CARD)} ${bd(BORDER)} hover:${bg(HOVER)}`}
    onPointerDown={(e: ui.PointerEvent) => props.onPress()}>
    <Text className={`text-[11px] font-semibold ${fg(TEXT)}`}>{props.label}</Text>
  </View>;
}

export function SmartEditor(props: { e: SmartEdit }): i32 {
  const e = props.e;
  const tracks = (): ipod.Track[] => previewTracks();
  const summary = (): string => {
    let ms = 0, size = 0;
    const ts = tracks();
    for (const t of ts) { ms += t.durationMs; size += t.size; }
    return `${count(ts.length, 'song', 'songs')} · ${longDuration(ms)} · ${bytes(size)}`;
  };
  const sortName = (): string => { edits(); const i = LIMIT_SORTS.indexOf(e.limitSort); return i >= 0 ? LIMIT_SORT_NAMES[i] : e.limitSort; };
  return <View className="grow flex-col min-h-0 min-w-0">
    <View className={`flex-col gap-1.5 px-8 pt-6 pb-3 border-b ${bd(BORDER)}`}>
      <View className="flex-row items-center gap-3">
        <Icon name="sliders-horizontal" size={18} color={() => color(ACCENT)} strokeWidth={2} />
        <View className={`grow flex-row items-center h-[32] px-2 rounded-[6] border ${bg(CARD)} ${bd(BORDER)}`}>
          <Input className={`grow text-[16px] font-semibold ${fg(TEXT)}`} value={e.name} placeholder={e.id === '' ? 'New smart playlist' : 'Name'}
            onInput={(v: string) => { e.name = v; }} />
        </View>
        <Button icon="x" label="Close" onPress={() => closeEditor()} />
      </View>
      {e.id === '' ? <View className="flex-row flex-wrap items-center gap-1.5 pt-1">
        <Text className={`text-[11px] font-semibold ${fg(MUTED)}`}>TEMPLATES</Text>
        {templates().map((name: string) => <Chip label={name} onPress={() => applyTemplate(name)} />)}
      </View> : <View />}
      <View className="flex-row items-center gap-2 pt-1">
        <Words text="Match" />
        <Popup label={() => { edits(); return e.match; }} width={60} onPress={async (ev: ui.PointerEvent): Promise<void> => {
          const picked = await choose(ev, ['all', 'any'], ['all', 'any']);
          if (picked !== '') { e.match = picked; touched(); }
        }} />
        <Words text="of the following rules:" />
      </View>
      <For each={rows()}>{(r: ipod.SmartRule, i: i32) => <RuleRow r={r} />}</For>
      <View className="flex-row items-center gap-2 h-[32]">
        <Check on={() => { edits(); return e.limitOn; }} onToggle={() => { e.limitOn = !e.limitOn; touched(); }} />
        <Words text="Limit to" />
        <Field value={num(e.limitValue)} width={56} onInput={(v: string) => { e.limitValue = parsed(v, 1); touched(); }} />
        <Popup label={() => { edits(); return e.limitType; }} width={80} onPress={async (ev: ui.PointerEvent): Promise<void> => {
          const picked = await choose(ev, LIMIT_TYPES, LIMIT_TYPES);
          if (picked !== '') { e.limitType = picked; e.limitOn = true; touched(); }
        }} />
        <Words text="selected by" />
        <Popup label={sortName} width={170} onPress={async (ev: ui.PointerEvent): Promise<void> => {
          const picked = await choose(ev, LIMIT_SORTS, LIMIT_SORT_NAMES);
          if (picked !== '') { e.limitSort = picked; e.limitOn = true; touched(); }
        }} />
      </View>
      <View className="flex-row items-center gap-2 h-[26]">
        <Check on={() => { edits(); return e.live; }} onToggle={() => { e.live = !e.live; touched(); }} />
        <Words text="Live updating" />
        <Text className={`text-[11px] ${fg(MUTED)}`}>(filled again from the play counts and ratings each time the app saves to the iPod)</Text>
      </View>
    </View>
    <View className="flex-row items-center gap-3 px-8 pt-3 pb-3">
      <View className="grow basis-0 flex-col min-w-0">
        <Text className={`text-[15px] font-semibold ${fg(TEXT)}`}>{summary()}</Text>
        <Text className={`text-[12px] ${fg(MUTED)}`} numberOfLines={1}>{remoteOpen() ? 'A preview: the iPod daemon cannot write smart playlists yet'
          : e.id === '' ? 'Saved to the iPod as a smart playlist' : 'Save to iPod replaces the rules of this smart playlist'}</Text>
      </View>
      <Button icon="play" label="Play" accent={true} disabled={tracks().length === 0} onPress={() => playPreview(e)} />
      <Button icon="list-plus" label="Save to iPod" busy={busy('playlist')} onPress={() => saveSmart(e)} />
    </View>
    <TrackTable tracks={tracks} numbered={false} sortable={false} showAlbum={true} from={e.name !== '' ? e.name : 'Smart playlist'} scrollKey={scrollKey('smart')} />
  </View>;
}
