// The header: the run control, the sketch's files as tabs, and on the right the sketch (a click opens its card: the project's,
// or the offer to make a plain sketch one; the start view when nothing is open),
// how it runs, and the theme. The run control is one pill: "Run" at rest; while the sketch builds it names the step under
// way, then counts the seconds the program has been running, with the stop inside it.
import { createSignal, createNodeRef, For } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { rrect } from 'zinc:gfx';
import { theme, bg, fg, bd, toggleTheme } from '../app/theme';
import { active, activate, buffers, Buffer, closeBuffer, sketchName, sketchDir } from '../app/workspace';
import { project, projectOpen, setProjectOpen, openProject, iconPath } from '../app/project';
import { Project } from '../model';
import { ProjectIcon } from './Project';
import { phase, stage, seconds, debugging, run, stop, IDLE, BUILDING, ENGINE_IDS, engineName, engine, setEngine, device, setDevice } from '../app/tools';
import { devices, isPaired, choose, openDevices } from '../app/devices';
import { Device } from '../model';
import { command, startOpen, setStartOpen, openPalette, PAL_COMMANDS } from '../app/commands';
import { Glyph, IconButton, Tip } from './Controls';
import { t } from '../app/text';
import { I_PLAY, I_STOP, I_CLOSE, I_BUG, I_PLUS, I_DOWN, I_SUN, I_MOON, I_COMMAND, I_GRID, I_CHECK } from './icons';

