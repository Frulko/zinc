import { createSignal } from 'zinc:ui/solid';
import { WeekCalendar, WeekEvent, theme } from 'zinc:ui/kit';
export function PlanningWeek(): i32 {
  const [events, setEvents] = createSignal<WeekEvent[]>([
    { id: 'review', title: 'Design review', detail: 'Room 2', date: '2026-11-09', startMinute: 600, endMinute: 690 },
    { id: 'prepare', title: 'Prepare materials', date: '2026-11-10', startMinute: 540, endMinute: 660 },
    { id: 'paper', title: 'Paper circuits', detail: 'Workshop', date: '2026-11-11', startMinute: 600, endMinute: 750 },
    { id: 'mentors', title: 'Mentors', date: '2026-11-11', startMinute: 630, endMinute: 690 },
    { id: 'share', title: 'Share what worked', date: '2026-11-13', startMinute: 780, endMinute: 840 },
  ]);
  const [message, setMessage] = createSignal('Drag an event or its lower edge. Read-only calendars retain click callbacks.');
  return (
    <View className="flex-col gap-3">
      <WeekCalendar
        label="Workshop week"
        weekStart="2026-11-09"
        events={events}
        startMinute={480}
        endMinute={1080}
        hourHeight={42}
        height={470}
        today="2026-11-10"
        nowMinute={() => 615}
        onEventChange={(event: WeekEvent) => {
          setEvents(events().map((old: WeekEvent): WeekEvent => (old.id === event.id ? event : old)));
          setMessage('Updated ' + event.title);
        }}
        onEventClick={(id: string) => setMessage('Opened ' + id)}
      />
      <Text role="status" className={`text-[12px] text-${theme().mutedForeground}`}>
        {message()}
      </Text>
    </View>
  );
}
