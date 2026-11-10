import { createSignal } from 'zinc:ui/solid';
import { GanttChart, GanttTask, theme } from 'zinc:ui/kit';
export function PlanningGantt(): i32 {
  const [tasks, setTasks] = createSignal<GanttTask[]>([
    { id: 'research', title: 'Try paper circuits', owner: 'Maya', start: 0, end: 5, progress: 1 },
    { id: 'materials', title: 'Gather materials', owner: 'Jonas', start: 4, end: 10, progress: 0.65, dependsOn: 'research' },
    { id: 'guide', title: 'Write the guide', owner: 'Priya', start: 8, end: 18, progress: 0.35, dependsOn: 'materials' },
    { id: 'event', title: 'Workshop', start: 21, end: 21, milestone: true, dependsOn: 'guide' },
    { id: 'share', title: 'Share the notes', owner: 'Tomas', start: 22, end: 27, progress: 0, dependsOn: 'event' },
  ]);
  const [message, setMessage] = createSignal('Dependencies are drawn, not automatically rescheduled.');
  return (
    <View className="flex-col gap-3">
      <GanttChart
        label="Workshop plan"
        tasks={tasks}
        origin="2026-11-02"
        days={28}
        today="2026-11-10"
        height={250}
        dayWidth={30}
        onTaskChange={(task: GanttTask) => {
          setTasks(tasks().map((old: GanttTask): GanttTask => (old.id === task.id ? task : old)));
          setMessage('Rescheduled ' + task.title);
        }}
        onTaskClick={(id: string) => setMessage('Opened task ' + id)}
      />
      <Text role="status" className={`text-[12px] text-${theme().mutedForeground}`}>
        {message()}
      </Text>
    </View>
  );
}
