/** @jsxHelpers ./host */
// zinc:ui/nuxt, navigation and data (ZN-357.04): Tabs, Accordion, Table, Pagination, Breadcrumb, NavigationMenu and the Dashboard layout (DashboardGroup,
// DashboardSidebar, DashboardPanel, DashboardNavbar, DashboardToolbar) with Nuxt UI 4's look (docs/reports/nuxt-ui-research.md 3.11, 3.12, 3.18 to 3.22).
// Controlled state is an accessor and an onUpdate, like the controls.
import { theme, hex, mix, rounded } from './theme';
import { rgb, buttonIconSize, checkedFill } from './variants';
import { renderSlot } from './host';
import { Button, Badge, Checkbox } from './controls';
import { Icon } from 'zinc:icons';

// ---------------------------------------------------------------- Tabs
export type TabsItem = { label: string; icon?: string; badge?: string };
export type TabsProps = { items: TabsItem[]; modelValue: () => i32; onUpdate: (i: i32) => void; variant?: string; color?: string; size?: string; class?: string; content?: (i: i32) => i32 };
/** Nuxt UI's UTabs: pill (an elevated list, the active trigger filled with the colour) or link (an underline under the active one); `content` renders the
 *  panel of the active tab. ponytail: the indicator jumps (Nuxt slides it over 200 ms). */
export function Tabs(p: TabsProps): i32 {
  const variant = p.variant ?? 'pill', color = p.color ?? 'primary', size = p.size ?? 'md';
  const pad = size === 'xs' ? 'px-2 py-1 text-xs gap-1' : size === 'sm' ? 'px-2.5 py-1.5 text-xs gap-1.5' : size === 'md' ? 'px-3 py-1.5 text-sm gap-1.5' : size === 'lg' ? 'px-3 py-2 text-sm gap-2' : 'px-3 py-2 text-base gap-2';
  const trigger = (it: TabsItem, i: i32): i32 => {
    const t = theme(), on = p.modelValue() === i;
    const ink = variant === 'pill' ? (on ? t.textInverted : t.textMuted) : (on ? (color === 'neutral' ? t.textHighlighted : t.color(color)) : t.textMuted);
    const fill = variant === 'pill' && on ? 'bg-' + hex(checkedFill(t, color)) + ' shadow-sm' : '';
    const line = variant === 'link' && on ? 'border-b-2 border-' + hex(checkedFill(t, color)) : '';
    return <View class={`flex-row items-center justify-center font-medium ${variant === 'pill' ? 'grow ' + rounded('md') : ''} ${pad} ${fill} ${line} hover:text-${hex(t.text)}`}
      onClick={() => p.onUpdate(i)} role="tab" aria-selected={on}>
      <Show when={it.icon !== undefined}><Icon name={it.icon ?? ''} size={buttonIconSize(size)} color={() => rgb(ink)} /></Show>
      <Text class={`text-${hex(ink)}`}>{it.label}</Text>
      <Show when={it.badge !== undefined}><Badge label={it.badge} size="sm" color="neutral" variant="outline" /></Show>
    </View>;
  };
  return <View class={`flex-col gap-2 ${p.class ?? ''}`}>
    <View class={`flex-row ${variant === 'pill' ? 'p-1 ' + rounded('lg') + ' bg-' + hex(theme().bgElevated) : 'border-b border-' + hex(theme().border)}`} role="tablist">
      <For each={p.items}>{(it: TabsItem, i: i32) => trigger(it, i)}</For>
    </View>
    <Show when={p.content !== undefined}>{renderSlot((): i32 => (p.content as (i: i32) => i32)(p.modelValue()))}</Show>
  </View>;
}

