/** @jsxHelpers ./host */
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

export interface ListProps {
  class?: string;
  children?: () => i32;
}
export interface ListItemProps {
  title: string;
  description?: string;
  trailing?: string;          // short text on the right ('3', '12 ms', '⌘K')
  selected?: () => boolean;   // highlighted row (a live accessor)
  onClick?: () => void;
  leading?: () => i32;        // a node on the left (an Avatar, a status dot)
  children?: () => i32;       // custom content on the right (a Switch, a Badge)
}

export function List(props?: ListProps): i32 {
  return <View class={`flex-col gap-0.5 p-1 rounded-lg border border-${theme().border} bg-${theme().card} ${props?.class ?? ''}`}>
    {renderSlot(props?.children)}
  </View>;
}

function rowClass(selected: boolean, clickable: boolean): string {
  const t = theme();
  const fill = selected ? `bg-${t.subtle}` : 'bg-transparent';
  return clickable ? `${fill} focus:bg-${t.subtle} active:bg-${t.secondaryPressed}` : fill;
}

export function ListItem(props: ListItemProps): i32 {
  const clickable = props.onClick !== undefined;
  const isSelected = (): boolean => { const s = props.selected; return s !== undefined ? s() : false; };
  const row = <View class={`flex-row items-center gap-3 px-3 py-2 rounded-md transition-colors ${rowClass(isSelected(), clickable)}`}>
    {renderSlot(props.leading)}
    <View class="flex-col grow gap-0.5">
      <Text class={`text-sm font-medium text-${theme().foreground}`}>{props.title}</Text>
      <Show when={props.description !== undefined}>
        <Text class={`text-xs text-${theme().mutedForeground}`}>{props.description ?? ''}</Text>
      </Show>
    </View>
    <Show when={props.trailing !== undefined}>
      <Text class={`text-sm text-${theme().mutedForeground}`}>{props.trailing ?? ''}</Text>
    </Show>
    {renderSlot(props.children)}
  </View>;
  // only clickable rows take focus (a listener makes a node focusable)
  if (clickable) ui.listen(row, () => props.onClick?.());
  return row;
}
