// The sidebar, as Music and the Finder show a device: the iPod open (name, model, how full, and its eject button) and the Allow changes switch, For
// you, its library's pages, the pages that manage it (add, backups, optimise, transfers with what runs, logs), the other iPods plugged in (one seen
// over USB only can be mounted), the remote iPod (an iPod daemon's, with a network mark and an x that disconnects it), and Rescan at the bottom. Everything above Rescan scrolls when the window is short.
import * as ui from 'zinc:ui';
import { Icon } from 'zinc:icons';
import * as ipod from 'zinc:ipod';
import { library, page, showPage, pods, openDevice, opening, rescan, scanning, albums, artists, countOf, photoCount, playlists, remoteAddress, remoteToken,
  openRemoteDevice, disconnectRemote } from '../state';
import { PodLibrary } from '../services/ipod';
import { bg, bd, fg, color, SIDEBAR, BORDER, HOVER, SELECTED, TEXT, MUTED, FAINT, ACCENT, ERROR, TRACK, SIDEBAR_WIDTH,
  PAGE_OVERVIEW, PAGE_ALBUMS, PAGE_ARTISTS, PAGE_SONGS, PAGE_PODCASTS, PAGE_AUDIOBOOKS, PAGE_VIDEOS, PAGE_PHOTOS, PAGE_PLAYLISTS, PAGE_FILES, PAGE_SPECS,
  PAGE_ADD, PAGE_BACKUPS, PAGE_OPTIMISE, PAGE_TRANSFERS, PAGE_LOGS, PAGE_SETTINGS, PAGE_FOR_YOU, PAGE_DISCOVER, PAGE_REPAIR } from '../constants';
import { PodDrawing } from './PodDrawing';
import { AllowChanges } from './AllowChanges';
import { pending, overallFraction, unseenFailed } from '../services/transfers';
import { ProgressRing } from 'zinc:ui/kit';
import { mountPod, ejectPod } from '../actions';

function NavRow(props: { icon: string; label: string; to: string; count: i32 }): i32 {
  const on = (): boolean => page() === props.to;
  return <View className={`flex-row items-center h-[30] px-2.5 mx-2 gap-2.5 rounded-[6] cursor-pointer ${on() ? bg(SELECTED) : `hover:${bg(HOVER)}`}`}
    onPointerDown={(e: ui.PointerEvent) => showPage(props.to)}>
    <Icon name={props.icon} size={16} color={() => color(ACCENT)} strokeWidth={2} />
    <Text className={`grow text-[13px] ${fg(TEXT)} ${on() ? 'font-semibold' : ''}`}>{props.label}</Text>
    {props.count >= 0 ? <Text className={`text-[11px] ${fg(FAINT)}`}>{`${props.count}`}</Text> : <View />}
  </View>;
}

function Section(props: { label: string }): i32 {
  return <Text className={`text-[11px] font-semibold px-4 pt-4 pb-1.5 ${fg(FAINT)}`}>{props.label}</Text>;
}

function DeviceRow(props: { d: ipod.Device }): i32 {
  const d = props.d;
  const shown = (): boolean => { const l = library(); return l !== null && (l as PodLibrary).device.mountpoint === d.mountpoint && d.mountpoint !== ''; };
  const label = d.name !== '' ? d.name : d.model !== '' ? d.model : 'iPod';
  return <View className={`flex-row items-center h-[30] px-2.5 mx-2 gap-2.5 rounded-[6] ${d.connection === 'disk' ? 'cursor-pointer' : ''} ${shown() ? bg(SELECTED) : `hover:${bg(HOVER)}`}`}
    onPointerDown={(e: ui.PointerEvent) => { if (d.connection === 'disk') openDevice(d.mountpoint); else mountPod(); }}>
    <Icon name={d.connection === 'disk' ? 'hard-drive' : 'usb'} size={16} color={() => color(MUTED)} strokeWidth={2} />
    <Text className={`grow text-[13px] ${fg(TEXT)}`} numberOfLines={1}>{label}</Text>
    {opening() === d.mountpoint && d.mountpoint !== '' ? <Text className={`text-[11px] ${fg(MUTED)}`}>opening</Text>
      : d.connection !== 'disk' ? <Text className={`text-[11px] font-semibold ${fg(ACCENT)}`}>Mount</Text> : <View />}
  </View>;
}

