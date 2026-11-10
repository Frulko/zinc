/** @jsxHelpers zinc:ui/kit/host */
// Quiet navigation: controlled destinations and document anchors, composed from the kit's existing controls.
import * as ui from 'zinc:ui';
import { createNodeRef } from 'zinc:ui/solid';
import { Icon } from 'zinc:icons';
import { TabsProps, tabNodes, tabKey, tabStop, revealTab } from './tabs';
import { Button as KitButton } from './button';
import { Tooltip, DropdownMenu } from './overlays';
import { theme } from './theme';
import { onCleanup, componentRef } from './host';
import { springTo, SPRING_STATE } from './motion';
import { pageItems } from '../pagination';

export interface NavigationItem { id: string; label: string; icon?: string; badge?: string; disabled?: boolean }
export interface NavigationProps { label: string; items: NavigationItem[]; selected: () => string; onSelect: (id: string) => void; variant?: string; className?: string }
function itemIcon(p: { item: NavigationItem }): i32 {
  return <View className="flex-row items-center gap-2">
    <Show when={p.item.icon !== undefined}><Icon name={p.item.icon ?? ''} size={16} color={() => ui.tailwindColor(theme().foreground)} /></Show>
  </View>;
}
/** Rich tabs own their indicator, icons and badges; basic Tabs remains independent of those capabilities. */
export function NavigationTabs(p: NavigationProps): i32 {
  const root = createNodeRef(), marker = createNodeRef(), geometry = componentRef<number[]>([]);
  const basic: TabsProps = { label: p.label, items: p.items.map((it: NavigationItem) => it.label), selected: () => p.items.findIndex((it: NavigationItem) => it.id === p.selected()), onSelect: (i: i32) => p.onSelect(p.items[i].id), disabled: p.items.map((it: NavigationItem, i: i32) => it.disabled === true ? i : -1) };
  const node = <ScrollView ref={root} role="tablist" aria-label={p.label} onKeyDown={(e: ui.KeyEvent) => tabKey(root.node, basic, e)} className={`relative flex-row shrink-0 overflow-x-auto ${p.variant === 'underline' ? 'border-b border-' + theme().border : 'p-1 rounded-[14px] bg-' + theme().muted} ${p.className ?? ''}`}>
    <View ref={marker} className={`absolute left-0 bottom-0 ${p.variant === 'underline' ? 'h-[2px] bg-' + theme().accent : 'top-1 bottom-1 rounded-[10px] bg-' + theme().card}`} />
    {p.items.map((it: NavigationItem, i: i32) => <Button role="tab" aria-label={it.label} aria-selected={String(p.selected() === it.id)} tabIndex={tabStop(basic) === i ? 0 : -1} disabled={it.disabled ?? false} onClick={() => p.onSelect(it.id)} className={`relative flex-row items-center justify-center gap-2 h-9 px-[14px] shrink-0 rounded-[10px] ${it.disabled === true ? 'opacity-45' : ''}`}>
      {itemIcon({ item: it })}<Text className={`text-[13px] whitespace-nowrap text-${p.selected() === it.id ? theme().foreground : theme().mutedForeground}`}>{it.label}</Text><Show when={it.badge !== undefined}><Text className={`text-[11px] tabular-nums text-${theme().mutedForeground}`}>{it.badge ?? ''}</Text></Show>
    </Button>)}
  </ScrollView>;
  const follow = (): void => {
    const nodes: i32[] = []; tabNodes(root.node, nodes);
    const selected = basic.selected();
    if (selected < 0 || selected >= nodes.length) { ui.setNumber(marker.node, 'hidden', 1); return; }
    ui.setNumber(marker.node, 'hidden', 0);
    const box = ui.screenBox(nodes[selected]), track = ui.screenBox(root.node), x = box[0] - track[0] + ui.scrollLeft(root.node);
    if (geometry.current.length === 0) { ui.setNumber(marker.node, 'left', x); ui.setNumber(marker.node, 'width', box[2]); }
    else if (geometry.current[0] !== x || geometry.current[1] !== box[2]) {
      springTo(marker.node, 'left', ui.getNumber(marker.node, 'left'), x, SPRING_STATE);
      springTo(marker.node, 'width', ui.getNumber(marker.node, 'width'), box[2], SPRING_STATE);
    }
    geometry.current = [x, box[2]]; revealTab(root.node, selected);
  };
  ui.addWatcher(follow); onCleanup(() => ui.removeWatcher(follow)); return node;
}
/** The compact bottom-navigation form uses the same roving tab stop and animated pill as desktop tabs. */
export function TabBar(p: NavigationProps): i32 { return <NavigationTabs label={p.label} items={p.items} selected={p.selected} onSelect={p.onSelect} className={p.className} />; }

