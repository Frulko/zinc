import { createSignal, Show } from 'zinc:ui/solid';
import { quit, minimizeWindow, setWidget, showWidget, windowState } from 'zinc:gfx';
import { Keyboard } from 'zinc:ui/kit';
import * as fs from 'zinc:fs';
import { Ink, TOOLS, ERASERS } from 'zinc:ink';
import { env, device, dataDir } from 'zinc:sys';
import { Svg } from 'zinc:svg';
import status from './native/status.spec';

const [minutes, setMinutes] = createSignal<i32>(status.localMinutes());
const [battery, setBattery] = createSignal<i32>(status.battery());
const [charging, setCharging] = createSignal<boolean>(status.charging());
setInterval(() => {
  setMinutes(status.localMinutes()); setBattery(status.battery()); setCharging(status.charging());
}, 10000);

// App widgets, after iOS WidgetKit and Android's Glance: the app declares a small view of itself, and Accueil shows it over the tablet's
// screen while the app keeps running. It is the same program: what is tapped in the widget is the app's state when it opens again.
/** The app's own folder (zinc:sys dataDir(): what the Hub's Reset data erases). The files an older version kept in `legacy` move there once. */
export function appFolder(legacy: string): string {
  const dir = dataDir();
  if (dir === '') return legacy;   // an engine before dataDir(): the old folder stays the app's
  if (legacy !== '' && legacy !== dir && fs.exists(legacy)) {
    for (const f of fs.list(legacy)) if (!fs.exists(dir + '/' + f)) fs.rename(legacy + '/' + f, dir + '/' + f);
    if (fs.list(legacy).length === 0) fs.remove(legacy);
  }
  return dir;
}

export interface RemarkableAppProps {
  /** The full app. */
  app: () => i32;
  /** The widget; none: Accueil minimizes the window. */
  widget?: WidgetSpec;
}
export interface WidgetSpec {
  /** Its view, drawn at the top left of the screen in width x height pixels. */
  view: () => i32;
  width: i32;
  height: i32;
}
const [mode, setMode] = createSignal<string>(windowState());
let widgetSize: i32[] = [];   // [w, h] once a RemarkableApp declares a widget
// The system panel: a finger swiped down from the top edge of the screen (display-rmpp counts them, "window.edge") opens Accueil / Quitter /
// Annuler over any app in a RemarkableApp, full screen or not, with the actions of its RemarkableBar
const [panel, setPanel] = createSignal<boolean>(false);
// Docked with the Zinc AppLoad (0010), the app's title and Home / Quit are in xochitl's header: RemarkableBar draws nothing, and a press
// there acts as its button would ("window.action")
const [headerBar, setHeaderBar] = createSignal<boolean>(device('window.headerbar') === '1');
let swipes = device('window.edge'), actions = device('window.action');
setInterval(() => {
  const m = windowState(); if (m !== mode()) setMode(m);
  const n = device('window.edge');
  if (n !== swipes) { swipes = n; if (m === 'full' || m === 'docked') setPanel(true); }
  const h = device('window.headerbar') === '1'; if (h !== headerBar()) setHeaderBar(h);
  const a = device('window.action');
  if (a !== actions) { actions = a; if (a.endsWith(':quit')) leave(shell); else home(shell); }
}, 250);
/** 'full', 'docked' (under xochitl's header: zinc.json "display": {"header": "remarkable"}), 'widget' or 'hidden': how the app is shown now. */
export function windowMode(): string { return mode(); }

/** The root of a reMarkable app with a widget: the app, or its widget while it is shown as one. */
export function RemarkableApp(props: RemarkableAppProps): i32 {
  const Full = props.app;   // mounted as components: a call in braces would be read as a number
  // Docked under xochitl's header (experimental), the top of the screen is the header's: the driver gives its height as the safe area
  const full = <View className="flex-col grow pt-[env(safe-area-inset-top)]">
    <View className="flex-col grow relative"><Full />{panel() ? <SystemPanel /> : null}</View>
  </View>;
  if (!props.widget) return full;
  const spec = props.widget as WidgetSpec;   // narrowed for the closures below
  widgetSize = [spec.width, spec.height];
  const Widget = spec.view;
  return <Show when={mode() === 'widget'} fallback={full}>
    <View className="flex-col bg-white" style={{ width: spec.width, height: spec.height }}><Widget /></View>
  </Show>;
}

/** Accueil's way out: the widget when the app has one and the host shows widgets, else a minimized window; false when neither. */
export function goHome(): boolean {
  if (widgetSize.length === 2 && setWidget(0, 0, widgetSize[0], widgetSize[1]) && showWidget()) { setMode('widget'); return true; }
  if (minimizeWindow()) { setMode('hidden'); return true; }
  return false;
}

