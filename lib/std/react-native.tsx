// zinc:react-native (ZN-367): React Native's components and APIs on zinc:ui, in the React model (zinc:ui/react). Prop names and defaults follow React
// Native 0.76; what does not map is listed in docs/react-native.md. View, Text, Image and ScrollView imported from here are zinc:ui's host elements; the
// style props of these components (style, *Style) arrive as one flattened Style, as React Native composes `style={[a, b]}`.
import * as ui from 'zinc:ui';
import { useState, useEffect, useRef, render } from 'zinc:ui/react';   // _virtual comes with the JSX helpers
import { platform, env, device } from 'zinc:sys';
import * as Device from 'zinc:device-info';
import { width, height, pixelScale, stroke, quit } from 'zinc:gfx';
import { createEffect } from 'zinc:ui/solid';
import * as A from 'zinc:ui/animated';
import * as P from 'zinc:ui/platform';   // the platform look (ZN-748): Button, Switch and ActivityIndicator draw as the platform's own

export { StyleSheet, PanResponder, LayoutAnimation } from 'zinc:ui';

/** Host elements: the JSX lowering turns these names into zinc:ui nodes. */
export const View: i32 = ui.VIEW, Text: i32 = ui.TEXT, Image: i32 = ui.IMAGE, ScrollView: i32 = ui.SCROLL;

const NONE = new ui.Style([], []);
function renderChildren(c: (() => i32) | undefined): i32 { return c !== undefined ? c() : ui.createNode(ui.FRAGMENT); }

/** '#rgb', '#rrggbb', '#rrggbbaa' (alpha dropped) and a few names as 0xRRGGBB; -1 when unknown. ponytail: the CSS names zinc:ui knows at build time are
 *  not repeated here, add them when a run-time colour needs one. */
export function processColor(c: string): i32 {
  if (c === 'white') return 0xffffff;
  if (c === 'black') return 0x000000;
  if (c === 'transparent') return -1;
  if (c.length > 0 && c.charAt(0) === '#') {
    const h = c.substring(1);
    if (h.length === 3) { const r = parseInt(h.charAt(0), 16), g = parseInt(h.charAt(1), 16), b = parseInt(h.charAt(2), 16); return (r * 17) << 16 | (g * 17) << 8 | b * 17; }
    if (h.length === 6 || h.length === 8) return parseInt(h.substring(0, 6), 16);
  }
  return -1;
}

// ---------------------------------------------------------------- Pressable and the Touchable family
export type PressableProps = {
  onPress?: () => void; onLongPress?: () => void; onPressIn?: () => void; onPressOut?: () => void;
  disabled?: boolean; style?: ui.Style; testID?: string; accessibilityLabel?: string; children?: () => i32;
  activeOpacity?: number; underlayColor?: string;   // TouchableOpacity, TouchableHighlight (one props type: no intersection types here)
};
/** The press machinery the Touchables share: pressed while the pointer is down on it, onPress on a click, onLongPress after 500 ms (no onPress then).
 *  Without a pressed style of its own it dims while pressed (zinc:ui's default pressed feedback); with one, or `feedback` false, only that shows. */
// disabled: the engine neither presses nor focuses it. Both keys are always written: a key a style drops keeps its last value.
const FEEDBACK = new ui.Style(['pressFeedback'], [1]), NO_FEEDBACK = new ui.Style(['pressFeedback'], [0]);
const ENABLED = new ui.Style(['disabled'], [0]), DISABLED = new ui.Style(['disabled'], [1]);
function Press(p: PressableProps, pressedStyle: ui.Style | null, feedback: boolean = true): i32 {
  const [pressed, setPressed] = useState<boolean>(false);
  const off = p.disabled ?? false;
  const press = (): void => { const f = p.onPress; if (!off && f !== undefined) f(); };
  const long = (e: ui.PointerEvent): void => { const f = p.onLongPress; if (!off && f !== undefined) f(); };
  const down = (e: ui.PointerEvent): void => { if (off) return; setPressed(true); const f = p.onPressIn; if (f !== undefined) f(); };
  const up = (e: ui.PointerEvent): void => { if (!pressed) return; setPressed(false); const f = p.onPressOut; if (f !== undefined) f(); };
  return <View style={[p.style ?? NONE, pressedStyle !== null || !feedback ? NO_FEEDBACK : FEEDBACK, off ? DISABLED : ENABLED, pressed && pressedStyle !== null && (pressedStyle as ui.Style)]} onPress={press} onLongPress={long} onPointerDown={down}
    onPointerUp={up} onPointerCancel={up} aria-label={p.accessibilityLabel ?? ''}>{renderChildren(p.children)}</View>;
}
export function Pressable(p: PressableProps): i32 { return Press(p, null); }
/** React Native's Button, as its Button.js draws it per platform (zinc:ui/platform's look): iOS a tinted title (18 px; `color` tints it), Android a
 *  raised filled rectangle with an upper-case white title (`color` fills it, #2196f3 by default), macOS a push button (a white bezel, 13 px). It dims
 *  while pressed; disabled greys it. The neutral look keeps iOS's. */
export function Button(p: { title: string; onPress?: () => void; color?: string; disabled?: boolean; accessibilityLabel?: string; testID?: string }): i32 {
  const L = P.look(), off = p.disabled ?? false, given = p.color !== undefined ? processColor(p.color as string) : -1;
  if (L.name === 'android') {
    const bg = off ? 0xdfdfdf : given >= 0 ? given : 0x2196f3;
    return <Pressable onPress={p.onPress} disabled={off} accessibilityLabel={p.accessibilityLabel ?? p.title} style={new ui.Style(['backgroundColor', 'borderRadius', 'elevation', 'alignItems'], [bg, 2, off ? 0 : 4, 1])}>
      <Text style={{ fontSize: 14, fontWeight: '500', padding: 8, color: off ? 0xa1a1a1 : 0xffffff }}>{p.title.toUpperCase()}</Text>
    </Pressable>;
  }
  if (L.name === 'macos') {
    return <Pressable onPress={p.onPress} disabled={off} accessibilityLabel={p.accessibilityLabel ?? p.title} style={new ui.Style(['backgroundColor', 'borderRadius', 'borderWidth', 'borderColor', 'height', 'paddingLeft', 'paddingRight', 'alignItems', 'justifyContent', 'shadowColor', 'shadowOpacity', 'shadowRadius', 'shadowOffsetY'],
      [P.color(L.raised), 6, 1, P.color(L.border), 22, 12, 12, 1, 1, 0x000000, 0.1, 1, 1])}>
      <Text style={{ fontSize: 13, color: off ? 0xa0a0a0 : given >= 0 ? given : P.color(L.label) }}>{p.title}</Text>
    </Pressable>;
  }
  return <Pressable onPress={p.onPress} disabled={off} accessibilityLabel={p.accessibilityLabel ?? p.title} style={new ui.Style(['paddingTop', 'paddingBottom', 'alignItems'], [8, 8, 1])}>
    <Text style={{ fontSize: 18, color: off ? 0x999999 : (given < 0 ? P.tint() : given) }}>{p.title}</Text>
  </Pressable>;
}
export function TouchableWithoutFeedback(p: PressableProps): i32 { return Press(p, null, false); }
/** Dims to activeOpacity (0.2) while pressed. */
export function TouchableOpacity(p: PressableProps): i32 { return Press(p, new ui.Style(['opacity'], [p.activeOpacity ?? 0.2])); }
/** Shows underlayColor (black) behind the content while pressed. ponytail: the underlay replaces the background instead of showing through a dimmed
 *  child, which is the same picture for opaque children. */
