// What shows while no iPod is open: the search for one (it looks again every few seconds), the iPods to pick from when there
// are several, an iPod seen on USB but not mounted (what USB tells, and how to get it mounted), the opening, and errors.
import * as ui from 'zinc:ui';
import * as ipod from 'zinc:ipod';
import { Spinner } from 'zinc:ui/kit';
import { Icon } from 'zinc:icons';
import { pods, opening, error, rescan, scanning, openDevice, library } from '../../state';
import { PodDrawing } from '../../components/PodDrawing';
import { bytes } from '../../format';
import { bg, bd, fg, color, CARD, BORDER, HOVER, TEXT, MUTED, FAINT, ACCENT, ERROR } from '../../constants';

function PodCard(props: { d: ipod.Device }): i32 {
  const d = props.d, mounted = d.connection === 'disk';
  const lines: string[] = [];
  if (d.generation !== '') lines.push(d.generation);
  if (d.capacityGb > 0) lines.push(`${d.capacityGb} GB`);
  if (d.firmware !== '') lines.push(`firmware ${d.firmware}`);
  if (d.serial !== '') lines.push(`serial ${d.serial}`);
  return <View className={`flex-col items-center gap-3 w-[220] p-5 rounded-[14] border ${bg(CARD)} ${bd(BORDER)} ${mounted ? `cursor-pointer hover:${bg(HOVER)}` : ''}`}
    onPointerDown={(e: ui.PointerEvent) => { if (mounted) openDevice(d.mountpoint); }}>
    <PodDrawing model={d.model} name={d.name} width={96} />
    <View className="flex-col items-center gap-0.5">
      <Text className={`text-[15px] font-semibold ${fg(TEXT)}`} numberOfLines={1}>{d.name !== '' ? d.name : d.model !== '' ? d.model : 'iPod'}</Text>
      <Text className={`text-[12px] ${fg(MUTED)}`} numberOfLines={1}>{d.model}</Text>
      <Text className={`text-[11px] text-center ${fg(FAINT)}`}>{lines.join(' · ')}</Text>
      {mounted ? <Text className={`text-[11px] ${fg(FAINT)}`}>{`${bytes(d.freeBytes)} free`}</Text> : <View />}
    </View>
    {mounted
      ? <Text className={`text-[12px] font-semibold ${fg(ACCENT)}`}>{opening() === d.mountpoint ? 'Opening…' : 'Open'}</Text>
      : <View className="flex-row items-center gap-1.5">
          <Icon name="usb" size={13} color={() => color(MUTED)} strokeWidth={2} />
          <Text className={`text-[11px] text-center ${fg(MUTED)}`}>Plugged in, not mounted: put it in disk mode to read it</Text>
        </View>}
  </View>;
}

export function DevicesPage(): i32 {
  return <ScrollView className="grow">
    <View className="flex-col items-center gap-8 px-10 py-14">
      <View className="flex-col items-center gap-2">
        <Text className={`text-[26px] font-bold ${fg(TEXT)}`}>{pods().length === 0 ? 'Connect an iPod' : opening() !== '' ? 'Reading the iPod' : 'Choose an iPod'}</Text>
        <Text className={`text-[13px] text-center ${fg(MUTED)}`}>{pods().length === 0
          ? 'Plug in an iPod Classic, Nano, Mini, Video or Shuffle. Its music, covers and details show here; nothing on it is changed.'
          : 'Its music, covers and details show here; nothing on it is changed.'}</Text>
      </View>
      {error() !== '' ? <View className={`flex-row items-center gap-2.5 max-w-[640] px-4 py-3 rounded-[10] border ${bd(ERROR)}`}>
        <Icon name="triangle-alert" size={16} color={() => color(ERROR)} strokeWidth={2} />
        <Text className={`text-[13px] ${fg(ERROR)}`}>{error()}</Text>
      </View> : <View />}
      {opening() !== '' || pods().length === 0
        ? <View className="flex-row items-center gap-2.5">
            <Spinner size={18} color={() => color(MUTED)} active={() => library() === null} />
            <Text className={`text-[13px] ${fg(MUTED)}`}>{opening() !== '' ? 'Reading its tracks, playlists and details…' : 'Looking for iPods…'}</Text>
          </View>
        : <View />}
      {pods().length > 0 ? <View className="flex-row flex-wrap justify-center gap-5">{pods().map((d: ipod.Device) => <PodCard d={d} />)}</View> : <View />}
      <View className={`flex-row items-center gap-2 px-4 h-[32] rounded-[8] border cursor-pointer ${bd(BORDER)} hover:${bg(HOVER)}`}
        onPointerDown={(e: ui.PointerEvent) => { if (!scanning()) rescan(); }}>
        <Icon name="refresh-cw" size={14} color={() => color(TEXT)} strokeWidth={2} />
        <Text className={`text-[13px] ${fg(TEXT)}`}>Rescan</Text>
      </View>
    </View>
  </ScrollView>;
}