/** The remote iPod set in the config: a network mark, its iPod's name once open (else the address), and an x that disconnects it. */
function RemoteRow(): i32 {
  const shown = (): boolean => { const l = library(); return l !== null && (l as PodLibrary).remote !== ''; };
  const label = (): string => { const l = library(); return shown() && (l as PodLibrary).device.name !== '' ? (l as PodLibrary).device.name : remoteAddress().replace('http://', ''); };
  return <View className={`flex-row items-center h-[30] px-2.5 mx-2 gap-2.5 rounded-[6] cursor-pointer ${shown() ? bg(SELECTED) : `hover:${bg(HOVER)}`}`}
    onPointerDown={(e: ui.PointerEvent) => { openRemoteDevice(remoteAddress(), remoteToken()); }}>
    <Icon name="wifi" size={16} color={() => color(MUTED)} strokeWidth={2} />
    <Text className={`grow text-[13px] ${fg(TEXT)}`} numberOfLines={1}>{label()}</Text>
    {opening() === remoteAddress() ? <Text className={`text-[11px] ${fg(MUTED)}`}>opening</Text>
      : <View className={`p-0.5 rounded-full hover:${bg(HOVER)}`} onPointerDown={(e: ui.PointerEvent) => { disconnectRemote(); }}>
          <Icon name="x" size={13} color={() => color(FAINT)} strokeWidth={2} />
        </View>}
  </View>;
}

function OpenPod(props: { lib: PodLibrary }): i32 {
  const d = props.lib.device;
  const used = d.totalBytes > 0 ? (d.totalBytes - d.freeBytes) / d.totalBytes : 0;
  return <View className={`flex-row items-center gap-3 px-4 py-4 border-b ${bd(BORDER)}`}>
    <PodDrawing model={d.model} name={d.name} width={30} />
    <View className="grow flex-col gap-1 min-w-0">
      <Text className={`text-[14px] font-semibold ${fg(TEXT)}`} numberOfLines={1}>{d.name !== '' ? d.name : 'iPod'}</Text>
      {props.lib.remote !== '' ? <View className="flex-row items-center gap-1 min-w-0">
          <Icon name="wifi" size={11} color={() => color(MUTED)} strokeWidth={2} />
          <Text className={`grow text-[11px] ${fg(MUTED)}`} numberOfLines={1}>{d.model}</Text>
        </View>
        : <Text className={`text-[11px] ${fg(MUTED)}`} numberOfLines={1}>{d.model}</Text>}
      <View className={`h-[4] rounded-full overflow-hidden ${bg(TRACK)}`}>
        <View className={`h-full ${bg(ACCENT)}`} style={{ widthPercent: Math.max(0.01, used) }} />
      </View>
    </View>
    <View className={`p-1.5 rounded-full cursor-pointer hover:${bg(HOVER)}`} onPointerDown={(e: ui.PointerEvent) => { ejectPod(); }}>
      <Icon name="eject" size={16} color={() => color(MUTED)} strokeWidth={2} />
    </View>
  </View>;
}

/** The Transfers row: a ring of the overall progress and a badge of how many jobs wait or run, and a red dot when one failed since the page
 *  was last shown. */
function TransfersRow(): i32 {
  const on = (): boolean => page() === PAGE_TRANSFERS;
  return <View className={`flex-row items-center h-[30] px-2.5 mx-2 gap-2.5 rounded-[6] cursor-pointer ${on() ? bg(SELECTED) : `hover:${bg(HOVER)}`}`}
    onPointerDown={(e: ui.PointerEvent) => showPage(PAGE_TRANSFERS)}>
    <Icon name="arrow-down-up" size={16} color={() => color(ACCENT)} strokeWidth={2} />
    <Text className={`grow text-[13px] ${fg(TEXT)} ${on() ? 'font-semibold' : ''}`}>Transfers</Text>
    {unseenFailed() > 0 && !on() ? <View className={`w-[8] h-[8] rounded-full ${bg(ERROR)}`} /> : <View />}
    {pending() > 0 ? <ProgressRing value={() => overallFraction() * 100} size={14} color={() => color(ACCENT)} track={() => color(TRACK)} strokeWidth={4} /> : <View />}
    {pending() > 0 ? <View className={`min-w-[18] h-[16] px-1 items-center justify-center rounded-full ${bg(ACCENT)}`}>
      <Text className="text-[10px] font-bold text-white">{`${pending()}`}</Text>
    </View> : <View />}
  </View>;
}

