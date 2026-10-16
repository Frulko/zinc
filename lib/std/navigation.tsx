// zinc:ui/navigation: a stack navigator in the React model, shaped like React Navigation's native stack (docs/ui.md, "Navigation stack").
// Screens are pushed and popped with the platform's transition (ui.platformStyle()): on iOS the new screen slides in from the right over the
// previous one, which moves a third of the way left under a dimming, and an edge swipe pops interactively (completed or cancelled by the
// release velocity); on Android the screens cross with Material's shared X axis (a 30 px slide and a fade through), the back key pops, and
// Android 14's predictive back shrinks the screen while the gesture runs (backstart / backprogress / backcancel signals). Reduce motion makes
// both a short cross-fade. `present` opens a screen modally in the shared React Native Modal: a sheet that a drag down dismisses on iOS, a
// full-screen dialog on Android. Lower screens stay mounted (their state and scroll are kept), as a native stack keeps them.
// The motion runs in a zinc:ui stepper on the screens' own nodes: a transition re-renders nothing.
import * as ui from 'zinc:ui';
import { useState, useRef, useEffect } from 'zinc:ui/react';
import { width, height, stroke } from 'zinc:gfx';
import { Modal } from 'zinc:react-native';

export class Route { key: i32 = 0; name: string = ''; title: string = ''; params: number = 0; modal: boolean = false; }

// the screens' backgrounds (iOS's grouped grey, Android's surface) and the dimming left of the top screen, which the motion's styles keep
const IOS_BG = new ui.Style(['backgroundColor'], [0xf2f2f7]), ANDROID_BG = new ui.Style(['backgroundColor'], [0xffffff]);
const DIM = new ui.Style(['left', 'width', 'backgroundColor', 'opacity', 'hidden'], [-2000, 2000, 0x000000, 0, 1]);
const SCRIM = new ui.Style(['backgroundColor', 'backgroundAlpha'], [0x000000, 90]);
const IOS_MS: number = 350, ANDROID_MS: number = 300, FADE_MS: number = 200;   // the iOS edge strip that swipes back: w-6 (24 px)

/** The navigation state of one Stack: the routes, the running transition and the screens' nodes it moves. */
export class Navigation {
  routes: Route[] = [];
  keys: i32 = 0;
  style: string = 'ios';         // 'ios' | 'android' (the desktop takes iOS's)
  // the transition: kind 0 none, 1 push, 2 pop, 3 swipe (finger), 4 predictive back (progress), 5 settle back to rest after a cancel
  kind: i32 = 0;
  t: number = 1;                 // the top screen's progress: 1 shown, 0 gone
  from: number = 1; to: number = 1; startedAt: number = 0; ms: number = 0;
  edge: number = 1;              // predictive back: 1 from the left edge, -1 from the right
  predictive: boolean = false;   // the transition is Android's predictive back (its progress, its commit, its cancel)
  dragAt: number[] = []; dragX: number[] = [];   // swipe samples (ms, dx) for the release velocity
  nodes: Map<i32, i32> = new Map<i32, i32>();    // route key -> its screen's node
  dims: Map<i32, i32> = new Map<i32, i32>();     // route key -> the dimming node under it (iOS)
  alphas: Map<i32, number> = new Map<i32, number>();   // route key -> its screen's opacity now
  rerender: () => void = (): void => {};
  stepping: boolean = false;
  stepper: () => void = (): void => {};
  backFn: () => boolean = (): boolean => false;
  signalFn: (kind: string, arg: string) => void = (kind: string, arg: string): void => {};