export function TouchableHighlight(p: PressableProps): i32 {
  const c = processColor(p.underlayColor ?? 'black');
  return Press(p, new ui.Style(['backgroundColor', 'backgroundAlpha'], [c < 0 ? 0 : c, c < 0 ? 0 : 255]));
}

// ---------------------------------------------------------------- Switch
export type TrackColor = { false?: string; true?: string };
export type SwitchProps = { value?: boolean; onValueChange?: (v: boolean) => void; disabled?: boolean; trackColor?: TrackColor; thumbColor?: string;
  ios_backgroundColor?: string; style?: ui.Style; testID?: string };
/** The platform's switch (zinc:ui/platform's look): iOS 51 x 31 with a 27 px thumb and the green track, Material 3 52 x 32 with an outlined track whose
 *  thumb grows from 16 to 24 on the primary colour, macOS 38 x 22 on the accent. The neutral look keeps iOS's. Controlled like React Native's: it reports
 *  the new value and shows `value`. iOS gives a light haptic when it flips. */
export function Switch(p: SwitchProps): i32 {
  const on = p.value ?? false, off = p.disabled ?? false, L = P.look(), S = L.name === 'neutral' ? P.IOS : L;
  const tc = p.trackColor;
  const tf = tc !== undefined && tc.false !== undefined ? processColor(tc.false as string) : p.ios_backgroundColor !== undefined ? processColor(p.ios_backgroundColor as string) : P.color(S.switchOff);
  const tt = tc !== undefined && tc.true !== undefined ? processColor(tc.true as string) : L.name === 'macos' ? P.tint() : P.color(S.switchOn);
  const th = p.thumbColor !== undefined ? processColor(p.thumbColor as string) : P.color(on ? S.thumb : S.thumbDim);
  const flip = (): void => { const f = p.onValueChange; if (!off && f !== undefined) { P.toggleFeedback(); f(!on); } };
  const o = S.outline, inner = S.switchW - 2 * o, innerH = S.switchH - 2 * o, k = on ? S.thumbOn : S.thumbOff;
  const x = on ? inner - (innerH - k) / 2 - k : (innerH - k) / 2;
  return <View style={[{ width: S.switchW, height: S.switchH, borderRadius: S.switchH / 2, borderWidth: o, borderColor: on ? tt : P.color(S.border), backgroundColor: on ? tt : tf, opacity: off ? 0.5 : 1,
    flexDirection: 'row', alignItems: 'center' }, p.style ?? NONE]} onPress={flip} role="switch" aria-checked={on}>
    <View style={{ width: k, height: k, borderRadius: k / 2, backgroundColor: th, translateX: x, shadowColor: 0x000000, shadowOffset: { width: 0, height: o > 0 ? 0 : 2 }, shadowOpacity: o > 0 ? 0 : 0.2, shadowRadius: 3 }} />
  </View>;
}

// ---------------------------------------------------------------- ActivityIndicator, SafeAreaView, StatusBar
export type NativeViewProps = { style?: ui.Style; view: ui.NativeViewHost };
/** A real OS view (zinc:webview's WebView, a map) at this box: zinc:ui's NativeView with React Native styles (docs/ui.md "Native views"). */
export function NativeView(p: NativeViewProps): i32 {
  const h = <View style={p.style ?? NONE} />;
  ui.nativeView(h, p.view);
  return h;
}
export type ActivityIndicatorProps = { animating?: boolean; color?: string; size?: string; hidesWhenStopped?: boolean; style?: ui.Style };
/** The platform's spinner (zinc:ui/platform's look): iOS and macOS 12 bars, the bright one turning once a second (grey by default); Material a turning arc
 *  that grows and shrinks, in the primary colour. Size 'small' (20) or 'large' (36). */
export function ActivityIndicator(p: ActivityIndicatorProps): i32 {
  const n = p.size === 'large' ? 36 : 20, run = p.animating ?? true, L = P.look(), arc = L.spinner === 'arc';
  const col = p.color !== undefined ? processColor(p.color as string) : arc ? P.tint() : 0x999999;
  if (!run && (p.hidesWhenStopped ?? true)) return <View style={[{ width: n, height: n }, p.style ?? NONE]} />;
  return <View style={[{ alignItems: 'center', justifyContent: 'center' }, p.style ?? NONE]} role="progressbar">
    <Canvas style={{ width: n, height: n, lazy: run ? 0 : 1 }} onDraw={(x: i32, y: i32, w: i32, h: i32) => {   // stopped: a lazy canvas, the frame stays idle
      const cx = x + w / 2, cy = y + h / 2, r1 = w * 0.22, r2 = w * 0.46, lead = run ? Math.floor(ui.now() / 83) % 12 : 0;
      if (arc) {   // Material's indeterminate circle: the arc turns once in 1.57 s while its sweep breathes between 20 and 270 degrees every 1.33 s
        const t = run ? ui.now() : 0, r = w * 0.4, start = t / 1568 * Math.PI * 2, sweep = (20 + 250 * (0.5 - 0.5 * Math.cos(t / 1333 * Math.PI * 2))) * Math.PI / 180;
        const pts: number[] = [];
        for (let i = 0; i <= 24; i++) { const a = start + sweep * i / 24; pts.push(cx + Math.sin(a) * r); pts.push(cy - Math.cos(a) * r); }
        stroke(pts, w * 0.1, col as u32, 255, false);
        return;
      }
      for (let i = 0; i < 12; i++) {
        const a = i * Math.PI / 6, age = (lead - i + 12) % 12;
        stroke([cx + Math.sin(a) * r1, cy - Math.cos(a) * r1, cx + Math.sin(a) * r2, cy - Math.cos(a) * r2], w * 0.09, col as u32, Math.round(255 * (1 - age / 14)), false);
      }
    }} />
  </View>;
}
const SAFE = new ui.Style([], []);
/** Pads its content by the system's safe area (notch, status bar, home indicator: zinc:ui safe-area insets, which the OS feeds); 0 on a desktop. */
export function SafeAreaView(p: { style?: ui.Style; children?: () => i32 }): i32 {
  return <View className="pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]" style={p.style ?? SAFE}>{renderChildren(p.children)}</View>;
}
export type StatusBarProps = { barStyle?: string; hidden?: boolean; backgroundColor?: string; translucent?: boolean; animated?: boolean };
/** The system status bar of a phone: barStyle ('default', 'light-content', 'dark-content'), hidden, backgroundColor and translucent (Android) go to the OS
 *  (zinc:sys device('statusbar', 'STYLE HIDDEN COLOR TRANSLUCENT')); a desktop has none. Renders nothing; the last props stay in statusBarProps(). */
