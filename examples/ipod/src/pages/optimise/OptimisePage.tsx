// Optimise: what can be cleaned up on the iPod. Analyse (a job that only reads it) finds the duplicates, by their tags, by identical
// files and by their sound (Chromaprint fingerprints, cached on the computer), the music without a cover or tags, the files no track
// uses and the empty playlists. Each duplicate group shows why it matched and its copies, the one kept first (zinc:ipod's score; a
// click on another copy keeps that one instead) with a tick to merge it; Merge selected (behind Allow changes) merges the ticked groups.
import * as ui from 'zinc:ui';
import { Icon } from 'zinc:icons';
import * as ipod from 'zinc:ipod';
import { library, allowChanges } from '../../state';
import { PodLibrary } from '../../services/ipod';
import { notice, remoteOpen } from '../../actions';
import { analysis, duplicates, analyse, mergeTicked, tracksById, songName, DuplicateRow } from '../../optimise';
import { Button } from '../../components/Button';
import { bytes, count, duration } from '../../format';
import { bg, bd, fg, color, CARD, BORDER, HOVER, TEXT, MUTED, FAINT, ACCENT, ACCENT_SOFT, ERROR, REMOTE_LOCAL_ONLY } from '../../constants';

const REASONS: string[] = ['tags', 'Same tags', 'file', 'Same file', 'audio', 'Same sound'];
function reasonLabel(r: string): string { for (let i = 0; i < REASONS.length; i += 2) if (REASONS[i] === r) return REASONS[i + 1]; return r; }

function Badge(props: { label: string }): i32 {
  return <View className={`px-2 py-0.5 rounded-full ${bg(ACCENT_SOFT)}`}><Text className={`text-[10px] font-semibold ${fg(ACCENT)}`}>{props.label}</Text></View>;
}

/** A number of the summary: how many, what, and a detail line. */
function Tile(props: { icon: string; value: string; label: string; detail: string }): i32 {
  return <View className={`grow basis-0 flex-col gap-1 px-4 py-3 rounded-[10] border min-w-0 ${bg(CARD)} ${bd(BORDER)}`}>
    <View className="flex-row items-center gap-2">
      <Icon name={props.icon} size={15} color={() => color(ACCENT)} strokeWidth={2} />
      <Text className={`text-[20px] font-bold ${fg(TEXT)}`}>{props.value}</Text>
    </View>
    <Text className={`text-[12px] font-semibold ${fg(TEXT)}`} numberOfLines={1}>{props.label}</Text>
    <Text className={`text-[11px] ${fg(MUTED)}`} numberOfLines={2}>{props.detail}</Text>
  </View>;
}

function Summary(props: { a: ipod.Analysis }): i32 {
  const a = props.a;
  const tracks = tracksById();
  let spare = 0;
  for (const row of duplicates()) spare += row.freed(tracks);
  const playlistNames: string[] = [];
  const l = library();
  if (l !== null) for (const p of (l as PodLibrary).playlists) if (a.emptyPlaylists.indexOf(p.id) >= 0) playlistNames.push(p.name);
  return <View className="flex-col gap-2">
    <View className="flex-row gap-3">
      <Tile icon="copy" value={`${duplicates().length}`} label="Duplicate groups" detail={duplicates().length > 0 ? `${bytes(spare)} to free` : 'No song is there twice'} />
      <Tile icon="image" value={`${a.noArtwork.length}`} label="Without a cover" detail="Songs with no artwork" />
      <Tile icon="tag" value={`${a.missingTags.length}`} label="Missing tags" detail="No title, artist or album" />
      <Tile icon="file-x" value={`${a.orphans.length + a.missing.length}`} label="Orphan files" detail={`${bytes(a.orphanBytes)} unused · ${a.missing.length} lost`} />
      <Tile icon="list-music" value={`${a.emptyPlaylists.length}`} label="Empty playlists" detail={playlistNames.length > 0 ? playlistNames.join(', ') : 'None'} />
    </View>
    <Text className={`text-[11px] ${fg(FAINT)}`}>{`Sound fingerprints: ${a.fingerprinted} made now, ${a.fromCache} from the cache, ${a.noFingerprint} not possible (too short, silent or unreadable). Orphan files and lost tracks are cleaned by Repair on the Backups page.`}</Text>
  </View>;
}

/** One copy of a group: a dot that keeps it, its song, album and length, what the score sees of it, and its plays. */
function CopyRow(props: { row: DuplicateRow; index: i32; tracks: Map<string, ipod.Track> }): i32 {
  const id = props.row.group.trackIds[props.index];
  const t = props.tracks.get(id);
  const kept = (): boolean => props.row.keep() === id;
  const x = t !== undefined ? t as ipod.Track : null;
  return <View className={`flex-row items-center gap-3 pl-[46] pr-4 py-1.5 cursor-pointer hover:${bg(HOVER)}`}
    onPointerDown={(e: ui.PointerEvent) => props.row.setKeep(id)}>
    <View className={`w-[14] h-[14] rounded-full border-2 items-center justify-center ${kept() ? bd(ACCENT) : bd(BORDER)}`}>
      {kept() ? <View className={`w-[6] h-[6] rounded-full ${bg(ACCENT)}`} /> : <View />}
    </View>
    <Text className={`w-[58] text-[11px] font-semibold ${kept() ? fg(ACCENT) : fg(MUTED)}`}>{kept() ? 'Keep' : 'Remove'}</Text>
    <View className="grow basis-0 flex-col min-w-0">
      <Text className={`text-[12px] ${fg(TEXT)}`} numberOfLines={1}>{x !== null ? `${songName(id, props.tracks)}${x.album !== '' ? ` · ${x.album}` : ''} · ${duration(x.durationMs)}` : id}</Text>
      <Text className={`text-[11px] ${fg(MUTED)}`} numberOfLines={1}>{props.row.group.quality[props.index]}</Text>
    </View>
    <Text className={`text-[11px] ${fg(MUTED)}`}>{x !== null ? `${count(x.playCount, 'play', 'plays')} · ${bytes(x.size)}` : ''}</Text>
  </View>;
}

