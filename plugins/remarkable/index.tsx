import { createSignal, Show } from 'zinc:ui/solid';
import { quit, minimizeWindow, setWidget, showWidget, windowState } from 'zinc:gfx';
import { Keyboard } from 'zinc:ui/kit';
import * as fs from 'zinc:fs';
import { env } from 'zinc:sys';
import status from './native/status.spec';

const [minutes, setMinutes] = createSignal<i32>(status.localMinutes());
const [battery, setBattery] = createSignal<i32>(status.battery());
const [charging, setCharging] = createSignal<boolean>(status.charging());
setInterval(() => {
  setMinutes(status.localMinutes()); setBattery(status.battery()); setCharging(status.charging());
}, 10000);

// App widgets, after iOS WidgetKit and Android's Glance: the app declares a small view of itself, and Accueil shows it over the tablet's
// screen while the app keeps running. It is the same program: what is tapped in the widget is the app's state when it opens again.
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
setInterval(() => { const m = windowState(); if (m !== mode()) setMode(m); }, 250);
/** 'full', 'widget' or 'hidden': how the app is shown now. */
export function windowMode(): string { return mode(); }

/** The root of a reMarkable app with a widget: the app, or its widget while it is shown as one. */
export function RemarkableApp(props: RemarkableAppProps): i32 {
  if (!props.widget) { const Only = props.app; return <Only />; }
  const spec = props.widget as WidgetSpec;   // narrowed for the closures below
  widgetSize = [spec.width, spec.height];
  const Full = props.app, Widget = spec.view;   // mounted as components: a call in braces would be read as a number
  return <Show when={mode() === 'widget'} fallback={<Full />}>
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
const BUTTON = 'px-8 py-3 border-2 border-black rounded-lg bg-white focus:bg-white';
function leave(props: RemarkableBarProps): void { if (props.onQuit) props.onQuit(); else quit(); }
/** Platform-specific shell component, explicitly imported by reMarkable apps. Hosts preview an unknown battery. */
export function RemarkableBar(props: RemarkableBarProps): i32 {
  return <View className="flex-row items-center justify-between gap-6 px-6 py-3 bg-white border-b-2 border-black">
    <Text className="text-[30px] text-black">{props.title}</Text>
    <Text className="text-[30px] text-black">{Math.floor(minutes() / 60).toString().padStart(2, '0')}:{(minutes() % 60).toString().padStart(2, '0')}</Text>
    <Text className="text-[28px] text-black">{battery() < 0 ? 'Battery —' : `Battery ${battery()}%`}{charging() ? ' · Charging' : ''}</Text>
    <View className="flex-row gap-4">
      <Button className={BUTTON} onClick={() => { if (props.onHome) props.onHome(); if (!goHome()) leave(props); }}>
        <Text className="text-[30px] text-black">Accueil</Text>
      </Button>
      <Button className={BUTTON} onClick={() => leave(props)}>
        <Text className="text-[30px] text-black">Quitter</Text>
      </Button>
    </View>
  </View>;
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
