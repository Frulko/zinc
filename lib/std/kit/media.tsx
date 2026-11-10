/** @jsxHelpers zinc:ui/kit/host */
import * as ui from 'zinc:ui';
import { Value, spring } from 'zinc:ui/animated';
import { createNodeRef } from 'zinc:ui/solid';
import { rect, rrect, border, drawImageRect, imageWidth, imageHeight } from 'zinc:gfx';
import { theme, themeColor } from './theme';
import { Button as ActionButton } from './button';
import { componentRef, componentSignal, componentEffect } from './host';
import { retainCachedImage, releaseCachedImage } from '../image-cache';
import { ImageView, ImageViewport, MediaRect, CropHandle, clampMedia, fitImageRect, normalizedCrop, cropHandle, moveCrop, resizeCrop, drawnCrop, mediaSlide } from './media-model';
export { ImageView, MediaRect } from './media-model';

enum MotionPhase { Idle, Moving, Disposed }
class MediaMotion {
  value: Value; phase: MotionPhase = MotionPhase.Idle; generation: i32 = 0;
  constructor(value: number) { this.value = new Value(value); }
  transition(next: MotionPhase): boolean {
    if (this.phase === MotionPhase.Disposed) return false;
    this.phase = next; return true;
  }
  move(to: number, animated: boolean, velocity: number = 0): void {
    if (this.phase === MotionPhase.Disposed) return;
    this.generation++; this.value.stopAnimation();
    if (!animated || ui.prefersReducedMotion() || Math.abs(this.value.get() - to) < 0.001) {
      this.value.setValue(to); this.transition(MotionPhase.Idle); return;
    }
    this.transition(MotionPhase.Moving);
    const generation = this.generation;
    spring(this.value, { toValue: to, stiffness: 240, damping: 31, mass: 1, velocity: velocity }).start((finished: boolean) => {
      if (this.generation === generation) this.transition(MotionPhase.Idle);
    });
  }
  dispose(): void { this.generation++; this.value.stopAnimation(); this.value.removeAllListeners(); this.transition(MotionPhase.Disposed); }
}
function frameClass(extra: string = ''): string {
  return `relative min-w-0 w-full overflow-hidden rounded-[10px] border border-${theme().border} bg-${theme().muted} focus-visible:ring-2 focus-visible:ring-${theme().accent} focus-visible:ring-offset-2 ${extra}`;
}
function imageQuad(image: i32, viewport: ImageViewport, left: number, top: number): void {
  if (image < 0) return;
  const r = viewport.visible();
  if (r[6] > 0 && r[7] > 0) drawImageRect(image, r[0], r[1], r[2], r[3], left + r[4], top + r[5], r[6], r[7], 255);
}
function useMediaImages(read: () => i32[]): void {
  componentEffect(() => {
    const images = read();
    for (const image of images) retainCachedImage(image);
    return () => { for (const image of images) releaseCachedImage(image); };
  });
}
function checker(left: number, top: number, width: number, height: number): void {
  const cell = Math.max(10, Math.ceil(Math.max(width, height) / 80));
  rect(left, top, width, height, themeColor('card'));
  for (let y = 0; y < height; y += cell) for (let x = ((Math.floor(y / cell) % 2) * cell); x < width; x += cell * 2)
    rect(left + x, top + y, Math.min(cell, width - x), Math.min(cell, height - y), themeColor('border'));
}
export interface ImageViewerProps {
  image: i32; imageWidth?: number; imageHeight?: number; label: string;
  view: () => ImageView; onChange: (view: ImageView) => void;
  height?: number; maxZoom?: number; noToolbar?: boolean; checkerboard?: boolean; className?: string;
}
enum MediaDrag { Idle, Dragging, Pinching }
class ViewportOwner {
  viewport: ImageViewport = new ImageViewport(); display: ImageViewport = new ImageViewport();
  zoom: MediaMotion = new MediaMotion(1); x: MediaMotion = new MediaMotion(0); y: MediaMotion = new MediaMotion(0);
  width: number = 1; height: number = 1; image: i32 = -1; props: ImageViewerProps | null = null;
  targetZoom: number = -1; targetX: number = 0; targetY: number = 0; reduced: boolean = false;
  drag: MediaDrag = MediaDrag.Idle; start: ImageView = new ImageView();
  transition(next: MediaDrag): void { if (next === MediaDrag.Idle || this.drag === MediaDrag.Idle) this.drag = next; }
  dispose(): void { this.transition(MediaDrag.Idle); this.zoom.dispose(); this.x.dispose(); this.y.dispose(); }
}
export function ImageViewer(p: ImageViewerProps): i32 {
  const root = createNodeRef();
  const ref = componentRef<ViewportOwner | null>(null);
  if (ref.current === null) ref.current = new ViewportOwner();
  const owner = ref.current; owner.props = p;
  const iw = (): number => p.imageWidth ?? imageWidth(p.image), ih = (): number => p.imageHeight ?? imageHeight(p.image);
  const geometry = (): ImageViewport => {
    owner.viewport.set(p.view(), owner.width, owner.height, iw(), ih(), p.maxZoom ?? 16); return owner.viewport;
  };
  const change = (view: ImageView): void => { p.onChange(view); ui.repaint(); };
  const zoom = (factor: number, x: number, y: number): void => {
    const v = geometry(); change(v.atZoom(v.zoom * factor, x, y, p.maxZoom ?? 16));
  };
  const keys = (e: ui.KeyEvent): void => {
    const v = geometry(), step = e.shift ? 100 : 24;
    if (e.key === '+' || e.key === '=') zoom(1.5, owner.width / 2, owner.height / 2);
    else if (e.key === '-') zoom(1 / 1.5, owner.width / 2, owner.height / 2);
    else if (e.key === '0' || e.key === 'Home') change(new ImageView());
    else if (e.key === '1') change(v.atZoom(1, owner.width / 2, owner.height / 2, p.maxZoom ?? 16));
    else if (e.key === 'ArrowLeft') change(v.pan(step, 0));
    else if (e.key === 'ArrowRight') change(v.pan(-step, 0));
    else if (e.key === 'ArrowUp') change(v.pan(0, step));
    else if (e.key === 'ArrowDown') change(v.pan(0, -step));
    else return;
    e.preventDefault();
  };
  const draw = (left: i32, top: i32, width: i32, height: i32): void => {
    owner.width = width; owner.height = height;
    const visible = owner.display;
    visible.set(new ImageView(owner.zoom.value.get(), owner.x.value.get(), owner.y.value.get()), width, height, iw(), ih(), p.maxZoom ?? 16);
    if (p.checkerboard === true && p.image >= 0) {
      const region = visible.visible(); checker(left + region[4], top + region[5], region[6], region[7]);
    }
    imageQuad(p.image, visible, left, top);
  };
  const node = <View className={`flex-col gap-2 min-w-0 ${p.className ?? ''}`}>
    <Text className={`text-[13px] text-${theme().foreground}`}>{p.label}</Text>
    <Button ref={root} role="group" aria-label={p.label} style={{ height: p.height ?? 300 }} className={frameClass()} dragThreshold={1} onKeyDown={keys}
      onWheel={(e: ui.PointerEvent) => { if (e.pinch !== 1) zoom(e.pinch, e.x, e.y); else zoom(Math.exp(e.wheel * 0.12), e.x, e.y); }}
      onDoubleClick={(e: ui.PointerEvent) => { const v = geometry(); change(Math.abs(v.zoom - v.fit) < 0.001 ? v.atZoom(1, e.x, e.y, p.maxZoom ?? 16) : new ImageView()); }}
      onPinch={(e: ui.PointerEvent) => {
        if (e.phase === 0) { owner.start = new ImageView(owner.zoom.value.get(), owner.x.value.get(), owner.y.value.get()); owner.transition(MediaDrag.Pinching); }
        if (e.phase === 1 && owner.drag === MediaDrag.Pinching) {
          owner.viewport.set(owner.start, owner.width, owner.height, iw(), ih(), p.maxZoom ?? 16);
          change(owner.viewport.atZoom(owner.start.zoom * e.scale, e.x, e.y, p.maxZoom ?? 16));
        }
        if (e.phase >= 2) owner.transition(MediaDrag.Idle);
      }} onDrag={(e: ui.PointerEvent) => {
        if (e.phase === 0) {
          owner.start = new ImageView(owner.zoom.value.get(), owner.x.value.get(), owner.y.value.get());
          owner.zoom.move(owner.start.zoom, false); owner.x.move(owner.start.cx, false); owner.y.move(owner.start.cy, false);
          owner.transition(MediaDrag.Dragging);
        }
        if (e.phase < 2 && owner.drag === MediaDrag.Dragging) {
          owner.viewport.set(owner.start, owner.width, owner.height, iw(), ih(), p.maxZoom ?? 16);
          change(owner.viewport.pan(e.dx, e.dy, p.maxZoom ?? 16));
        }
        if (e.phase >= 2) owner.transition(MediaDrag.Idle);
      }} onPointerCancel={(e: ui.PointerEvent) => owner.transition(MediaDrag.Idle)}>
      <Canvas className="absolute inset-0 pointer-events-none" style={{ lazy: 1 }} onDraw={draw}/>
      <Show when={p.image < 0}><View className="absolute inset-0 items-center justify-center"><Text className={`text-[13px] text-${theme().mutedForeground}`}>No image</Text></View></Show>
    </Button>
    <Show when={p.noToolbar !== true}><View className="flex-row flex-wrap items-center gap-2">
      <ActionButton label="Zoom out" variant="outline" size="sm" onClick={() => zoom(1 / 1.5, owner.width / 2, owner.height / 2)} />
      <Text role="status" className={`text-[12px] tabular-nums text-${theme().mutedForeground}`}>{p.view().zoom <= 0 ? 'Fit' : Math.round(p.view().zoom * 100) + '%'}</Text>
      <ActionButton label="Zoom in" variant="outline" size="sm" onClick={() => zoom(1.5, owner.width / 2, owner.height / 2)} />
      <ActionButton label="Fit image" variant="outline" size="sm" onClick={() => change(new ImageView())}/>
    </View></Show>
  </View>;
  useMediaImages(() => [p.image]);
  componentEffect(() => {
    const watch = (): void => {
      const box = ui.inspectNode(root.node);
      if (box === null) return;
      owner.width = box.lw; owner.height = box.lh;
      const props = owner.props;
      if (props === null) return;
      owner.viewport.set(props.view(), owner.width, owner.height, props.imageWidth ?? imageWidth(props.image), props.imageHeight ?? imageHeight(props.image), props.maxZoom ?? 16);
      const v = owner.viewport, reduced = ui.prefersReducedMotion();
      if (v.zoom === owner.targetZoom && v.cx === owner.targetX && v.cy === owner.targetY && reduced === owner.reduced && owner.image === props.image) return;
      const animate = owner.targetZoom >= 0 && owner.image === props.image && owner.drag === MediaDrag.Idle;
      owner.zoom.move(v.zoom, animate); owner.x.move(v.cx, animate); owner.y.move(v.cy, animate);
      owner.targetZoom = v.zoom; owner.targetX = v.cx; owner.targetY = v.cy; owner.reduced = reduced; owner.image = props.image;
    };
    owner.zoom.value.addListener((value: number) => ui.repaint()); owner.x.value.addListener((value: number) => ui.repaint()); owner.y.value.addListener((value: number) => ui.repaint());
    ui.addWatcher(watch);
    return () => { ui.removeWatcher(watch); owner.dispose(); };
  }, []);
  return node;
}
export interface ImageCompareProps {
  before: i32; after: i32; label: string; position: () => number; onChange: (position: number) => void;
  height?: number; aspect?: number; beforeLabel?: string; afterLabel?: string; className?: string;
}
export function ImageCompare(p: ImageCompareProps): i32 {
  const root = createNodeRef();
  const geometry = componentRef(new ImageViewport());
  const width = componentRef(1);
  const update = (position: number): void => { p.onChange(clampMedia(position, 0, 1)); ui.repaint(); };
  const draw = (left: i32, top: i32, w: i32, h: i32): void => {
    width.current = w;
    const iw = p.aspect !== undefined && p.aspect > 0 ? p.aspect * 1000 : Math.max(1, imageWidth(p.after >= 0 ? p.after : p.before));
    const ih = p.aspect !== undefined && p.aspect > 0 ? 1000 : Math.max(1, imageHeight(p.after >= 0 ? p.after : p.before));
    const scale = Math.max(w / iw, h / ih), view = geometry.current;
    view.set(new ImageView(scale, iw / 2, ih / 2), w, h, iw, ih, Math.max(16, scale));
    const region = view.visible();
    if (p.after >= 0) drawImageRect(p.after, region[0] / iw * imageWidth(p.after), region[1] / ih * imageHeight(p.after), region[2] / iw * imageWidth(p.after), region[3] / ih * imageHeight(p.after), left + region[4], top + region[5], region[6], region[7], 255);
    const split = clampMedia(p.position(), 0, 1), clipped = region[6] * split;
    if (p.before >= 0 && clipped > 0) drawImageRect(p.before, region[0] / iw * imageWidth(p.before), region[1] / ih * imageHeight(p.before), region[2] / iw * imageWidth(p.before) * split, region[3] / ih * imageHeight(p.before), left + region[4], top + region[5], clipped, region[7], 255);
    rect(left + w * split - 1, top, 2, h, themeColor('accent'));
    rrect(left + w * split - 15, top + h / 2 - 15, 30, 30, 15, themeColor('card'), 255);
    border(left + w * split - 15, top + h / 2 - 15, 30, 30, 15, 1, themeColor('input'), 255);
    rect(left + w * split - 4, top + h / 2 - 5, 1, 10, themeColor('foreground'));
    rect(left + w * split + 3, top + h / 2 - 5, 1, 10, themeColor('foreground'));
  };
  const node = <View className={`flex-col gap-2 min-w-0 ${p.className ?? ''}`}>
    <Text className={`text-[13px] text-${theme().foreground}`}>{p.label}</Text>
    <Button ref={root} role="slider" aria-label={p.label} aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(clampMedia(p.position(), 0, 1) * 100)} aria-valuetext={Math.round(clampMedia(p.position(), 0, 1) * 100) + '% before'} style={{ height: p.height ?? 260 }} className={frameClass()} dragThreshold={2}
      onPointerDown={(e: ui.PointerEvent) => { if (e.button === 0) update(e.x / width.current); }}
      onDrag={(e: ui.PointerEvent) => { if (e.phase < 3) update(e.x / width.current); }}
      onKeyDown={(e: ui.KeyEvent) => {
        if (e.key === 'Home') update(0); else if (e.key === 'End') update(1);
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') update(p.position() - (e.shift ? 0.1 : 0.01));
        else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') update(p.position() + (e.shift ? 0.1 : 0.01)); else return;
        e.preventDefault();
      }}>
      <Canvas className="absolute inset-0 pointer-events-none" style={{ lazy: 1 }} onDraw={draw}/>
      <View className="absolute top-2 left-2 pointer-events-none"><Text className={`text-[11px] px-2 py-1 rounded-[6px] bg-${theme().card} text-${theme().foreground}`}>{p.beforeLabel ?? 'Before'}</Text></View>
      <View className="absolute top-2 right-2 pointer-events-none"><Text className={`text-[11px] px-2 py-1 rounded-[6px] bg-${theme().card} text-${theme().foreground}`}>{p.afterLabel ?? 'After'}</Text></View>
    </Button>
  </View>;
  useMediaImages(() => [p.before, p.after]);
  return node;
}
export interface ImageCropperProps {
  image: i32; imageWidth?: number; imageHeight?: number; label: string;
  crop: () => MediaRect; onChange: (crop: MediaRect) => void;
  height?: number; aspect?: number; round?: boolean; minSize?: number; className?: string;
}
class CropOwner {
  phase: MediaDrag = MediaDrag.Idle; handle: CropHandle = CropHandle.None;
  start: MediaRect = new MediaRect(); frame: MediaRect = new MediaRect();
  x: number = 0; y: number = 0; scale: number = 1;
  transition(next: MediaDrag): void {
    if (next !== MediaDrag.Idle && this.phase !== MediaDrag.Idle) return;
    this.phase = next; if (next === MediaDrag.Idle) this.handle = CropHandle.None;
  }
}
export function ImageCropper(p: ImageCropperProps): i32 {
  const owner = componentRef(new CropOwner()).current;
  const iw = (): number => Math.max(1, p.imageWidth ?? imageWidth(p.image)), ih = (): number => Math.max(1, p.imageHeight ?? imageHeight(p.image));
  const aspect = (): number => p.round === true ? 1 : p.aspect ?? 0;
  const crop = (): MediaRect => normalizedCrop(p.crop(), iw(), ih(), aspect(), p.minSize ?? 16);
  const update = (next: MediaRect): void => { p.onChange(next); ui.repaint(); };
  const draw = (left: i32, top: i32, width: i32, height: i32): void => {
    const fitted = fitImageRect(width, height, iw(), ih(), 8, 8);
    owner.frame = fitted; owner.scale = fitted.width / iw();
    if (p.image >= 0) drawImageRect(p.image, 0, 0, iw(), ih(), left + fitted.x, top + fitted.y, fitted.width, fitted.height, 255);
    const c = crop(), x = left + fitted.x + c.x * owner.scale, y = top + fitted.y + c.y * owner.scale;
    const w = c.width * owner.scale, h = c.height * owner.scale, shade = themeColor('foreground');
    rrect(left + fitted.x, top + fitted.y, fitted.width, Math.max(0, y - top - fitted.y), 0, shade, 130);
    rrect(left + fitted.x, y + h, fitted.width, Math.max(0, top + fitted.y + fitted.height - y - h), 0, shade, 130);
    rrect(left + fitted.x, y, Math.max(0, x - left - fitted.x), h, 0, shade, 130);
    rrect(x + w, y, Math.max(0, left + fitted.x + fitted.width - x - w), h, 0, shade, 130);
    if (p.round === true) {
      // Shade the four corners outside the circular selection without another image surface.
      const radius = w / 2;
      for (let row = 0; row < 32; row++) {
        const yy = row * h / 32, mid = yy + h / 64 - radius;
        const edge = radius - Math.sqrt(Math.max(0, radius * radius - mid * mid));
        rrect(x, y + yy, edge, h / 32 + 0.5, 0, shade, 130); rrect(x + w - edge, y + yy, edge, h / 32 + 0.5, 0, shade, 130);
      }
    }
    border(x, y, w, h, p.round === true ? w / 2 : 0, 1.5, themeColor('accent'), 255);
    if (owner.phase === MediaDrag.Dragging) for (let n = 1; n < 3; n++) {
      rrect(x + w * n / 3, y, 1, h, 0, themeColor('card'), 170); rrect(x, y + h * n / 3, w, 1, 0, themeColor('card'), 170);
    }
    for (const px of [x, x + w]) for (const py of [y, y + h]) {
      rect(px - 4, py - 4, 8, 8, themeColor('card')); border(px - 4, py - 4, 8, 8, 2, 1, themeColor('accent'), 255);
    }
  };
  const node = <View className={`flex-col gap-2 min-w-0 ${p.className ?? ''}`}>
    <Text className={`text-[13px] text-${theme().foreground}`}>{p.label}</Text>
    <Button role="group" aria-label={p.label} style={{ height: p.height ?? 300 }} className={frameClass()} dragThreshold={1} onDrag={(e: ui.PointerEvent) => {
      const x = clampMedia((e.x - owner.frame.x) / owner.scale, 0, iw()), y = clampMedia((e.y - owner.frame.y) / owner.scale, 0, ih());
      if (e.phase === 0) {
        owner.start = crop();
        owner.x = clampMedia((e.x - e.dx - owner.frame.x) / owner.scale, 0, iw());
        owner.y = clampMedia((e.y - e.dy - owner.frame.y) / owner.scale, 0, ih());
        owner.handle = cropHandle(owner.start, owner.x, owner.y, 9 / owner.scale); owner.transition(MediaDrag.Dragging);
      }
      if (e.phase < 2 && owner.phase === MediaDrag.Dragging) {
        update(owner.handle === CropHandle.Draw ? drawnCrop(owner.x, owner.y, x, y, iw(), ih(), aspect(), p.minSize ?? 16)
          : resizeCrop(owner.start, owner.handle, x - owner.x, y - owner.y, iw(), ih(), aspect(), p.minSize ?? 16));
      }
      if (e.phase >= 2) { owner.transition(MediaDrag.Idle); ui.repaint(); }
    }} onPointerCancel={(e: ui.PointerEvent) => { owner.transition(MediaDrag.Idle); ui.repaint(); }} onKeyDown={(e: ui.KeyEvent) => {
      const step = e.shift ? 10 : 1;
      if (e.key === 'Home') update(new MediaRect());
      else if (e.key === 'ArrowLeft') update(moveCrop(crop(), -step, 0, iw(), ih()));
      else if (e.key === 'ArrowRight') update(moveCrop(crop(), step, 0, iw(), ih()));
      else if (e.key === 'ArrowUp') update(moveCrop(crop(), 0, -step, iw(), ih()));
      else if (e.key === 'ArrowDown') update(moveCrop(crop(), 0, step, iw(), ih())); else return;
      e.preventDefault();
    }}>
      <Canvas className="absolute inset-0 pointer-events-none" style={{ lazy: 1 }} onDraw={draw}/>
    </Button>
    <Text role="status" className={`text-[12px] tabular-nums text-${theme().mutedForeground}`}>{Math.round(crop().width) + ' × ' + Math.round(crop().height) + ' px · ' + Math.round(crop().x) + ', ' + Math.round(crop().y)}</Text>
  </View>;
  useMediaImages(() => [p.image]);
  componentEffect(() => () => owner.transition(MediaDrag.Idle), []);
  return node;
}

