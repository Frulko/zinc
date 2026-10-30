// The toolbar, as on a Mac: Run (and Debug) and where the sketch runs on the left, Share and the palette on the right. The run
// control is one button: "Run" at rest; while the sketch builds it names the step under way, then counts the seconds the program
// has been running, with the stop inside it. The tabs of the open files are the strip above the editor (TabStrip).
import { createSignal, createNodeRef, For } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { rrect } from 'zinc:gfx';
import { Icon } from 'zinc:icons';
import { theme, bg, fg, bd, toggleTheme } from '../app/theme';
import { active, activate, buffers, Buffer, closeBuffer } from '../app/workspace';
import { phase, stage, seconds, debugging, run, stop, IDLE, BUILDING, ENGINE_IDS, engineName, engine, setEngine, device, setDevice } from '../app/tools';
import { devices, isPaired, choose } from '../app/devices';
import { Device } from '../model';
import { command, openPalette, PAL_COMMANDS, page, go } from '../app/commands';
import { Glyph, IconButton, Tip } from './Controls';
import { t } from '../app/text';
import { I_PLAY, I_STOP, I_CLOSE, I_BUG, I_PLUS, I_DOWN, I_SUN, I_MOON, I_COMMAND, I_CHECK } from './icons';

// ---- run control
function clock(s: i32): string { const m: i32 = Math.floor(s / 60), r = s % 60; return `${m < 10 ? '0' : ''}${m}:${r < 10 ? '0' : ''}${r}`; }
let beat: i32 = 0;
/** The live dot of the control: it breathes while the sketch builds, and stays green while it runs. */
function Pulse(): i32 {
  return <Canvas style={{ width: 8, height: 8 }} onDraw={(x: i32, y: i32, w: i32, h: i32) => {
    beat++;
    const building = phase() === BUILDING;
    rrect(x, y, w, h, w / 2, building ? theme().accent : theme().success, building ? 130 + Math.round(120 * Math.abs(Math.sin(beat / 14))) : 255);
  }} />;
}
function RunControl(): i32 {
  const idle = (): boolean => phase() === IDLE;
  const label = (): string => phase() === BUILDING ? (stage() === '' ? t('atelier.header.building') : t('atelier.header.building_step', ['step', stage()])) : t(debugging() ? 'atelier.header.debugging' : 'atelier.header.running');
  return <View ref={runRef} className="flex-row items-center gap-1">
    {idle()
      ? <View className={`flex-row items-center h-[28] pl-2.5 pr-3.5 gap-1 rounded-[7] cursor-pointer active:opacity-80 ${bg(theme().accent)}`}
          onPointerDown={(e: ui.PointerEvent) => { if (e.button === 0) run(false); }}>
          <Glyph kind={I_PLAY} size={14} color={() => theme().onAccent} back={() => theme().accent} />
          <Text className={`text-[13px] font-semibold ${fg(theme().onAccent)}`}>{t('atelier.header.run')}</Text>
        </View>
      : <View className={`flex-row items-center h-[28] pl-3 pr-[3] gap-2 rounded-[7] border ${bg(theme().bg)} ${bd(theme().border)}`}>
          <Pulse />
          <Text className={`text-[13px] ${fg(theme().text)}`}>{label()}</Text>
          {phase() !== BUILDING && <Text className={`text-[12px] font-mono ${fg(theme().muted)}`}>{clock(seconds())}</Text>}
          <View className={`w-[22] h-[22] rounded-[5] items-center justify-center cursor-pointer ${bg(theme().surface)} hover:${bg(theme().active)}`}
            onPointerDown={(e: ui.PointerEvent) => { if (e.button === 0) stop(); }}>
            <Glyph kind={I_STOP} size={13} color={() => theme().error} back={() => theme().surface} />
          </View>
        </View>}
    {idle() && <IconButton kind={I_BUG} size={15} onPress={() => run(true)} tip={() => t('atelier.tip.debug')} />}
  </View>;
}