  /** The route on top (the one shown). */
  top(): Route { return this.routes[this.routes.length - 1]; }
  canGoBack(): boolean { return this.stackDepth() > 1 || this.modalOpen(); }
  stackDepth(): i32 { let n: i32 = 0; for (const r of this.routes) if (!r.modal) n++; return n; }
  modalOpen(): boolean { return this.routes.length > 0 && this.top().modal; }
  route(name: string, title: string, params: number, modal: boolean): Route {
    const r = new Route(); r.key = ++this.keys; r.name = name; r.title = title; r.params = params; r.modal = modal; return r;
  }
  /** Opens a screen above the current one, with the platform's transition. */
  push(name: string, title: string = '', params: number = 0): void {
    if (this.kind === 2) this.finish();
    this.routes.push(this.route(name, title, params, false));
    this.animate(1, 0, 1);
    this.rerender();
  }
  /** Opens a screen modally: a sheet on iOS (drag it down to dismiss), a full-screen dialog on Android. */
  present(name: string, title: string = '', params: number = 0): void {
    if (this.kind === 2) this.finish();
    this.routes.push(this.route(name, title, params, true));
    this.rerender();
  }
  /** Back one screen, with the platform's transition; false when there is nothing to pop. */
  pop(): boolean {
    if (this.modalOpen()) { this.routes.pop(); this.rerender(); return true; }
    if (this.stackDepth() < 2 || this.kind === 2) return false;
    this.animate(2, this.t, 0);
    return true;
  }
  /** The top screen replaced, without a transition. */
  replace(name: string, title: string = '', params: number = 0): void {
    this.routes[this.routes.length - 1] = this.route(name, title, params, this.top().modal);
    this.rerender();
  }
  /** Back to the first screen at once. */
  popToTop(): void { this.routes = this.routes.slice(0, 1); this.kind = 0; this.t = 1; this.rerender(); }