export interface RemarkableBarProps {
  title: string;
  /** App decides whether unsaved work permits exit. Notes saves before calling quit(). */
  onQuit?: () => void;
  /** Accueil: called first (save the state there), then the app shows its widget (RemarkableApp) or its window is minimized, and it keeps
   *  running. Where the host can do neither, Accueil quits like Quitter: an app that saved its state comes back as it was. */
  onHome?: () => void;
}
// Lucide's glyphs (third_party/lucide, ISC) the shell draws, inline: zinc:icons compiles in only the icons a project's own sources name
function glyphPaths(name: string): string {
  if (name === 'house') return '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>';
  if (name === 'x') return '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>';
  if (name === 'back') return '<path d="m18 15-6-6-6 6"/>';
  if (name === 'battery-low') return '<path d="M22 14v-4"/><path d="M6 14v-4"/><rect x="2" y="6" width="16" height="12" rx="2"/>';
  if (name === 'battery-medium') return '<path d="M10 14v-4"/><path d="M22 14v-4"/><path d="M6 14v-4"/><rect x="2" y="6" width="16" height="12" rx="2"/>';
  if (name === 'battery-full') return '<path d="M10 10v4"/><path d="M14 10v4"/><path d="M22 14v-4"/><path d="M6 10v4"/><rect x="2" y="6" width="16" height="12" rx="2"/>';
  if (name === 'battery-charging') return '<path d="m11 7-3 5h4l-3 5"/><path d="M14.856 6H16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.935"/><path d="M22 14v-4"/><path d="M5.14 18H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2.936"/>';
  return '';
}
const glyphCache = new Map<string, Svg>();
/** A black line glyph, size x size, drawn when the frame is painted for another reason (lazy: no repaint of its own). */
function Glyph(p: { name: () => string; size: i32 }): i32 {
  return <Canvas style={{ width: p.size, height: p.size, lazy: 1 }} onDraw={(x: i32, y: i32, w: i32, h: i32) => {
    const name = p.name();
    let g = glyphCache.get(name);
    if (g === undefined) {
      g = new Svg('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round">' + glyphPaths(name) + '</svg>');
      glyphCache.set(name, g as Svg);
    }
    (g as Svg).draw(x, y, w, h, 255);
  }} />;
}
const batteryGlyph = (): string => charging() ? 'battery-charging' : battery() >= 70 ? 'battery-full' : battery() >= 30 ? 'battery-medium' : 'battery-low';
const ICON_BUTTON = 'w-[76px] h-[76px] items-center justify-center border-2 border-black rounded-full bg-white focus:bg-white';
const BAR = 'flex-row items-center gap-6 px-8 h-[104px] bg-white border-b-2 border-black';
const BAR_SLIM = 'flex-row items-center gap-6 px-8 h-[92px] bg-white border-b-2 border-black';
function leave(props: RemarkableBarProps): void { if (props.onQuit) props.onQuit(); else quit(); }
function home(props: RemarkableBarProps): void { if (props.onHome) props.onHome(); if (!goHome()) leave(props); }
let shell: RemarkableBarProps = { title: '' };   // the last RemarkableBar's: the panel's actions are the bar's

const PANEL_BUTTON = 'grow flex-col gap-3 h-[168px] items-center justify-center border-2 border-black rounded-2xl bg-white focus:bg-white';
/** Over the app's top: three large buttons, no animation (e-paper). A tap under it is Annuler. */
function SystemPanel(): i32 {
  const act = (f: () => void): void => { setPanel(false); f(); };
  return <View className="absolute top-0 left-0 right-0 bottom-0 flex-col" onClick={() => setPanel(false)}>
    <View className="flex-row gap-6 px-8 py-8 bg-white border-b-4 border-black" onClick={() => {}}>
      <Button className={PANEL_BUTTON} onClick={() => act(() => home(shell))}><Glyph name={() => 'house'} size={64} /><Text className="text-[34px] text-black">Accueil</Text></Button>
      <Button className={PANEL_BUTTON} onClick={() => act(() => leave(shell))}><Glyph name={() => 'x'} size={64} /><Text className="text-[34px] text-black">Quitter</Text></Button>
      <Button className={PANEL_BUTTON} onClick={() => setPanel(false)}><Glyph name={() => 'back'} size={64} /><Text className="text-[34px] text-black">Annuler</Text></Button>
    </View>
  </View>;
}
/** Platform-specific shell component, explicitly imported by reMarkable apps. Hosts preview an unknown battery. */
export function RemarkableBar(props: RemarkableBarProps): i32 {
  shell = props;
  // Docked under xochitl's header, which shows the time and the battery: a slim action bar, the title and the two buttons
  const docked = (): boolean => mode() === 'docked';
  // the title on the left, the time in the middle, the battery and the two round icon buttons on the right
  // none when the title and the buttons are in xochitl's header (headerBar)
  return <View className="flex-col">{headerBar() ? null : <View className={docked() ? BAR_SLIM : BAR}>
      <Text className="grow basis-0 truncate text-[34px] font-bold text-black">{props.title}</Text>
      {docked() ? null : <Text className="text-[32px] text-black">{Math.floor(minutes() / 60).toString().padStart(2, '0')}:{(minutes() % 60).toString().padStart(2, '0')}</Text>}
      <View className="grow basis-0 flex-row items-center justify-end gap-5">
        {docked() || battery() < 0 ? null : <View className="flex-row items-center gap-2">
          <Glyph name={batteryGlyph} size={44} /><Text className="text-[28px] text-black">{`${battery()}%`}</Text>
        </View>}
        <Button className={ICON_BUTTON} onClick={() => home(props)}><Glyph name={() => 'house'} size={44} /></Button>
        <Button className={ICON_BUTTON} onClick={() => leave(props)}><Glyph name={() => 'x'} size={44} /></Button>
      </View>
    </View>}</View>;
}

