// The iPod: its drawing in its colour, its name and model, how its disk is used by kind of media, and the facts that identify it
// (firmware, serial, model number...).
import * as ipod from 'zinc:ipod';
import { PodLibrary } from '../../services/ipod';
import { albums, playlists } from '../../state';
import { PodDrawing } from '../../components/PodDrawing';
import { StorageBar } from '../../components/StorageBar';
import { bytes, longDuration } from '../../format';
import { bg, bd, fg, CARD, BORDER, TEXT, MUTED, FAINT, ACCENT, ACCENT_SOFT, POD_WIDTH } from '../../constants';

function Fact(props: { label: string; value: string }): i32 {
  return <View className="flex-col gap-0.5 w-[200]">
    <Text className={`text-[11px] font-semibold ${fg(FAINT)}`}>{props.label}</Text>
    <Text className={`text-[13px] ${fg(TEXT)}`} numberOfLines={1}>{props.value !== '' ? props.value : '—'}</Text>
  </View>;
}

function Count(props: { value: string; label: string }): i32 {
  return <View className={`flex-col grow basis-0 gap-0.5 px-4 py-3 rounded-[10] border ${bg(CARD)} ${bd(BORDER)}`}>
    <Text className={`text-[22px] font-bold ${fg(TEXT)}`}>{props.value}</Text>
    <Text className={`text-[12px] ${fg(MUTED)}`}>{props.label}</Text>
  </View>;
}

function Chip(props: { label: string }): i32 {
  return <View className={`px-2.5 py-1 rounded-full ${bg(ACCENT_SOFT)}`}><Text className={`text-[12px] font-semibold ${fg(ACCENT)}`}>{props.label}</Text></View>;
}

export function OverviewPage(props: { lib: PodLibrary }): i32 {
  const d: ipod.Device = props.lib.device, tracks = props.lib.tracks;
  let ms = 0;
  for (const t of tracks) ms += t.durationMs;
  return <ScrollView className="grow">
    <View className="flex-row w-full gap-12 px-12 py-10 items-start">
      <PodDrawing model={d.model} name={d.name} width={POD_WIDTH} />
      <View className="grow basis-0 flex-col gap-6 min-w-0 pt-2">
        <View className="flex-col gap-2">
          <Text className={`text-[30px] font-bold ${fg(TEXT)}`} numberOfLines={1}>{d.name !== '' ? d.name : 'iPod'}</Text>
          <Text className={`text-[15px] ${fg(MUTED)}`}>{d.model !== '' ? d.model : 'iPod'}</Text>
          <View className="flex-row gap-2 pt-1">
            {d.generation !== '' ? <Chip label={d.generation} /> : <View />}
            {d.capacityGb > 0 ? <Chip label={`${d.capacityGb} GB`} /> : <View />}
            {d.readOnly ? <Chip label="Read-only" /> : <View />}
          </View>
        </View>
        <View className={`flex-col gap-3 p-5 rounded-[12] border ${bg(CARD)} ${bd(BORDER)}`}>
          <View className="flex-row items-end">
            <Text className={`grow text-[14px] font-semibold ${fg(TEXT)}`}>Storage</Text>
            <Text className={`text-[12px] ${fg(MUTED)}`}>{`${bytes(d.totalBytes - d.freeBytes)} of ${bytes(d.totalBytes)} used`}</Text>
          </View>
          <StorageBar device={d} tracks={tracks} />
        </View>
        <View className="flex-row gap-3">
          <Count value={`${tracks.length}`} label="Songs" />
          <Count value={`${albums().length}`} label="Albums" />
          <Count value={`${playlists().length}`} label="Playlists" />
          <Count value={longDuration(ms)} label="Playing time" />
        </View>
        <View className="flex-row flex-wrap gap-x-6 gap-y-4">
          <Fact label="FIRMWARE" value={d.firmware} />
          <Fact label="SERIAL NUMBER" value={d.serial} />
          <Fact label="MODEL NUMBER" value={d.modelNumber} />
          <Fact label="FIREWIRE GUID" value={d.firewireGuid} />
          <Fact label="DATABASE CHECKSUM" value={d.checksum} />
          <Fact label="MOUNTED AT" value={d.mountpoint} />
        </View>
      </View>
    </View>
  </ScrollView>;
}
