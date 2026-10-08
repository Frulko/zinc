// zinc:react-native (ZN-367): React Native's components and APIs on zinc:ui, in the React model (zinc:ui/react). Prop names and defaults follow React
// Native 0.76; what does not map is listed in docs/react-native.md. View, Text, Image and ScrollView imported from here are zinc:ui's host elements; the
// style props of these components (style, *Style) arrive as one flattened Style, as React Native composes `style={[a, b]}`.
import * as ui from 'zinc:ui';
import { useState, useEffect, useRef } from 'zinc:ui/react';
import { platform, env } from 'zinc:sys';
import { width, height, pixelScale, stroke } from 'zinc:gfx';

export { StyleSheet, PanResponder } from 'zinc:ui';

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
/** The press machinery the Touchables share: pressed while the pointer is down on it, onPress on a click, onLongPress after 500 ms (no onPress then). */
function Press(p: PressableProps, pressedStyle: ui.Style | null): i32 {
  const [pressed, setPressed] = useState<boolean>(false);
  const off = p.disabled ?? false;
  const press = (): void => { const f = p.onPress; if (!off && f !== undefined) f(); };
  const long = (e: ui.PointerEvent): void => { const f = p.onLongPress; if (!off && f !== undefined) f(); };
  const down = (e: ui.PointerEvent): void => { if (off) return; setPressed(true); const f = p.onPressIn; if (f !== undefined) f(); };
  const up = (e: ui.PointerEvent): void => { if (!pressed) return; setPressed(false); const f = p.onPressOut; if (f !== undefined) f(); };
  return <View style={[p.style ?? NONE, pressed && pressedStyle !== null && (pressedStyle as ui.Style)]} onPress={press} onLongPress={long} onPointerDown={down}
    onPointerUp={up} onPointerCancel={up} aria-label={p.accessibilityLabel ?? ''}>{renderChildren(p.children)}</View>;
}
export function Pressable(p: PressableProps): i32 { return Press(p, null); }
export function TouchableWithoutFeedback(p: PressableProps): i32 { return Press(p, null); }
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
/** iOS proportions (51 x 31, thumb 27). Controlled like React Native's: it reports the new value and shows `value`. */
export function Switch(p: SwitchProps): i32 {
  const on = p.value ?? false, off = p.disabled ?? false;
  const tc = p.trackColor;
  const tf = tc !== undefined && tc.false !== undefined ? processColor(tc.false as string) : processColor(p.ios_backgroundColor ?? '#e9e9ea');
  const tt = tc !== undefined && tc.true !== undefined ? processColor(tc.true as string) : 0x34c759;
  const th = p.thumbColor !== undefined ? processColor(p.thumbColor as string) : 0xffffff;
  const flip = (): void => { const f = p.onValueChange; if (!off && f !== undefined) f(!on); };
  return <View style={[{ width: 51, height: 31, borderRadius: 16, padding: 2, backgroundColor: on ? tt : tf, opacity: off ? 0.5 : 1 }, p.style ?? NONE]} onPress={flip} role="switch"
    aria-checked={on}>
    <View style={{ width: 27, height: 27, borderRadius: 14, backgroundColor: th, translateX: on ? 20 : 0, shadowColor: 0x000000, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3 }} />
  </View>;
}