// ---------------------------------------------------------------- Accordion
export type AccordionItem = { label: string; icon?: string; content: string; disabled?: boolean };
export type AccordionProps = { items: AccordionItem[]; open: () => i32[]; onUpdate: (open: i32[]) => void; type?: string; collapsible?: boolean; class?: string };
/** Nuxt UI's UAccordion: items under a hairline, a trigger with a chevron, the content below; type 'single' keeps one open (collapsible: it can close). */
export function Accordion(p: AccordionProps): i32 {
  const toggle = (i: i32): void => {
    const now = p.open(), at = now.indexOf(i);
    if (p.type === 'multiple') { if (at >= 0) p.onUpdate(now.filter((k: i32) => k !== i)); else p.onUpdate(now.concat([i])); return; }
    if (at >= 0) { if (p.collapsible ?? true) p.onUpdate([]); } else p.onUpdate([i]);
  };
  return <View class={`flex-col ${p.class ?? ''}`}>
    <For each={p.items}>{(it: AccordionItem, i: i32) => <View class={`flex-col ${i < p.items.length - 1 ? 'border-b border-' + hex(theme().border) : ''}`}>
      <View class={`flex-row items-center gap-1.5 py-3.5 ${it.disabled === true ? 'opacity-75' : ''}`} onClick={() => { if (it.disabled !== true) toggle(i); }} role="button" aria-expanded={p.open().indexOf(i) >= 0}>
        <Show when={it.icon !== undefined}><Icon name={it.icon ?? ''} size={20} color={() => rgb(theme().text)} /></Show>
        <Text class={`grow text-sm font-medium text-${hex(theme().text)}`}>{it.label}</Text>
        <Icon name={p.open().indexOf(i) >= 0 ? 'chevron-up' : 'chevron-down'} size={20} color={() => rgb(theme().text)} />
      </View>
      <Show when={p.open().indexOf(i) >= 0}><Text class={`text-sm pb-3.5 text-${hex(theme().textMuted)}`}>{it.content}</Text></Show>
    </View>}</For>
  </View>;
}

// ---------------------------------------------------------------- Table
export type TableColumn = { key: string; label: string; sortable?: boolean; width?: number };
export type TableProps = {
  columns: TableColumn[]; rows: string[][]; sort?: () => i32; onSort?: (column: i32) => void; descending?: () => boolean;
  selected?: () => i32[]; onSelect?: (rows: i32[]) => void; empty?: string; loading?: boolean; class?: string;
};
/** The rows in the order of column `col` (numbers compared as numbers), descending or not; the indexes of `rows`. */
export function sortedRows(rows: string[][], col: i32, descending: boolean): i32[] {
  const order: i32[] = [];
  for (let i = 0; i < rows.length; i++) order.push(i);
  if (col < 0) return order;
  return order.sort((a: i32, b: i32): number => {
    const x = rows[a][col], y = rows[b][col], nx = parseFloat(x), ny = parseFloat(y);
    const c = nx === nx && ny === ny ? nx - ny : x < y ? -1 : x > y ? 1 : 0;
    return descending ? -c : c;
  });
}
/** Nuxt UI's UTable: a header row (text-highlighted, semibold) over a hairline, rows divided by the border colour, cells p-4 text-muted. A sortable column's
 *  header sorts on click (again: descending); `selected` / `onSelect` add a checkbox column; `loading` draws the 1 px bar under the header. */
