import { env } from 'zinc:sys';
import { heading, theme } from 'zinc:ui/kit';
import { PlanningBoard } from '../planning/Board';
import { PlanningWeek } from '../planning/Week';
import { PlanningMonth } from '../planning/Month';
import { PlanningGantt } from '../planning/Gantt';
export function PlanningSection(): i32 {
  const visible = (name: string): boolean => env('PLANNING_VIEW') === '' || env('PLANNING_VIEW') === name;
  return (
    <View className="flex-col gap-6 min-w-0">
      <Text className={heading(3)}>Planning</Text>
      <Text className={`text-[13px] text-${theme().mutedForeground}`}>
        Move work with the keyboard or pointer. Dates are civil days; changes belong to the application.
      </Text>
      <Show when={visible('board')}>
        <PlanningBoard />
      </Show>
      <Show when={visible('week')}>
        <PlanningWeek />
      </Show>
      <Show when={visible('month')}>
        <PlanningMonth />
      </Show>
      <Show when={visible('gantt')}>
        <PlanningGantt />
      </Show>
    </View>
  );
}
