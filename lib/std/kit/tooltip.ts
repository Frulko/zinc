// Shared hint behavior for JSX and imperative controls. Timers use UI time, so deterministic runs and unmounts agree.
import * as ui from 'zinc:ui';
import { onCleanup } from './host';
import { theme } from './theme';
import { springTo, SPRING_SMOOTH } from './motion';

enum HintState { Hidden, Waiting, Visible, Transient, Disposed }
export class TooltipSession { state: HintState = HintState.Hidden; keyboard: boolean = false; deadline: number = 0; }
let recentHint: number = -10000, recentX: number = 0, recentY: number = 0;

function describe(h: i32, id: string, owned: i32[]): void {
  const n = ui.inspectNode(h);
  if (n === null) return;
  if (n.focusable) {
    const at = n.attrK.indexOf('aria-describedby'), previous = at >= 0 ? n.attrV[at] : '';
    ui.setAttr(h, 'aria-describedby', previous.length > 0 ? previous + ' ' + id : id);
    owned.push(h, ui.nodeSerial(h));
  }
  for (const child of n.children) describe(child, id, owned);
}

/** A noninteractive hint: focus stays on the trigger, Escape dismisses, nearby hints open without a second dwell. */
export function attachTooltip(host: i32, label: string, placement: string = 'bottom', delay: number = 500, memory: TooltipSession = new TooltipSession()): void {
  const tip = ui.createNode(ui.VIEW), text = ui.createNode(ui.TEXT);
  const serial = ui.nodeSerial(host), tipSerial = ui.nodeSerial(tip);
  ui.setClass(tip, `flex-row items-center px-2 py-1 rounded-[10px] shadow-lg bg-${theme().primary} pointer-events-none`);
  ui.setClass(text, `text-[12px] text-${theme().primaryForeground}`);
  ui.setText(text, label);
  ui.setRole(tip, 'tooltip');
  const id = `kit-tip-${tipSerial}`;
  ui.setAttr(tip, 'id', id);
  const described: i32[] = [];
  describe(host, id, described);
  ui.insert(tip, text, -1);
  ui.insert(host, tip, -1);
  ui.setNumber(tip, 'hidden', memory.state === HintState.Visible || memory.state === HintState.Transient ? 0 : 1);
  ui.openLayer(tip, { priority: 300, motion: 'fade', duration: 140 });
  ui.anchor(tip, host, placement, 6);
  let state = memory.state, timer: i32 = -1;
  const transition = (next: HintState): void => {
    if (state === HintState.Disposed || next === state) return;
    if (timer >= 0) ui.cancelAlarm(timer);
    timer = -1;
    if ((state === HintState.Visible || state === HintState.Transient) && next !== HintState.Disposed && ui.nodeSerial(tip) === tipSerial) {
      const box = ui.screenBox(tip);
      recentX = box[0]; recentY = box[1]; recentHint = ui.now();
    }
    state = next;
    if (next !== HintState.Disposed) memory.state = next;
    if (ui.nodeSerial(host) !== serial || ui.nodeSerial(tip) !== tipSerial) return;
    ui.setNumber(tip, 'hidden', next === HintState.Visible || next === HintState.Transient ? 0 : 1);
    if (next === HintState.Visible && ui.now() - recentHint < 500) {
      ui.openLayer(tip, { priority: 300 });
      const box = ui.screenBox(tip);
      springTo(tip, 'translateX', recentX - box[0], 0, SPRING_SMOOTH);
      springTo(tip, 'translateY', recentY - box[1], 0, SPRING_SMOOTH);
    }
    if (next === HintState.Waiting || next === HintState.Transient) {
      memory.deadline = ui.now() + (next === HintState.Transient ? 3000 : ui.now() - recentHint < 500 ? 0 : delay);
      timer = ui.alarm(memory.deadline, () => transition(next === HintState.Waiting ? HintState.Visible : HintState.Hidden));
    }
  };
  ui.onPointer(host, ui.PENTER, (e: ui.PointerEvent) => transition(memory.keyboard ? HintState.Visible : HintState.Waiting));
  ui.onPointer(host, ui.PLEAVE, (e: ui.PointerEvent) => transition(memory.keyboard ? HintState.Visible : HintState.Hidden));
  ui.onPointer(host, ui.PDOWN, (e: ui.PointerEvent) => transition(HintState.Hidden));
  ui.onPointer(host, ui.PLONG, (e: ui.PointerEvent) => {
    transition(HintState.Transient);
  });
  const releaseFocus = ui.onFocusWithin(host, (on: boolean) => {
    memory.keyboard = on;
    const node = ui.inspectNode(host);
    if (on) transition(HintState.Visible);
    else if (node === null || !node.hovered) transition(HintState.Hidden);
  });
  ui.onDismiss(tip, () => transition(HintState.Hidden));
  if (state === HintState.Waiting || state === HintState.Transient) { const pending = state; timer = ui.alarm(memory.deadline, () => transition(pending === HintState.Waiting ? HintState.Visible : HintState.Hidden)); }
  onCleanup(() => {
    releaseFocus(); transition(HintState.Disposed);
    for (let i = 0; i < described.length; i += 2) {
      const h = described[i], n = ui.inspectNode(h);
      if (n === null || ui.nodeSerial(h) !== described[i + 1]) continue;
      const at = n.attrK.indexOf('aria-describedby');
      if (at >= 0) ui.setAttr(h, 'aria-describedby', n.attrV[at].split(' ').filter((value: string) => value !== id).join(' '));
    }
    if (ui.nodeSerial(tip) === tipSerial) ui.destroy(tip);
  });
}