// ---------------------------------------------------------------- ActivityIndicator, SafeAreaView, StatusBar
export type ActivityIndicatorProps = { animating?: boolean; color?: string; size?: string; hidesWhenStopped?: boolean; style?: ui.Style };
/** iOS's spinner: 12 bars, the bright one turning once a second; size 'small' (20) or 'large' (36). */
export function ActivityIndicator(p: ActivityIndicatorProps): i32 {
  const n = p.size === 'large' ? 36 : 20, run = p.animating ?? true, col = processColor(p.color ?? '#999999');
  if (!run && (p.hidesWhenStopped ?? true)) return <View style={[{ width: n, height: n }, p.style ?? NONE]} />;
  return <View style={[{ alignItems: 'center', justifyContent: 'center' }, p.style ?? NONE]} role="progressbar">
    <canvas style={{ width: n, height: n }} onDraw={(x: i32, y: i32, w: i32, h: i32) => {
      const cx = x + w / 2, cy = y + h / 2, r1 = w * 0.22, r2 = w * 0.46, lead = run ? Math.floor(ui.now() / 83) % 12 : 0;
      for (let i = 0; i < 12; i++) {
        const a = i * Math.PI / 6, age = (lead - i + 12) % 12;
        stroke([cx + Math.sin(a) * r1, cy - Math.cos(a) * r1, cx + Math.sin(a) * r2, cy - Math.cos(a) * r2], w * 0.09, col as u32, Math.round(255 * (1 - age / 14)), false);
      }
    }} />
  </View>;
}
/** No notch or home indicator on the desktop and simulator surfaces: a plain View. */
export function SafeAreaView(p: { style?: ui.Style; children?: () => i32 }): i32 { return <View style={p.style ?? NONE}>{renderChildren(p.children)}</View>; }
export type StatusBarProps = { barStyle?: string; hidden?: boolean; backgroundColor?: string; translucent?: boolean; animated?: boolean };
/** There is no system status bar to style: StatusBar renders nothing; the last props are kept for StatusBar.currentProps. */
export function StatusBar(p: StatusBarProps): i32 { statusBar = p; return ui.createNode(ui.FRAGMENT); }
let statusBar: StatusBarProps = {};
export function statusBarProps(): StatusBarProps { return statusBar; }

