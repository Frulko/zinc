// The playlists on the iPod (searched by name), and the tracks of the one picked, in its order (searched by title, artist and album);
// a smart playlist shows its rules, read-only. Above them, "Genius & mixes": the last Genius list and the taste clusters of the listening
// history (drafts.ts), not on the iPod until Save to iPod; Play hears them first (on this Mac or the Sonos group chosen).
// Picking one is an entry of the history; a right click on one plays it or queues it (menus.ts). The + beside the title makes a playlist
// or a smart playlist (the editor, SmartEditor.tsx, shown here while it is open); a smart playlist's rules open in it with Edit rules, or,
// when the editor cannot read them, the playlist is duplicated as a normal one.
import * as ui from 'zinc:ui';
import * as ipod from 'zinc:ipod';
import { Icon } from 'zinc:icons';
import { playlists, playlistShown, openPlaylist, playlistTracks, filterTracks, search, setSearch, trackSearch, setTrackSearch, scrollKey } from '../../state';
import { SearchField } from '../../components/SearchField';
import { hay, words, matches } from '../../search';
import { TrackTable } from '../../components/TrackTable';
import { openTrackMenu } from '../../menus';
import { Button } from '../../components/Button';
import { download, notice, newPlaylist } from '../../actions';
import { choose } from '../../menus';
import { SMART_EDITOR, SmartEdit, smartEdit, newSmart, editSmart, whyNotEditable, duplicateAsNormal } from '../../smart';
import { SmartEditor } from './SmartEditor';
import { busy } from '../../services/transfers';
import { syncHistory, historyStarted } from '../../services/historyJobs';
import { Draft, geniusDrafts, pathDrafts, mixDrafts, draftOf, isDraft, isGenius, play, refreshDraft, saveDraft } from '../../drafts';
import { startRadio } from '../../radio';
import { count } from '../../format';
import { bg, bd, fg, color, BORDER, HOVER, SELECTED, TEXT, MUTED, ACCENT, ERROR } from '../../constants';

function PlaylistRow(props: { p: ipod.Playlist }): i32 {
  const p = props.p;
  const on = (): boolean => playlistShown() === p.id;
  return <View className={`flex-row items-center gap-2.5 h-[44] px-3 rounded-[8] cursor-pointer ${on() ? bg(SELECTED) : `hover:${bg(HOVER)}`}`}
    onPointerDown={(e: ui.PointerEvent) => { if (e.button === 0) openPlaylist(p.id); }}
    onContextMenu={(e: ui.PointerEvent) => { const list = playlistTracks(p.id); openTrackMenu(e, list, 0, list, p.name); }}>
    <Icon name={p.smart ? 'sparkles' : 'list-music'} size={18} color={() => color(ACCENT)} strokeWidth={2} />
    <View className="grow flex-col min-w-0">
      <Text className={`text-[13px] ${fg(TEXT)} ${on() ? 'font-semibold' : ''}`} numberOfLines={1}>{p.name}</Text>
      <Text className={`text-[11px] ${fg(MUTED)}`}>{`${count(p.trackIds.length, 'song', 'songs')}${p.podcasts ? ' · podcasts' : p.smart ? ' · smart' : ''}`}</Text>
    </View>
  </View>;
}

function DraftRow(props: { d: Draft }): i32 {
  const d = props.d;
  const on = (): boolean => playlistShown() === d.id;
  return <View className={`flex-row items-center gap-2.5 h-[44] px-3 rounded-[8] cursor-pointer ${on() ? bg(SELECTED) : `hover:${bg(HOVER)}`}`}
    onPointerDown={(e: ui.PointerEvent) => { if (e.button === 0) openPlaylist(d.id); }}
    onContextMenu={(e: ui.PointerEvent) => openTrackMenu(e, d.tracks, 0, d.tracks, d.name)}>
    <Icon name={isGenius(d) ? 'sparkles' : 'disc-3'} size={18} color={() => color(ACCENT)} strokeWidth={2} />
    <View className="grow flex-col min-w-0">
      <Text className={`text-[13px] ${fg(TEXT)} ${on() ? 'font-semibold' : ''}`} numberOfLines={1}>{d.name}</Text>
      <Text className={`text-[11px] ${fg(MUTED)}`}>{`${count(d.tracks.length, 'song', 'songs')} · draft`}</Text>
    </View>
  </View>;
}