function GroupCard(props: { row: DuplicateRow; tracks: Map<string, ipod.Track> }): i32 {
  const r = props.row, g = r.group;
  const why = (): string => r.keep() === g.trackIds[0] ? `Keeps the best copy: ${g.keepWhy}` : 'Keeps the copy you chose';
  return <View className={`flex-col pb-2 border-t ${bd(BORDER)}`}>
    <View className="flex-row items-center gap-3 px-4 pt-2.5 pb-1.5">
      <View className={`w-[18] h-[18] rounded-[5] border items-center justify-center cursor-pointer ${r.ticked() ? `${bg(ACCENT)} ${bd(ACCENT)}` : bd(BORDER)}`}
        onPointerDown={(e: ui.PointerEvent) => r.setTicked(!r.ticked())}>
        {r.ticked() ? <Icon name="check" size={12} color={() => 0xffffff} strokeWidth={3} /> : <View />}
      </View>
      <View className="grow basis-0 flex-col gap-0.5 min-w-0">
        <View className="flex-row items-center gap-2">
          <Text className={`text-[13px] font-semibold ${fg(TEXT)}`} numberOfLines={1}>{songName(r.keep(), props.tracks)}</Text>
          {g.reasons.map((x: string) => <Badge label={reasonLabel(x)} />)}
        </View>
        <Text className={`text-[11px] ${fg(MUTED)}`} numberOfLines={1}>{`${count(g.trackIds.length, 'copy', 'copies')} · ${why()}`}</Text>
      </View>
      <Text className={`text-[11px] font-semibold ${fg(MUTED)}`}>{`frees ${bytes(r.freed(props.tracks))}`}</Text>
    </View>
    {g.trackIds.map((id: string, i: i32) => <CopyRow row={r} index={i} tracks={props.tracks} />)}
  </View>;
}

export function OptimisePage(): i32 {
  const ticked = (): i32 => { let n = 0; for (const r of duplicates()) if (r.ticked()) n++; return n; };
  const a = (): ipod.Analysis | null => analysis();
  return <ScrollView className="grow">
    <View className="flex-col gap-6 px-10 py-8">
      <View className="flex-row items-end gap-2">
        <View className="grow basis-0 flex-col min-w-0">
          <Text className={`text-[26px] font-bold ${fg(TEXT)}`}>Optimise</Text>
          <Text className={`text-[13px] ${fg(MUTED)}`} numberOfLines={1}>Duplicates, missing covers and tags, files no track uses</Text>
        </View>
        <Button icon="sparkles" label={a() === null ? 'Analyse' : 'Analyse again'} accent={a() === null && !remoteOpen()} disabled={remoteOpen()} onPress={analyse} />
        <Button icon="list-checks" label={`Merge selected (${ticked()})`} accent={a() !== null && ticked() > 0 && allowChanges()}
          disabled={a() === null || ticked() === 0 || !allowChanges()} onPress={() => { mergeTicked(); }} />
      </View>
      <View className="flex-col gap-2">
        <View className={`flex-row items-center gap-2.5 px-4 py-3 rounded-[10] border ${allowChanges() ? bd(ERROR) : bd(BORDER)}`}>
          <Icon name={allowChanges() ? 'lock-open' : 'lock'} size={16} color={() => color(allowChanges() ? ERROR : MUTED)} strokeWidth={2} />
          <Text className={`grow basis-0 text-[12px] ${fg(TEXT)}`}>{remoteOpen()
            ? `A remote iPod: Optimise is ${REMOTE_LOCAL_ONLY}.`
            : allowChanges()
            ? 'Changes are allowed: a merge removes the other copies and their files, after a backup of the database.'
            : 'Read only: analysing reads the iPod; merging needs Allow changes (in the sidebar).'}</Text>
        </View>
        {notice() !== '' ? <Text className={`text-[12px] ${fg(ERROR)}`}>{notice()}</Text> : <View />}
      </View>
      {a() === null ? <View className={`flex-col gap-1 px-4 py-4 rounded-[10] border ${bg(CARD)} ${bd(BORDER)}`}>
        <Text className={`text-[13px] font-semibold ${fg(TEXT)}`}>Not analysed yet</Text>
        <Text className={`text-[12px] ${fg(MUTED)}`}>Analyse compares the songs by their tags, their files and their sound, and keeps for each song the most complete copy: lossless first, then the bitrate, the sample rate, the tags, the cover, the track numbers and the year. Fingerprints are kept on this computer, so the next analysis is quick.</Text>
      </View> : <Summary a={a() as ipod.Analysis} />}
      {a() !== null && duplicates().length > 0 ? <View className={`flex-col rounded-[10] border overflow-hidden ${bg(CARD)} ${bd(BORDER)}`}>
        <Text className={`text-[12px] font-semibold px-4 py-2 ${fg(MUTED)}`}>{`${count(duplicates().length, 'duplicate group', 'duplicate groups')} · ${ticked()} ticked · a click on a copy keeps it instead`}</Text>
        {duplicates().map((r: DuplicateRow) => <GroupCard row={r} tracks={tracksById()} />)}
      </View> : <View />}
    </View>
  </ScrollView>;
}
