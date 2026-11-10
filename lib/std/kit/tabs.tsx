/** @jsxHelpers zinc:ui/kit/host */
// Basic controlled tabs; NavigationTabs adds icons and a moving indicator without charging this API for them.
import * as ui from 'zinc:ui';
import { createNodeRef } from 'zinc:ui/solid';
import { theme } from './theme';
import { look, selectionFeedback } from '../platform/index';
import { nativeControl, onCleanup } from './host';

export interface TabsProps {
  items: string[];
  selected: () => i32;
  onSelect: (index: i32) => void;
  label?: string;
  variant?: string; // pill (default) or underline
  disabled?: i32[];
  className?: string;
}
export function tabShown(h: i32): boolean {
  const n = ui.inspectNode(h);
  return n !== null && !n.hidden && (n.parent < 0 || tabShown(n.parent));
}
export function tabNodes(root: i32, out: i32[]): void {
  const n = ui.inspectNode(root);
  if (n === null) return;
  if (n.role === 'tab') { out.push(root); return; }
  for (const child of n.children) tabNodes(child, out);
}
export function tabStop(p: TabsProps): i32 {
  if (p.selected() >= 0 && p.selected() < p.items.length && (p.disabled === undefined || p.disabled.indexOf(p.selected()) < 0)) return p.selected();
  return p.items.findIndex((label: string, i: i32) => p.disabled === undefined || p.disabled.indexOf(i) < 0);
}
export function tabKey(root: i32, p: TabsProps, e: ui.KeyEvent): void {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
  const enabled: i32[] = [];
  for (let i = 0; i < p.items.length; i++) if (p.disabled === undefined || p.disabled.indexOf(i) < 0) enabled.push(i);
  if (enabled.length === 0) return;
  const from = enabled.indexOf(tabStop(p));
  const to = e.key === 'Home' ? 0 : e.key === 'End' ? enabled.length - 1 : (from + (e.key === 'ArrowLeft' ? enabled.length - 1 : 1)) % enabled.length;
  const nodes: i32[] = []; tabNodes(root, nodes);
  if (enabled[to] < nodes.length) ui.focusNode(nodes[enabled[to]]);
  if (p.selected() !== enabled[to]) selectionFeedback();
  p.onSelect(enabled[to]); e.preventDefault();
}
/** Reveals the current tab after keyboard, pointer or application-controlled selection. */
export function revealTab(root: i32, selected: i32): void {
  if (!tabShown(root)) return;
  const nodes: i32[] = []; tabNodes(root, nodes);
  if (selected < 0 || selected >= nodes.length) return;
  const container = ui.inspectNode(root)!;
  const box = ui.screenBox(nodes[selected]), track = ui.screenBox(root);
  if (track[2] <= 0 || track[3] <= 0 || box[2] <= 0) return;
  const left = box[0] - track[0] - container.pl;
  const right = box[0] + box[2] - track[0] - track[2] + container.pr;
  const delta = left < 0 ? left : Math.max(0, right);
  if (delta !== 0) ui.scrollTo(root, container.sx + delta, 0, !ui.prefersReducedMotion());
}
export function Tabs(p: TabsProps): i32 {
  const root = createNodeRef(), L = look();
  const node = <ScrollView ref={root} role="tablist" aria-label={p.label ?? 'Tabs'} onKeyDown={(e: ui.KeyEvent) => tabKey(root.node, p, e)}
    className={`flex-row shrink-0 overflow-x-auto ${p.variant === 'underline' ? 'border-b border-' + theme().border : L.segTrack + ' ' + (L.name === 'neutral' || L.name === 'quiet' ? 'bg-' + theme().muted : '')} ${p.className ?? ''}`}>
    {p.items.map((label: string, i: i32) => <Button role="tab" aria-label={label} aria-selected={String(p.selected() === i)} tabIndex={tabStop(p) === i ? 0 : -1} disabled={p.disabled !== undefined && p.disabled.indexOf(i) >= 0}
      onClick={() => { if (p.selected() !== i) selectionFeedback(); p.onSelect(i); }} className={`grow flex-row items-center justify-center ${L.segItem} shrink-0 ${p.variant === 'underline' ? 'border-b-2 border-' + (p.selected() === i ? theme().accent : 'transparent') : L.name === 'quiet' || L.name === 'neutral' ? 'rounded-[10px] ' + (p.selected() === i ? 'bg-' + theme().card : '') : p.selected() === i ? L.segOn : 'bg-transparent'} ${p.disabled !== undefined && p.disabled.indexOf(i) >= 0 ? 'opacity-45' : ''}`}>
      <Text className={`${L.segLabel} whitespace-nowrap text-${p.selected() === i ? theme().foreground : theme().mutedForeground}`}>{label}</Text>
    </Button>)}
  </ScrollView>;
  const follow = (): void => revealTab(root.node, p.selected());
  ui.addWatcher(follow); onCleanup(() => ui.removeWatcher(follow));
  return nativeControl(node, 'segmented', () => ['items', p.items.join('\n'), 'value', '' + p.selected()], (value: string) => { const i = parseInt(value) as i32; if (i >= 0 && i < p.items.length && (p.disabled === undefined || p.disabled.indexOf(i) < 0)) p.onSelect(i); });
}