export function StatusBar(p: StatusBarProps): i32 { statusBar = p; applyStatusBar(); return ui.createNode(ui.FRAGMENT); }
let statusBar: StatusBarProps = {};
let statusSent: string = '';
function applyStatusBar(): void {
  const p = statusBar;
  const line = (p.barStyle ?? 'default') + ' ' + (p.hidden === true ? '1' : '0') + ' ' + (p.backgroundColor ?? '-') + ' ' + (p.translucent === true ? '1' : '0');
  if (line !== statusSent) { statusSent = line; device('statusbar', line); }
}
export function statusBarProps(): StatusBarProps { return statusBar; }
/** React Native's StatusBar.setBarStyle, setHidden, setBackgroundColor, setTranslucent (a function component carries no statics here). */
export function setStatusBarStyle(style: string): void { statusBar.barStyle = style; applyStatusBar(); }
export function setStatusBarHidden(hidden: boolean): void { statusBar.hidden = hidden; applyStatusBar(); }
export function setStatusBarBackgroundColor(color: string): void { statusBar.backgroundColor = color; applyStatusBar(); }
export function setStatusBarTranslucent(on: boolean): void { statusBar.translucent = on; applyStatusBar(); }

// ---------------------------------------------------------------- BackHandler, Vibration
/** Android's back button and back gesture (zinc:ui's back handlers): the newest listener that returns true takes it; when none does, the app goes back to the system. */
export class BackHandler {
  static addEventListener(kind: string, f: () => boolean): Subscription {
    ui.addBackHandler(f);
    return new Subscription((): void => ui.removeBackHandler(f));
  }
  /** Leaves the app as the system's back would (Android); elsewhere the program ends. */
  static exitApp(): void { if (platform() === 'android') device('exitapp'); else quit(); }
}
/** Vibration.vibrate(ms) and cancel(): the phone's vibrator (zinc:sys device('haptic', 'vibrate MS')); a desktop has none. ponytail: a pattern plays its first pulse. */
export class Vibration {
  static vibrate(ms: number = 400): void { device('haptic', 'vibrate ' + Math.round(ms)); }
  static cancel(): void { device('haptic', 'vibrate 0'); }
}

