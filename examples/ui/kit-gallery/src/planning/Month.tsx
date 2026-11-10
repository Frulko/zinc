import { createSignal } from 'zinc:ui/solid';
import { MonthCalendar, MonthEvent, theme } from 'zinc:ui/kit';
export function PlanningMonth(): i32 {
  const [month, setMonth] = createSignal('2026-11-01'),
    [selected, setSelected] = createSignal('2026-11-10');
  const events: MonthEvent[] = [
    { id: 'sprint', title: 'Prepare the workshop', start: '2026-11-06', end: '2026-11-11', allDay: true },
    { id: 'sessions', title: 'Open studio', start: '2026-11-09', end: '2026-11-12', allDay: true },
    { id: 'review', title: 'Review', start: '2026-11-10', timeMinutes: 540 },
    { id: 'mentor', title: 'Mentors arrive', start: '2026-11-10', timeMinutes: 570 },
    { id: 'parts', title: 'Parts delivery', start: '2026-11-10', timeMinutes: 630 },
    { id: 'demo', title: 'Paper circuits', start: '2026-11-10', timeMinutes: 720 },
    { id: 'sharing', title: 'Share your work', start: '2026-11-20', timeMinutes: 900 },
  ];
  const [message, setMessage] = createSignal('Choose a day. Enter or a double click starts a new event.');
  return (
    <View className="flex-col gap-3">
      <MonthCalendar
        label="Workshop month"
        month={month}
        onMonthChange={setMonth}
        selected={selected}
        onSelectDay={setSelected}
        events={() => events}
        today="2026-11-10"
        onDayActivate={(date: string) => setMessage('Create an event on ' + date)}
        onEventClick={(id: string) => setMessage('Opened event ' + id)}
      />
      <Text role="status" className={`text-[12px] text-${theme().mutedForeground}`}>
        {message()}
      </Text>
    </View>
  );
}
