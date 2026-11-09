/** @jsxHelpers ./host */
// Quiet feedback: notices, activity, identity and empty/history states. The old component files remain import-compatible.
import * as ui from 'zinc:ui';
import { createNodeRef } from 'zinc:ui/solid';
import { Icon } from 'zinc:icons';
import { Svg } from 'zinc:svg';
import { theme } from './theme';
import { Button as KitButton } from './button';
import { nativeControl, componentRef, componentEffect } from './host';
import { springValues, SPRING_SMOOTH } from './motion';

function toneColor(tone: string): string {
  return tone === 'danger' || tone === 'destructive' || tone === 'error' ? theme().destructive : tone === 'success' ? theme().success : tone === 'warning' ? theme().warningSoftForeground : tone === 'accent' || tone === 'info' ? theme().accent : theme().foreground;
}
function toneFill(tone: string): string {
  return tone === 'danger' || tone === 'destructive' || tone === 'error' ? theme().destructiveSoft : tone === 'success' ? theme().successSoft : tone === 'warning' ? theme().warningSoft : tone === 'accent' || tone === 'info' ? theme().accentSoft : theme().muted;
}
function toneIcon(tone: string): string { return tone === 'success' ? 'circle-check' : tone === 'warning' ? 'triangle-alert' : tone === 'danger' || tone === 'destructive' || tone === 'error' ? 'circle-alert' : 'info'; }
function percent(value: number, min: number = 0, max: number = 100): number { return Number.isFinite(value) && max > min ? Math.max(0, Math.min(100, (value - min) / (max - min) * 100)) : 0; }

// Two sampled endpoints run on the compositor; only a completed cycle schedules the next one.
enum ActivityState { Stopped, Waiting, Running }
function activity(node: i32, key: string, end: () => number, duration: number, enabled: () => boolean): void {
  componentEffect(() => {
    if (!enabled()) return undefined;
    const serial = ui.nodeSerial(node);
    let state = ActivityState.Stopped, timer: i32 = -1, animation: i32 = -1;
    const transition = (next: ActivityState): void => {
      if (next === ActivityState.Waiting && state !== ActivityState.Stopped) return;
      if (next === ActivityState.Running && state !== ActivityState.Waiting && state !== ActivityState.Running) return;
      state = next;
    };
    const stop = (): void => {
      transition(ActivityState.Stopped);
      if (timer >= 0) ui.cancelAlarm(timer);
      if (animation >= 0) ui.stopSeries(animation);
      timer = -1; animation = -1;
      if (ui.nodeSerial(node) === serial) ui.setNumber(node, key, 0);
    };
    const cycle = (): void => {
      if (state === ActivityState.Stopped || ui.nodeSerial(node) !== serial) return;
      transition(ActivityState.Running);
      ui.setNumber(node, key, 0);
      animation = ui.animateSeries(node, key, [0, end()], duration, 0, (finished: boolean) => { if (finished) cycle(); });
    };
    const update = (): void => {
      stop();
      if (ui.prefersReducedMotion() || ui.nodeSerial(node) !== serial) return;
      transition(ActivityState.Waiting);
      timer = ui.alarm(ui.now(), () => { timer = -1; cycle(); });
    };
    const signal = (kind: string, arg: string): void => { if (kind === 'reducemotion') update(); };
    update(); ui.addSignalListener(signal);
    return () => { stop(); ui.removeSignalListener(signal); };
  });
}