// The on-screen keyboard of the reMarkable apps, drawn for e-paper as the tablet's own: white keys with a thin black outline and
// large captions, no shadow and no preview bubble (each would be one more refresh), Enter and the capitals in black.
const KB_KEY = 'bg-white text-black border-[1.5px] border-black rounded-[12px] active:bg-white';
const KB_SPECIAL = 'bg-[#ebebeb] text-black border-[1.5px] border-black rounded-[12px] active:bg-[#ebebeb]';
const KB_DARK = 'bg-black text-white border-[1.5px] border-black rounded-[12px] active:bg-black';
export interface RemarkableKeyboardProps {
  /** Layout ids the language key cycles through; default: the language the tablet's handwriting search uses, then English. */
  layouts?: string[];
  /** As the kit's Keyboard: 'auto' (while a field has the focus, the default), 'always', 'never'. */
  mode?: string;
  onKey?: (key: string) => void;
}
/** The languages of this tablet: xochitl's handwriting language (fr_FR -> fr), then LANG, then English. */
export function tabletLayouts(): string[] {
  const out: string[] = [];
  const add = (l: string): void => { const id = l.slice(0, 2).toLowerCase(); if (id.length === 2 && out.indexOf(id) < 0) out.push(id); };
  const conf = '/home/root/.config/remarkable/xochitl.conf';
  if (fs.exists(conf)) for (const line of fs.readText(conf).split('\n')) if (line.startsWith('HandwritingSearchLanguage=')) add(line.slice(26));
  const lang = env('LANG');
  if (lang !== '' && lang !== 'C' && !lang.startsWith('C.')) add(lang);
  add('en');
  return out;
}
/** <RemarkableKeyboard />: shows itself while a text field has the focus, as the kit's Keyboard does. */
export function RemarkableKeyboard(props: RemarkableKeyboardProps = {}): i32 {
  return <Keyboard layouts={props.layouts ?? tabletLayouts()} mode={props.mode} onKey={props.onKey}
    keyHeight={104} gap={12} shadow={false} preview={false} retractable={false}
    keyClass={KB_KEY} specialKeyClass={KB_SPECIAL} enterKeyClass={KB_DARK} shiftOnClass={KB_DARK}
    labelClass="text-[40px]" specialLabelClass="text-[28px]" accentClass="bg-white border-[1.5px] border-black"
    className="bg-white border-t-[1.5px] border-black px-3 pt-3 pb-4" />;
}

// The writing tools of the reMarkable apps (zinc:ink), as xochitl's palette: a tool, a colour and a width for the next strokes, the stroke
// and area erasers, undo / redo and erase all. E-paper: black and white, finger-sized targets, the chosen ones inverted or ringed, no
// animation. Folded, it is one small handle that names the tool. Colours: the Paper Pro's nine pen colours and its highlighter colours,
// with the RGB values reMarkable's own SVG export uses (rmc), so a page reads the same here, in xochitl and on a computer.
export const PEN_COLORS: i32[] = [0x000000, 0x909090, 0xffffff, 0x4e69c9, 0xb33e39, 0xa1d87d, 0xf7e851, 0x8bd0e5, 0xb782cd];
export const HIGHLIGHTER_COLORS: i32[] = [0xfbf719, 0xa1d87d, 0xffc0cb, 0x8bd0e5, 0x909090];
const TOOL_LABELS: string[] = ['Ballpoint', 'Fineliner', 'Marker', 'Pencil', 'Calligraphy', 'Highlighter', 'Eraser', 'Area'];
const TOOL_NAMES: string[] = TOOLS.concat(ERASERS);
const PAL_OFF = 'px-5 h-[80px] items-center justify-center rounded-lg border-2 border-black bg-white focus:bg-white';
const PAL_ON = 'px-5 h-[80px] items-center justify-center rounded-lg border-2 border-black bg-black focus:bg-black';
/** The panel's Pen waveform (fast, black and white, for writing) or its UI one (greys and colours, clean pages). The switch takes about
 *  a second on the tablet, so call it when the user starts or stops writing, not per stroke. false where there is no such mode. */
