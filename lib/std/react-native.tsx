// zinc:react-native (ZN-367): React Native's components and APIs on zinc:ui, in the React model (zinc:ui/react). Prop names and defaults follow React
// Native 0.76; what does not map is listed in docs/react-native.md. View, Text, Image and ScrollView imported from here are zinc:ui's host elements; the
// style props of these components (style, *Style) arrive as one flattened Style, as React Native composes `style={[a, b]}`.
import * as ui from 'zinc:ui';
import { useState, useEffect, useRef, render } from 'zinc:ui/react';   // _virtual comes with the JSX helpers
import { platform, env } from 'zinc:sys';
import { width, height, pixelScale, stroke } from 'zinc:gfx';
import { createEffect } from 'zinc:ui/solid';
import * as A from 'zinc:ui/animated';

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
/** React Native's Button: iOS's look (a blue title; `color` tints it), dims while pressed and when disabled. */
export function Button(p: { title: string; onPress?: () => void; color?: string; disabled?: boolean; accessibilityLabel?: string; testID?: string }): i32 {
  const c = processColor(p.color ?? '#007aff'), off = p.disabled ?? false;
  return <Pressable onPress={p.onPress} disabled={off} accessibilityLabel={p.accessibilityLabel ?? p.title} style={new ui.Style(['paddingTop', 'paddingBottom', 'alignItems'], [8, 8, 1])}>
    <Text style={{ fontSize: 18, color: off ? 0x999999 : (c < 0 ? 0x007aff : c) }}>{p.title}</Text>
  </Pressable>;
}
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
  const bare = new ui.Style(['borderWidth'], [0]);   // React Native's TextInput has no border of its own (zinc:ui's field has one)
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
    return <TextArea ref={field} style={[bare, p.style ?? NONE, flags]} value={text} placeholder={p.placeholder ?? ''} onInput={typed} aria-label={p.accessibilityLabel ?? ''} />;
  return <Input ref={field} style={[bare, p.style ?? NONE, flags]} value={text} placeholder={p.placeholder ?? ''} onInput={typed} onKeyDown={key} aria-label={p.accessibilityLabel ?? ''} />;
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
// keyExtractor takes one parameter until ZN-383: the lambda of a generic argument keeps its own arity, and `item => item.id` is the common form.
export type ItemLayout = { length: number; offset: number; index: number };
export type FlatListProps<T> = {
  data: T[]; renderItem: (info: ListRenderItemInfo<T>) => i32; keyExtractor?: (item: T) => string;
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

/** A section is exactly { title, data } here: a generic call takes the shape of the literal it is given, so an optional field would make a different
 *  record (contextual typing of generic arguments: ZN-383). */
export type SectionBase<T> = { title: string; data: T[] };
export type SectionListRenderItemInfo<T> = { item: T; index: number; section: SectionBase<T> };
export type SectionHeaderInfo<T> = { section: SectionBase<T> };
export type SectionListProps<T> = {
  sections: SectionBase<T>[]; renderItem: (info: SectionListRenderItemInfo<T>) => i32;
  renderSectionHeader?: (info: SectionHeaderInfo<T>) => i32; renderSectionFooter?: (info: SectionHeaderInfo<T>) => i32;
  stickySectionHeadersEnabled?: boolean; keyExtractor?: (item: T) => string; ItemSeparatorComponent?: () => i32;
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
class ModalState { open: boolean = false; at: A.Value = new A.Value(0); }
/** A full-screen modal layer above the app: the backdrop is white unless transparent, Escape asks onRequestClose, animationType 'slide' comes up from
 *  the bottom and 'fade' fades in (300 ms). ponytail: it hides at once on close (React Native animates the way out too). */
export function Modal(p: ModalProps): i32 {
  const host = useRef<i32>(-1);
  const st = useRef<ModalState>(new ModalState());
  const visible = p.visible ?? true;
  const k = useAnimated(st.current.at);
  useEffect((): void => {
    const s = st.current, h = host.current;
    if (visible && !s.open) {
      s.open = true;
      ui.openLayer(h, { modal: true, priority: 1000 });
      ui.onDismiss(h, (): void => { const f = p.onRequestClose; if (f !== undefined) f(); });
      if (p.animationType === 'slide' || p.animationType === 'fade') { s.at.setValue(0); A.timing(s.at, { toValue: 1, duration: 300, easing: A.Easing.out(A.Easing.cubic) }).start(); }
      else s.at.setValue(1);
      const f = p.onShow; if (f !== undefined) f();
    } else if (!visible && s.open) { s.open = false; ui.closeLayer(h); }
  }, [visible ? 1 : 0]);
  const motion = p.animationType === 'slide' ? new ui.Style(['translateY'], [(1 - k) * height()]) : p.animationType === 'fade' ? new ui.Style(['opacity'], [k]) : NONE;
  return <View ref={host} style={[{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }, p.transparent === true ? NONE : new ui.Style(['backgroundColor', 'backgroundAlpha'], [0xffffff, 255]),
    motion, visible ? NONE : new ui.Style(['hidden'], [1])]}>{renderChildren(p.children)}</View>;
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
    const close = (): void => { ui.closeLayer(box.node); ui.remove(root, box.node); };
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
    ui.openLayer(shade, { modal: true, priority: 2000 });
    ui.onDismiss(shade, (): void => { const c = box.cancel; if (c !== null) (c as () => void)(); else if (buttons.length <= 1) close(); });
  }
}

// ---------------------------------------------------------------- AppRegistry (ZN-367.05)
/** React Native's entry: `AppRegistry.registerComponent('main', () => App)` mounts App (white background, React Native's). One app per program. */
export class AppRegistry {
  static registerComponent(name: string, getComponent: () => () => i32): void { render(getComponent(), 0xffffff, null); }
}

