// The Devices page (ZN-729.06): the devices of the network and the paired ones (a press on a paired one sends Run there: `zinc device
// <name> deploy`, which sends only what changed), the form that pairs one with the code it shows (a Raspberry Pi or a Mac running
// `zinc agent`), and for the chosen device what it is, its load, its memory, its temperature and its apps, renewed every second.
// What changes with the machine and the moment (addresses, figures) is in the right column, of a fixed width.
import { createNodeRef, createEffect } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { theme, bg, fg, bd } from 'zinc:editor';
import { focusLater } from '../app/workspace';
import { device } from '../app/tools';
import { devices, listed, devicesOpen, closeDevices, figures, note, noteBad, who, setWho, code, setCode, pairing, pair, choose, refresh, isPaired, stateText, none } from '../app/devices';
import { Device, Figures, DeviceApp, sizeText } from '../model';
import { Glyph } from './Controls';
import { Page, Group, Row, Button } from './Form';
import { t as tr } from '../app/text';
import { I_CHECK, I_DOT } from './icons';

const whoRef = createNodeRef(), codeRef = createNodeRef();
const FIELD = (): string => `h-[26] text-[13px] px-2 rounded-[6] border ${bg(theme().bg)} ${bd(theme().border)} ${fg(theme().text)} focus:${bd(theme().accent)}`;
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
    <Text className={`grow text-[12px] ${fg(a.running ? theme().success : theme().faint)}`}>{tr(a.running ? 'atelier.device.app_running' : 'atelier.device.app_stopped')}</Text>
    <View className={VALUE}><Text className={`text-[12px] ${fg(theme().text)}`}>{a.running ? sizeText(a.rss) : ''}</Text></View>
  </View>;
}
/** The chosen device: what it is and how it is doing. */
function Details(): i32 {
  const apps = (): DeviceApp[] => figures() === null ? [] : (figures() as Figures).apps;
  return <View className={`flex-col pt-1.5 mt-1.5 border-t ${bd(theme().borderSoft)}`} style={{ hidden: device() === '' ? 1 : 0 }}>
    <View className="flex-row items-center h-[26] px-2.5 gap-2">
      <Text className={`text-[12px] font-semibold ${fg(theme().text)}`}>{device()}</Text>
      <Text className={`grow text-[12px] ${fg(theme().faint)}`}>{tr(figures() === null ? 'atelier.device.no_answer_yet' : 'atelier.device.every_second')}</Text>
    </View>
    <Fact label={tr('atelier.device.kind')} value={(f: Figures) => f.kind} />
    <Fact label={tr('atelier.device.system')} value={(f: Figures) => f.system} />
    <Fact label={tr('atelier.device.processor')} value={(f: Figures) => f.cpu} />
    <Fact label={tr('atelier.device.load')} value={(f: Figures) => f.load.toFixed(2)} />
    <Fact label={tr('atelier.device.memory')} value={(f: Figures) => tr('atelier.device.memory_of', ['free', sizeText(f.memFree), 'total', sizeText(f.memTotal)])} />
    <Fact label={tr('atelier.device.temperature')} value={(f: Figures) => f.temp < 0 ? tr('atelier.device.no_temperature') : f.temp.toFixed(1) + ' °C'} />
    <View className="flex-row items-center h-[24] px-2.5">
      <Text className={`text-[12px] ${fg(theme().muted)}`}>{tr(apps().length === 0 ? 'atelier.device.no_app' : 'atelier.device.apps')}</Text>
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
  return <Page shown={devicesOpen} title={() => tr('atelier.device.title')} subtitle={() => tr('atelier.device.subtitle')}>
    <Group title={tr('atelier.device.found')} note={() => tr('atelier.device.how_1') + ' ' + tr('atelier.device.how_2')}>
      {devices().map((d: Device) => <View className={`flex-col px-1.5 py-1 ${bg(theme().elevated)}`}><DeviceRow d={d} /></View>)}
      {devices().length === 0 && <Row label={() => listed() ? none() : tr('atelier.device.looking')} />}
      <Row label={() => tr('atelier.device.look_again_hint')}><Button label={() => tr('atelier.device.look_again')} onPress={() => refresh()} /></Row>
    </Group>
    <Group title={tr('atelier.device.pair_title')}>
      <View className={`flex-row items-center px-3.5 py-2.5 gap-2 ${bg(theme().elevated)}`}>
        <Input ref={whoRef} className={`grow ${FIELD()}`} placeholder={tr('atelier.device.who')} value={who()} onInput={(v: string) => setWho(v)} onKeyDown={formKey} />
        <Input ref={codeRef} className={`w-[96] ${FIELD()}`} placeholder={tr('atelier.device.code')} value={code()} onInput={(v: string) => setCode(v)} onKeyDown={formKey} />
        <View style={{ opacity: pairing() ? 0.5 : 1 }}><Button primary label={() => tr('atelier.device.pair')} onPress={() => pair()} /></View>
      </View>
    </Group>
    <View className="px-1 pt-1.5" style={{ hidden: note() === '' ? 1 : 0 }}>
      <Text className={`text-[12px] ${fg(noteBad() ? theme().error : theme().muted)}`}>{note()}</Text>
    </View>
    <View className={`flex-col mt-5 p-1.5 rounded-[10] border ${bg(theme().elevated)} ${bd(theme().borderSoft)}`} style={{ hidden: device() === '' ? 1 : 0 }}>
      <Details />
    </View>
  </Page>;
}

