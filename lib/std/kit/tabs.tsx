/** @jsxHelpers ./host */
// zinc:ui/kit — Tabs: a segmented row of triggers on a muted track; the selected one is raised. The panels are
// yours to switch (`<Show when={tab() === 1}>`), which keeps each panel's state alive or not as you choose.
//
//   <Tabs items={['Overview', 'Settings']} selected={tab} onSelect={setTab} />
import { theme } from './theme';

export interface TabsProps {
  items: string[];
  selected: () => i32;
  onSelect: (index: i32) => void;
  class?: string;      // 'w-full' stretches the triggers
}

function triggerClass(active: boolean): string {
  const t = theme();
  if (active) return `bg-${t.card} shadow-sm focus:bg-${t.card}`;
  return `bg-transparent focus:bg-${t.muted}`;
}

function labelClass(active: boolean): string {
  const t = theme();
  return `text-sm font-medium text-${active ? t.foreground : t.mutedForeground}`;
}

export function Tabs(props: TabsProps): i32 {
  return <View class={`flex-row p-1 gap-1 rounded-lg bg-${theme().muted} ${props.class ?? ''}`}>
    {props.items.map((label: string, i: i32) =>
      <View class={`grow flex-row items-center justify-center h-7 px-3 rounded-md transition-colors ${triggerClass(props.selected() === i)}`}
        onClick={() => props.onSelect(i)}>
        <Text class={labelClass(props.selected() === i)}>{label}</Text>
      </View>)}
  </View>;
}