// ---------------------------------------------------------------- Platform, Dimensions, useWindowDimensions, PixelRatio, Appearance
export type PlatformSelect<T> = { ios?: T; android?: T; macos?: T; windows?: T; web?: T; native?: T; default?: T };
/** Platform.constants: React Native's iOS and Android keys in one record, from zinc:device-info ('' where the platform cannot know). */
export class PlatformConstants {
  /** iOS's UIDevice.userInterfaceIdiom: 'phone', 'pad', 'tv', 'mac' (a Mac), 'unknown'. */
  interfaceIdiom: string = 'unknown';
  /** 'iOS', 'iPadOS', 'Android', 'macOS'... */
  systemName: string = '';
  osVersion: string = '';
  /** Android's Build.VERSION.RELEASE ('14'); the OS version elsewhere. */
  Release: string = '';
  Model: string = '';
  Brand: string = '';
  Manufacturer: string = '';
  /** Android's UI mode: 'tv', 'normal' (a phone or a tablet), 'desk' (a desktop), 'unknown'. */
  uiMode: string = 'unknown';
  isTesting: boolean = false;
}
function platformConstants(): PlatformConstants {
  const c = new PlatformConstants();
  const t = Device.deviceType;
  c.interfaceIdiom = t === Device.DeviceType.PHONE ? 'phone' : t === Device.DeviceType.TABLET ? 'pad' : t === Device.DeviceType.TV ? 'tv' : t === Device.DeviceType.DESKTOP && platform() === 'macos' ? 'mac' : 'unknown';
  c.uiMode = t === Device.DeviceType.TV ? 'tv' : t === Device.DeviceType.PHONE || t === Device.DeviceType.TABLET ? 'normal' : t === Device.DeviceType.DESKTOP ? 'desk' : 'unknown';
  c.systemName = Device.osName; c.osVersion = Device.osVersion; c.Release = Device.osVersion;
  c.Model = Device.modelName; c.Brand = Device.brand; c.Manufacturer = Device.manufacturer;
  return c;
}
export class Platform {
  /** platform() of zinc:sys: 'android', 'ios', 'macos', 'linux', 'windows', 'web'; ZINC_PLATFORM=android|ios forces it on the desktop (docs/react-native.md). */
  static OS: string = platform();
  /** The OS version: Android's API level ('35'), iOS's or macOS's version ('18.0'); ZINC_PLATFORM_VERSION forces it. A string (React Native: a number on Android). */
  static Version: string = device('osversion');
  /** An iPad (UIDevice's idiom; a tablet on iOS only, as React Native). */
  static isPad: boolean = platform() === 'ios' && Device.deviceType === Device.DeviceType.TABLET;
  /** A TV: Android's television UI mode, an Apple TV. */
  static isTV: boolean = Device.deviceType === Device.DeviceType.TV;
  static constants: PlatformConstants = platformConstants();
  /** The entry for this OS, else `native` (any non-web target), else `default`, else `fallback` (React Native returns undefined: no undefined T here). */
  static select<T>(o: PlatformSelect<T>, fallback: T): T {
    const os = Platform.OS;
    if (os === 'ios' && o.ios !== undefined) return o.ios as T;
    if (os === 'android' && o.android !== undefined) return o.android as T;
    if (os === 'windows' && o.windows !== undefined) return o.windows as T;
    if (os === 'macos' && o.macos !== undefined) return o.macos as T;
    if (os === 'ios' && o.ios !== undefined) return o.ios as T;
    if (os === 'web' && o.web !== undefined) return o.web as T;
    if (os !== 'web' && o.native !== undefined) return o.native as T;
    if (o.default !== undefined) return o.default as T;
    return fallback;
  }
}
export class ScaledSize { width: number = 0; height: number = 0; scale: number = 1; fontScale: number = 1; }
export class DimensionsChange { window: ScaledSize = new ScaledSize(); screen: ScaledSize = new ScaledSize(); }
export class Subscription { private f: () => void; constructor(f: () => void) { this.f = f; } remove(): void { this.f(); } }
function size(): ScaledSize { const s = new ScaledSize(); s.width = width(); s.height = height(); s.scale = pixelScale(); s.fontScale = ui.systemFontScale(); return s; }
const dimFns: ((e: DimensionsChange) => void)[] = [];
let lastW: number = -1, lastH: number = -1;
const dimStep: () => void = (): void => {
  if (width() === lastW && height() === lastH) return;
  lastW = width(); lastH = height();
  const e = new DimensionsChange(); e.window = size(); e.screen = size();
  for (const f of dimFns.slice()) f(e);
};
export class Dimensions {
  /** 'window' and 'screen' are the same surface here. */
  static get(dim: string): ScaledSize { return size(); }
  /** 'change', called once per frame in which the surface size moved. */
  static addEventListener(type: string, f: (e: DimensionsChange) => void): Subscription {
    if (dimFns.length === 0) { lastW = width(); lastH = height(); ui.addWatcher(dimStep); }
    dimFns.push(f);
    return new Subscription((): void => { const i = dimFns.indexOf(f); if (i >= 0) dimFns.splice(i, 1); if (dimFns.length === 0) ui.removeWatcher(dimStep); });
  }
}
/** The window size; the component renders again when it changes. ponytail: the subscription lives as long as the program (useEffect has no cleanup). */
export function useWindowDimensions(): ScaledSize {
  const [s, setS] = useState<ScaledSize>(size());
  const subscribed = useRef<boolean>(false);
  useEffect((): void => {
    if (subscribed.current) return;
    subscribed.current = true;
    Dimensions.addEventListener('change', (e: DimensionsChange): void => setS(e.window));
  }, []);
  return s;
}
export class PixelRatio {
  static get(): number { return pixelScale(); }
  /** The OS's text size setting (Android's font size, iOS's Dynamic Type), 1 by default: Text sizes are already scaled by it. */
  static getFontScale(): number { return ui.systemFontScale(); }
  static getPixelSizeForLayoutSize(n: number): number { return Math.round(n * pixelScale()); }
  static roundToNearestPixel(n: number): number { const k = pixelScale(); return Math.round(n * k) / k; }
}
let scheme: string = env('ZINC_COLOR_SCHEME') === 'dark' ? 'dark' : 'light';
let schemeSet = env('ZINC_COLOR_SCHEME') !== '';   // the app or the run chose one: the system's no longer counts
const schemeFns: ((p: AppearancePreferences) => void)[] = [];
export class AppearancePreferences { colorScheme: string = 'light'; }
function schemeTo(s: string): void {
  if (s === scheme) return;
  scheme = s === 'dark' ? 'dark' : 'light';
  const e = new AppearancePreferences(); e.colorScheme = scheme;
  for (const f of schemeFns.slice()) f(e);
}
// the system's light or dark (the theme signal of zinc:ui: the OS setting, ZINC_INPUT `theme dark`) until the app sets one
ui.addSignalListener((kind: string, arg: string): void => { if (kind === 'theme' && !schemeSet) schemeTo(arg); });
/** The colour scheme: the system's (Android's and iOS's dark theme, macOS's appearance), ZINC_COLOR_SCHEME=dark or setColorScheme ('unspecified' follows the system again). */
export class Appearance {
  static getColorScheme(): string { return scheme; }
  static setColorScheme(s: string): void { schemeSet = s === 'light' || s === 'dark'; if (schemeSet) schemeTo(s); }
  static addChangeListener(f: (p: AppearancePreferences) => void): Subscription {
    schemeFns.push(f);
    return new Subscription((): void => { const i = schemeFns.indexOf(f); if (i >= 0) schemeFns.splice(i, 1); });
  }
}
/** react-native-safe-area-context's insets: what the status bar, a notch, the home indicator or the navigation bar cover (zinc:ui safeArea). */
export class EdgeInsets { top: number = 0; right: number = 0; bottom: number = 0; left: number = 0; }
function insetsNow(): EdgeInsets { const a = ui.safeArea(), e = new EdgeInsets(); e.top = a[0]; e.right = a[1]; e.bottom = a[2]; e.left = a[3]; return e; }
/** The safe area's insets; the component renders again when they change (a rotation). ponytail: the subscription lives as long as the program, as useColorScheme's. */
export function useSafeAreaInsets(): EdgeInsets {
  const [e, setE] = useState<EdgeInsets>(insetsNow());
  const subscribed = useRef<boolean>(false);
  useEffect((): void => {
    if (subscribed.current) return;
    subscribed.current = true;
    ui.addSignalListener((kind: string, arg: string): void => { if (kind === 'safearea') setE(insetsNow()); });
  }, []);
  return e;
}
/** 'active' or 'background' (zinc:ui appState: the OS's background and foreground signals); 'change' is the moment to save what must survive. */
export class AppState {
  static get currentState(): string { return ui.appState(); }
  static addEventListener(type: string, f: (state: string) => void): Subscription {
    const g = (kind: string, arg: string): void => { if (kind === 'background' || kind === 'foreground') f(ui.appState()); };
    ui.addSignalListener(g);
    return new Subscription((): void => ui.removeSignalListener(g));
  }
}
/** 'light' or 'dark'; the component renders again when Appearance changes. */
export function useColorScheme(): string {
  const [s, setS] = useState<string>(scheme);
  const subscribed = useRef<boolean>(false);
  useEffect((): void => {
    if (subscribed.current) return;
    subscribed.current = true;
    Appearance.addChangeListener((p: AppearancePreferences): void => setS(p.colorScheme));
  }, []);
  return s;
}

