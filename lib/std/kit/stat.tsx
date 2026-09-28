/** @jsxHelpers ./host */
// zinc:ui/kit — Stat: a metric tile (a label, a large live value with an optional unit, a hint line), like the
// cards at the top of a shadcn dashboard.
//
//   <Stat label="Temperature" value={() => temp().toFixed(1)} unit="°C" hint="sensor 1, every 100 ms" />
import { theme } from './theme';
import { renderSlot } from './host';

export interface StatProps {
  label: string;
  value: () => string;
  unit?: string;
  hint?: string;
  class?: string;
  children?: () => i32;   // shown on the label row, on the right (a Badge, a status dot)
}

export function Stat(props: StatProps): i32 {
  return <View class={`flex-col gap-1 p-4 rounded-xl border border-${theme().border} bg-${theme().card} shadow-sm ${props.class ?? ''}`}>
    <View class="flex-row items-center justify-between gap-2">
      <Text class={`text-sm font-medium text-${theme().mutedForeground}`}>{props.label}</Text>
      {renderSlot(props.children)}
    </View>
    <View class="flex-row items-end gap-1">
      <Text class={`text-2xl font-bold tracking-tight text-${theme().foreground}`}>{props.value()}</Text>
      <Show when={props.unit !== undefined}>
        <Text class={`text-sm pb-1 text-${theme().mutedForeground}`}>{props.unit ?? ''}</Text>
      </Show>
    </View>
    <Show when={props.hint !== undefined}>
      <Text class={`text-xs text-${theme().mutedForeground}`}>{props.hint ?? ''}</Text>
    </Show>
  </View>;
}
