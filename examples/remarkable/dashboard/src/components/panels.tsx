// The dashboard panels. Each one reads only the signals it shows, so a tap or a tick redraws a small rectangle
// of the screen (display-rmpp refreshes it with the fast waveform).
import { PANEL, PANEL_TITLE, LABEL, PRIMARY_BUTTON, PRIMARY_LABEL } from '../eink';
import {
  TASKS, HABITS, DAYS, tasksDone, habitDays, timerRunning, toggleTask, toggleHabit, toggleTimer, clockText, timerText,
} from '../state';

export function ClockPanel(): i32 {
  return <View className="flex-col">
    <Text className="text-[120px] font-bold text-black">{clockText()}</Text>
    <Text className={LABEL}>UTC · Zinc on e-ink</Text>
  </View>;
}

export function TimerPanel(): i32 {
  return <View className={PANEL}>
    <Text className={LABEL}>Focus timer</Text>
    <Text className="text-[96px] font-bold text-black">{timerText()}</Text>
    <Button className={PRIMARY_BUTTON} onClick={toggleTimer}>
      <Text className={PRIMARY_LABEL}>{timerRunning() ? 'Pause' : 'Start'}</Text>
    </Button>
  </View>;
}

/** A task row: a big checkbox (filled black when done) and the text, dark grey once done. */
function TaskRow(props: { text: string; index: i32 }): i32 {
  const done = (): boolean => tasksDone()[props.index];
  return <Button className="px-2 flex-row items-center justify-start gap-6 py-3 bg-white focus:bg-white" onClick={() => toggleTask(props.index)}>
    <View className={done() ? 'w-[56px] h-[56px] rounded-md bg-black' : 'w-[56px] h-[56px] rounded-md border-4 border-black'} />
    <Text className={done() ? 'text-[40px] text-gray-600' : 'text-[40px] text-black'}>{props.text}</Text>
  </Button>;
}

export function TasksPanel(): i32 {
  return <View className={PANEL}>
    <Text className={PANEL_TITLE}>Today</Text>
    {TASKS.map((text: string, i: i32) => <TaskRow text={text} index={i} />)}
  </View>;
}

function HabitRow(props: { name: string; habit: i32 }): i32 {
  const on = (day: i32): boolean => habitDays()[props.habit * 7 + day];
  return <View className="flex-row items-center gap-4">
    <Text className="w-[160px] text-[36px] text-black">{props.name}</Text>
    {DAYS.map((_label: string, day: i32) =>
      <Button className={on(day) ? 'px-2 py-1 w-[80px] h-[80px] rounded-lg bg-black focus:bg-black' : 'px-2 py-1 w-[80px] h-[80px] rounded-lg border-2 border-black bg-white focus:bg-white'}
        onClick={() => toggleHabit(props.habit, day)} />)}
  </View>;
}

export function HabitsPanel(): i32 {
  return <View className={PANEL}>
    <Text className={PANEL_TITLE}>Habits this week</Text>
    <View className="flex-row gap-4">
      <View className="w-[160px]" />
      {DAYS.map((label: string) => <Text className="w-[80px] text-[28px] text-center text-black">{label}</Text>)}
    </View>
    {HABITS.map((name: string, i: i32) => <HabitRow name={name} habit={i} />)}
  </View>;
}

/** The widget Accueil leaves over the tablet's screen (zinc:remarkable RemarkableApp): the focus timer and the first three tasks, the
 *  same signals as the full dashboard, so a task ticked here is ticked when the app opens again. */
/** The widget's row: smaller than TaskRow, the card is a third of a panel. */
function WidgetTask(props: { text: string; index: i32 }): i32 {
  const done = (): boolean => tasksDone()[props.index];
  return <Button className="px-1 flex-row items-center justify-start gap-3 py-1 bg-white focus:bg-white" onClick={() => toggleTask(props.index)}>
    <View className={done() ? 'w-[36px] h-[36px] rounded bg-black' : 'w-[36px] h-[36px] rounded border-2 border-black'} />
    <Text className={done() ? 'text-[28px] text-gray-600' : 'text-[28px] text-black'}>{props.text}</Text>
  </Button>;
}

export function DashboardWidget(): i32 {
  return <View className="flex-row grow gap-6 px-5 py-4 bg-white">
    <View className="flex-col justify-between items-start">
      <Text className="text-[24px] text-gray-600">Focus</Text>
      <Text className="text-[64px] font-bold text-black">{timerText()}</Text>
      <Button className="px-5 py-2 rounded-md bg-black focus:bg-black" onClick={toggleTimer}>
        <Text className="text-[26px] font-bold text-white">{timerRunning() ? 'Pause' : 'Start'}</Text>
      </Button>
    </View>
    <View className="flex-col grow gap-1">
      <Text className="text-[24px] text-gray-600">Today</Text>
      {TASKS.slice(0, 3).map((text: string, i: i32) => <WidgetTask text={text} index={i} />)}
    </View>
  </View>;
}