export function Table(p: TableProps): i32 {
  const sortCol = (): i32 => p.sort !== undefined ? (p.sort as () => i32)() : -1;
  const desc = (): boolean => p.descending !== undefined && (p.descending as () => boolean)();
  const sel = (): i32[] => p.selected !== undefined ? (p.selected as () => i32[])() : [];
  const selectable = p.onSelect !== undefined;
  const cell = (c: TableColumn): string => c.width !== undefined ? `w-[${c.width}px]` : 'grow basis-0';
  const flip = (r: i32): void => { const f = p.onSelect; if (f === undefined) return; const s = sel(); f(s.indexOf(r) >= 0 ? s.filter((k: i32) => k !== r) : s.concat([r])); };
  return <View class={`flex-col overflow-hidden ${p.class ?? ''}`} role="table">
    <View class={`flex-row items-center border-b border-${hex(theme().borderAccented)}`}>
      <Show when={selectable}><View class="w-[44px] pl-4"><Checkbox modelValue={() => sel().length === p.rows.length && p.rows.length > 0}
        onUpdate={(v: boolean) => { const f = p.onSelect; if (f === undefined) return; const all: i32[] = []; if (v) for (let i = 0; i < p.rows.length; i++) all.push(i); f(all); }} /></View></Show>
      <For each={p.columns}>{(c: TableColumn, i: i32) => <View class={`flex-row items-center gap-1 px-4 py-3.5 ${cell(c)}`} onClick={() => { const f = p.onSort; if (c.sortable === true && f !== undefined) f(i); }}>
        <Text class={`text-sm font-semibold text-${hex(theme().textHighlighted)}`}>{c.label}</Text>
        <Show when={c.sortable === true}><Icon name={sortCol() === i ? (desc() ? 'arrow-down-wide-narrow' : 'arrow-up-narrow-wide') : 'arrow-up-down'} size={16} color={() => rgb(theme().textMuted)} /></Show>
      </View>}</For>
    </View>
    <Show when={p.loading === true}><View class={`h-[1px] bg-${hex(theme().primary)}`} /></Show>
    <Show when={p.rows.length === 0}><Text class={`py-6 text-center text-sm text-${hex(theme().textMuted)}`}>{p.empty ?? 'No data.'}</Text></Show>
    <For each={sortedRows(p.rows, sortCol(), desc())}>{(r: i32, k: i32) => <View class={`flex-row items-center border-b border-${hex(theme().border)} ${sel().indexOf(r) >= 0 ? 'bg-' + hex(mix(theme().bgElevated, 50, theme().bg)) : ''} ${selectable ? 'hover:bg-' + hex(mix(theme().bgElevated, 50, theme().bg)) : ''}`} role="row">
      <Show when={selectable}><View class="w-[44px] pl-4"><Checkbox modelValue={() => sel().indexOf(r) >= 0} onUpdate={(v: boolean) => flip(r)} /></View></Show>
      <For each={p.columns}>{(c: TableColumn, i: i32) => <View class={`p-4 overflow-hidden ${cell(c)}`}><Text class={`text-sm whitespace-nowrap truncate text-${hex(theme().textMuted)}`}>{p.rows[r][i]}</Text></View>}</For>
    </View>}</For>
  </View>;
}

// ---------------------------------------------------------------- Pagination
export type PaginationProps = { page: () => i32; onUpdate: (page: i32) => void; total: i32; itemsPerPage?: i32; siblingCount?: i32; size?: string; class?: string };
/** The page numbers Nuxt UI (Reka) shows: the first, the last, `siblings` around the current one, 0 for an ellipsis. */
export function pageItems(page: i32, pages: i32, siblings: i32): i32[] {
  const out: i32[] = [];
  if (pages <= siblings * 2 + 5) { for (let i = 1; i <= pages; i++) out.push(i); return out; }
  const lo = Math.max(2, page - siblings), hi = Math.min(pages - 1, page + siblings);
  out.push(1);
  if (lo > 2) out.push(0);
  for (let i = lo; i <= hi; i++) out.push(i);
  if (hi < pages - 1) out.push(0);
  out.push(pages);
  return out;
}
/** Nuxt UI's UPagination: neutral outline Buttons for the pages, a primary solid one for the current page, previous / next with chevrons, ellipses. */
export function Pagination(p: PaginationProps): i32 {
  const pages = Math.max(1, Math.ceil(p.total / (p.itemsPerPage ?? 10))) as i32, size = p.size ?? 'md';
  const go = (n: i32): void => { if (n >= 1 && n <= pages && n !== p.page()) p.onUpdate(n); };
  return <View class={`flex-row items-center gap-1 ${p.class ?? ''}`} role="navigation">
    <Button icon="chevron-left" color="neutral" variant="outline" size={size} disabled={p.page() <= 1} onClick={() => go(p.page() - 1)} />
    <For each={pageItems(p.page(), pages, p.siblingCount ?? 2)}>{(n: i32, i: i32) => n === 0
      ? <Button label="…" color="neutral" variant="ghost" size={size} disabled={true} />
      : <Button label={`${n}`} color={n === p.page() ? 'primary' : 'neutral'} variant={n === p.page() ? 'solid' : 'outline'} size={size} onClick={() => go(n)} />}</For>
    <Button icon="chevron-right" color="neutral" variant="outline" size={size} disabled={p.page() >= pages} onClick={() => go(p.page() + 1)} />
  </View>;
}