  animate(kind: i32, from: number, to: number): void {
    this.kind = kind; this.from = from; this.to = to; this.t = from; this.startedAt = ui.now();
    const full = ui.prefersReducedMotion() ? FADE_MS : this.style === 'android' ? ANDROID_MS : IOS_MS;
    this.ms = Math.max(80, full * Math.abs(to - from));
    this.wake();
  }
  wake(): void { if (!this.stepping) { this.stepping = true; ui.addStepper(this.stepper); } this.apply(); }
  /** One frame of the transition. */
  step(): void {
    if (this.kind === 1 || this.kind === 2 || this.kind === 5) {
      const k = this.ms > 0 ? Math.min(1, (ui.now() - this.startedAt) / this.ms) : 1;
      // iOS: UIKit's navigation curve (a cubic ease out); Android: Material's emphasized decelerate (a quint ease out)
      const e = this.style === 'android' && !ui.prefersReducedMotion() ? 1 - Math.pow(1 - k, 5) : 1 - Math.pow(1 - k, 3);
      this.t = this.from + (this.to - this.from) * e;
      if (k >= 1) { this.finish(); return; }
    }
    this.apply();
  }
  finish(): void {
    const popped = this.kind === 2;
    this.kind = 0; this.t = 1; this.edge = 1; this.predictive = false;
    if (this.stepping) { this.stepping = false; ui.removeStepper(this.stepper); }
    if (popped) { const r = this.routes.pop(); if (r !== undefined) { this.nodes.delete(r.key); this.dims.delete(r.key); } this.rerender(); }
    this.apply();
  }
  /** The screens' motion for the progress t (iOS slide with parallax and dimming, Android shared axis or predictive shrink, a fade when reduced). */
  apply(): void {
    const w = width(), stack: Route[] = [];
    for (const r of this.routes) if (!r.modal) stack.push(r);
    const n = stack.length, t = this.t, reduced = ui.prefersReducedMotion();
    for (let i = 0; i < n; i++) {
      const h = this.nodes.get(stack[i].key);
      if (h === undefined) continue;
      const isTop = i === n - 1, below = i === n - 2, moving = this.kind !== 0;
      let x: number = 0, op: number = 1, s: number = 1, hide = !isTop && !(below && moving);
      if (moving && (isTop || below)) {
        if (reduced) op = isTop ? t : 1;
        else if (this.predictive) {
          // Android's predictive back: the top screen shrinks toward 90 % and leans the gesture's way (4 % of the width); the one below waits
          // behind it, still; a commit (the back) carries on to 80 % and fades it out, a cancel brings it back
          if (isTop) { const p = 1 - t; s = 1 - 0.1 * Math.min(1, p) - (this.kind === 2 ? 0.1 * p : 0); x = this.edge * 0.04 * w * p; op = this.kind === 2 ? Math.min(1, t * 3) : 1; }
        } else if (this.style === 'android') {
          if (isTop) { x = 30 * (1 - t); op = Math.max(0, Math.min(1, (t - 0.3) / 0.7)); }
          else { x = -30 * t; op = Math.max(0, Math.min(1, 1 - t / 0.3)); }
        } else {
          if (isTop) x = (1 - t) * w; else x = -0.3 * w * t;
        }
      }
      this.alphas.set(stack[i].key, hide ? 0 : op);
      ui.setStyles(h, [this.style === 'android' ? ANDROID_BG : IOS_BG, new ui.Style(['translateX', 'opacity', 'scaleX', 'scaleY', 'hidden'], [x, op, s, s, hide ? 1 : 0])]);   // the JSX's base, then the motion
      const d = this.dims.get(stack[i].key);   // iOS: the screen below is dimmed by up to 10 % as the top one covers it
      if (d !== undefined) ui.setStyles(d, [DIM, new ui.Style(['opacity', 'hidden'], [0.1 * t, isTop && moving && this.style !== 'android' && !reduced ? 0 : 1])]);
    }
  }
  /** The opacity the motion gives a route's screen now (a canvas in it draws with it). */
  alphaOf(key: i32): number { const a = this.alphas.get(key); return a === undefined ? 1 : a; }
  // ---- the iOS edge swipe: the top screen follows the finger, the release velocity decides
  swipe(e: ui.PointerEvent): void {
    if (this.stackDepth() < 2) return;
    const w = Math.max(1, width());
    if (e.phase === 0) { this.kind = 3; this.dragAt = []; this.dragX = []; this.wake(); }
    if (this.kind !== 3) return;
    const dx = Math.max(0, e.dx);
    this.t = 1 - Math.min(1, dx / w);
    this.dragAt.push(ui.now()); this.dragX.push(dx);
    while (this.dragAt.length > 2 && ui.now() - this.dragAt[0] > 100) { this.dragAt.shift(); this.dragX.shift(); }
    this.apply();
    if (e.phase === 2 || e.phase === 3) {
      const k = this.dragAt.length - 1, span = k > 0 ? this.dragAt[k] - this.dragAt[0] : 0;
      const v = span > 0 ? (this.dragX[k] - this.dragX[0]) / span * 1000 : 0;   // px/s, positive toward the right
      // UIKit's rule: past the middle and not thrown back, or thrown right fast enough, completes; anything else returns
      const done = e.phase === 2 && ((dx > w / 2 && v > -300) || v > 500);
      if (done) this.animate(2, this.t, 0); else this.animate(5, this.t, 1);
    }
  }
  // ---- Android's predictive back and back key
  signal(kind: string, arg: string): void {
    if (this.style !== 'android' || this.stackDepth() < 2 || this.modalOpen()) return;
    if (kind === 'backstart') { this.kind = 4; this.predictive = true; this.edge = arg === 'right' ? -1 : 1; this.t = 1; this.wake(); }
    else if (kind === 'backprogress' && this.kind === 4) { this.t = 1 - Math.max(0, Math.min(1, parseFloat(arg))); this.apply(); }
    else if (kind === 'backcancel' && this.kind === 4) this.animate(5, this.t, 1);
  }
}

export type StackProps = {
  initial: string; initialTitle?: string; initialParams?: number;
  renderScreen: (r: Route, nav: Navigation) => i32;
  headerShown?: boolean; largeTitle?: boolean; tint?: i32; style?: string;
};

