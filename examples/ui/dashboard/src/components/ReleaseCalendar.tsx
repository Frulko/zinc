import { createSignal } from 'zinc:ui/solid';
import { Card, CardHeader, CardContent, Calendar, Tabs, Button, theme } from 'zinc:ui/kit';
import { slots } from '../data';
export function ReleaseCalendar(): i32 {
  const [date, setDate] = createSignal('2026-11-17');
  const [slot, setSlot] = createSignal<i32>(1);
  const [booked, setBooked] = createSignal('');
  const [notice, setNotice] = createSignal('Choose a date and time, then reserve it locally.');
  return <Card><CardHeader title="Release window" description="Workshop 1.8 · reserve time for the team review" />
    <CardContent>
      <View className="flex-row flex-wrap items-start gap-6">
        <View className="grow basis-[260px] min-w-0"><Calendar label="Release date" value={date} onChange={setDate} today="2026-11-10" min="2026-11-10" max="2027-01-31" /></View>
        <View className="grow basis-[180px] min-w-0 flex-col gap-4">
          <Text className={`text-[13px] text-${theme().foreground}`}>{date()}</Text>
          <Tabs label="Release time" items={slots} selected={slot} onSelect={setSlot} className="flex-wrap" />
          <Button label="Reserve window" variant="outline" onClick={() => { const value = date() + ' at ' + slots[slot()]; setBooked(value); setNotice('Reserved ' + value); }} />
          <Button label="Cancel reservation" variant="ghost" disabled={booked() === ''} onClick={() => { setBooked(''); setNotice('Reservation cancelled'); }} />
        </View>
      </View>
      <Text role="status" className={`text-[12px] text-${theme().mutedForeground}`}>{notice()}</Text>
    </CardContent>
  </Card>;
}