// ---------------------------------------------------------------- TextInput, Keyboard, KeyboardAvoidingView (ZN-367.02)
const INPUT_MODES: string[] = ['default', 'number-pad', 'decimal-pad', 'phone-pad', 'email-address', 'url', 'web-search'];
export type TextInputProps = {
  value?: string; defaultValue?: string; onChangeText?: (text: string) => void; onSubmitEditing?: () => void; placeholder?: string;
  keyboardType?: string; secureTextEntry?: boolean; multiline?: boolean; editable?: boolean; maxLength?: number; autoFocus?: boolean;
  autoCapitalize?: string; autoCorrect?: boolean; returnKeyType?: string; textContentType?: string; autoComplete?: string;
  name?: string; required?: boolean; pattern?: string; minLength?: number; enterKeyHint?: string;   // the page's form attributes (web target); ignored elsewhere
  placeholderTextColor?: string; selectionColor?: string; cursorColor?: string;
  style?: ui.Style; testID?: string; accessibilityLabel?: string;
};
/** The keyboard traits a phone's OS gets for the field (zinc:ui setInputTraits): capitalisation, autocorrect, the return key, the autofill hint. */
function inputTraits(p: TextInputProps): string {
  let t = 'cap=' + (p.autoCapitalize ?? 'sentences') + ' autocorrect=' + (p.autoCorrect === false ? '0' : '1') + ' return=' + (p.returnKeyType ?? 'default');
  const fill = p.autoComplete ?? p.textContentType ?? '';
  if (fill !== '') t += ' autofill=' + fill;
  if (p.maxLength !== undefined) t += ' maxlength=' + p.maxLength;
  return t;
}
/** A zinc:ui text field (a TextArea when multiline). Controlled through value + onChangeText as in React Native; maxLength cuts what is typed past it;
 *  onSubmitEditing on Enter (single line); keyboardType picks the on-screen keyboard (numeric 'numeric' / 'number-pad', 'decimal-pad', 'phone-pad',
 *  'email-address', 'url', 'web-search'). ponytail: onFocus / onBlur are not offered yet (zinc:ui's focus listeners cannot be removed). */
export function TextInput(p: TextInputProps): i32 {
  const field = useRef<i32>(-1);
  const started = useRef<boolean>(false);
  const kt = p.keyboardType ?? 'default';
  const mode = kt === 'numeric' ? 1 : Math.max(0, INPUT_MODES.indexOf(kt));
  const fk: string[] = ['password', 'readOnly', 'inputMode'], fv: number[] = [p.secureTextEntry === true ? 1 : 0, p.editable === false ? 1 : 0, mode];
  if (p.placeholderTextColor !== undefined) { fk.push('placeholderTextColor'); fv.push(processColor(p.placeholderTextColor)); }   // the style keys of the same names
  if (p.selectionColor !== undefined) { fk.push('selectionColor'); fv.push(processColor(p.selectionColor)); }
  if (p.cursorColor !== undefined) { fk.push('cursorColor'); fv.push(processColor(p.cursorColor)); }
  const flags = new ui.Style(fk, fv);
  const text = p.value ?? p.defaultValue ?? '';
  const typed = (s: string): void => {
    let v = s;
    const max = p.maxLength ?? -1;
    if (max >= 0 && v.length > max) { v = v.substring(0, max); ui.setValue(field.current, v); }
    const f = p.onChangeText; if (f !== undefined) f(v);
  };
  const key = (e: ui.KeyEvent): void => { if (e.key === 'Enter' && p.multiline !== true) { const f = p.onSubmitEditing; if (f !== undefined) f(); } };
  useEffect((): void => {
    ui.setInputTraits(field.current, inputTraits(p));
    if (started.current) return;
    started.current = true;
    if (p.autoFocus === true) ui.focusNode(field.current);
  }, null);
  if (p.multiline === true)
    return <TextArea ref={field} style={[p.style ?? NONE, flags]} value={text} placeholder={p.placeholder ?? ''} onInput={typed} aria-label={p.accessibilityLabel ?? ''}
      name={p.name ?? ''} required={p.required === true} minLength={p.minLength ?? 0} />;
  return <Input ref={field} style={[p.style ?? NONE, flags]} value={text} placeholder={p.placeholder ?? ''} onInput={typed} onKeyDown={key} aria-label={p.accessibilityLabel ?? ''}
    name={p.name ?? ''} required={p.required === true} pattern={p.pattern ?? ''} minLength={p.minLength ?? 0} enterKeyHint={p.enterKeyHint ?? ''} />;
}
export type FormProps = { onSubmit?: () => void; name?: string; style?: ui.Style; children?: () => i32 };
/** A group of fields submitted as one: a real <form> in the page (web target: Enter submits it, the browser validates `required`, `pattern` and `minLength` of its TextInputs,
 *  password managers and autofill see it), and on a desktop or a phone a View that routes Enter in a single-line TextInput to `onSubmit`. */
export function Form(p: FormProps): i32 {
  return <View as="form" role="form" name={p.name ?? ''} style={p.style ?? NONE} onSubmit={() => { const f = p.onSubmit; if (f !== undefined) f(); }}>{renderChildren(p.children)}</View>;
}

