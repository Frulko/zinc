/** @jsxHelpers ./host */
// zinc:ui/kit — Tabs: a segmented row of triggers on a muted track; the selected one is raised. The panels are
// yours to switch (`<Show when={tab() === 1}>`), which keeps each panel's state alive or not as you choose.
//
//   <Tabs items={['Overview', 'Settings']} selected={tab} onSelect={setTab} />
import { theme } from './theme';
import { look, selectionFeedback } from '../platform/index';

export interface TabsProps {
  items: string[];
  selected: () => i32;
  onSelect: (index: i32) => void;
  className?: string;      // 'w-full' stretches the triggers
}

function triggerClass(active: boolean): string {
  const t = theme(), L = look();
  if (L.name !== 'neutral') return active ? `${L.segOn} focus:${L.segOn.split(' ')[0]}` : 'bg-transparent';
  if (active) return `bg-${t.card} shadow-sm focus:bg-${t.card}`;
  return `bg-transparent focus:bg-${t.muted}`;
}

function labelClass(active: boolean): string {
  const t = theme();
  return `${look().segLabel} text-${active ? t.foreground : t.mutedForeground}`;
}

export function Tabs(props: TabsProps): i32 {
  const L = look();
  return <View className={`flex-row ${L.segTrack} ${L.name === 'neutral' ? 'bg-' + theme().muted : ''} ${props.className ?? ''}`}>
    {props.items.map((label: string, i: i32) =>
      <View className={`grow flex-row items-center justify-center ${L.segItem} transition-colors ${triggerClass(props.selected() === i)}`}
        onClick={() => { if (props.selected() !== i) selectionFeedback(); props.onSelect(i); }}>
        <Text className={labelClass(props.selected() === i)}>{label}</Text>
      </View>)}
  </View>;
}
