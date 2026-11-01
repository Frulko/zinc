// zinc:ui/kit — a tooltip for a node made with zinc:ui's own calls (the ImageViewer's buttons), the same as <Tooltip> for a component: it shows
// after `delay` ms of the pointer on the node (not while it is pressed) or at once when the keyboard puts the focus on it; a long press (touch) shows it for 3 s.
import * as ui from 'zinc:ui';

/** Gives `host` a hint with `label`; `placement` as zinc:ui's anchor ('top', 'bottom', 'left', 'right', with '-start' / '-end'). The hint is a child of `host`. */
export function attachTooltip(host: i32, label: string, placement: string = 'bottom', delay: number = 500): void {
  const tip = ui.createNode(ui.VIEW), text = ui.createNode(ui.TEXT);
  ui.setClass(tip, 'flex-row items-center px-2 py-1 rounded-md bg-[#18181b]');
  ui.setClass(text, 'text-xs text-[#fafafa]');
  ui.setText(text, label);
  ui.insert(tip, text, -1);
  ui.insert(host, tip, -1);
  ui.setNumber(tip, 'hidden', 1);
  ui.openLayer(tip, { priority: 300 });
  ui.anchor(tip, host, placement, 6);
  let timer: i32 = -1;
  const stop = (): void => { if (timer >= 0) clearTimeout(timer); timer = -1; ui.setNumber(tip, 'hidden', 1); };
  ui.onPointer(host, ui.PENTER, (e: ui.PointerEvent) => { if (timer >= 0) clearTimeout(timer); timer = setTimeout(() => { timer = -1; ui.setNumber(tip, 'hidden', 0); }, delay); });
  ui.onPointer(host, ui.PLEAVE, (e: ui.PointerEvent) => { stop(); });
  ui.onPointer(host, ui.PDOWN, (e: ui.PointerEvent) => { stop(); });
  ui.onPointer(host, ui.PLONG, (e: ui.PointerEvent) => { ui.setNumber(tip, 'hidden', 0); timer = setTimeout(stop, 3000); });   // touch: a long press shows it for 3 s
  ui.onFocusWithin(host, (on: boolean) => { if (on) ui.setNumber(tip, 'hidden', 0); else stop(); });
}