function controls(root: i32, out: i32[]): void {
  const n = ui.inspectNode(root);
  if (n === null || n.hidden || ui.isDisabled(root)) return;
  if (n.tag === ui.BUTTON) { out.push(root); return; }
  for (const child of n.children) controls(child, out);
}
function arrowFocus(root: i32, e: ui.KeyEvent): void {
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown' && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
  const nodes: i32[] = []; controls(root, nodes);
  if (nodes.length === 0) return;
  const from = nodes.indexOf(ui.focused()), reverse = e.key === 'ArrowUp' || e.key === 'ArrowLeft';
  const to = e.key === 'Home' ? 0 : e.key === 'End' ? nodes.length - 1 : from < 0 ? 0 : (from + (reverse ? nodes.length - 1 : 1)) % nodes.length;
  ui.focusNode(nodes[to]); e.preventDefault();
}
export interface SidebarGroup { id: string; label: string; items: NavigationItem[] }
export interface SidebarProps {
  label: string; groups: SidebarGroup[]; selected: () => string; onSelect: (id: string) => void;
  collapsed?: () => boolean; closedGroups?: () => string[]; onGroupToggle?: (id: string) => void; className?: string;
}
export function Sidebar(p: SidebarProps): i32 {
  const root = createNodeRef(), marker = createNodeRef(), geometry = componentRef<number[]>([]);
  const narrow = (): boolean => p.collapsed !== undefined && p.collapsed();
  const node = <View ref={root} role="navigation" aria-label={p.label} onKeyDown={(e: ui.KeyEvent) => arrowFocus(root.node, e)} className={`relative flex-col gap-4 ${narrow() ? 'w-14' : 'w-56'} ${p.className ?? ''}`}>
    <View ref={marker} className={`absolute top-0 left-0 rounded-[10px] bg-${theme().accentSoft}`} />
    {p.groups.map((group: SidebarGroup) => <View className="flex-col gap-1">
      <Show when={!narrow()}>
        {p.onGroupToggle !== undefined ? <Button aria-label={group.label} aria-expanded={String(p.closedGroups === undefined || p.closedGroups().indexOf(group.id) < 0)} onClick={() => (p.onGroupToggle as (id: string) => void)(group.id)} className="flex-row items-center justify-between h-[30px] px-3 rounded-[10px]">
          <Text className={`text-[12px] text-${theme().mutedForeground}`}>{group.label}</Text>
          <Icon name={p.closedGroups !== undefined && p.closedGroups().indexOf(group.id) >= 0 ? 'chevron-right' : 'chevron-down'} size={12} color={() => ui.tailwindColor(theme().mutedForeground)} />
        </Button> : <Text className={`px-3 py-2 text-[12px] text-${theme().mutedForeground}`}>{group.label}</Text>}
      </Show>
      <Show when={p.closedGroups === undefined || p.closedGroups().indexOf(group.id) < 0}>
        {group.items.map((it: NavigationItem) => <Tooltip label={narrow() ? it.label : ''}>
          <Button role="link" aria-label={it.label} aria-current={p.selected() === it.id ? 'page' : ''} disabled={it.disabled ?? false}
            onClick={() => p.onSelect(it.id)} className={`relative flex-row items-center gap-2 h-9 px-3 rounded-[10px] ${it.disabled === true ? 'opacity-45' : ''}`}>
            <Show when={it.icon !== undefined}><Icon name={it.icon ?? ''} size={16} color={() => ui.tailwindColor(p.selected() === it.id ? theme().accent : theme().mutedForeground)} /></Show>
            <Show when={!narrow()}><Text className={`grow text-[13px] text-${p.selected() === it.id ? theme().foreground : theme().mutedForeground}`}>{it.label}</Text><Text className={`text-[11px] tabular-nums text-${theme().mutedForeground}`}>{it.badge ?? ''}</Text></Show>
          </Button>
        </Tooltip>)}
      </Show>
    </View>)}
  </View>;
  const selectedLink = (h: i32): i32 => {
    const n = ui.inspectNode(h);
    if (n === null || n.hidden) return -1;
    const at = n.attrK.indexOf('aria-current');
    if (n.role === 'link' && at >= 0 && n.attrV[at] === 'page') return h;
    for (const child of n.children) { const found = selectedLink(child); if (found >= 0) return found; }
    return -1;
  };
  const follow = (): void => {
    const selected = selectedLink(root.node);
    ui.setNumber(marker.node, 'hidden', selected < 0 ? 1 : 0);
    if (selected < 0) return;
    const box = ui.screenBox(selected), track = ui.screenBox(root.node), y = box[1] - track[1];
    if (geometry.current.length === 0) ui.setNumber(marker.node, 'top', y);
    else if (geometry.current[0] !== y) springTo(marker.node, 'top', ui.getNumber(marker.node, 'top'), y, SPRING_STATE);
    ui.setNumber(marker.node, 'width', box[2]); ui.setNumber(marker.node, 'height', box[3]); geometry.current = [y];
  };
  ui.addWatcher(follow); onCleanup(() => ui.removeWatcher(follow)); return node;
}
export interface BreadcrumbItem { label: string; onSelect?: () => void }
/** Keeps the root and recent ancestors; every hidden ancestor remains reachable from the overflow menu. */
export function Breadcrumb(p: { items: BreadcrumbItem[]; maxItems?: i32; label?: string; className?: string }): i32 {
  const max = Math.max(2, p.maxItems ?? 4), hidden = Math.max(0, p.items.length - max);
  const root = createNodeRef();
  return <View ref={root} role="navigation" aria-label={p.label ?? 'Breadcrumb'} onKeyDown={(e: ui.KeyEvent) => arrowFocus(root.node, e)} className={`flex-row items-center gap-1 min-w-0 ${p.className ?? ''}`}>
    {p.items.map((it: BreadcrumbItem, i: i32) => <View className="flex-row items-center gap-1 shrink-0">
      <Show when={i === 1 && hidden > 0}><DropdownMenu label="Earlier locations" items={p.items.slice(1, hidden + 1).map((ancestor: BreadcrumbItem) => ({ label: ancestor.label, onSelect: ancestor.onSelect }))} variant="ghost" /><Text className={`text-[13px] text-${theme().mutedForeground}`}>/</Text></Show>
      <Show when={i === 0 || i > hidden}>
        <Button role="link" aria-label={it.label} aria-current={i === p.items.length - 1 ? 'page' : ''} disabled={it.onSelect === undefined} onClick={() => { if (it.onSelect !== undefined) it.onSelect(); }} className="h-[30px] px-2 rounded-[10px]">
          <Text className={`text-[13px] text-${i === p.items.length - 1 ? theme().foreground : theme().mutedForeground}`}>{it.label}</Text>
        </Button>
        <Show when={i < p.items.length - 1}><Text className={`text-[13px] text-${theme().mutedForeground}`}>/</Text></Show>
      </Show>
    </View>)}
  </View>;
}
/** Pages are zero based, matching the reference; pageItems supplies the proven first/last/ellipsis layout. */
export function Pagination(p: { page: () => i32; pages: i32; onChange: (page: i32) => void; siblings?: i32; label?: string; className?: string }): i32 {
  const count = Math.max(0, p.pages), root = createNodeRef();
  const go = (n: i32): void => { if (n < 0 || n >= count || n === p.page()) return;
    const nodes: i32[] = []; controls(root.node, nodes);
    for (const h of nodes) { const node = ui.inspectNode(h); if (node !== null && node.label === 'Page ' + (n + 1)) { ui.focusNode(h); break; } }
    p.onChange(n);
  };
  return <View ref={root} role="navigation" aria-label={p.label ?? 'Pagination'} onKeyDown={(e: ui.KeyEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') { go(e.key === 'Home' ? 0 : e.key === 'End' ? count - 1 : p.page() + (e.key === 'ArrowLeft' ? -1 : 1)); e.preventDefault(); }
  }} className={`flex-row items-center gap-1 ${p.className ?? ''}`}>
    <KitButton label="Previous" size="sm" variant="ghost" disabled={count === 0 || p.page() <= 0} onClick={() => go(p.page() - 1)} />
    {pageItems(Math.max(1, Math.min(count, p.page() + 1)), count, Math.max(0, p.siblings ?? 1)).map((n: i32) => n === 0 ? <Text className={`px-2 text-[13px] text-${theme().mutedForeground}`}>…</Text> :
      <Button aria-label={'Page ' + n} aria-current={p.page() === n - 1 ? 'page' : ''} onClick={() => go(n - 1)} className={`w-[30px] h-[30px] rounded-[10px] ${p.page() === n - 1 ? 'bg-' + theme().accentSoft : ''}`}><Text className={`text-[13px] tabular-nums text-${theme().foreground}`}>{String(n)}</Text></Button>)}
    <KitButton label="Next" size="sm" variant="ghost" disabled={count === 0 || p.page() >= count - 1} onClick={() => go(p.page() + 1)} />
  </View>;
}
export interface StepItem { label: string; description?: string; status?: string; disabled?: boolean }
export function Stepper(p: { items: StepItem[]; current: () => i32; onSelect?: (step: i32) => void; linear?: boolean; vertical?: boolean; label?: string; className?: string }): i32 {
  const root = createNodeRef();
  return <View ref={root} role="group" aria-label={p.label ?? 'Steps'} onKeyDown={(e: ui.KeyEvent) => arrowFocus(root.node, e)} className={`${p.vertical === true ? 'flex-col' : 'flex-row'} gap-4 ${p.className ?? ''}`}>
    {p.items.map((it: StepItem, i: i32) => <Button aria-label={it.label} aria-current={p.current() === i ? 'step' : ''} disabled={p.onSelect === undefined || it.disabled === true || (p.linear === true && i > p.current())}
      onClick={() => { if (p.onSelect !== undefined) p.onSelect(i); }} className={`flex-row items-center gap-2 rounded-[10px] ${it.disabled === true ? 'opacity-45' : ''}`}>
      <View className={`w-[30px] h-[30px] rounded-full items-center justify-center border border-${it.status === 'error' ? theme().destructive : p.current() === i ? theme().accent : theme().border} ${p.current() === i ? 'bg-' + theme().accentSoft : ''}`}>
        {it.status === 'complete' || (it.status !== 'error' && i < p.current()) ? <Icon name="check" size={14} color={() => ui.tailwindColor(theme().foreground)} /> : <Text className={`text-[12px] text-${it.status === 'error' ? theme().destructive : theme().foreground}`}>{it.status === 'error' ? '!' : String(i + 1)}</Text>}
      </View>
      <View className="flex-col gap-1"><Text className={`text-[13px] text-${theme().foreground}`}>{it.label}</Text><Show when={it.description !== undefined}><Text className={`text-[12px] text-${theme().mutedForeground}`}>{it.description ?? ''}</Text></Show></View>
    </Button>)}
  </View>;
}

