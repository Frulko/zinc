/** @jsxHelpers zinc:ui/kit/host */
// zinc:ui/kit — List and ListItem: a bordered panel of rows (title, description, an optional leading node and
// trailing text or content), like a shadcn command menu. Rows with `onClick` highlight when focused or pressed.
//
//   <List>
//     <ListItem title="Ada Lovelace" description="ada@example.com" leading={() => <Avatar name="Ada Lovelace" />} />
//     <ListItem title="Notifications" trailing="3" onClick={open} />
//   </List>
import * as ui from 'zinc:ui';
import { theme } from './theme';
import { renderSlot } from './host';
import { createNodeRef } from 'zinc:ui/solid';

export interface ListProps {
  className?: string;
  children?: () => i32;
}
export interface ListItemProps {
  title: string;
  description?: string;
  trailing?: string;          // short text on the right ('3', '12 ms', '⌘K')
  selected?: () => boolean;   // highlighted row (a live accessor)
  onClick?: () => void;
  disabled?: boolean;
  leading?: () => i32;        // a node on the left (an Avatar, a status dot)
  children?: () => i32;       // custom content on the right (a Switch, a Badge)
}

export function List(props?: ListProps): i32 {
  const root = createNodeRef();
  return <View ref={root} tabIndex={-1} onKeyDown={(e: ui.KeyEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
    const rows: i32[] = []; listRows(root.node, rows);
    const at = rows.indexOf(ui.focused()); if (at < 0 || rows.length === 0) return;
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1)));
    ui.focusNode(rows[next]); e.preventDefault();
  }} className={`flex-col gap-0.5 p-1 rounded-[14px] border border-${theme().border} bg-${theme().card} ${props?.className ?? ''}`} as="ul">
    {renderSlot(props?.children)}
  </View>;
}
function listRows(root: i32, rows: i32[]): void {
  const node = ui.inspectNode(root); if (node === null || node.hidden || ui.isDisabled(root)) return;
  if (node.role === 'button') { rows.push(root); return; }
  for (const child of node.children) listRows(child, rows);
}

function rowClass(selected: boolean, clickable: boolean): string {
  const t = theme();
  const fill = selected ? `bg-${t.accentSoft}` : 'bg-transparent';
  return clickable ? `${fill} focus-visible:ring-2 focus-visible:ring-${t.accent} focus-visible:ring-offset-2 active:bg-${t.secondaryPressed}` : fill;
}

export function ListItem(props: ListItemProps): i32 {
  const clickable = props.onClick !== undefined;
  const isSelected = (): boolean => { const s = props.selected; return s !== undefined ? s() : false; };
  const row = <View as="li" role={clickable ? 'button' : 'listitem'} aria-label={props.title} disabled={props.disabled === true} className={`flex-row items-center gap-3 px-3 py-2 rounded-[10px] ${props.disabled === true ? 'opacity-45' : ''} ${rowClass(isSelected(), clickable)}`} aria-selected={String(isSelected())}>
    {renderSlot(props.leading)}
    <View className="flex-col grow gap-0.5">
      <Text className={`text-sm font-medium text-${theme().foreground}`}>{props.title}</Text>
      <Show when={props.description !== undefined}>
        <Text className={`text-xs text-${theme().mutedForeground}`}>{props.description ?? ''}</Text>
      </Show>
    </View>
    <Show when={props.trailing !== undefined}>
      <Text className={`text-sm text-${theme().mutedForeground}`}>{props.trailing ?? ''}</Text>
    </Show>
    {renderSlot(props.children)}
  </View>;
  // only clickable rows take focus (a listener makes a node focusable)
  if (clickable) ui.listen(row, () => { if (props.disabled !== true) props.onClick?.(); });
  return row;
}
