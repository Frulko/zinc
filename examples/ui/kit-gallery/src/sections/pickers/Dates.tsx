import { createSignal } from 'zinc:ui/solid';
import { Calendar, RangeCalendar, DatePicker, DateRangePicker, TimePicker, TimeDial, WheelPicker, heading, theme } from 'zinc:ui/kit';
const [date, setDate] = createSignal('2026-11-09');
const [start, setStart] = createSignal('2026-11-12');
const [end, setEnd] = createSignal('2026-11-18');
const [time, setTime] = createSignal(14 * 60 + 30);
const [wheel, setWheel] = createSignal(2);
const range = (first: string, last: string): void => { setStart(first); setEnd(last); };
export function PickerDates(): i32 {
  return <View className="flex-col gap-6">
    <Text className={heading(3)}>Dates and time</Text>
    <View className="flex-row flex-wrap gap-6 items-start">
      <View className="flex-col gap-3"><Text className={`text-[13px] text-${theme().foreground}`}>Project review</Text><DatePicker label="Review date" value={date} onChange={setDate} today="2026-11-09" /><Calendar label="Review calendar" value={date} onChange={setDate} today="2026-11-09" min="2026-11-01" max="2027-01-31" /></View>
      <View className="flex-col gap-3"><Text className={`text-[13px] text-${theme().foreground}`}>Studio reservation</Text><DateRangePicker label="Reservation dates" value={start} end={end} onRangeChange={range} today="2026-11-09" /><RangeCalendar label="Reservation calendar" value={start} end={end} onRangeChange={range} today="2026-11-09" /></View>
      <View className="flex-col gap-3"><Text className={`text-[13px] text-${theme().foreground}`}>Arrival time</Text><TimePicker label="Arrival time" value={time} onChange={setTime} twelveHour={true} minuteStep={5} /><TimeDial label="Arrival dial" value={time} onChange={setTime} minuteStep={5} size={220} /></View>
      <View className="flex-col gap-3"><Text className={`text-[13px] text-${theme().foreground}`}>Guests</Text><WheelPicker label="Guests" items={['1 guest', '2 guests', '3 guests', '4 guests', '5 guests', '6 guests']} value={wheel} onChange={setWheel} width={120} /></View>
    </View>
    <Text className={`text-[12px] text-${theme().mutedForeground}`}>Calendar: arrows, Home/End, Page Up/Down · Shift changes year · Enter chooses.</Text>
  </View>;
}