export function setPenMode(on: boolean): boolean { return device('display.mode', on ? 'fast' : 'ui') === '1'; }

export interface InkPaletteProps {
  ink: Ink;
  /** Thin, medium and thick in the ink's units; default: half, once and twice the ink's width when the palette is made. */
  widths?: number[];
  /** Starts unfolded (default true). Unfolded is writing: the panel is in its Pen waveform (setPenMode) until the palette is hidden. */
  open?: boolean;
  /** After every choice (a tool, a colour, a width, undo...): an app that saves on change hooks it here. */
  onChange?: () => void;
}
/** <InkPalette ink={ink} />: the writing tools for `ink`, as a bar above (or below) the page. */
export function InkPalette(props: InkPaletteProps): i32 {
  const ink = props.ink;
  const widths = props.widths ?? [ink.width / 2, ink.width, ink.width * 2];
  const [open, setOpenSignal] = createSignal<boolean>(props.open !== false);
  const setOpen = (on: boolean): void => { setOpenSignal(on); setPenMode(on); };
  setPenMode(open());
  const [tool, setTool] = createSignal<string>(ink.eraser ? 'eraser' : ink.tool);
  const [color, setColor] = createSignal<i32>(ink.color);
  const [width, setWidth] = createSignal<number>(ink.width);
  let penColor = ink.color, hlColor = HIGHLIGHTER_COLORS[0];
  const changed = (): void => { if (props.onChange) (props.onChange as () => void)(); };
  const pickTool = (t: string): void => {
    ink.tool = t; ink.eraser = false; setTool(t);
    if (t === 'highlighter') { ink.color = hlColor; setColor(hlColor); }
    else if (TOOLS.indexOf(t) >= 0) { ink.color = penColor; setColor(penColor); }
    changed();
  };
  const pickColor = (c: i32): void => {
    if (tool() === 'highlighter') hlColor = c; else { penColor = c; if (TOOLS.indexOf(tool()) < 0) pickTool('ballpoint'); }
    ink.color = c; setColor(c); changed();
  };
  const pickWidth = (w: number): void => { ink.width = w; setWidth(w); changed(); };
  const Btn = (p: { label: string; on: () => boolean; press: () => void }): i32 =>
    <Button className={p.on() ? PAL_ON : PAL_OFF} onClick={p.press}>
      <Text className={p.on() ? 'text-[28px] text-white' : 'text-[28px] text-black'}>{p.label}</Text>
    </Button>;
  const off = (): boolean => false;
  const swatches = (): i32[] => tool() === 'highlighter' ? HIGHLIGHTER_COLORS : PEN_COLORS;
  return <Show when={open()} fallback={
    <View className="flex-row px-4 py-2 bg-white"><Btn label={`Tools · ${TOOL_LABELS[TOOL_NAMES.indexOf(tool())]}`} on={off} press={() => setOpen(true)} /></View>}>
    <View className="flex-col gap-3 px-4 py-3 bg-white border-b-2 border-black">
      <View className="flex-row flex-wrap gap-3">
        {TOOL_NAMES.map((t: string, i: i32) => <Btn label={TOOL_LABELS[i]} on={() => tool() === t} press={() => pickTool(t)} />)}
      </View>
      <View className="flex-row flex-wrap items-center gap-3">
        {swatches().map((c: i32) => <Button
          className={color() === c ? 'w-[72px] h-[72px] rounded-full border-[8px] border-black' : 'w-[72px] h-[72px] rounded-full border-2 border-black'}
          style={{ backgroundColor: c }} onClick={() => pickColor(c)} />)}
        <View className="w-[24px]" />
        {widths.map((w: number, i: i32) => <Btn label={['Thin', 'Medium', 'Thick'][i]} on={() => width() === w} press={() => pickWidth(w)} />)}
      </View>
      <View className="flex-row flex-wrap gap-3">
        <Btn label="Undo" on={off} press={() => { ink.undo(); changed(); }} />
        <Btn label="Redo" on={off} press={() => { ink.redo(); changed(); }} />
        <Btn label="Erase all" on={off} press={() => { ink.clear(); changed(); }} />
        <View className="grow" />
        <Btn label="Hide" on={off} press={() => setOpen(false)} />
      </View>
    </View>
  </Show>;
}