// ---------------------------------------------------------------- Platform, Dimensions, useWindowDimensions, PixelRatio, Appearance
export type PlatformSelect<T> = { ios?: T; android?: T; macos?: T; windows?: T; web?: T; native?: T; default?: T };
export class Platform {
  /** platform() of zinc:sys: 'macos', 'linux', 'web' and the device targets; never 'ios' or 'android' until those targets exist (ZN-372). */
  static OS: string = platform();
  static Version: string = '';
  static isPad: boolean = false;
  static isTV: boolean = false;
  /** The entry for this OS, else `native` (any non-web target), else `default`, else `fallback` (React Native returns undefined: no undefined T here). */
  static select<T>(o: PlatformSelect<T>, fallback: T): T {
    const os = Platform.OS;
    if (os === 'macos' && o.macos !== undefined) return o.macos as T;
    if (os === 'web' && o.web !== undefined) return o.web as T;
    if (os !== 'web' && o.native !== undefined) return o.native as T;
    if (o.default !== undefined) return o.default as T;
    return fallback;
  }
}
export class ScaledSize { width: number = 0; height: number = 0; scale: number = 1; fontScale: number = 1; }
export class DimensionsChange { window: ScaledSize = new ScaledSize(); screen: ScaledSize = new ScaledSize(); }
export class Subscription { private f: () => void; constructor(f: () => void) { this.f = f; } remove(): void { this.f(); } }
function size(): ScaledSize { const s = new ScaledSize(); s.width = width(); s.height = height(); s.scale = pixelScale(); return s; }
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
    if (dimFns.length === 0) { lastW = width(); lastH = height(); ui.addStepper(dimStep); }
    dimFns.push(f);
    return new Subscription((): void => { const i = dimFns.indexOf(f); if (i >= 0) dimFns.splice(i, 1); if (dimFns.length === 0) ui.removeStepper(dimStep); });
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
  static getFontScale(): number { return 1; }
  static getPixelSizeForLayoutSize(n: number): number { return Math.round(n * pixelScale()); }
  static roundToNearestPixel(n: number): number { const k = pixelScale(); return Math.round(n * k) / k; }
}
let scheme: string = env('ZINC_COLOR_SCHEME') === 'dark' ? 'dark' : 'light';
const schemeFns: ((p: AppearancePreferences) => void)[] = [];
export class AppearancePreferences { colorScheme: string = 'light'; }
/** The colour scheme: ZINC_COLOR_SCHEME=dark or setColorScheme; the system setting is not read yet (listed in docs/react-native.md). */
export class Appearance {
  static getColorScheme(): string { return scheme; }
  static setColorScheme(s: string): void {
    if (s === scheme) return;
    scheme = s === 'dark' ? 'dark' : 'light';
    const e = new AppearancePreferences(); e.colorScheme = scheme;
    for (const f of schemeFns.slice()) f(e);
  }
  static addChangeListener(f: (p: AppearancePreferences) => void): Subscription {
    schemeFns.push(f);
    return new Subscription((): void => { const i = schemeFns.indexOf(f); if (i >= 0) schemeFns.splice(i, 1); });
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
  style?: ui.Style; testID?: string; accessibilityLabel?: string;
};
/** A zinc:ui text field (a TextArea when multiline). Controlled through value + onChangeText as in React Native; maxLength cuts what is typed past it;
 *  onSubmitEditing on Enter (single line); keyboardType picks the on-screen keyboard (numeric 'numeric' / 'number-pad', 'decimal-pad', 'phone-pad',
 *  'email-address', 'url', 'web-search'). ponytail: onFocus / onBlur are not offered yet (zinc:ui's focus listeners cannot be removed). */
export function TextInput(p: TextInputProps): i32 {
  const field = useRef<i32>(-1);
  const started = useRef<boolean>(false);
  const kt = p.keyboardType ?? 'default';
  const mode = kt === 'numeric' ? 1 : Math.max(0, INPUT_MODES.indexOf(kt));
  const flags = new ui.Style(['password', 'readOnly', 'inputMode'], [p.secureTextEntry === true ? 1 : 0, p.editable === false ? 1 : 0, mode]);
  const text = p.value ?? p.defaultValue ?? '';
  const typed = (s: string): void => {
    let v = s;
    const max = p.maxLength ?? -1;
    if (max >= 0 && v.length > max) { v = v.substring(0, max); ui.setValue(field.current, v); }
    const f = p.onChangeText; if (f !== undefined) f(v);
  };
  const key = (e: ui.KeyEvent): void => { if (e.key === 'Enter' && p.multiline !== true) { const f = p.onSubmitEditing; if (f !== undefined) f(); } };
  useEffect((): void => {
    if (started.current) return;
    started.current = true;
    if (p.autoFocus === true) ui.focusNode(field.current);
  }, []);
  if (p.multiline === true)
    return <TextArea ref={field} style={[p.style ?? NONE, flags]} value={text} placeholder={p.placeholder ?? ''} onInput={typed} aria-label={p.accessibilityLabel ?? ''} />;
  return <Input ref={field} style={[p.style ?? NONE, flags]} value={text} placeholder={p.placeholder ?? ''} onInput={typed} onKeyDown={key} aria-label={p.accessibilityLabel ?? ''} />;
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
    if (kbFns.length === 0) { kbShown = ui.keyboardInset(); ui.addStepper(kbStep); }
    kbFns.push(f); kbKinds.push(kind);
    return new Subscription((): void => { const i = kbFns.indexOf(f); if (i >= 0) { kbFns.splice(i, 1); kbKinds.splice(i, 1); } if (kbFns.length === 0) ui.removeStepper(kbStep); });
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
  useEffect((): void => {
    if (subscribed.current) return;
    subscribed.current = true;
    Keyboard.addListener('keyboardDidChangeFrame', (e: KeyboardEvent): void => setInset(e.endCoordinates.height));
    Keyboard.addListener('keyboardDidShow', (e: KeyboardEvent): void => setInset(e.endCoordinates.height));
    Keyboard.addListener('keyboardDidHide', (e: KeyboardEvent): void => setInset(0));
  }, []);
  const room = p.enabled === false ? 0 : Math.max(0, inset - (p.keyboardVerticalOffset ?? 0));
  const lift = p.behavior === 'position' ? new ui.Style(['translateY'], [-room]) : p.behavior !== undefined ? new ui.Style(['paddingBottom'], [room]) : NONE;
  return <View style={[p.style ?? NONE, lift]}>{renderChildren(p.children)}</View>;
}
