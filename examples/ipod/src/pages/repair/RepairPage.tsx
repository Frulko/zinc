// Repair my library (repair.ts): albums without a cover, songs without a year or genre, artist names written several ways and duplicates,
// one section each with Fix all; each row says what is wrong and, once looked up, what its Fix writes (the cover itself for a cover).
// Look for problems reads the iPod, MusicBrainz and Last.fm; writing waits for Allow changes.
import { createSignal } from 'zinc:ui/solid';
import { Icon } from 'zinc:icons';
import * as fs from 'zinc:fs';
import { imageFromBytes } from 'zinc:gfx';
import { scrollKey, allowChanges } from '../../state';
import { Finding, ofKind, lookForProblems, looking, lookError, fix, COVERS, TAGS, SPELLINGS, DUPLICATES } from '../../repair';
import { notice } from '../../actions';
import { busy } from '../../services/transfers';
import { Button } from '../../components/Button';
import { bg, bd, fg, color, CARD, BORDER, TEXT, MUTED, FAINT, ACCENT, ERROR, TRACK } from '../../constants';

const THUMB: i32 = 44;

const images = new Map<string, i32>();
function imageOf(file: string): i32 {
  const had = images.get(file);
  if (had !== undefined) return had as i32;
  let img = -1;
  try { img = imageFromBytes(fs.readBytes(file)); } catch (e) { /* unreadable: the icon */ }
  images.set(file, img);
  return img;
}

function Thumb(props: { f: Finding; icon: string }): i32 {
  return <View className={`items-center justify-center rounded-[6] overflow-hidden shrink-0 ${bg(TRACK)}`} style={{ width: THUMB, height: THUMB }}>
    {props.f.cover !== '' && imageOf(props.f.cover) >= 0 ? <Image image={imageOf(props.f.cover)} className="w-full h-full object-cover" />
      : <Icon name={props.icon} size={18} color={() => color(MUTED)} strokeWidth={1.5} />}
  </View>;
}

function Row(props: { f: Finding; icon: string }): i32 {
  const f = props.f;
  const ready = f.dup !== null || f.changes.length > 0;
  return <View className={`flex-row items-center gap-3 px-4 py-2.5 border-b ${bd(BORDER)}`}>
    <Thumb f={f} icon={props.icon} />
    <View className="grow basis-0 flex-col gap-0.5 min-w-0">
      <Text className={`text-[13px] font-semibold ${fg(TEXT)}`} numberOfLines={1}>{f.title}</Text>
      <Text className={`text-[12px] ${fg(MUTED)}`} numberOfLines={1}>{f.sub}</Text>
      <Text className={`text-[12px] ${ready ? fg(ACCENT) : fg(FAINT)}`} numberOfLines={1}>
        {ready ? `Fix: ${f.preview}` : f.state === 'ask' ? 'Look for problems to find a fix' : 'Nothing found to fix it with'}
      </Text>
    </View>
    <Button icon="wrench" label={f.dup !== null ? 'Merge' : 'Fix'} disabled={!ready || !allowChanges()} busy={busy('repair')} onPress={() => fix([f], `Repair ${f.title}`)} />
  </View>;
}

function Section(props: { kind: string; title: string; icon: string; empty: string }): i32 {
  const list = (): Finding[] => ofKind(props.kind);
  const ready = (): Finding[] => list().filter((f: Finding) => f.dup !== null || f.changes.length > 0);
  return <View className={`flex-col rounded-[10] border overflow-hidden ${bg(CARD)} ${bd(BORDER)}`}>
    <View className={`flex-row items-center gap-3 px-4 py-3 border-b ${bd(BORDER)}`}>
      <Icon name={props.icon} size={16} color={() => color(ACCENT)} strokeWidth={2} />
      <Text className={`grow text-[15px] font-bold ${fg(TEXT)}`}>{`${props.title}${list().length > 0 ? ` · ${list().length}` : ''}`}</Text>
      {ready().length > 0 ? <Button icon="wrench" label={`Fix all ${ready().length}`} accent={true} disabled={!allowChanges()} busy={busy('repair')}
        onPress={() => fix(ready(), `Repair ${props.title.toLowerCase()}`)} /> : <View />}
    </View>
    {list().length === 0 ? <Text className={`text-[12px] px-4 py-3 ${fg(MUTED)}`}>{props.empty}</Text> : <View />}
    {list().map((f: Finding) => <Row f={f} icon={props.icon} />)}
  </View>;
}

export function RepairPage(): i32 {
  return <ScrollView className="grow" scrollKey={scrollKey('repair')}>
    <View className="flex-col gap-4 px-10 pt-6 pb-10">
      <View className="flex-row items-end gap-4">
        <View className="grow flex-col gap-1">
          <Text className={`text-[26px] font-bold ${fg(TEXT)}`}>Repair my library</Text>
          <Text className={`text-[13px] ${fg(MUTED)}`}>Covers, years, genres and spellings from MusicBrainz and Last.fm, and duplicates. Each fix shows what it writes.</Text>
        </View>
        <Button icon={looking() ? 'loader-circle' : 'search'} label={looking() ? 'Looking…' : 'Look for problems'} accent={true} busy={looking()} onPress={lookForProblems} />
      </View>
      {!allowChanges() || lookError() !== '' || notice() !== '' ? <View className="flex-col gap-1">
        {!allowChanges() ? <Text className={`text-[12px] ${fg(MUTED)}`}>Turn on Allow changes to write the fixes to the iPod.</Text> : <View />}
        {lookError() !== '' ? <Text className={`text-[12px] ${fg(ERROR)}`}>{lookError()}</Text> : <View />}
        {notice() !== '' ? <Text className={`text-[12px] ${fg(ERROR)}`}>{notice()}</Text> : <View />}
      </View> : <View />}
      <Section kind={COVERS} title="Covers" icon="image-plus" empty="Every album has a cover." />
      <Section kind={TAGS} title="Years and genres" icon="calendar" empty="Every song has a year and a genre." />
      <Section kind={SPELLINGS} title="Spellings" icon="spell-check" empty="Every artist is written one way." />
      <Section kind={DUPLICATES} title="Duplicates" icon="copy" empty="No duplicates found (Look for problems analyses the iPod)." />
    </View>
  </ScrollView>;
}