/** The smart playlist being made or edited, while the editor is open. */
function EditorRow(props: { e: SmartEdit }): i32 {
  const on = (): boolean => playlistShown() === SMART_EDITOR;
  return <View className={`flex-row items-center gap-2.5 h-[44] px-3 rounded-[8] cursor-pointer ${on() ? bg(SELECTED) : `hover:${bg(HOVER)}`}`}
    onPointerDown={(e: ui.PointerEvent) => { if (e.button === 0) openPlaylist(SMART_EDITOR); }}>
    <Icon name="sliders-horizontal" size={18} color={() => color(ACCENT)} strokeWidth={2} />
    <View className="grow flex-col min-w-0">
      <Text className={`text-[13px] ${fg(TEXT)} ${on() ? 'font-semibold' : ''}`} numberOfLines={1}>{props.e.id === '' ? 'New smart playlist' : props.e.name}</Text>
      <Text className={`text-[11px] ${fg(MUTED)}`}>editing the rules</Text>
    </View>
  </View>;
}

/** Why no playlist is listed (none on the iPod, or none matches the search). */
function NoPlaylist(props: { none: boolean; noMatch: boolean }): i32 {
  return <View>{props.none ? <Text className={`text-[13px] px-3 ${fg(MUTED)}`}>No playlists on this iPod</Text>
    : props.noMatch ? <Text className={`text-[13px] px-3 ${fg(MUTED)}`}>No playlist matches</Text> : <View />}</View>;
}

/** A draft: its songs, Play, Refresh (Genius) and Save to iPod. */
function DraftView(props: { d: Draft }): i32 {
  const d = props.d;
  const tracks = (): ipod.Track[] => filterTracks(d.tracks, words(trackSearch()));
  const why = new Map<string, string>();   // a Genius list: why each song was picked, in a column beside the artist
  for (let i = 0; i < d.why.length && i < d.tracks.length; i++) if (d.why[i] !== '') why.set(d.tracks[i].id, d.why[i]);
  return <View className="grow flex-col min-h-0 min-w-0">
    <View className="flex-row items-end gap-3 px-8 pt-8 pb-4">
      <View className="grow basis-0 flex-col min-w-0">
        <Text className={`text-[22px] font-bold ${fg(TEXT)}`} numberOfLines={1}>{d.name}</Text>
        <Text className={`text-[13px] ${fg(MUTED)}`}>{`${count(d.tracks.length, 'song', 'songs')} · a draft, not on the iPod until it is saved`}</Text>
      </View>
      <Button icon="play" label="Play" accent={true} onPress={() => play(d)} />
      {isGenius(d) ? <Button icon="refresh-cw" label="Refresh" onPress={() => refreshDraft(d)} /> : <View />}
      {isGenius(d) ? <Button icon="radio" label="Start radio" onPress={() => startRadio(d.tracks[0])} /> : <View />}
      <Button icon="list-plus" label="Save to iPod" busy={busy(`Save “${d.name}” to the iPod`)} onPress={() => saveDraft(d)} />
    </View>
    {why.size > 0 ? <TrackTable tracks={tracks} numbered={false} sortable={false} showAlbum={false} from={d.name} scrollKey={scrollKey('playlist')} why={why} />
      : <TrackTable tracks={tracks} numbered={false} sortable={false} showAlbum={true} from={d.name} scrollKey={scrollKey('playlist')} />}
  </View>;
}