// ---- tabs
export const tabsRef = createNodeRef();
const tabNodes = new Map<string, i32>();   // path -> tab node, to scroll the active tab into view
function Tab(props: { b: Buffer }): i32 {
  const b = props.b;
  const [hover, setHover] = createSignal<boolean>(false);
  const on = (): boolean => active() === b;
  const tab = <View className={`flex-row items-center h-full pl-3 pr-1.5 gap-1.5 border-r ${bd(theme().borderSoft)} cursor-pointer ${on() ? bg(theme().bg) : `${bg(theme().chrome)} hover:${bg(theme().hover)}`}`}
    onPointerDown={(e: ui.PointerEvent) => {
      if (e.button === 1) closeBuffer(b);
      else if (e.button === 0) { activate(b); if (e.clicks >= 2) command('rename-file'); }
    }}
    onPointerEnter={(e: ui.PointerEvent) => setHover(true)} onPointerLeave={(e: ui.PointerEvent) => setHover(false)}>
    <Text className={`text-[12px] ${on() ? fg(theme().text) : fg(theme().muted)}`}>{b.name}</Text>
    <View className={`w-[18] h-[18] rounded-[4] items-center justify-center hover:${bg(theme().active)}`}
      onPointerDown={(e: ui.PointerEvent) => { if (e.button === 0) closeBuffer(b); }}>
      {b.modified() && !hover() && <View className={`w-[7] h-[7] rounded-full ${bg(theme().accent)}`} />}
      {hover() && <Glyph kind={I_CLOSE} size={12} color={() => theme().muted} back={() => on() ? theme().bg : theme().hover} />}
    </View>
  </View>;
  tabNodes.set(b.path, tab);
  return tab;
}
/** The tab node of an open file (-1 if none): scripted sessions press it. */
export function tabNode(path: string): i32 { return tabNodes.has(path) ? tabNodes.get(path) as i32 : -1; }
/** Scrolls the strip so the active tab is fully visible (called by the frame loop when the active buffer changes). */
export function revealActiveTab(): void {
  const b = active(), bar = tabsRef.node;
  if (b === null || bar < 0) return;
  const path = (b as Buffer).path;
  if (!tabNodes.has(path)) return;
  const box = ui.screenBox(bar), tb = ui.screenBox(tabNodes.get(path) as i32), left = ui.scrollLeft(bar);
  const x = tb[0] - box[0] + left;
  if (x < left) ui.scrollTo(bar, x, 0);
  else if (x + tb[2] > left + box[2]) ui.scrollTo(bar, x + tb[2] - box[2], 0);
}
/** The open files, above the editor. */
export function TabStrip(): i32 {
  return <View className={`flex-row items-center h-[34] border-b ${bg(theme().chrome)} ${bd(theme().borderSoft)}`}>
    <View ref={tabsRef} className="flex-row items-center shrink h-full overflow-x-auto"
      onWheel={(e: ui.PointerEvent) => {
        // vertical wheels scroll the strip sideways; trackpads send fractional steps (1/10 px on macOS)
        const frac = e.wheel !== Math.round(e.wheel) || e.wheelX !== Math.round(e.wheelX);
        ui.scrollTo(tabsRef.node, ui.scrollLeft(tabsRef.node) + (e.wheelX - e.wheel) * (frac ? 10 : 40), 0);
      }}>
      <For each={buffers()}>{(b: Buffer, i: i32) => <Tab b={b} />}</For>
    </View>
    <IconButton kind={I_PLUS} size={13} onPress={() => command('open-file')} tip={() => t('atelier.tip.open_file')} />
  </View>;
}