// ---- run control
function clock(s: i32): string { const m: i32 = Math.floor(s / 60), r = s % 60; return `${m < 10 ? '0' : ''}${m}:${r < 10 ? '0' : ''}${r}`; }
let beat: i32 = 0;
/** The live dot of the pill: it breathes while the sketch builds, and stays green while it runs. */
function Pulse(): i32 {
  return <Canvas style={{ width: 10, height: 10 }} onDraw={(x: i32, y: i32, w: i32, h: i32) => {
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
      ? <View className={`flex-row items-center h-[34] pl-3 pr-4 gap-1.5 rounded-full cursor-pointer active:opacity-80 ${bg(theme().accent)}`}
          onPointerDown={(e: ui.PointerEvent) => { if (e.button === 0) run(false); }}>
          <Glyph kind={I_PLAY} size={15} color={() => theme().onAccent} back={() => theme().accent} />
          <Text className={`text-[13px] font-semibold ${fg(theme().onAccent)}`}>{t('atelier.header.run')}</Text>
        </View>
      : <View className={`flex-row items-center h-[34] pl-3.5 pr-1 gap-2 rounded-full border ${bg(theme().bg)} ${bd(theme().border)}`}>
          <Pulse />
          <Text className={`text-[13px] font-medium ${fg(theme().text)}`}>{label()}</Text>
          {phase() !== BUILDING && <Text className={`text-[12px] font-mono ${fg(theme().muted)}`}>{clock(seconds())}</Text>}
          <View className={`w-[26] h-[26] rounded-full items-center justify-center cursor-pointer ${bg(theme().surface)} hover:${bg(theme().active)}`}
            onPointerDown={(e: ui.PointerEvent) => { if (e.button === 0) stop(); }}>
            <Glyph kind={I_STOP} size={14} color={() => theme().error} back={() => theme().surface} />
          </View>
        </View>}
    {idle() && <IconButton kind={I_BUG} onPress={() => run(true)} tip={() => t('atelier.tip.debug')} />}
  </View>;
}

// ---- tabs
export const tabsRef = createNodeRef();
const tabNodes = new Map<string, i32>();   // path -> tab node, to scroll the active tab into view
function Tab(props: { b: Buffer }): i32 {
  const b = props.b;
  const [hover, setHover] = createSignal<boolean>(false);
  const on = (): boolean => active() === b;
  const tab = <View className={`flex-row items-center h-[30] pl-3 pr-1.5 gap-1.5 rounded-[9] cursor-pointer ${on() ? `shadow-sm ${bg(theme().dark ? theme().surface : theme().bg)}` : `hover:${bg(theme().hover)}`}`}
    onPointerDown={(e: ui.PointerEvent) => {
      if (e.button === 1) closeBuffer(b);
      else if (e.button === 0) { activate(b); if (e.clicks >= 2) command('rename-file'); }
    }}
    onPointerEnter={(e: ui.PointerEvent) => setHover(true)} onPointerLeave={(e: ui.PointerEvent) => setHover(false)}>
    <Text className={`text-[13px] ${on() ? `font-medium ${fg(theme().text)}` : fg(theme().muted)}`}>{b.name}</Text>
    <View className={`w-[18] h-[18] rounded-full items-center justify-center hover:${bg(theme().active)}`}
      onPointerDown={(e: ui.PointerEvent) => { if (e.button === 0) closeBuffer(b); }}>
      {b.modified() && !hover() && <View className={`w-[7] h-[7] rounded-full ${bg(theme().accent)}`} />}
      {hover() && <Glyph kind={I_CLOSE} size={12} color={() => theme().muted} back={() => on() ? (theme().dark ? theme().surface : theme().bg) : theme().hover} />}
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
function Tabs(): i32 {
  return <View className="flex-row items-center grow shrink gap-0.5 overflow-hidden">
    <View ref={tabsRef} className="flex-row items-center shrink h-[38] gap-0.5 overflow-x-auto"
      onWheel={(e: ui.PointerEvent) => {
        // vertical wheels scroll the strip sideways; trackpads send fractional steps (1/10 px on macOS)
        const frac = e.wheel !== Math.round(e.wheel) || e.wheelX !== Math.round(e.wheelX);
        ui.scrollTo(tabsRef.node, ui.scrollLeft(tabsRef.node) + (e.wheelX - e.wheel) * (frac ? 10 : 40), 0);
      }}>
      <For each={buffers()}>{(b: Buffer, i: i32) => <Tab b={b} />}</For>
    </View>
    <IconButton kind={I_PLUS} size={14} onPress={() => command('open-file')} tip={() => t('atelier.tip.open_file')} />
  </View>;
}

// ---- right side
export const [engineOpen, setEngineOpen] = createSignal<boolean>(false);
const CHOICE = (): string => `flex-row items-center h-[30] px-2.5 gap-2 rounded-lg cursor-pointer hover:${bg(theme().hover)}`;
/** The list under the engine pill; drawn by the app over everything else. Where the sketch runs: this machine, one way or
 *  another, or a paired device (the devices panel finds and pairs them). */
export function EngineMenu(): i32 {
  return <View className="absolute inset-0" style={{ hidden: engineOpen() ? 0 : 1 }}>
    <View className="absolute inset-0" onPointerDown={() => setEngineOpen(false)} />
    <View className={`absolute top-[50] right-[92] w-[270] flex-col p-1 rounded-xl border shadow-lg ${bg(theme().elevated)} ${bd(theme().border)}`}>
      {ENGINE_IDS.map((id: string, i: i32) => <View className={`flex-row items-center py-1.5 px-2.5 gap-2 rounded-lg cursor-pointer hover:${bg(theme().hover)}`}
        onPointerDown={(e: ui.PointerEvent) => { setEngine(i); setDevice(''); setEngineOpen(false); }}>
        <View className="grow flex-col gap-0.5">
          <Text className={`text-[13px] ${fg(theme().text)}`}>{engineName(i)}</Text>
          <Text className={`text-[11px] ${fg(theme().muted)}`}>{t('atelier.engine.' + id + '_text')}</Text>
        </View>
        {engine() === i && device() === '' && <Glyph kind={I_CHECK} size={13} color={() => theme().accent} back={() => theme().elevated} />}
      </View>)}
      <View className={`h-px my-1 ${bg(theme().borderSoft)}`} />
      {devices().filter(isPaired).map((d: Device) => <View className={CHOICE()}
        onPointerDown={(e: ui.PointerEvent) => { if (device() !== d.name) choose(d.name); setEngineOpen(false); }}>
        <Text className={`grow text-[13px] ${fg(theme().text)}`}>{d.name}</Text>
        {device() === d.name && <Glyph kind={I_CHECK} size={13} color={() => theme().accent} back={() => theme().elevated} />}
      </View>)}
      <View className={CHOICE()} onPointerDown={(e: ui.PointerEvent) => { setEngineOpen(false); openDevices(); }}>
        <Text className={`grow text-[13px] ${fg(theme().text)}`}>{t('atelier.header.devices')}</Text>
      </View>
    </View>
  </View>;
}
const PILL = 'flex-row items-center h-[30] px-2.5 gap-1.5 rounded-full cursor-pointer';
/** The run control, the engine pill and the palette button (the tour points at them). */
export const runRef = createNodeRef(), engineRef = createNodeRef(), paletteRef = createNodeRef();// the sketch pill: a project (a folder with a zinc.json) shows the app's name, its version and its icon; a plain sketch its folder's name
function appName(): string { const p = project(); return p !== null && (p as Project).name !== '' ? (p as Project).name : sketchName(); }
function appVersion(): string { const p = project(); return p === null ? '' : (p as Project).version; }

export function Header(): i32 {
  return <View className="flex-row items-center h-[54] pl-3 pr-2.5 gap-3">
    <RunControl />
    <View className={`w-px h-[18] ${bg(theme().border)}`} />
    <Tabs />
    <Tip label={() => t(sketchDir() === '' ? 'atelier.tip.examples' : 'atelier.tip.sketch')}>
      <View className={`${PILL} ${startOpen() || projectOpen() ? bg(theme().active) : ''} hover:${bg(theme().hover)}`}
        onPointerDown={(e: ui.PointerEvent) => { if (sketchDir() === '') setStartOpen(!startOpen()); else if (projectOpen()) setProjectOpen(false); else openProject(); }}>
        {iconPath() !== '' ? <ProjectIcon size={18} /> : <Glyph kind={I_GRID} size={14} color={() => theme().muted} />}
        <Text className={`text-[13px] font-medium ${fg(theme().text)}`}>{appName()}</Text>
        {appVersion() !== '' && <Text className={`text-[12px] ${fg(theme().muted)}`}>{appVersion()}</Text>}
      </View>
    </Tip>
    <Tip label={() => t('atelier.tip.engine')}>
      <View ref={engineRef} className={`${PILL} ${engineOpen() ? bg(theme().active) : ''} hover:${bg(theme().hover)}`} onPointerDown={(e: ui.PointerEvent) => setEngineOpen(!engineOpen())}>
        <Text className={`text-[13px] ${fg(theme().muted)}`}>{device() !== '' ? device() : engineName(engine())}</Text>
        <Glyph kind={I_DOWN} size={12} color={() => theme().faint} />
      </View>
    </Tip>
    <View className="flex-row items-center">
      <View ref={paletteRef} className="flex-row"><IconButton kind={I_COMMAND} size={15} onPress={() => openPalette(PAL_COMMANDS)} tip={() => t('atelier.tip.palette')} /></View>
      {theme().dark ? <IconButton kind={I_SUN} size={15} onPress={() => toggleTheme()} tip={() => t('atelier.tip.theme')} /> : <IconButton kind={I_MOON} size={15} onPress={() => toggleTheme()} tip={() => t('atelier.tip.theme')} />}
    </View>
  </View>;
}
