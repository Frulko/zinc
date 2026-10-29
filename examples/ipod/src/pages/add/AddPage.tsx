// Adding to the iPod: choose what the files are (music, podcast, audiobook, video) and a playlist to put them in, then pick files
// or a folder, or drop them on the window. zinc:ipod checks the space before copying anything and says per file what happened
// (added, refused format, not audio). Behind Allow changes; the database is backed up before the first change of the session.
import * as ui from 'zinc:ui';
import { Icon } from 'zinc:icons';
import * as ipod from 'zinc:ipod';
import { allowChanges, playlists } from '../../state';
import { addKind, setAddKind, addPlaylist, setAddPlaylist, addResults, notice, pickAndAdd } from '../../actions';
import { Button } from '../../components/Button';
import { bg, bd, fg, color, CARD, BORDER, HOVER, SELECTED, TEXT, MUTED, FAINT, ACCENT, ACCENT_SOFT, ERROR, ADD_KINDS, ADD_KIND_NAMES } from '../../constants';

function KindChip(props: { kind: string; label: string }): i32 {
  const on = (): boolean => addKind() === props.kind;
  return <View className={`px-3 h-[28] justify-center rounded-full border cursor-pointer ${on() ? `${bg(ACCENT_SOFT)} ${bd(ACCENT)}` : `${bd(BORDER)} hover:${bg(HOVER)}`}`}
    onPointerDown={(e: ui.PointerEvent) => setAddKind(props.kind)}>
    <Text className={`text-[12px] font-semibold ${on() ? fg(ACCENT) : fg(TEXT)}`}>{props.label}</Text>
  </View>;
}

function PlaylistChip(props: { name: string; label: string }): i32 {
  const on = (): boolean => addPlaylist() === props.name;
  return <View className={`px-3 h-[26] justify-center rounded-[6] cursor-pointer ${on() ? bg(SELECTED) : `hover:${bg(HOVER)}`}`}
    onPointerDown={(e: ui.PointerEvent) => setAddPlaylist(props.name)}>
    <Text className={`text-[12px] ${fg(TEXT)} ${on() ? 'font-semibold' : ''}`}>{props.label}</Text>
  </View>;
}

function base(path: string): string { return path.slice(path.lastIndexOf('/') + 1); }

function ResultRow(props: { r: ipod.AddResult }): i32 {
  const r = props.r, ok = r.error === '';
  return <View className={`flex-row items-center gap-2.5 px-4 py-2 border-t ${bd(BORDER)}`}>
    <Icon name={ok ? 'circle-check' : 'circle-x'} size={14} color={() => color(ok ? ACCENT : ERROR)} strokeWidth={2} />
    <Text className={`w-[260] text-[13px] ${fg(TEXT)}`} numberOfLines={1}>{base(r.file)}</Text>
    <Text className={`grow basis-0 text-[12px] ${ok ? fg(MUTED) : fg(ERROR)}`} numberOfLines={2}>{ok ? 'Added' : r.error}</Text>
  </View>;
}

export function AddPage(): i32 {
  return <ScrollView className="grow">
    <View className="flex-col gap-6 px-10 py-8">
      <View className="flex-col">
        <Text className={`text-[26px] font-bold ${fg(TEXT)}`}>Add to iPod</Text>
        <Text className={`text-[13px] ${fg(MUTED)}`}>MP3, AAC, ALAC, WAV, AIFF, M4B and MP4 video; the space is checked before anything is copied</Text>
      </View>
      {!allowChanges() ? <View className={`flex-row items-center gap-2.5 px-4 py-3 rounded-[10] border ${bd(ERROR)}`}>
        <Icon name="lock" size={16} color={() => color(ERROR)} strokeWidth={2} />
        <Text className={`text-[13px] ${fg(ERROR)}`}>Turn on Allow changes in the sidebar to add to the iPod</Text>
      </View> : <View />}
      <View className="flex-col gap-2">
        <Text className={`text-[11px] font-semibold ${fg(FAINT)}`}>ADD AS</Text>
        <View className="flex-row gap-2">{ADD_KINDS.map((k: string, i: i32) => <KindChip kind={k} label={ADD_KIND_NAMES[i]} />)}</View>
      </View>
      <View className="flex-col gap-2">
        <Text className={`text-[11px] font-semibold ${fg(FAINT)}`}>INTO THE PLAYLIST</Text>
        <View className="flex-row flex-wrap gap-1">
          <PlaylistChip name="" label="None" />
          {playlists().filter((p: ipod.Playlist) => !p.podcasts && !p.smart).map((p: ipod.Playlist) => <PlaylistChip name={p.name} label={p.name} />)}
        </View>
      </View>
      <View className={`flex-col items-center gap-3 py-8 rounded-[12] border ${bg(CARD)} ${bd(BORDER)}`}>
        <Icon name="upload" size={30} color={() => color(allowChanges() ? ACCENT : FAINT)} strokeWidth={1.5} />
        <Text className={`text-[14px] font-semibold ${fg(TEXT)}`}>Drop files or folders on the window</Text>
        <View className="flex-row gap-2">
          <Button icon="file-plus" label="Choose files…" accent={true} disabled={!allowChanges()} onPress={() => { pickAndAdd(false); }} />
          <Button icon="folder-open" label="Choose a folder…" disabled={!allowChanges()} onPress={() => { pickAndAdd(true); }} />
        </View>
        {notice() !== '' ? <Text className={`text-[12px] ${fg(ERROR)}`}>{notice()}</Text> : <View />}
      </View>
      {addResults().length > 0 ? <View className={`flex-col rounded-[10] border overflow-hidden ${bg(CARD)} ${bd(BORDER)}`}>
        <Text className={`text-[12px] font-semibold px-4 py-2 ${fg(MUTED)}`}>The last add</Text>
        {addResults().map((r: ipod.AddResult) => <ResultRow r={r} />)}
      </View> : <View />}
    </View>
  </ScrollView>;
}
