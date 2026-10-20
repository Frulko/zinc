// The devices panel (ZN-729.06), under the pill that says where the sketch runs: the devices of the network and the paired
// ones (a press on a paired one sends Run there), the form that pairs one with the code it shows, and for the chosen device
// what it is, its load, its memory, its temperature and its apps, renewed every second.
// What changes with the machine and the moment (addresses, figures) is in the right column, of a fixed width.
import { createNodeRef, createEffect } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { theme, bg, fg, bd } from '../app/theme';
import { focusLater } from '../app/workspace';
import { device } from '../app/tools';
import { devices, listed, devicesOpen, closeDevices, figures, note, noteBad, who, setWho, code, setCode, pairing, pair, choose, refresh, isPaired, stateText, NONE } from '../app/devices';
import { Device, Figures, DeviceApp, sizeText } from '../model';
import { Glyph, IconButton } from './Controls';
import { I_CHECK, I_CLOSE, I_DOT } from './icons';

const whoRef = createNodeRef(), codeRef = createNodeRef();
const FIELD = (): string => `h-[30] text-[13px] px-3 rounded-full border-0 ${bg(theme().chrome)} ${fg(theme().text)} focus:${bd(theme().chrome)}`;
const VALUE = 'w-[200] items-end overflow-hidden';

function DeviceRow(props: { d: Device }): i32 {
  const d = props.d;
  const on = (): boolean => device() === d.name;
  return <View className={`flex-row items-center h-[34] pl-2 pr-2.5 gap-2 rounded-lg cursor-pointer ${on() ? bg(theme().selected) : ''} hover:${bg(theme().hover)}`}
    onPointerDown={(e: ui.PointerEvent) => {
      if (e.button !== 0) return;
      if (isPaired(d)) choose(d.name); else { setWho(d.name); focusLater(codeRef.node); }
    }}>
    <View className="w-[16] h-[16] items-center justify-center">
      {on() ? <Glyph kind={I_CHECK} size={13} color={() => theme().accent} back={() => theme().selected} />
            : <Glyph kind={I_DOT} size={14} color={() => isPaired(d) ? theme().success : theme().faint} back={() => theme().elevated} />}
    </View>
    <Text className={`text-[13px] font-medium ${fg(theme().text)}`}>{d.name}</Text>
    <View className="grow shrink overflow-hidden h-[18] justify-center"><Text className={`text-[12px] ${fg(theme().muted)}`}>{stateText(d)}</Text></View>
    <View className={VALUE}><Text className={`text-[11px] font-mono ${fg(theme().faint)}`}>{d.address}</Text></View>
  </View>;
}

function Fact(props: { label: string; value: (f: Figures) => string }): i32 {
  return <View className="flex-row items-center h-[24] px-2.5">
    <Text className={`grow text-[12px] ${fg(theme().muted)}`}>{props.label}</Text>
    <View className={VALUE}><Text className={`text-[12px] ${fg(theme().text)}`}>{figures() === null ? '' : props.value(figures() as Figures)}</Text></View>
  </View>;
}
function AppRow(props: { a: DeviceApp }): i32 {
  const a = props.a;
  return <View className="flex-row items-center h-[24] px-2.5 gap-2">
    <Text className={`text-[12px] font-mono ${fg(theme().text)}`}>{a.name}</Text>
    <Text className={`grow text-[12px] ${fg(a.running ? theme().success : theme().faint)}`}>{a.running ? 'running' : 'stopped'}</Text>
    <View className={VALUE}><Text className={`text-[12px] ${fg(theme().text)}`}>{a.running ? sizeText(a.rss) : ''}</Text></View>
  </View>;
}
/** The chosen device: what it is and how it is doing. */
function Details(): i32 {
  const apps = (): DeviceApp[] => figures() === null ? [] : (figures() as Figures).apps;
  return <View className={`flex-col pt-1.5 mt-1.5 border-t ${bd(theme().borderSoft)}`} style={{ hidden: device() === '' ? 1 : 0 }}>
    <View className="flex-row items-center h-[26] px-2.5 gap-2">
      <Text className={`text-[12px] font-semibold ${fg(theme().text)}`}>{device()}</Text>
      <Text className={`grow text-[12px] ${fg(theme().faint)}`}>{figures() === null ? 'no answer yet' : 'every second'}</Text>
    </View>
    <Fact label="Kind" value={(f: Figures) => f.kind} />
    <Fact label="System" value={(f: Figures) => f.system} />
    <Fact label="Processor" value={(f: Figures) => f.cpu} />
    <Fact label="Load" value={(f: Figures) => f.load.toFixed(2)} />
    <Fact label="Memory free" value={(f: Figures) => `${sizeText(f.memFree)} of ${sizeText(f.memTotal)}`} />
    <Fact label="Temperature" value={(f: Figures) => f.temp < 0 ? 'not given by this system' : f.temp.toFixed(1) + ' °C'} />
    <View className="flex-row items-center h-[24] px-2.5">
      <Text className={`text-[12px] ${fg(theme().muted)}`}>{apps().length === 0 ? 'No app yet: Run sends the sketch' : 'Apps'}</Text>
    </View>
    {apps().map((a: DeviceApp) => <AppRow a={a} />)}
  </View>;
}