export function Sidebar(): i32 {
  return <View className={`flex-col h-full border-r ${bg(SIDEBAR)} ${bd(BORDER)}`} style={{ width: SIDEBAR_WIDTH }}>
    {library() !== null ? <OpenPod lib={library() as PodLibrary} /> : <View className="h-[12]" />}
    <View className="grow min-h-0 flex-col overflow-y-auto">
    {library() !== null ? <AllowChanges /> : <View />}
    {library() !== null ? <View className="flex-col">
      <Section label="iPod" />
      <NavRow icon="heart" label="For you" to={PAGE_FOR_YOU} count={-1} />
      <NavRow icon="compass" label="Discover" to={PAGE_DISCOVER} count={-1} />
      <NavRow icon="hard-drive" label="Overview" to={PAGE_OVERVIEW} count={-1} />
      <NavRow icon="info" label="Specs" to={PAGE_SPECS} count={-1} />
      <Section label="Library" />
      <NavRow icon="disc-3" label="Albums" to={PAGE_ALBUMS} count={albums().length} />
      <NavRow icon="mic-vocal" label="Artists" to={PAGE_ARTISTS} count={artists().length} />
      <NavRow icon="music" label="Songs" to={PAGE_SONGS} count={countOf(PAGE_SONGS)} />
      <NavRow icon="radio" label="Podcasts" to={PAGE_PODCASTS} count={countOf(PAGE_PODCASTS)} />
      <NavRow icon="book-audio" label="Audiobooks" to={PAGE_AUDIOBOOKS} count={countOf(PAGE_AUDIOBOOKS)} />
      <NavRow icon="clapperboard" label="Videos" to={PAGE_VIDEOS} count={countOf(PAGE_VIDEOS)} />
      <NavRow icon="images" label="Photos" to={PAGE_PHOTOS} count={photoCount()} />
      <NavRow icon="list-music" label="Playlists" to={PAGE_PLAYLISTS} count={playlists().length} />
      <NavRow icon="notebook-pen" label="Notes & files" to={PAGE_FILES} count={(library() as PodLibrary).extras.length} />
      <Section label="Manage" />
      <NavRow icon="plus" label="Add to iPod" to={PAGE_ADD} count={-1} />
      <NavRow icon="archive" label="Backups" to={PAGE_BACKUPS} count={-1} />
      <NavRow icon="wrench" label="Repair" to={PAGE_REPAIR} count={-1} />
      <NavRow icon="sparkles" label="Optimise" to={PAGE_OPTIMISE} count={-1} />
      <TransfersRow />
      <NavRow icon="scroll-text" label="Logs" to={PAGE_LOGS} count={-1} />
      <NavRow icon="settings" label="Settings" to={PAGE_SETTINGS} count={-1} />
    </View> : <View />}
    <Section label="Devices" />
    <View className="flex-col pb-2">
      {pods().length === 0 ? <Text className={`text-[12px] px-4 ${fg(MUTED)}`}>No iPod plugged in</Text> : <View />}
      {pods().map((d: ipod.Device) => <DeviceRow d={d} />)}
      {remoteAddress() !== '' ? <RemoteRow /> : <View />}
    </View>
    </View>
    <View className={`flex-row items-center h-[30] px-2.5 mx-2 mb-3 gap-2.5 rounded-[6] cursor-pointer hover:${bg(HOVER)}`}
      onPointerDown={(e: ui.PointerEvent) => { if (!scanning()) rescan(true); }}>
      <Icon name="refresh-cw" size={15} color={() => color(MUTED)} strokeWidth={2} />
      <Text className={`text-[13px] ${fg(MUTED)}`}>{scanning() ? 'Looking for iPods…' : 'Rescan'}</Text>
    </View>
  </View>;
}
