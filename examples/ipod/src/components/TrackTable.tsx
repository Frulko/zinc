// A table of tracks: a header (sortable when `sortable`), then one row per track in a VirtualList, so 2,500 tracks cost the
// rows on screen only. `numbered` shows the track number (an album) instead of the position. A click selects a row (Cmd or Ctrl
// adds one, Shift a range: what Download selected copies), a double-click plays the track, then the ones under it; the track playing
// shows a speaker instead of its number. The arrow at the end of a row downloads that track (and shows its progress: DownloadMark).
import * as ui from 'zinc:ui';
import { VirtualList } from 'zinc:ui/solid';
import { Icon } from 'zinc:icons';
import * as ipod from 'zinc:ipod';
import { sortKey, sortUp, sortBy, library, selected, selectRow } from '../state';
import { download } from '../actions';
import { DownloadMark } from './DownloadMark';
import { PodLibrary } from '../services/ipod';
import { current, isPlaying, playList } from '../services/player';
import { duration } from '../format';
import { bd, bg, fg, color, BORDER, HOVER, SELECTED, STRIPE, MUTED, TEXT, FAINT, ACCENT, ROW_HEIGHT } from '../constants';

function HeaderCell(props: { label: string; sortKey: string; sortable: boolean; className: string }): i32 {
  const on = (): boolean => props.sortable && sortKey() === props.sortKey;
  return <View className={`flex-row items-center ${props.className} ${props.sortable ? 'cursor-pointer' : ''}`}
    onPointerDown={(e: ui.PointerEvent) => { if (props.sortable) sortBy(props.sortKey); }}>
    <Text className={`text-[12px] font-semibold ${on() ? fg(TEXT) : fg(MUTED)}`}>{props.label}</Text>
    {on() ? <View className="ml-1"><Icon name={sortUp() ? 'arrow-up' : 'arrow-down'} size={12} color={() => color(TEXT)} strokeWidth={2.5} /></View> : <View />}
  </View>;
}

// what a row shows for an index past the end, while the list shrinks and before its rows are rebuilt
const NO_TRACK: ipod.Track = { id: '', title: '', artist: '', album: '', albumArtist: '', genre: '', composer: '', comment: '', trackNr: 0, tracks: 0,
  cdNr: 0, cds: 0, year: 0, rating: 0, playCount: 0, bitrate: 0, sampleRate: 0, durationMs: 0, size: 0, mediaType: '', path: '', artwork: false,
  added: 0, lastPlayed: 0 };

function isSelected(t: ipod.Track): boolean { return t.id !== '' && selected().indexOf(t.id) >= 0; }

function nowOn(t: ipod.Track): boolean { const c = current(); return c !== null && t.id !== '' && (c as ipod.Track).id === t.id; }

export function TrackTable(props: { tracks: () => ipod.Track[]; numbered: boolean; sortable: boolean; showAlbum: boolean }): i32 {
  const list = props.tracks;
  const at = (i: i32): ipod.Track => { const l = list(); return i < l.length ? l[i] : NO_TRACK; };
  return <View className="grow flex-col min-h-0">
    <View className={`flex-row items-center h-[30] px-6 gap-4 border-b ${bd(BORDER)}`}>
      <Text className={`w-[32] text-[12px] font-semibold text-right ${fg(MUTED)}`}>#</Text>
      <HeaderCell label="Title" sortKey="title" sortable={props.sortable} className="grow basis-0" />
      <HeaderCell label="Artist" sortKey="artist" sortable={props.sortable} className="w-[190]" />
      {props.showAlbum ? <HeaderCell label="Album" sortKey="album" sortable={props.sortable} className="w-[210]" /> : <View />}
      <HeaderCell label="Time" sortKey="time" sortable={props.sortable} className="w-[56] justify-end" />
      <View className="w-[16]" />
    </View>
    <VirtualList count={list().length} itemHeight={ROW_HEIGHT} className="grow min-h-0">
      {(i: i32) => <View className={`flex-row items-center px-6 gap-4 ${isSelected(at(i)) ? bg(SELECTED) : `hover:${bg(HOVER)} ${i % 2 === 1 ? bg(STRIPE) : ''}`}`} style={{ height: ROW_HEIGHT }}
        onPointerDown={(e: ui.PointerEvent) => {
          if (at(i).id === '') return;
          if (e.clicks === 2) playList(library() as PodLibrary, list(), i);
          else selectRow(list(), i, e.meta || e.ctrl, e.shift);
        }}>
        {nowOn(at(i))
          ? <View className="w-[32] items-end"><Icon name={isPlaying() ? 'volume-2' : 'volume'} size={14} color={() => color(ACCENT)} strokeWidth={2} /></View>
          : <Text className={`w-[32] text-[13px] text-right ${fg(FAINT)}`}>{props.numbered ? (at(i).trackNr > 0 ? `${at(i).trackNr}` : '') : `${i + 1}`}</Text>}
        <Text className={`grow basis-0 text-[13px] ${nowOn(at(i)) ? `${fg(ACCENT)} font-semibold` : fg(TEXT)}`} numberOfLines={1}>{at(i).title !== '' ? at(i).title : 'Untitled'}</Text>
        <Text className={`w-[190] text-[13px] ${fg(MUTED)}`} numberOfLines={1}>{at(i).artist}</Text>
        {props.showAlbum ? <Text className={`w-[210] text-[13px] ${fg(MUTED)}`} numberOfLines={1}>{at(i).album}</Text> : <View />}
        <Text className={`w-[56] text-[13px] text-right ${fg(MUTED)}`}>{duration(at(i).durationMs)}</Text>
        <View className="w-[16] items-center cursor-pointer" onPointerDown={(e: ui.PointerEvent) => { const t = at(i); if (t.id !== '') download(`“${t.title}”`, [t], `track:${t.id}`); }}>
          <DownloadMark id={() => at(i).id} />
        </View>
      </View>}
    </VirtualList>
  </View>;
}