function formKey(e: ui.KeyEvent): void {
  if (e.key === 'Enter') pair(); else if (e.key === 'Escape') closeDevices(); else return;
  e.preventDefault();
}
createEffect(() => { if (devicesOpen() && devices().length === 0) focusLater(whoRef.node); });

export function DevicesPanel(): i32 {
  return <View className="absolute inset-0" style={{ hidden: devicesOpen() ? 0 : 1 }}>
    <View className="absolute inset-0" onPointerDown={() => closeDevices()} />
    <View className={`absolute top-[50] right-[10] w-[440] flex-col p-2 rounded-xl border shadow-lg ${bg(theme().elevated)} ${bd(theme().border)}`} onPointerDown={() => {}}>
      <View className="flex-row items-center h-[30] pl-2.5 gap-2">
        <Text className={`grow text-[13px] font-semibold ${fg(theme().text)}`}>Devices</Text>
        <View className={`flex-row items-center h-[24] px-2.5 rounded-full cursor-pointer hover:${bg(theme().hover)}`} onPointerDown={(e: ui.PointerEvent) => refresh()}>
          <Text className={`text-[12px] ${fg(theme().muted)}`}>Look again</Text>
        </View>
        <IconButton kind={I_CLOSE} size={12} onPress={() => closeDevices()} />
      </View>
      {devices().map((d: Device) => <DeviceRow d={d} />)}
      {devices().length === 0 && <View className="flex-col px-2.5 py-1.5 gap-1">
        <Text className={`text-[13px] ${fg(theme().text)}`}>{listed() ? NONE : 'Looking for devices…'}</Text>
        <Text className={`text-[12px] ${fg(theme().muted)}`}>On the device, start zinc agent: it shows a code of 6 digits.</Text>
        <Text className={`text-[12px] ${fg(theme().muted)}`}>Type its name or its address here, then that code.</Text>
      </View>}
      <View className="flex-row items-center pt-1.5 px-1 gap-1.5">
        <Input ref={whoRef} className={`grow ${FIELD()}`} placeholder="Name or address of a device" value={who()} onInput={(v: string) => setWho(v)} onKeyDown={formKey} />
        <Input ref={codeRef} className={`w-[96] ${FIELD()}`} placeholder="Code" value={code()} onInput={(v: string) => setCode(v)} onKeyDown={formKey} />
        <View className={`flex-row items-center h-[30] px-3.5 rounded-full cursor-pointer active:opacity-80 ${bg(theme().accent)}`} style={{ opacity: pairing() ? 0.5 : 1 }}
          onPointerDown={(e: ui.PointerEvent) => { if (e.button === 0) pair(); }}>
          <Text className={`text-[13px] font-semibold ${fg(theme().onAccent)}`}>Pair</Text>
        </View>
      </View>
      <View className="px-2.5 pt-1.5 pb-0.5" style={{ hidden: note() === '' ? 1 : 0 }}>
        <Text className={`text-[12px] ${fg(noteBad() ? theme().error : theme().muted)}`}>{note()}</Text>
      </View>
      <Details />
    </View>
  </View>;
}