export function PlaylistsPage(): i32 {
  if (historyStarted()) syncHistory();   // the iPods' new listens matched: the mixes read them (no history made from here)
  const drafts = (): Draft[] => geniusDrafts().concat(pathDrafts()).concat(mixDrafts());
  const shownDraft = (): Draft | null => isDraft(playlistShown()) ? draftOf(playlistShown()) : null;
  const shown = (): ipod.Playlist | null => { for (const p of playlists()) if (p.id === playlistShown()) return p; return playlists().length > 0 ? playlists()[0] : null; };
  const listed = (): ipod.Playlist[] => { const ws = words(search()); return ws.length === 0 ? playlists() : playlists().filter((p: ipod.Playlist) => matches(hay([p.name]), ws)); };
  const tracks = (): ipod.Track[] => filterTracks(playlistTracks((shown() as ipod.Playlist).id), words(trackSearch()));
  return <View className="grow flex-row min-h-0">
    <View className={`flex-col w-[250] shrink-0 border-r ${bd(BORDER)}`}>
      <View className="flex-row items-center px-6 pt-8 pb-3">
        <Text className={`grow text-[26px] font-bold ${fg(TEXT)}`}>Playlists</Text>
        <View className={`items-center justify-center w-[28] h-[28] rounded-full cursor-pointer hover:${bg(HOVER)}`}
          onPointerDown={async (e: ui.PointerEvent): Promise<void> => {
            const picked = await choose(e, ['new', 'smart'], ['New playlist', 'New smart playlist…']);
            if (picked === 'new') newPlaylist(); else if (picked === 'smart') newSmart();
          }}><Icon name="plus" size={18} color={() => color(ACCENT)} strokeWidth={2.5} /></View>
      </View>
      <View className="px-3 pb-3"><SearchField value={search()} onInput={(v: string) => setSearch(v)} placeholder="Search playlists" width={226} /></View>
      <ScrollView className="grow flex-col px-3 gap-0.5" scrollKey={scrollKey('playlists')}>
        {smartEdit() !== null ? <EditorRow e={smartEdit() as SmartEdit} /> : <View />}
        {drafts().length > 0 ? <View className="flex-col gap-0.5">
          <Text className={`text-[11px] font-semibold px-3 pt-1 pb-1 ${fg(MUTED)}`}>GENIUS & MIXES</Text>
          {drafts().map((d: Draft) => <DraftRow d={d} />)}
          <Text className={`text-[11px] font-semibold px-3 pt-3 pb-1 ${fg(MUTED)}`}>ON THE IPOD</Text>
          <NoPlaylist none={playlists().length === 0} noMatch={listed().length === 0} />
        </View> : <NoPlaylist none={playlists().length === 0} noMatch={listed().length === 0} />}
        {listed().map((p: ipod.Playlist) => <PlaylistRow p={p} />)}
      </ScrollView>
    </View>
    <View className="grow basis-0 flex-col min-h-0 min-w-0">
      {notice() !== '' ? <Text className={`text-[12px] px-8 pt-3 ${fg(ERROR)}`}>{notice()}</Text> : <View />}
      {playlistShown() === SMART_EDITOR && smartEdit() !== null ? <SmartEditor e={smartEdit() as SmartEdit} />
        : shownDraft() !== null ? <DraftView d={shownDraft() as Draft} /> : shown() !== null ? <View className="grow flex-col min-h-0 min-w-0">
        <View className="flex-row items-end gap-3 px-8 pt-8 pb-4">
          <View className="grow basis-0 flex-col min-w-0">
            <Text className={`text-[22px] font-bold ${fg(TEXT)}`} numberOfLines={1}>{(shown() as ipod.Playlist).name}</Text>
            <Text className={`text-[13px] ${fg(MUTED)}`}>{trackSearch().trim() === '' ? count((shown() as ipod.Playlist).trackIds.length, 'song', 'songs')
              : `${tracks().length} of ${count((shown() as ipod.Playlist).trackIds.length, 'song', 'songs')}`}</Text>
            {(shown() as ipod.Playlist).smart ? <View className="flex-row items-center gap-1.5 pt-1 min-w-0">
              <Icon name="sparkles" size={13} color={() => color(MUTED)} strokeWidth={2} />
              <Text className={`text-[12px] ${fg(MUTED)}`} numberOfLines={2}>{ipod.describeSmart((shown() as ipod.Playlist).rules, playlists()) +
                ((shown() as ipod.Playlist).rules.refreshable ? '' : ' · kept as iTunes wrote it')}</Text>
            </View> : <View />}
          </View>
          <SearchField value={trackSearch()} onInput={(v: string) => setTrackSearch(v)} placeholder="Search in the playlist" width={220} />
          {(shown() as ipod.Playlist).smart && whyNotEditable(shown() as ipod.Playlist) === ''
            ? <Button icon="sliders-horizontal" label="Edit rules" onPress={() => editSmart(shown() as ipod.Playlist)} /> : <View />}
          <Button icon="download" label="Download" busy={busy(`Download “${(shown() as ipod.Playlist).name}”`)} onPress={() => { const p = shown() as ipod.Playlist; download(`“${p.name}”`, playlistTracks(p.id)); }} />
        </View>
        {(shown() as ipod.Playlist).smart && whyNotEditable(shown() as ipod.Playlist) !== '' ? <View className="flex-row items-center gap-3 px-8 pb-4 min-w-0">
          <Text className={`grow basis-0 text-[12px] ${fg(MUTED)}`} numberOfLines={2}>{`These rules cannot be edited here: ${whyNotEditable(shown() as ipod.Playlist)}.`}</Text>
          <Button icon="copy" label="Duplicate as normal playlist" onPress={() => duplicateAsNormal(shown() as ipod.Playlist)} />
        </View> : <View />}
        <TrackTable tracks={tracks} numbered={false} sortable={false} showAlbum={true} from={(shown() as ipod.Playlist).name} scrollKey={scrollKey('playlist')} />
      </View> : <View />}
    </View>
  </View>;
}