const INK: i32 = 0x0f172a;
/** The back button of a header: iOS's chevron and the previous title in the tint, Android's arrow. */
function BackButton(q: { nav: Navigation; routeKey: i32; android: boolean; prev: string; tint: i32 }): i32 {
  const android = q.android;
  return <View style={{ flexDirection: 'row', alignItems: 'center', height: 44, paddingLeft: android ? 16 : 8, paddingRight: 8 }} onPress={() => { q.nav.pop(); }} role="button" aria-label="Back">
    <Canvas style={{ width: android ? 24 : 14, height: 24, lazy: 1 }} onDraw={(x: i32, y: i32, w: i32, h: i32) => {
      // in the canvas's box as laid out (a scaled screen scales it); the screen's fade is applied here: a canvas draws at full alpha otherwise
      const c = (android ? INK : q.tint) as u32, k = w / (android ? 24 : 14), al: i32 = Math.round(255 * q.nav.alphaOf(q.routeKey));
      if (al <= 0) return;
      if (android) { stroke([x + 20 * k, y + 12 * k, x + 4 * k, y + 12 * k], 2 * k, c, al, false); stroke([x + 11 * k, y + 5 * k, x + 4 * k, y + 12 * k, x + 11 * k, y + 19 * k], 2 * k, c, al, false); }
      else stroke([x + 11 * k, y + 3 * k, x + 2 * k, y + 12 * k, x + 11 * k, y + 21 * k], 3 * k, c, al, false);
    }} />
    {!android && q.prev !== '' && <Text style={[TEXT17, new ui.Style(['color'], [q.tint])]}>{q.prev}</Text>}
  </View>;
}
const TEXT17 = new ui.Style(['fontSize', 'marginLeft'], [17, 4]);
/** A header bar: iOS (the back button, the title centred; a large title below when asked), Android (the back arrow, the title on the left). */
function Header(q: { nav: Navigation; route: Route; index: i32; prev: string; large: boolean; tint: i32 }): i32 {
  const android = q.nav.style === 'android', back = q.index > 0 || q.route.modal;
  const ink = INK;
  if (android) return <View className="pt-[env(safe-area-inset-top)]" style={{ backgroundColor: 0xffffff }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', height: 64 }}>{back ? <BackButton nav={q.nav} routeKey={q.route.key} android={true} prev="" tint={q.tint} /> : <View style={{ width: 16 }} />}<Text style={{ fontSize: 22, color: ink, marginLeft: back ? 16 : 0 }}>{q.route.title}</Text></View>
  </View>;
  return <View className="pt-[env(safe-area-inset-top)]" style={{ backgroundColor: 0xf9f9f9, borderBottomWidth: q.large ? 0 : 0.5, borderColor: 0xc8c7cc }}>
    <View style={{ height: 44, flexDirection: 'row', alignItems: 'center' }}>
      {back ? <BackButton nav={q.nav} routeKey={q.route.key} android={false} prev={q.prev} tint={q.tint} /> : <View style={{ width: 8 }} />}
      <View className="absolute inset-y-0 left-[90px] right-[90px] items-center justify-center">
        <Text style={{ fontSize: 17, fontWeight: 600, color: ink }}>{q.large ? '' : q.route.title}</Text>
      </View>
    </View>
    {q.large ? <View style={{ paddingLeft: 16, paddingBottom: 8 }}><Text style={{ fontSize: 34, fontWeight: 700, color: ink }}>{q.route.title}</Text></View> : <View />}
  </View>;
}

/** One screen of the stack: its node registered for the motion, its header, its content; an iOS edge strip pops it by a swipe. */
function Screen(q: { nav: Navigation; route: Route; index: i32; prev: string; p: StackProps }): i32 {
  const host = useRef<i32>(-1), dim = useRef<i32>(-1);
  const nav = q.nav, r = q.route, android = nav.style === 'android';
  useEffect((): void => { nav.nodes.set(r.key, host.current); if (!android) nav.dims.set(r.key, dim.current); nav.apply(); }, null);
  const large = (q.p.largeTitle ?? false) && !android && q.index === 0;
  return <View ref={host} className="absolute inset-0 flex-col" style={android ? ANDROID_BG : IOS_BG}>
    {android ? <View /> : <View ref={dim} className="absolute inset-y-0" style={DIM} />}
    {(q.p.headerShown ?? true) ? <Header nav={nav} route={r} index={q.index} prev={q.prev} large={large} tint={q.p.tint ?? 0x007aff} /> : <View />}
    <View className="flex-1">{q.p.renderScreen(r, nav)}</View>
    {!android && q.index > 0 ? <View className="absolute inset-y-0 left-0 w-6" onDrag={(e: ui.PointerEvent) => nav.swipe(e)} /> : <View />}
  </View>;
}

/** The modal screen on top: in React Native's Modal (its layer and scrim), a sheet on iOS that a drag down on its top dismisses, a full-screen
 *  dialog on Android with a back arrow. Always mounted, the Modal shown while a modal route is on top: React's model here has no unmount
 *  cleanup, so the Modal closes its layer when it turns invisible. A dismissal waits for the end of the frame (the drag's node goes with it). */
function Presented(q: { nav: Navigation; p: StackProps }): i32 {
  const [drag, setDrag] = useState<number>(0);
  const nav = q.nav, android = nav.style === 'android', h = height(), shown = nav.modalOpen();
  const close = (): void => { const later: () => void = (): void => { ui.removeStepper(later); setDrag(0); nav.pop(); }; ui.addStepper(later); };
  const grab = (e: ui.PointerEvent): void => {
    if (e.phase === 1) setDrag(Math.max(0, e.dy));
    else if (e.phase === 2 || e.phase === 3) { if (e.phase === 2 && e.dy > h * 0.25) close(); else setDrag(0); }
  };
  const r = shown ? nav.top() : new Route();
  if (android) return <Modal visible={shown} transparent={true} animationType="slide" onRequestClose={close}>
    {shown && <View className="flex-1" style={ANDROID_BG}>
      <Header nav={nav} route={r} index={1} prev="" large={false} tint={q.p.tint ?? 0x007aff} />
      <View className="flex-1">{q.p.renderScreen(r, nav)}</View>
    </View>}
  </Modal>;
  return <Modal visible={shown} transparent={true} animationType="slide" onRequestClose={close}>
    {shown && <View className="flex-1" style={SCRIM}>
      <View className="flex-1" style={{ marginTop: ui.safeArea()[0] + 10, translateY: drag, backgroundColor: 0xffffff, borderTopLeftRadius: 12, borderTopRightRadius: 12 }}>
        <View style={{ height: 24, alignItems: 'center', justifyContent: 'center' }} onDrag={grab} role="button" aria-label="Dismiss">
          <View style={{ width: 36, height: 5, borderRadius: 3, backgroundColor: 0xc7c7cc }} />
        </View>
        <Text style={{ fontSize: 17, fontWeight: 600, alignSelf: 'center', color: 0x0f172a }}>{r.title}</Text>
        <View className="flex-1">{q.p.renderScreen(r, nav)}</View>
      </View>
    </View>}
  </Modal>;
}

/** A stack navigator: `renderScreen(route, nav)` draws a screen; `nav.push('details', 'Details', id)`, `nav.pop()`, `nav.present(...)`. The Android back
 *  key and gesture pop it (zinc:ui's back handlers); `style` forces 'ios' or 'android' (default: ui.platformStyle(), the desktop taking iOS's). */
export function Stack(p: StackProps): i32 {
  const [version, setVersion] = useState<number>(0);
  const st = useRef<Navigation | null>(null);
  if (st.current === null) {
    const nav = new Navigation();
    nav.style = p.style ?? (ui.platformStyle() === 'android' ? 'android' : 'ios');
    nav.routes.push(nav.route(p.initial, p.initialTitle ?? '', p.initialParams ?? 0, false));
    nav.stepper = (): void => nav.step();
    nav.backFn = (): boolean => nav.pop();
    nav.signalFn = (kind: string, arg: string): void => nav.signal(kind, arg);
    ui.addBackHandler(nav.backFn);
    ui.addSignalListener(nav.signalFn);
    st.current = nav;
  }
  const nav = st.current as Navigation;
  nav.rerender = (): void => setVersion(version + 1);
  const stack = nav.routes.filter((r: Route): boolean => !r.modal);
  return <View className="flex-1 overflow-hidden">
    {stack.map((r: Route, i: number) => <Screen key={'' + r.key} nav={nav} route={r} index={i} prev={i > 0 ? stack[i - 1].title : ''} p={p} />)}
    <Presented nav={nav} p={p} />
  </View>;
}