export interface AlertProps { title: string; description?: string; variant?: string; tone?: string; icon?: string; iconName?: string; dismissible?: boolean; dismissLabel?: string; onDismiss?: () => void; className?: string }
export interface BannerProps extends AlertProps { action?: string; onAction?: () => void }
enum NoticeState { Open, Closing, Closed }
function Notice(p: BannerProps, banner: boolean): i32 {
  const root = createNodeRef(), state = componentRef(NoticeState.Open);
  const tone = p.tone ?? p.variant ?? (banner ? 'accent' : 'neutral');
  const transition = (next: NoticeState): void => {
    if (next === NoticeState.Closing && state.current !== NoticeState.Open) return;
    if (next === NoticeState.Closed && state.current !== NoticeState.Closing) return;
    state.current = next;
    if (next === NoticeState.Closed) ui.setNumber(root.node, 'hidden', 1);
  };
  const dismiss = (): void => {
    if (state.current !== NoticeState.Open) return;
    transition(NoticeState.Closing);
    if (banner && !ui.prefersReducedMotion()) {
      const serial = ui.nodeSerial(root.node), h = ui.screenBox(root.node)[3];
      ui.animateSeries(root.node, 'height', springValues(h, 0, SPRING_SMOOTH), 1000 / 60, 0, (finished: boolean) => { if (finished && ui.nodeSerial(root.node) === serial) transition(NoticeState.Closed); });
    } else transition(NoticeState.Closed);
    if (p.onDismiss !== undefined) p.onDismiss();
  };
  return <View ref={root} hidden={state.current === NoticeState.Closed ? 1 : 0} role={tone === 'danger' || tone === 'destructive' || tone === 'error' ? 'alert' : 'status'} className={`flex-row items-start gap-3 ${banner ? 'px-4 py-3 w-full' : 'p-4 rounded-[14px] border border-' + theme().border} overflow-hidden bg-${banner ? toneFill(tone) : theme().card} ${p.className ?? ''}`}>
    <View className="w-5 h-5 items-center justify-center shrink-0">
      <Show when={p.icon !== undefined}><Text className={`text-[13px] text-${toneColor(tone)}`}>{p.icon ?? ''}</Text></Show>
      <Show when={p.icon === undefined}><Icon name={p.iconName ?? toneIcon(tone)} size={18} color={() => ui.tailwindColor(toneColor(tone))} /></Show>
    </View>
    <View className="flex-col grow shrink min-w-0 gap-1">
      <Text className={`text-[13px] font-medium text-${toneColor(tone)}`}>{p.title}</Text>
      <Show when={p.description !== undefined}><Text className={`text-[13px] text-${theme().mutedForeground}`}>{p.description ?? ''}</Text></Show>
    </View>
    <Show when={p.action !== undefined}><KitButton label={p.action ?? ''} size="sm" variant="outline" onClick={() => { if (state.current === NoticeState.Open && p.onAction !== undefined) p.onAction(); }} /></Show>
    <Show when={p.dismissible === true}><KitButton label={p.dismissLabel ?? 'Dismiss'} size="sm" variant="ghost" onClick={dismiss} /></Show>
  </View>;
}
export function Alert(p: AlertProps): i32 { return Notice(p, false); }
export function Banner(p: BannerProps): i32 { return Notice(p, true); }

export interface ProgressProps { value: () => number; accent?: boolean; label?: string; showValue?: boolean; indeterminate?: boolean; className?: string }
export function Progress(p: ProgressProps): i32 {
  const fill = createNodeRef(), track = createNodeRef();
  const value = (): number => percent(p.value());
  const node = <View className={`flex-col gap-2 ${p.className ?? ''}`}>
    <Show when={p.label !== undefined || p.showValue === true}><View className="flex-row justify-between gap-3">
      <Text className={`text-[13px] text-${theme().foreground}`}>{p.label ?? ''}</Text>
      <Show when={p.showValue === true && p.indeterminate !== true}><Text className={`text-[12px] tabular-nums text-${theme().mutedForeground}`}>{Math.round(value())}%</Text></Show>
    </View></Show>
    <View ref={track} className={`flex-row h-1.5 w-full rounded-full overflow-hidden bg-${theme().muted}`} role="progressbar" aria-label={p.label ?? 'Progress'} aria-valuenow={p.indeterminate === true ? '' : String(Math.round(value()))} aria-valuemin="0" aria-valuemax="100" aria-busy={p.indeterminate === true ? 'true' : 'false'}>
      <View ref={fill} className={`h-full rounded-full bg-${p.accent === true ? theme().accent : theme().primary} ${p.indeterminate === true ? 'w-1/3' : 'w-' + Math.round(value()) + '/100'}`} />
    </View>
  </View>;
  nativeControl(track.node, 'progress', () => ['value', p.indeterminate === true ? '-1' : String(Number.isFinite(p.value()) ? p.value() : 0)]);
  activity(fill.node, 'translateX', () => ui.screenBox(track.node)[2], 1300, () => p.indeterminate === true);
  return node;
}