// ---------------------------------------------------------------- Breadcrumb
export type BreadcrumbItem = { label: string; icon?: string; onSelect?: () => void };
/** Nuxt UI's UBreadcrumb: muted links separated by chevrons, the last one (the current page) semibold in the colour. */
export function Breadcrumb(p: { items: BreadcrumbItem[]; color?: string; class?: string }): i32 {
  const color = p.color ?? 'primary';
  return <View class={`flex-row items-center gap-1.5 ${p.class ?? ''}`} role="navigation">
    <For each={p.items}>{(it: BreadcrumbItem, i: i32) => <View class="flex-row items-center gap-1.5">
      <View class="flex-row items-center gap-1.5" onClick={() => { const f = it.onSelect; if (f !== undefined) f(); }}>
        <Show when={it.icon !== undefined}><Icon name={it.icon ?? ''} size={20} color={() => rgb(i === p.items.length - 1 ? (color === 'neutral' ? theme().textHighlighted : theme().color(color)) : theme().textMuted)} /></Show>
        <Text class={`text-sm ${i === p.items.length - 1 ? 'font-semibold text-' + hex(color === 'neutral' ? theme().textHighlighted : theme().color(color)) : 'font-medium text-' + hex(theme().textMuted) + ' hover:text-' + hex(theme().text)}`}>{it.label}</Text>
      </View>
      <Show when={i < p.items.length - 1}><Icon name="chevron-right" size={20} color={() => rgb(theme().textMuted)} /></Show>
    </View>}</For>
  </View>;
}

// ---------------------------------------------------------------- NavigationMenu
export type NavigationItem = { label: string; icon?: string; badge?: string; active?: boolean; type?: string; onSelect?: () => void };
/** Nuxt UI's UNavigationMenu: vertical (a sidebar list) or horizontal (a header bar), pill (the active link on bg-elevated) or link variant; `type: 'label'`
 *  items head a group; `collapsed` shows the icons only. */
export function NavigationMenu(p: { items: NavigationItem[]; orientation?: string; variant?: string; color?: string; collapsed?: boolean; class?: string }): i32 {
  const vertical = (p.orientation ?? 'horizontal') === 'vertical', pill = (p.variant ?? 'pill') === 'pill', color = p.color ?? 'primary';
  const link = (it: NavigationItem): i32 => {
    const t = theme();
    if (it.type === 'label') return <Text class={`px-2.5 py-1.5 text-xs font-semibold text-${hex(t.textHighlighted)}`}>{p.collapsed === true ? '' : it.label}</Text>;
    const on = it.active === true;
    const ink = on ? (color === 'neutral' ? t.textHighlighted : t.color(color)) : t.textMuted;
    return <View class={`flex-row items-center gap-1.5 py-1.5 ${p.collapsed === true ? 'px-1.5 justify-center' : 'px-2.5'} ${rounded('md')} ${pill && on ? 'bg-' + hex(t.bgElevated) : 'hover:bg-' + hex(mix(t.bgElevated, 50, theme().bg))} ${vertical ? 'w-full' : ''}`}
      onClick={() => { const f = it.onSelect; if (f !== undefined) f(); }} role="link" aria-current={on ? 'page' : ''}>
      <Show when={it.icon !== undefined}><Icon name={it.icon ?? ''} size={20} color={() => rgb(on ? ink : theme().textDimmed)} /></Show>
      <Show when={p.collapsed !== true}><Text class={`grow text-sm font-medium text-${hex(ink)}`}>{it.label}</Text></Show>
      <Show when={it.badge !== undefined && p.collapsed !== true}><Badge label={it.badge} size="sm" color="neutral" variant="outline" /></Show>
    </View>;
  };
  return <View class={`${vertical ? 'flex-col gap-0.5' : 'flex-row items-center gap-1'} ${p.class ?? ''}`} role="navigation">
    <For each={p.items}>{(it: NavigationItem, i: i32) => link(it)}</For>
  </View>;
}