export class KeyboardCoordinates { screenX: number = 0; screenY: number = 0; width: number = 0; height: number = 0; }
export class KeyboardEvent { endCoordinates: KeyboardCoordinates = new KeyboardCoordinates(); duration: number = 0; easing: string = 'keyboard'; }
const kbFns: ((e: KeyboardEvent) => void)[] = [], kbKinds: string[] = [];
let kbShown: number = 0;
function kbEvent(h: number): KeyboardEvent { const e = new KeyboardEvent(); const c = e.endCoordinates; c.width = width(); c.height = h; c.screenY = height() - h; return e; }
/** Watches zinc:ui's keyboard inset each frame while someone listens: Did and Will events fire together (there is no animation to anticipate). */
const kbStep: () => void = (): void => {
  const now = ui.keyboardInset();
  if (now === kbShown) return;
  const show = now > 0 && kbShown === 0, hide = now === 0;
  kbShown = now;
  const e = kbEvent(now);
  for (let i = 0; i < kbFns.length; i++) {
    const k = kbKinds[i];
    if ((show && (k === 'keyboardDidShow' || k === 'keyboardWillShow')) || (hide && (k === 'keyboardDidHide' || k === 'keyboardWillHide')) ||
        (!show && !hide && (k === 'keyboardDidChangeFrame' || k === 'keyboardWillChangeFrame'))) kbFns[i](e);
  }
};
export class Keyboard {
  /** keyboardDidShow / WillShow, keyboardDidHide / WillHide, keyboardDidChangeFrame / WillChangeFrame. */
  static addListener(kind: string, f: (e: KeyboardEvent) => void): Subscription {
    if (kbFns.length === 0) { kbShown = ui.keyboardInset(); ui.addWatcher(kbStep); }
    kbFns.push(f); kbKinds.push(kind);
    return new Subscription((): void => { const i = kbFns.indexOf(f); if (i >= 0) { kbFns.splice(i, 1); kbKinds.splice(i, 1); } if (kbFns.length === 0) ui.removeWatcher(kbStep); });
  }
  /** Takes the focus from the field, which hides the on-screen keyboard. */
  static dismiss(): void { ui.focusNode(-1); }
  static isVisible(): boolean { return ui.keyboardInset() > 0; }
  static metrics(): KeyboardCoordinates { return kbEvent(ui.keyboardInset()).endCoordinates; }
}

export type KeyboardAvoidingViewProps = { behavior?: string; keyboardVerticalOffset?: number; enabled?: boolean; style?: ui.Style; children?: () => i32 };
/** Makes room for the on-screen keyboard: behavior 'padding' (and 'height', the same picture for a flex: 1 view) pads the bottom by the keyboard's height,
 *  'position' lifts the content by it; keyboardVerticalOffset is taken off. */
export function KeyboardAvoidingView(p: KeyboardAvoidingViewProps): i32 {
  const [inset, setInset] = useState<number>(ui.keyboardInset());
  const subscribed = useRef<boolean>(false);
  const self = useRef<i32>(-1);
  // as React Native's: the part of this view the keyboard covers (a tab bar below the view is covered first), not the keyboard's whole height
  const covered = (kb: number): number => {
    if (kb <= 0 || self.current < 0) return kb;
    const b = ui.screenBox(self.current);
    return Math.max(0, Math.min(kb, b[1] + b[3] - (height() - kb)));
  };
  useEffect((): void => {
    if (subscribed.current) return;
    subscribed.current = true;
    Keyboard.addListener('keyboardDidChangeFrame', (e: KeyboardEvent): void => setInset(covered(e.endCoordinates.height)));
    Keyboard.addListener('keyboardDidShow', (e: KeyboardEvent): void => setInset(covered(e.endCoordinates.height)));
    Keyboard.addListener('keyboardDidHide', (e: KeyboardEvent): void => setInset(0));
  }, []);
  const room = p.enabled === false ? 0 : Math.max(0, inset - (p.keyboardVerticalOffset ?? 0));
  const lift = p.behavior === 'position' ? new ui.Style(['translateY'], [-room]) : p.behavior !== undefined ? new ui.Style(['paddingBottom'], [room]) : NONE;
  const h = <View style={[p.style ?? NONE, lift]}>{renderChildren(p.children)}</View>;
  self.current = h;
  return h;
}

