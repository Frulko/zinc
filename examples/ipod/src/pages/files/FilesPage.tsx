// The files the iPod keeps beside its music: notes, contacts, calendars and voice recordings, by kind; a note, a contact card
// or a calendar picked is shown as text on the right.
import * as ui from 'zinc:ui';
import * as ipod from 'zinc:ipod';
import { readText } from 'zinc:fs';
import { Icon } from 'zinc:icons';
import { library, extraShown, setExtraShown } from '../../state';
import { PodLibrary } from '../../services/ipod';
import { bytes, count } from '../../format';
import { bg, bd, fg, color, BORDER, HOVER, SELECTED, TEXT, MUTED, FAINT, ACCENT } from '../../constants';

const KINDS: string[] = ['note', 'contact', 'calendar', 'recording'];
const TITLES: string[] = ['Notes', 'Contacts', 'Calendars', 'Recordings'];
const ICONS: string[] = ['notebook-pen', 'contact', 'calendar', 'mic'];
const TEXT_LIMIT = 200000;   // a bigger file is shown cut

function FileRow(props: { x: ipod.Extra; icon: string }): i32 {
  const x = props.x, readable = x.kind !== 'recording';
  const on = (): boolean => extraShown() === x.path;
  return <View className={`flex-row items-center gap-2.5 h-[40] px-3 rounded-[8] ${readable ? 'cursor-pointer' : ''} ${on() ? bg(SELECTED) : `hover:${bg(HOVER)}`}`}
    onPointerDown={(e: ui.PointerEvent) => { if (readable) setExtraShown(x.path); }}>
    <Icon name={props.icon} size={16} color={() => color(ACCENT)} strokeWidth={2} />
    <Text className={`grow basis-0 text-[13px] ${fg(TEXT)} ${on() ? 'font-semibold' : ''}`} numberOfLines={1}>{x.name}</Text>
    <Text className={`text-[11px] ${fg(MUTED)}`}>{bytes(x.bytes)}</Text>
  </View>;
}

function Body(props: { path: string }): i32 {
  let text = '';
  try { text = readText(props.path); } catch (e) { text = `Could not read ${props.path}: ${(e as Error).message}`; }
  if (text.length > TEXT_LIMIT) text = text.slice(0, TEXT_LIMIT) + '\n…';
  const name = props.path.slice(props.path.lastIndexOf('/') + 1);
  return <View className="grow flex-col min-h-0">
    <Text className={`text-[22px] font-bold px-8 pt-8 pb-4 ${fg(TEXT)}`} numberOfLines={1}>{name}</Text>
    <ScrollView className="grow px-8 pb-8">
      <Text className={`text-[13px] ${fg(TEXT)}`}>{text}</Text>
    </ScrollView>
  </View>;
}

export function FilesPage(): i32 {
  const lib = library() as PodLibrary;
  return <View className="grow flex-row min-h-0">
    <View className={`flex-col w-[300] shrink-0 border-r ${bd(BORDER)}`}>
      <Text className={`text-[26px] font-bold px-6 pt-8 pb-1 ${fg(TEXT)}`}>Notes & files</Text>
      <Text className={`text-[13px] px-6 pb-3 ${fg(MUTED)}`}>{count(lib.extras.length, 'file', 'files')}</Text>
      <ScrollView className="grow flex-col px-3 pb-4">
        {lib.extras.length === 0 ? <Text className={`text-[13px] px-3 ${fg(MUTED)}`}>No notes, contacts, calendars or recordings</Text> : <View />}
        {KINDS.map((k: string, i: i32) => {
          const items = lib.extras.filter((x: ipod.Extra) => x.kind === k);
          return items.length === 0 ? <View /> : <View className="flex-col gap-0.5">
            <Text className={`text-[11px] font-semibold px-3 pt-3 pb-1 ${fg(FAINT)}`}>{`${TITLES[i].toUpperCase()} · ${items.length}`}</Text>
            {items.map((x: ipod.Extra) => <FileRow x={x} icon={ICONS[i]} />)}
          </View>;
        })}
      </ScrollView>
    </View>
    <View className="grow basis-0 flex-col min-h-0 min-w-0">
      {extraShown() !== '' ? <Body path={extraShown()} /> : <Text className={`text-[13px] px-8 pt-8 ${fg(MUTED)}`}>Pick a note, a contact or a calendar to read it</Text>}
    </View>
  </View>;
}
