// The sidebar, as Music and the Finder show a device: the iPod open (name, model, how full), its library's pages, the other iPods
// plugged in, and Rescan at the bottom.
import * as ui from 'zinc:ui';
import { Icon } from 'zinc:icons';
import * as ipod from 'zinc:ipod';
import { library, page, showPage, pods, openDevice, opening, rescan, scanning, albums, countOf, photoCount, playlists } from '../state';
import { PodLibrary } from '../services/ipod';
import { bg, bd, fg, color, SIDEBAR, BORDER, HOVER, SELECTED, TEXT, MUTED, FAINT, ACCENT, TRACK, SIDEBAR_WIDTH,
  PAGE_OVERVIEW, PAGE_ALBUMS, PAGE_SONGS, PAGE_PODCASTS, PAGE_AUDIOBOOKS, PAGE_VIDEOS, PAGE_PHOTOS, PAGE_PLAYLISTS, PAGE_FILES, PAGE_SPECS } from '../constants';
import { PodDrawing } from './PodDrawing';

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
    onPointerDown={(e: ui.PointerEvent) => { if (d.connection === 'disk') openDevice(d.mountpoint); }}>
    <Icon name={d.connection === 'disk' ? 'hard-drive' : 'usb'} size={16} color={() => color(MUTED)} strokeWidth={2} />
    <Text className={`grow text-[13px] ${fg(TEXT)}`} numberOfLines={1}>{label}</Text>
    {opening() === d.mountpoint && d.mountpoint !== '' ? <Text className={`text-[11px] ${fg(MUTED)}`}>opening</Text> : <View />}
  </View>;
}

function OpenPod(props: { lib: PodLibrary }): i32 {
  const d = props.lib.device;
  const used = d.totalBytes > 0 ? (d.totalBytes - d.freeBytes) / d.totalBytes : 0;
  return <View className={`flex-row items-center gap-3 px-4 py-4 border-b ${bd(BORDER)}`}>
    <PodDrawing model={d.model} name={d.name} width={30} />
    <View className="grow flex-col gap-1 min-w-0">
      <Text className={`text-[14px] font-semibold ${fg(TEXT)}`} numberOfLines={1}>{d.name !== '' ? d.name : 'iPod'}</Text>
      <Text className={`text-[11px] ${fg(MUTED)}`} numberOfLines={1}>{d.model}</Text>
      <View className={`h-[4] rounded-full overflow-hidden ${bg(TRACK)}`}>
        <View className={`h-full ${bg(ACCENT)}`} style={{ widthPercent: Math.max(0.01, used) }} />
      </View>
    </View>
  </View>;
}

export function Sidebar(): i32 {
  return <View className={`flex-col h-full border-r ${bg(SIDEBAR)} ${bd(BORDER)}`} style={{ width: SIDEBAR_WIDTH }}>
    {library() !== null ? <OpenPod lib={library() as PodLibrary} /> : <View className="h-[12]" />}
    {library() !== null ? <View className="flex-col">
      <Section label="iPod" />
      <NavRow icon="hard-drive" label="Overview" to={PAGE_OVERVIEW} count={-1} />
      <NavRow icon="info" label="Specs" to={PAGE_SPECS} count={-1} />
      <Section label="Library" />
      <NavRow icon="disc-3" label="Albums" to={PAGE_ALBUMS} count={albums().length} />
      <NavRow icon="music" label="Songs" to={PAGE_SONGS} count={countOf(PAGE_SONGS)} />
      <NavRow icon="radio" label="Podcasts" to={PAGE_PODCASTS} count={countOf(PAGE_PODCASTS)} />
      <NavRow icon="book-audio" label="Audiobooks" to={PAGE_AUDIOBOOKS} count={countOf(PAGE_AUDIOBOOKS)} />
      <NavRow icon="clapperboard" label="Videos" to={PAGE_VIDEOS} count={countOf(PAGE_VIDEOS)} />
      <NavRow icon="images" label="Photos" to={PAGE_PHOTOS} count={photoCount()} />
      <NavRow icon="list-music" label="Playlists" to={PAGE_PLAYLISTS} count={playlists().length} />
      <NavRow icon="notebook-pen" label="Notes & files" to={PAGE_FILES} count={(library() as PodLibrary).extras.length} />
    </View> : <View />}
    <Section label="Devices" />
    <View className="flex-col grow">
      {pods().length === 0 ? <Text className={`text-[12px] px-4 ${fg(MUTED)}`}>No iPod plugged in</Text> : <View />}
      {pods().map((d: ipod.Device) => <DeviceRow d={d} />)}
    </View>
    <View className={`flex-row items-center h-[30] px-2.5 mx-2 mb-3 gap-2.5 rounded-[6] cursor-pointer hover:${bg(HOVER)}`}
      onPointerDown={(e: ui.PointerEvent) => { if (!scanning()) rescan(); }}>
      <Icon name="refresh-cw" size={15} color={() => color(MUTED)} strokeWidth={2} />
      <Text className={`text-[13px] ${fg(MUTED)}`}>{scanning() ? 'Looking for iPods…' : 'Rescan'}</Text>
    </View>
  </View>;
}