// ---- where the sketch runs
export const [engineOpen, setEngineOpen] = createSignal<boolean>(false);
const CHOICE = (): string => `flex-row items-center h-[28] px-2.5 gap-2 rounded-[6] cursor-pointer hover:${bg(theme().hover)}`;
const menuRef = createNodeRef();
/** The list under the destination button: this machine, one way or another, or a paired device (the Devices page finds and pairs them). */
export function EngineMenu(): i32 {
  const node = <View className="absolute inset-0" style={{ hidden: engineOpen() ? 0 : 1 }}>
    <View className="absolute inset-0" onPointerDown={() => setEngineOpen(false)} />
    <View ref={menuRef} className={`w-[280] flex-col p-1 rounded-[10] border shadow-lg ${bg(theme().elevated)} ${bd(theme().border)}`} style={{ hidden: engineOpen() ? 0 : 1 }}>
      <Text className={`px-2.5 pt-1.5 pb-1 text-[11px] font-semibold ${fg(theme().faint)}`}>{t('atelier.header.this_mac')}</Text>
      {ENGINE_IDS.map((id: string, i: i32) => <View className={`flex-row items-center py-1.5 px-2.5 gap-2 rounded-[6] cursor-pointer hover:${bg(theme().hover)}`}
        onPointerDown={(e: ui.PointerEvent) => { setEngine(i); setDevice(''); setEngineOpen(false); }}>
        <View className="grow flex-col gap-0.5">
          <Text className={`text-[13px] ${fg(theme().text)}`}>{engineName(i)}</Text>
          <Text className={`text-[11px] ${fg(theme().muted)}`}>{t('atelier.engine.' + id + '_text')}</Text>
        </View>
        {engine() === i && device() === '' && <Glyph kind={I_CHECK} size={13} color={() => theme().accent} back={() => theme().elevated} />}
      </View>)}
      <View className={`h-px my-1 mx-2 ${bg(theme().borderSoft)}`} />
      <Text className={`px-2.5 pt-1 pb-1 text-[11px] font-semibold ${fg(theme().faint)}`}>{t('atelier.side.devices')}</Text>
      {devices().filter(isPaired).map((d: Device) => <View className={CHOICE()}
        onPointerDown={(e: ui.PointerEvent) => { if (device() !== d.name) choose(d.name); setEngineOpen(false); }}>
        <Icon name="monitor-smartphone" size={14} strokeWidth={1.75} color={() => theme().muted} />
        <Text className={`grow text-[13px] ${fg(theme().text)}`}>{d.name}</Text>
        {device() === d.name && <Glyph kind={I_CHECK} size={13} color={() => theme().accent} back={() => theme().elevated} />}
      </View>)}
      <View className={CHOICE()} onPointerDown={(e: ui.PointerEvent) => { setEngineOpen(false); go('devices'); }}>
        <Text className={`grow text-[13px] ${fg(theme().accent)}`}>{t('atelier.header.devices')}</Text>
      </View>
    </View>
  </View>;
  ui.openLayer(menuRef.node, { priority: 250 });
  ui.anchor(menuRef.node, engineRef.node, 'bottom-start', 6);
  return node;
}

/** The run control, the destination button and the palette button (the tour points at them). */
export const runRef = createNodeRef(), engineRef = createNodeRef(), paletteRef = createNodeRef();

export function Header(): i32 {
  return <View className={`flex-row items-center h-[48] pl-3 pr-2 gap-2 border-b ${bg(theme().chrome)} ${bd(theme().borderSoft)}`}>
    <RunControl />
    <Tip label={() => t('atelier.tip.engine')}>
      <View ref={engineRef} className={`flex-row items-center h-[28] pl-2 pr-1.5 gap-1.5 rounded-[7] border cursor-pointer ${bd(theme().borderSoft)} ${engineOpen() ? bg(theme().active) : bg(theme().bg)} hover:${bg(theme().hover)}`}
        onPointerDown={(e: ui.PointerEvent) => setEngineOpen(!engineOpen())}>
        <Icon name={device() !== '' ? 'monitor-smartphone' : 'laptop'} size={14} strokeWidth={1.75} color={() => theme().muted} />
        <Text className={`text-[12px] ${fg(theme().text)}`}>{device() !== '' ? device() : t('atelier.header.this_mac')}</Text>
        <Text className={`text-[12px] ${fg(theme().faint)}`}>{device() !== '' ? '' : engineName(engine())}</Text>
        <Glyph kind={I_DOWN} size={11} color={() => theme().faint} back={() => theme().bg} />
      </View>
    </Tip>
    <View className="grow" />
    <View className={`flex-row items-center h-[28] px-3 gap-1.5 rounded-[7] cursor-pointer border ${bd(theme().borderSoft)} ${page() === 'share' ? bg(theme().active) : bg(theme().bg)} hover:${bg(theme().hover)}`}
      onPointerDown={(e: ui.PointerEvent) => { if (e.button === 0) go('share'); }}>
      <Icon name="share" size={14} strokeWidth={1.75} color={() => theme().text} />
      <Text className={`text-[12px] ${fg(theme().text)}`}>{t('atelier.side.share')}</Text>
    </View>
    <View className="flex-row items-center">
      <View ref={paletteRef} className="flex-row"><IconButton kind={I_COMMAND} size={15} onPress={() => openPalette(PAL_COMMANDS)} tip={() => t('atelier.tip.palette')} /></View>
      {theme().dark ? <IconButton kind={I_SUN} size={15} onPress={() => toggleTheme()} tip={() => t('atelier.tip.theme')} /> : <IconButton kind={I_MOON} size={15} onPress={() => toggleTheme()} tip={() => t('atelier.tip.theme')} />}
    </View>
  </View>;
}