// ---------------------------------------------------------------- Dashboard layout
/** Nuxt UI's UDashboardGroup: the whole surface, the sidebar and the panels side by side. */
export function DashboardGroup(p: { class?: string; children?: () => i32 }): i32 {
  return <View class={`flex-row w-full h-full overflow-hidden bg-${hex(theme().bg)} ${p.class ?? ''}`}>{renderSlot(p.children)}</View>;
}
export type DashboardSidebarProps = { collapsed?: () => boolean; width?: number; header?: () => i32; footer?: () => i32; class?: string; children?: () => i32 };
/** Nuxt UI's UDashboardSidebar: a left column with a 64 px header, a scrolling body and a footer, bordered on its right; 64 px wide when collapsed.
 *  ponytail: no resize handle and no mobile slideover yet (the width is fixed, 256 px). */
export function DashboardSidebar(p: DashboardSidebarProps): i32 {
  const narrow = (): boolean => p.collapsed !== undefined && (p.collapsed as () => boolean)();
  return <View class={`flex-col h-full shrink-0 border-r border-${hex(theme().border)} ${narrow() ? 'w-[64px]' : 'w-[' + (p.width ?? 256) + 'px]'} ${p.class ?? ''}`}>
    <Show when={p.header !== undefined}><View class={`flex-row items-center gap-1.5 h-[64px] shrink-0 ${narrow() ? 'px-3 justify-center' : 'px-4'}`}>{renderSlot(p.header)}</View></Show>
    <View class={`flex-col gap-4 grow overflow-auto ${narrow() ? 'px-2' : 'px-4'} py-2`}>{renderSlot(p.children)}</View>
    <Show when={p.footer !== undefined}><View class={`flex-row items-center gap-1.5 shrink-0 ${narrow() ? 'px-2' : 'px-4'} py-2`}>{renderSlot(p.footer)}</View></Show>
  </View>;
}
/** Nuxt UI's UDashboardPanel: the main column, its navbar and toolbar on top (header) and a scrolling body padded 24 px. */
export function DashboardPanel(p: { header?: () => i32; class?: string; children?: () => i32 }): i32 {
  return <View class={`flex-col grow h-full min-w-0 ${p.class ?? ''}`}>
    {renderSlot(p.header)}
    <View class="flex-col gap-6 grow overflow-auto p-6">{renderSlot(p.children)}</View>
  </View>;
}
/** Nuxt UI's UDashboardNavbar: 64 px, a title with its icon on the left, actions on the right, a hairline below. */
export function DashboardNavbar(p: { title?: string; icon?: string; leading?: () => i32; right?: () => i32; class?: string }): i32 {
  return <View class={`flex-row items-center justify-between gap-1.5 h-[64px] shrink-0 px-6 border-b border-${hex(theme().border)} ${p.class ?? ''}`}>
    <View class="flex-row items-center gap-1.5 min-w-0">
      {renderSlot(p.leading)}
      <Show when={p.icon !== undefined}><Icon name={p.icon ?? ''} size={20} color={() => rgb(theme().textHighlighted)} /></Show>
      <Text class={`font-semibold truncate text-${hex(theme().textHighlighted)}`}>{p.title ?? ''}</Text>
    </View>
    <View class="flex-row items-center gap-1.5">{renderSlot(p.right)}</View>
  </View>;
}
/** Nuxt UI's UDashboardToolbar: a 49 px row under the navbar (filters, tabs). */
export function DashboardToolbar(p: { class?: string; children?: () => i32 }): i32 {
  return <View class={`flex-row items-center justify-between gap-1.5 min-h-[49px] shrink-0 px-6 border-b border-${hex(theme().border)} ${p.class ?? ''}`}>{renderSlot(p.children)}</View>;
}