export interface CarouselProps {
  label: string; count: () => i32; index: () => i32; onChange: (index: i32) => void;
  renderSlide: (index: i32) => i32;
  height?: number; gap?: number; loop?: boolean; autoAdvance?: number; noArrows?: boolean; noDots?: boolean; className?: string;
}
enum CarouselClock { Manual, Waiting, HoverPaused, FocusPaused, Disposed }
class CarouselOwner {
  props: CarouselProps | null = null;
  position: MediaMotion = new MediaMotion(0); width: number = 1; target: i32 = -1;
  root: i32 = -1; track: i32 = -1; scope: i32 = -1; seenFocus: i32 = -1; seenFocusSerial: i32 = 0;
  alarm: i32 = -1; generation: i32 = 0;
  drag: MediaDrag = MediaDrag.Idle; dragStart: number = 0; lastDx: number = 0; lastTime: number = 0; velocity: number = 0;
  constructor(public readClock: () => CarouselClock, public writeClock: (state: CarouselClock) => void) {}
  get clock(): CarouselClock { return this.readClock(); }
  transition(next: CarouselClock): boolean {
    if (this.clock === CarouselClock.Disposed) return false;
    this.generation++; if (this.alarm >= 0) ui.cancelAlarm(this.alarm); this.alarm = -1;
    this.writeClock(next); return true;
  }
  transitionDrag(next: MediaDrag): void { if (next === MediaDrag.Idle || this.drag === MediaDrag.Idle) this.drag = next; }
  choose(index: number, animated: boolean = true, velocity: number = 0): void {
    const p = this.props; if (p === null || this.clock === CarouselClock.Disposed) return;
    const next = mediaSlide(index, p.count(), p.loop === true);
    this.target = next; this.position.move(next, animated, velocity);
    if (p.index() !== next) p.onChange(next);
    this.schedule();
  }
  schedule(): void {
    if (this.alarm >= 0) ui.cancelAlarm(this.alarm); this.alarm = -1; this.generation++;
    const p = this.props;
    if (p === null || this.clock !== CarouselClock.Waiting || this.drag !== MediaDrag.Idle || p.count() < 2 || !(p.autoAdvance !== undefined && p.autoAdvance > 0) || ui.prefersReducedMotion()) return;
    const generation = this.generation;
    this.alarm = ui.alarm(ui.now() + Math.max(250, p.autoAdvance * 1000), () => {
      if (this.clock !== CarouselClock.Waiting || generation !== this.generation) return;
      this.alarm = -1;
      const current = this.props;
      if (current !== null) this.choose(current.index() + 1 >= current.count() ? 0 : current.index() + 1);
    });
  }
  paintPosition(): void {
    const p = this.props;
    if (p !== null && this.track >= 0) ui.setNumber(this.track, 'translateX', -this.position.value.get() * (this.width + (p.gap ?? 12)));
  }
  dispose(): void { this.transition(CarouselClock.Disposed); this.transitionDrag(MediaDrag.Idle); this.position.dispose(); }
}
function slideIndices(count: i32): i32[] {
  mediaSlide(0, count);
  const out: i32[] = []; for (let i: i32 = 0; i < count; i++) out.push(i); return out;
}
export function Carousel(p: CarouselProps): i32 {
  const root = createNodeRef(), track = createNodeRef(), scope = createNodeRef();
  const [clock, setClock] = componentSignal<CarouselClock>((p.autoAdvance ?? 0) > 0 ? CarouselClock.Waiting : CarouselClock.Manual);
  const ref = componentRef<CarouselOwner | null>(null);
  if (ref.current === null) ref.current = new CarouselOwner(clock, setClock);
  const owner = ref.current; owner.props = p;
  const [width, setWidth] = componentSignal(1);
  const running = (): boolean => clock() === CarouselClock.Waiting || clock() === CarouselClock.HoverPaused;
  const index = (): i32 => mediaSlide(p.index(), p.count());
  const rememberFocus = (): void => { owner.seenFocus = ui.focused(); owner.seenFocusSerial = owner.seenFocus >= 0 ? ui.nodeSerial(owner.seenFocus) : 0; };
  const stopForFocus = (): void => { rememberFocus(); owner.transition(CarouselClock.FocusPaused); };
  const node = <View ref={scope} className={`flex-col gap-3 min-w-0 ${p.className ?? ''}`} role="region" aria-roledescription="carousel" aria-label={p.label}
      onPointerEnter={(e: ui.PointerEvent) => { if (owner.clock === CarouselClock.Waiting) owner.transition(CarouselClock.HoverPaused); }}
      onPointerLeave={(e: ui.PointerEvent) => { if (owner.clock === CarouselClock.HoverPaused) { owner.transition(CarouselClock.Waiting); owner.schedule(); } }}>
    <View className="flex-row items-center justify-between gap-3">
      <Text className={`text-[13px] text-${theme().foreground}`}>{p.label}</Text>
      <Show when={(p.autoAdvance ?? 0) > 0}><ActionButton label={running() ? 'Stop rotation' : 'Start rotation'} size="sm" variant="outline" onClick={() => {
        rememberFocus();
        const next = !running(), scopeNode = ui.inspectNode(owner.scope);
        owner.transition(next ? scopeNode !== null && scopeNode.hovered ? CarouselClock.HoverPaused : CarouselClock.Waiting : CarouselClock.Manual);
        owner.schedule();
      }} /></Show>
    </View>
    <Button ref={root} role="group" aria-label={p.label + ' slides'} style={{ height: p.height ?? 240 }} className={frameClass()} dragThreshold={2}

      onWheel={(e: ui.PointerEvent) => { if (e.wheelX !== 0) owner.choose(index() + (e.wheelX > 0 ? 1 : -1)); }}
      onKeyDown={(e: ui.KeyEvent) => {
        if (e.key === 'ArrowLeft') owner.choose(index() - 1); else if (e.key === 'ArrowRight') owner.choose(index() + 1);
        else if (e.key === 'Home') owner.choose(0); else if (e.key === 'End') owner.choose(p.count() - 1); else return;
        stopForFocus(); e.preventDefault();
      }} onDrag={(e: ui.PointerEvent) => {
        if (e.phase === 0) { owner.transitionDrag(MediaDrag.Dragging); owner.dragStart = owner.position.value.get(); owner.lastDx = e.dx; owner.lastTime = ui.now(); owner.velocity = 0; owner.position.value.stopAnimation(); owner.schedule(); }
        if (e.phase < 2 && owner.drag === MediaDrag.Dragging) {
          const elapsed = ui.now() - owner.lastTime;
          if (elapsed > 1) owner.velocity = owner.velocity * 0.6 + (e.dx - owner.lastDx) * 400 / elapsed;
          owner.lastDx = e.dx; owner.lastTime = ui.now();
          let next = owner.dragStart - e.dx / Math.max(1, owner.width + (p.gap ?? 12));
          const last = Math.max(0, p.count() - 1);
          if (next < 0) next = next * 0.25 / (1 - next);
          if (next > last) next = last + (next - last) * 0.25 / (1 + next - last);
          owner.position.move(next, false);
        }
        if (e.phase >= 2) {
          const projected = owner.position.value.get() - clampMedia(owner.velocity / Math.max(1, owner.width + (p.gap ?? 12)), -8, 8) * 0.12;
          owner.transitionDrag(MediaDrag.Idle); owner.choose(e.phase === 3 ? index() : projected, true, e.phase === 3 ? 0 : -owner.velocity / Math.max(1, owner.width + (p.gap ?? 12)));
        }
      }} onPointerCancel={(e: ui.PointerEvent) => { owner.transitionDrag(MediaDrag.Idle); owner.choose(index()); }}>
      <View ref={track} className="absolute left-0 top-0 flex-row" style={{ width: p.count() * (width() + (p.gap ?? 12)), height: p.height ?? 240, gap: p.gap ?? 12 }}>
        {slideIndices(p.count()).map((slide: i32) => <View key={'slide-' + slide} role="group" aria-roledescription="slide" aria-label={(slide + 1) + ' of ' + p.count()} aria-hidden={slide !== index()} disabled={slide !== index()} style={{ width: width(), height: p.height ?? 240 }} className="shrink-0 min-w-0 overflow-hidden">{p.renderSlide(slide)}</View>)}
      </View>
      <Show when={p.count() === 0}><View className="absolute inset-0 items-center justify-center"><Text className={`text-[13px] text-${theme().mutedForeground}`}>No slides</Text></View></Show>
    </Button>
    <View className="flex-row flex-wrap items-center justify-between gap-2">
      <Show when={p.noArrows !== true}><ActionButton label="Previous slide" size="sm" variant="outline" disabled={p.count() < 2 || (p.loop !== true && index() === 0)} onClick={() => owner.choose(index() - 1)} /></Show>
      <Show when={p.noDots !== true}><View role="group" aria-label="Choose a slide" className="flex-row flex-wrap gap-1">
        {slideIndices(p.count()).map((slide: i32) => <ActionButton ariaLabel={'Show slide ' + (slide + 1)} label={String(slide + 1)} size="sm" pressed={slide === index()} variant={slide === index() ? 'default' : 'outline'} onClick={() => owner.choose(slide)} />)}
      </View></Show>
      <Show when={p.noArrows !== true}><ActionButton label="Next slide" size="sm" variant="outline" disabled={p.count() < 2 || (p.loop !== true && index() === p.count() - 1)} onClick={() => owner.choose(index() + 1)} /></Show>
    </View>
    <Text role="status" aria-live={running() ? 'off' : 'polite'} className={`text-[12px] text-${theme().mutedForeground}`}>{p.count() === 0 ? 'No slides' : 'Slide ' + (index() + 1) + ' of ' + p.count()}</Text>
  </View>;
  owner.root = root.node; owner.track = track.node; owner.scope = scope.node;
  componentEffect(() => {
    owner.position.value.addListener((value: number) => owner.paintPosition());
    const unfocus = ui.onFocusWithin(scope.node, (focused: boolean) => { if (ui.hasFocusWithin(owner.scope)) stopForFocus(); });
    const watch = (): void => {
      const n = ui.inspectNode(owner.root), props = owner.props;
      if (n === null || props === null) return;
      const focused = ui.focused(), serial = focused >= 0 ? ui.nodeSerial(focused) : 0;
      if (focused !== owner.seenFocus || serial !== owner.seenFocusSerial) {
        if (ui.hasFocusWithin(owner.scope)) stopForFocus(); else rememberFocus();
      }
      if (n.lw !== owner.width) { owner.width = Math.max(1, n.lw); setWidth(owner.width); owner.paintPosition(); }
      const target = mediaSlide(props.index(), props.count());
      if (owner.drag === MediaDrag.Idle && target !== owner.target) owner.choose(target, owner.target >= 0);
      if (ui.prefersReducedMotion() && owner.position.phase === MotionPhase.Moving) owner.position.move(target, false);
      if (ui.prefersReducedMotion() && owner.alarm >= 0) { ui.cancelAlarm(owner.alarm); owner.alarm = -1; }
      if (!ui.prefersReducedMotion() && owner.clock === CarouselClock.Waiting && owner.alarm < 0) owner.schedule();
    };
    ui.addWatcher(watch);
    return () => { unfocus(); ui.removeWatcher(watch); owner.dispose(); };
  }, []);
  return node;
}