// ---------------------------------------------------------------- FlatList, SectionList, RefreshControl (ZN-367.03)
/** A spinner row: what a list shows at its top while `refreshing`. */
export function RefreshControl(p: { refreshing: boolean; onRefresh?: () => void; tintColor?: string; colors?: string[] }): i32 {
  if (!p.refreshing) return <View />;
  return <View style={{ height: 48, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={p.tintColor ?? '#999999'} /></View>;
}
/** What a list watches on its scroll node: onEndReached once per data length, pull to refresh past 64 px of overscroll at the top. */
class ListWatch {
  onEnd: (() => void) | null = null; threshold: number = 0.5; endFired: boolean = false; count: i32 = -1;
  onRefresh: (() => void) | null = null; refreshing: boolean = false; pulled: boolean = false; node: i32 = -1;
}
function watchList(w: ListWatch, h: i32, count: i32, onEnd: (() => void) | undefined, threshold: number | undefined, onRefresh: (() => void) | undefined, refreshing: boolean): void {
  w.onEnd = onEnd ?? null; w.threshold = threshold ?? 0.5; w.onRefresh = onRefresh ?? null; w.refreshing = refreshing;
  if (count !== w.count) { w.count = count; w.endFired = false; }   // more data: the end can be reached again
  if (w.node === h) return;
  w.node = h;
  ui.onScroll(h, (e: ui.ResponderEvent, g: ui.GestureState): void => {
    const n = ui.inspectNode(h);
    if (n === null) return;
    const y = e.nativeEvent.contentOffset.y, view = n.lh, far = n.contentH - (y + view);
    if (!w.endFired && w.onEnd !== null && far <= w.threshold * view) { w.endFired = true; (w.onEnd as () => void)(); }
    if (y < -64 && !w.pulled && !w.refreshing && w.onRefresh !== null) { w.pulled = true; (w.onRefresh as () => void)(); }
    if (y >= 0) w.pulled = false;
  });
}
function renderSlot(f: (() => i32) | undefined): i32 { return f !== undefined ? f() : ui.createNode(ui.FRAGMENT); }

export type ListRenderItemInfo<T> = { item: T; index: number };
export type ItemLayout = { length: number; offset: number; index: number };
export type FlatListProps<T> = {
  data: T[]; renderItem: (info: ListRenderItemInfo<T>) => i32; keyExtractor?: (item: T, index: number) => string;
  ItemSeparatorComponent?: () => i32; ListHeaderComponent?: () => i32; ListFooterComponent?: () => i32; ListEmptyComponent?: () => i32;
  onEndReached?: () => void; onEndReachedThreshold?: number; refreshing?: boolean; onRefresh?: () => void;
  numColumns?: number; getItemLayout?: (data: T[], index: number) => ItemLayout; initialNumToRender?: number;
  style?: ui.Style; contentContainerStyle?: ui.Style; columnWrapperStyle?: ui.Style; testID?: string;
};
/** A virtualised vertical list: only the rows near the viewport exist (zinc:ui virtualize, rows of their own heights estimated from getItemLayout or
 *  44 px). Rows: the refresh spinner while refreshing, ListHeaderComponent, the items (numColumns per row, each followed by ItemSeparatorComponent)
 *  or ListEmptyComponent, ListFooterComponent. ponytail: horizontal lists, inverted and scrollToIndex are not offered yet (docs/react-native.md). */
export function FlatList<T>(p: FlatListProps<T>): i32 {
  const sv = useRef<i32>(-1);
  const watch = useRef<ListWatch>(new ListWatch());
  const cols: i32 = Math.max(1, Math.floor(p.numColumns ?? 1));
  const n: i32 = p.data.length, refreshing = p.refreshing === true;
  const spin: i32 = refreshing ? 1 : 0, head: i32 = p.ListHeaderComponent !== undefined ? 1 : 0;
  const body: i32 = n === 0 ? (p.ListEmptyComponent !== undefined ? 1 : 0) : Math.ceil(n / cols);
  const total: i32 = spin + head + body + (p.ListFooterComponent !== undefined ? 1 : 0);
  const gl = p.getItemLayout;
  const est = gl !== undefined && n > 0 ? gl(p.data, 0).length : 44;
  const renderCell = (i: i32): i32 => {
    const sep = p.ItemSeparatorComponent;
    const last = i === n - 1;
    return <View style={cols > 1 ? { flex: 1 } : NONE}>{p.renderItem({ item: p.data[i], index: i })}{renderSlot(sep === undefined || last || cols > 1 ? undefined : sep)}</View>;
  };
  const renderBodyRow = (r: i32): i32 => {
    if (cols === 1) return renderCell(r);
    const row = ui.createNode(ui.FRAGMENT);
    for (let c = 0; c < cols && r * cols + c < n; c++) ui.insert(row, renderCell(r * cols + c), -1);
    return <View style={[{ flexDirection: 'row' }, p.columnWrapperStyle ?? NONE]}>{renderChildren((): i32 => row)}</View>;
  };
  const renderRow = (i: i32): i32 => {
    if (i < spin) return <RefreshControl refreshing={true} />;
    if (i < spin + head) return renderSlot(p.ListHeaderComponent);
    if (i < spin + head + body) return n === 0 ? renderSlot(p.ListEmptyComponent) : renderBodyRow(i - spin - head);
    return renderSlot(p.ListFooterComponent);
  };
  const list = <ScrollView ref={sv} style={[{ flex: 1 }, p.style ?? NONE]} />;
  _virtual(sv.current, total, -est, renderRow);
  watchList(watch.current, sv.current, n, p.onEndReached, p.onEndReachedThreshold, p.onRefresh, refreshing);
  return list;
}

/** A section is exactly { title, data } here: a literal passed in the call is typed against this record (ZN-383), but the common form declares the
 *  sections first (`const DATA = [{ title, data }]`), whose record is the literal's own shape, and an array of records does not convert to a wider
 *  record (ZN-389). */
export type SectionBase<T> = { title: string; data: T[] };
export type SectionListRenderItemInfo<T> = { item: T; index: number; section: SectionBase<T> };
export type SectionHeaderInfo<T> = { section: SectionBase<T> };
export type SectionListProps<T> = {
  sections: SectionBase<T>[]; renderItem: (info: SectionListRenderItemInfo<T>) => i32;
  renderSectionHeader?: (info: SectionHeaderInfo<T>) => i32; renderSectionFooter?: (info: SectionHeaderInfo<T>) => i32;
  stickySectionHeadersEnabled?: boolean; keyExtractor?: (item: T, index: number) => string; ItemSeparatorComponent?: () => i32;
  ListHeaderComponent?: () => i32; ListFooterComponent?: () => i32; onEndReached?: () => void; onEndReachedThreshold?: number;
  refreshing?: boolean; onRefresh?: () => void; style?: ui.Style; contentContainerStyle?: ui.Style;
};
/** Sections with their headers, sticky by default (iOS): a header stays at the top while its section scrolls under it. ponytail: not virtualised (every
 *  row exists); fine for the hundreds of rows a sectioned screen shows, a FlatList is the tool for thousands. */
export function SectionList<T>(p: SectionListProps<T>): i32 {
  const sv = useRef<i32>(-1);
  const watch = useRef<ListWatch>(new ListWatch());
  const sticky = p.stickySectionHeadersEnabled ?? true;
  let count: i32 = 0;
  const content = ui.createNode(ui.FRAGMENT);
  for (const sec of p.sections) {
    const part = ui.createNode(ui.VIEW);   // the section's box bounds its sticky header, as in React Native (a direct parent: sticky reads its box)
    const hd = p.renderSectionHeader;
    if (hd !== undefined) {
      const h = hd({ section: sec });
      if (sticky) { const wrap = ui.createNode(ui.VIEW); ui.setClass(wrap, 'sticky top-0 z-10'); ui.insert(wrap, h, -1); ui.insert(part, wrap, -1); } else ui.insert(part, h, -1);
    }
    for (let i = 0; i < sec.data.length; i++) {
      ui.insert(part, p.renderItem({ item: sec.data[i], index: i, section: sec }), -1);
      const sep = p.ItemSeparatorComponent;
      if (sep !== undefined && i < sec.data.length - 1) ui.insert(part, sep(), -1);
      count++;
    }
    const ft = p.renderSectionFooter;
    if (ft !== undefined) ui.insert(part, ft({ section: sec }), -1);
    ui.insert(content, part, -1);
  }
  const list = <ScrollView ref={sv} style={[{ flex: 1 }, p.style ?? NONE]}>
    <RefreshControl refreshing={p.refreshing === true} />
    {renderSlot(p.ListHeaderComponent)}
    <View style={p.contentContainerStyle ?? NONE}>{renderChildren((): i32 => content)}</View>
    {renderSlot(p.ListFooterComponent)}
  </ScrollView>;
  watchList(watch.current, sv.current, count, p.onEndReached, p.onEndReachedThreshold, p.onRefresh, p.refreshing === true);
  return list;
}

// ---------------------------------------------------------------- Animated in the React model (ZN-386)
/** The current number of an Animated value or interpolation, and a new render of the component each time it moves: what Animated.View does for its
 *  style in React Native (`const x = useAnimated(pan.x)` then `transform: [{ translateX: x }]`). ponytail: the watcher lives as long as the program. */
export function useAnimated(n: A.Node): number {
  const [v, setV] = useState<number>(n.get());
  const on = useRef<boolean>(false);
  if (!on.current) { on.current = true; createEffect((): void => { setV(n.get()); }); }
  return v;
}

// ---------------------------------------------------------------- Modal, Alert (ZN-367.04); Linking is zinc:react-native/linking (it needs the opener permission)
export type ModalProps = { visible?: boolean; transparent?: boolean; animationType?: string; onRequestClose?: () => void; onShow?: () => void; children?: () => i32 };
class ModalState { open: boolean = false; }
/** A full-screen modal layer above the app: the backdrop is white unless transparent, Escape asks onRequestClose. animationType 'slide' brings the
 *  content up from the bottom (250 ms) while a dimmed full-size view of a transparent modal (its scrim) fades in place, as on iOS; 'fade' fades all
 *  of it (200 ms); 'none' (the default) shows it at once. Closing plays the same motion backwards (zinc:ui's layer motions). */
export function Modal(p: ModalProps): i32 {
  const host = useRef<i32>(-1);
  const st = useRef<ModalState>(new ModalState());
  const visible = p.visible ?? true;
  useEffect((): void => {
    const s = st.current, h = host.current;
    if (visible && !s.open) {
      s.open = true;
      const anim = p.animationType ?? 'none';
      ui.openLayer(h, { modal: true, priority: 1000, motion: anim === 'slide' ? 'slide' : anim === 'fade' ? 'fade' : 'none', duration: anim === 'slide' ? 250 : 200 });
      ui.onDismiss(h, (): void => { const f = p.onRequestClose; if (f !== undefined) f(); });
      const f = p.onShow; if (f !== undefined) f();
    } else if (!visible && s.open) s.open = false;   // hidden: the layer plays its motion out
  }, [visible ? 1 : 0]);
  return <View ref={host} style={[{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }, p.transparent === true ? NONE : new ui.Style(['backgroundColor', 'backgroundAlpha'], [0xffffff, 255]),
    visible ? NONE : new ui.Style(['hidden'], [1])]}>{renderChildren(p.children)}</View>;
}

export type AlertButton = { text?: string; onPress?: () => void; style?: string };
class AlertBox { node: i32 = -1; cancel: (() => void) | null = null; }
const DEFAULT_OK: AlertButton[] = [{ text: 'OK' }];
/** React Native's Alert.alert as an in-app dialog over the app (a modal layer): the buttons close it, then call their onPress; Escape presses the
 *  'cancel' button (or just closes when there is none and the alert is not a choice). */
export class Alert {
  static alert(title: string, message: string = '', buttons: AlertButton[] = DEFAULT_OK): void {
    const root = ui.rootNode();
    if (root < 0) {   // called before the app is mounted (an effect of the first render): shown on the first frame that has a root
      const later: () => void = (): void => { if (ui.rootNode() < 0) return; ui.removeStepper(later); Alert.alert(title, message, buttons); };
      ui.addStepper(later);
      return;
    }
    const box = new AlertBox();
    const close = (): void => { ui.setNumber(box.node, 'hidden', 1); setTimeout((): void => { ui.remove(root, box.node); }, 200); };   // it fades out, then leaves
    const shade = ui.createNode(ui.VIEW);
    ui.setStyles(shade, [new ui.Style(['position', 'left', 'top', 'right', 'bottom', 'alignItems', 'justifyContent', 'backgroundColor', 'backgroundAlpha'], [1, 0, 0, 0, 0, 1, 1, 0x000000, 90])]);
    const card = ui.createNode(ui.VIEW);
    ui.setStyles(card, [new ui.Style(['width', 'borderRadius', 'backgroundColor', 'backgroundAlpha', 'paddingTop'], [270, 14, 0xf2f2f2, 255, 18])]);
    const t = ui.createText(title);
    ui.setStyles(t, [new ui.Style(['fontSize', 'fontWeight', 'textAlign', 'paddingLeft', 'paddingRight', 'color'], [17, 1, 1, 16, 16, 0x000000])]);
    ui.insert(card, t, -1);
    if (message !== '') {
      const m = ui.createText(message);
      ui.setStyles(m, [new ui.Style(['fontSize', 'textAlign', 'paddingLeft', 'paddingRight', 'marginTop', 'color'], [13, 1, 16, 16, 4, 0x000000])]);
      ui.insert(card, m, -1);
    }
    const row = ui.createNode(ui.VIEW);
    ui.setStyles(row, [new ui.Style(['flexDirection', 'marginTop', 'borderTopWidth', 'borderColor'], [buttons.length === 2 ? 1 : 0, 18, 1, 0xc6c6c8])]);
    for (const b of buttons) {
      const btn = ui.createNode(ui.VIEW);
      ui.setStyles(btn, [new ui.Style(['grow', 'height', 'alignItems', 'justifyContent'], [1, 44, 1, 1])]);
      const label = ui.createText(b.text ?? 'OK');
      ui.setStyles(label, [new ui.Style(['fontSize', 'fontWeight', 'color'], [17, b.style === 'cancel' ? 1 : 0, b.style === 'destructive' ? 0xff3b30 : 0x007aff])]);
      ui.insert(btn, label, -1);
      const press = (): void => { close(); const f = b.onPress; if (f !== undefined) f(); };
      if (b.style === 'cancel') box.cancel = press;
      ui.listen(btn, press);
      ui.insert(row, btn, -1);
    }
    ui.insert(card, row, -1);
    ui.insert(shade, card, -1);
    box.node = shade;
    ui.insert(root, shade, -1);
    ui.openLayer(shade, { modal: true, priority: 2000, motion: 'fade' });   // the shade is its scrim: all of it fades
    ui.onDismiss(shade, (): void => { const c = box.cancel; if (c !== null) (c as () => void)(); else if (buttons.length <= 1) close(); });
  }
}

// ---------------------------------------------------------------- AppRegistry (ZN-367.05)
/** React Native's entry: `AppRegistry.registerComponent('main', () => App)` mounts App (white background, React Native's). One app per program. */
export class AppRegistry {
  static registerComponent(name: string, getComponent: () => () => i32): void { render(getComponent(), 0xffffff, null); }
}

// ---------------------------------------------------------------- I18nManager (ZN-377)
/** React Native's right-to-left switch over zinc:ui's direction (one for the surface): forceRTL(true) lays everything out from the right at once
 *  (React Native applies it on the next start). */
export class I18nManager {
  static isRTL(): boolean { return ui.isRtl(); }
  static forceRTL(on: boolean): void { ui.setDirection(on ? 'rtl' : 'ltr'); }
  static allowRTL(on: boolean): void {}
  static getConstants(): boolean { return ui.isRtl(); }
}