export interface ProgressRingProps { value: () => number; size?: number; color?: () => i32; track?: () => i32; strokeWidth?: number; label?: string; showValue?: boolean }
export function ProgressRing(p: ProgressRingProps): i32 {
  const drawing = componentRef<Svg | null>(null), size = p.size ?? 80;
  const showValue = p.showValue ?? p.label !== undefined;
  componentEffect(() => {
    const image = ring(percent(p.value()), p.color !== undefined ? p.color() : ui.tailwindColor(theme().primary), p.track !== undefined ? p.track() : ui.tailwindColor(theme().muted), p.strokeWidth ?? 2.5);
    drawing.current = image; ui.repaint();
    return () => { image.dispose(); };
  });
  return <View className="items-center justify-center" style={{ width: size, height: size }} role="progressbar" aria-label={p.label ?? 'Progress'} aria-valuenow={String(Math.round(percent(p.value())))} aria-valuemin="0" aria-valuemax="100">
    <Canvas className="absolute inset-0" style={{ lazy: 1 }} onDraw={(x: i32, y: i32, w: i32, h: i32) => { const image = drawing.current; if (image !== null) image.draw(x, y, w, h, 255); }} />
    <View className="flex-col items-center justify-center gap-0.5 w-3/4">
      <Show when={showValue}><Text className={`text-[17px] tabular-nums text-${theme().foreground}`}>{Math.round(percent(p.value()))}%</Text></Show>
      <Show when={p.label !== undefined && size >= 64}><Text className={`text-[11px] text-${theme().mutedForeground} truncate max-w-full`}>{p.label ?? ''}</Text></Show>
    </View>
  </View>;
}
function hex6(c: i32): string { let s = (c & 0xffffff).toString(16); while (s.length < 6) s = '0' + s; return s; }
function ring(pct: number, color: i32, track: i32, stroke: number): Svg {
  stroke = Math.max(0.5, Math.min(12, stroke));
  const r = 12 - stroke / 2, a = pct / 100 * 2 * Math.PI;
  const x = 12 + r * Math.sin(a), y = 12 - r * Math.cos(a);
  const arc = pct >= 100 ? `<circle cx="12" cy="12" r="${r}" fill="none" stroke="#${hex6(color)}" stroke-width="${stroke}"/>`
    : pct <= 0 ? '' : `<path d="M12 ${12 - r} A${r} ${r} 0 ${pct > 50 ? 1 : 0} 1 ${x.toFixed(3)} ${y.toFixed(3)}" fill="none" stroke="#${hex6(color)}" stroke-width="${stroke}"/>`;
  return new Svg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="${r}" fill="none" stroke="#${hex6(track)}" stroke-width="${stroke}"/>${arc}</svg>`);
}

export interface MeterProps { label: string; value: () => number; max: number; min?: number; unit?: string; warning?: number; danger?: number; className?: string }
export function Meter(p: MeterProps): i32 {
  const value = (): number => percent(p.value(), p.min ?? 0, p.max);
  const tone = (): string => value() >= (p.danger ?? 0.95) * 100 ? 'danger' : value() >= (p.warning ?? 0.8) * 100 ? 'warning' : 'neutral';
  return <View className={`flex-col gap-2 ${p.className ?? ''}`} role="meter" aria-label={p.label} aria-valuenow={String(Number.isFinite(p.value()) ? Math.max(p.min ?? 0, Math.min(p.max, p.value())) : p.min ?? 0)} aria-valuemin={String(p.min ?? 0)} aria-valuemax={String(p.max)} aria-valuetext={`${p.value()} / ${p.max} ${p.unit ?? ''}`}>
    <View className="flex-row justify-between gap-3"><Text className={`text-[13px] text-${theme().foreground}`}>{p.label}</Text><Text className={`text-[12px] tabular-nums text-${toneColor(tone())}`}>{p.value()} / {p.max} {p.unit ?? ''}</Text></View>
    <View className={`h-1.5 rounded-full overflow-hidden bg-${theme().muted}`}><View className={`h-full rounded-full bg-${toneColor(tone())} w-${Math.round(value())}/100`} /></View>
  </View>;
}
export interface SpinnerProps { size?: number; color?: () => i32; active?: () => boolean; label?: string; className?: string }
export function Spinner(p: SpinnerProps): i32 {
  const node = createNodeRef(), active = (): boolean => p.active === undefined || p.active();
  const result = <View ref={node} hidden={active() ? 0 : 1} role="status" aria-label={p.label ?? 'Loading'} className={p.className ?? ''} style={{ width: p.size ?? 20, height: p.size ?? 20 }}><Icon name="loader-circle" size={p.size ?? 20} color={p.color ?? (() => ui.tailwindColor(theme().primary))} /></View>;
  activity(node.node, 'rotate', () => 360, 900, active);
  return result;
}
export interface SkeletonProps { width?: number; height?: number; circle?: boolean; active?: () => boolean; shimmer?: boolean; className?: string }
export function Skeleton(p: SkeletonProps): i32 {
  const root = createNodeRef(), shine = createNodeRef();
  const active = (): boolean => p.active === undefined || p.active();
  const node = <View ref={root} hidden={active() ? 0 : 1} role="presentation" aria-hidden="true" className={`overflow-hidden ${p.circle === true ? 'rounded-full' : 'rounded-[6px]'} bg-${theme().border} ${p.width === undefined ? 'w-full' : 'w-[' + p.width + 'px]'} ${p.className ?? ''}`} style={{ height: p.height ?? 12 }}>
    <View ref={shine} className={`absolute top-0 bottom-0 w-1/3 opacity-45 bg-${theme().card}`} />
  </View>;
  activity(shine.node, 'translateX', () => ui.screenBox(root.node)[2], 1400, () => active() && p.shimmer !== false);
  return node;
}

export interface BadgeProps { label: string; variant?: string; tone?: string; dot?: boolean; solid?: boolean; className?: string }
export function Badge(p: BadgeProps): i32 {
  const tone = p.tone ?? p.variant ?? 'neutral';
  const solid = p.solid === true || p.variant === 'default';
  return <View className={`flex-row items-center gap-1.5 px-2 py-0.5 rounded-[6px] ${p.variant === 'outline' ? 'border border-' + theme().border : 'bg-' + (solid ? toneColor(tone) : toneFill(tone))} ${p.className ?? ''}`}>
    <Show when={p.dot === true}><View className={`w-1.5 h-1.5 rounded-full bg-${solid ? theme().primaryForeground : toneColor(tone)}`} /></Show>
    <Text className={`text-[12px] font-medium text-${solid ? theme().primaryForeground : toneColor(tone)}`}>{p.label}</Text>
  </View>;
}
export interface AvatarProps { name: string; size?: string | number; image?: i32; src?: string; status?: string; className?: string }
export function initials(name: string): string { const words = name.trim().split(' ').filter((w: string) => w.length > 0); let out = ''; for (let i = 0; i < words.length && i < 2; i++) out += words[i].slice(0, 1).toUpperCase(); return out; }
export function Avatar(p: AvatarProps): i32 {
  const size = typeof p.size === 'number' ? p.size as number : p.size === 'sm' ? 32 : p.size === 'lg' ? 48 : 40;
  let hash: i32 = 0; for (let i = 0; i < p.name.length; i++) hash = (hash * 31 + p.name.charCodeAt(i)) & 0x7fffffff;
  const colors = [theme().muted, theme().secondary, theme().subtle];
  return <View role="img" aria-label={p.name + (p.status !== undefined ? ', ' + p.status : '')} className={`items-center justify-center rounded-full bg-${colors[hash % colors.length]} ${p.className ?? ''}`} style={{ width: size, height: size }}>
    <Text className={`text-[${Math.round(size * 0.35)}px] font-medium text-${theme().mutedForeground}`}>{initials(p.name) || '?'}</Text>
    <Show when={p.src !== undefined}><Image src={p.src ?? ''} className="absolute inset-0 rounded-full overflow-hidden" /></Show>
    <Show when={p.image !== undefined}><Image image={p.image ?? -1} className="absolute inset-0 rounded-full overflow-hidden" /></Show>
    <Show when={p.status !== undefined}><View className={`absolute right-0 bottom-0 w-2.5 h-2.5 rounded-full border-2 border-${theme().background} bg-${p.status === 'online' ? theme().success : p.status === 'away' ? theme().warningSoftForeground : p.status === 'busy' ? theme().destructive : theme().mutedForeground}`} /></Show>
  </View>;
}
export interface EmptyStateProps { title: string; description?: string; icon?: string; action?: string; onAction?: () => void; className?: string }
export function EmptyState(p: EmptyStateProps): i32 {
  return <View className={`flex-col items-center gap-3 py-6 ${p.className ?? ''}`}>
    <Icon name={p.icon ?? 'folder-open'} size={32} color={() => ui.tailwindColor(theme().mutedForeground)} />
    <Text className={`text-[17px] font-medium text-${theme().foreground}`}>{p.title}</Text>
    <Show when={p.description !== undefined}><Text className={`text-[13px] text-center text-${theme().mutedForeground}`}>{p.description ?? ''}</Text></Show>
    <Show when={p.action !== undefined}><KitButton label={p.action ?? ''} onClick={() => { if (p.onAction !== undefined) p.onAction(); }} /></Show>
  </View>;
}
export interface TimelineItem { title: string; time?: string; description?: string; icon?: string; tone?: string }
export interface TimelineProps { items: TimelineItem[]; label?: string; className?: string }
export function Timeline(p: TimelineProps): i32 {
  return <View role="list" aria-label={p.label ?? 'Timeline'} className={`flex-col ${p.className ?? ''}`}>
    {p.items.map((item: TimelineItem, index: i32) => <View role="listitem" className="flex-row gap-3">
      <View className="items-center w-5 shrink-0"><Icon name={item.icon ?? 'circle-check'} size={18} color={() => ui.tailwindColor(toneColor(item.tone ?? 'neutral'))} /><Show when={index < p.items.length - 1}><View className={`w-px grow min-h-6 bg-${theme().border}`} /></Show></View>
      <View className="flex-col gap-1 pb-5 grow shrink min-w-0"><View className="flex-row justify-between gap-3"><Text className={`text-[13px] font-medium text-${theme().foreground}`}>{item.title}</Text><Text className={`text-[11px] text-${theme().mutedForeground}`}>{item.time ?? ''}</Text></View><Show when={item.description !== undefined}><Text className={`text-[13px] text-${theme().mutedForeground}`}>{item.description ?? ''}</Text></Show></View>
    </View>)}
  </View>;
}