export interface ContentsItem { label: string; anchor: () => i32; level?: i32 }
/** Anchor refs belong to the caller's scroll content; geometry follows both wheel scrolling and layout changes. */
export function TableOfContents(p: { scroll: () => i32; items: ContentsItem[]; label?: string; className?: string }): i32 {
  const root = createNodeRef(), marker = createNodeRef(), fill = createNodeRef();
  const buttons: i32[] = [], geometry = componentRef<number[]>([]);
  const node = <View ref={root} role="navigation" aria-label={p.label ?? 'On this page'} onKeyDown={(e: ui.KeyEvent) => arrowFocus(root.node, e)} className={`relative flex-col gap-1 border-l border-${theme().border} ${p.className ?? ''}`}>
    <View ref={fill} className={`absolute left-0 top-0 w-px bg-${theme().accent}`} />
    <View ref={marker} className={`absolute left-0 top-0 w-[2px] h-[30px] bg-${theme().accent}`} />
    {p.items.map((it: ContentsItem) => {
      const ref = createNodeRef();
      const h = <Button ref={ref} role="link" aria-label={it.label} onClick={() => {
        const target = ui.screenBox(it.anchor()), viewport = ui.screenBox(p.scroll());
        ui.scrollTo(p.scroll(), 0, ui.scrollTop(p.scroll()) + target[1] - viewport[1], !ui.prefersReducedMotion());
      }} className={`flex-row justify-start h-[30px] pl-[${12 + Math.max(0, it.level ?? 0) * 12}px] pr-3 rounded-[10px]`}><Text className={`text-[12px] text-${theme().mutedForeground}`}>{it.label}</Text></Button>;
      buttons.push(ref.node); return h;
    })}
  </View>;
  const follow = (): void => {
    if (p.scroll() < 0 || buttons.length === 0) return;
    const viewport = ui.screenBox(p.scroll()), rail = ui.screenBox(root.node);
    let active: i32 = 0;
    const content = ui.inspectNode(p.scroll());
    const atEnd = content !== null && content.contentH > viewport[3] && ui.scrollTop(p.scroll()) + viewport[3] >= content.contentH - 1;
    for (let i = 0; i < p.items.length; i++) if (p.items[i].anchor() >= 0 && (atEnd || ui.screenBox(p.items[i].anchor())[1] <= viewport[1] + 8)) active = i;
    const progress = content !== null && content.contentH > viewport[3] ? Math.max(0, Math.min(1, ui.scrollTop(p.scroll()) / (content.contentH - viewport[3]))) : 1;
    ui.setNumber(fill.node, 'height', rail[3] * progress);
    const box = ui.screenBox(buttons[active]), y = box[1] - rail[1];
    if (geometry.current.length === 0 || geometry.current[0] !== y) {
      if (geometry.current.length === 0) ui.setNumber(marker.node, 'top', y);
      else springTo(marker.node, 'top', ui.getNumber(marker.node, 'top'), y, SPRING_STATE);
      geometry.current = [y];
      for (let i = 0; i < buttons.length; i++) ui.setAttr(buttons[i], 'aria-current', i === active ? 'location' : '');
    }
  };
  ui.addWatcher(follow); onCleanup(() => ui.removeWatcher(follow)); return node;
}
export interface DockItem { id: string; label: string; icon?: string; badge?: i32; running?: boolean; separator?: boolean; disabled?: boolean }
/** Launcher actions remain named through Tooltip and accessibility labels; no decorative hover scaling. */
export function Dock(p: { label?: string; items: DockItem[]; onSelect: (id: string) => void; className?: string }): i32 {
  const root = createNodeRef();
  return <View ref={root} role="toolbar" aria-label={p.label ?? 'Dock'} onKeyDown={(e: ui.KeyEvent) => arrowFocus(root.node, e)} className={`flex-row items-center gap-2 p-2 rounded-[18px] border border-${theme().border} bg-${theme().card} ${p.className ?? ''}`}>
    {p.items.map((it: DockItem) => it.separator === true ? <View className={`w-px h-8 mx-1 bg-${theme().border}`} /> : <Tooltip label={it.label}>
      <Button aria-label={it.label} disabled={it.disabled ?? false} onClick={() => p.onSelect(it.id)} className={`relative flex-col items-center justify-center w-11 h-11 rounded-[10px] ${it.disabled === true ? 'opacity-45' : ''}`}>
        <Icon name={it.icon ?? 'circle'} size={18} color={() => ui.tailwindColor(theme().foreground)} />
        <Show when={it.running === true}><View className={`absolute left-[20px] bottom-0 w-1 h-1 rounded-full bg-${theme().foreground}`} /></Show>
        <Show when={(it.badge ?? 0) > 0}><View className={`absolute right-0 top-0 min-w-4 h-4 px-1 rounded-full bg-${theme().accent} items-center justify-center`}><Text className={`text-[11px] tabular-nums text-${theme().accentForeground}`}>{(it.badge ?? 0) > 99 ? '99+' : String(it.badge ?? 0)}</Text></View></Show>
      </Button>
    </Tooltip>)}
  </View>;
}
