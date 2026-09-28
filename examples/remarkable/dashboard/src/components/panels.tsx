// The dashboard panels. Each one reads only the signals it shows, so a tap or a tick redraws a small rectangle
// of the screen (display-rmpp refreshes it with the fast waveform).
import { PANEL, PANEL_TITLE, LABEL, PRIMARY_BUTTON, PRIMARY_LABEL } from '../eink';
import {
  TASKS, HABITS, DAYS, tasksDone, habitDays, timerRunning, toggleTask, toggleHabit, toggleTimer, clockText, timerText,
} from '../state';

export function ClockPanel(): i32 {
  return <View class="flex-col">
    <Text class="text-[120px] font-bold text-black">{clockText()}</Text>
    <Text class={LABEL}>UTC · Zinc on e-ink</Text>
  </View>;
}

export function TimerPanel(): i32 {
  return <View class={PANEL}>
    <Text class={LABEL}>Focus timer</Text>
    <Text class="text-[96px] font-bold text-black">{timerText()}</Text>
    <Button class={PRIMARY_BUTTON} onClick={toggleTimer}>
      <Text class={PRIMARY_LABEL}>{timerRunning() ? 'Pause' : 'Start'}</Text>
    </Button>
  </View>;
}

/** A task row: a big checkbox (filled black when done) and the text, dark grey once done. */
function TaskRow(props: { text: string; index: i32 }): i32 {
  const done = (): boolean => tasksDone()[props.index];
  return <Button class="flex-row items-center justify-start gap-6 py-3 bg-white focus:bg-white" onClick={() => toggleTask(props.index)}>
    <View class={done() ? 'w-[56px] h-[56px] rounded-md bg-black' : 'w-[56px] h-[56px] rounded-md border-4 border-black'} />
    <Text class={done() ? 'text-[40px] text-gray-600' : 'text-[40px] text-black'}>{props.text}</Text>
  </Button>;
}

export function TasksPanel(): i32 {
  return <View class={PANEL}>
    <Text class={PANEL_TITLE}>Today</Text>
    {TASKS.map((text: string, i: i32) => <TaskRow text={text} index={i} />)}
  </View>;
}

function HabitRow(props: { name: string; habit: i32 }): i32 {
  const on = (day: i32): boolean => habitDays()[props.habit * 7 + day];
  return <View class="flex-row items-center gap-4">
    <Text class="w-[160px] text-[36px] text-black">{props.name}</Text>
    {DAYS.map((_label: string, day: i32) =>
      <Button class={on(day) ? 'w-[80px] h-[80px] rounded-lg bg-black focus:bg-black' : 'w-[80px] h-[80px] rounded-lg border-2 border-black bg-white focus:bg-white'}
        onClick={() => toggleHabit(props.habit, day)} />)}
  </View>;
}

export function HabitsPanel(): i32 {
  return <View class={PANEL}>
    <Text class={PANEL_TITLE}>Habits this week</Text>
    <View class="flex-row gap-4">
      <View class="w-[160px]" />
      {DAYS.map((label: string) => <Text class="w-[80px] text-[28px] text-center text-black">{label}</Text>)}
    </View>
    {HABITS.map((name: string, i: i32) => <HabitRow name={name} habit={i} />)}
  </View>;
}
