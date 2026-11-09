// The gallery's middle column: two metrics with sparklines, a date and time picker, a grouped bar chart (CUI's components screen).
import * as ui from 'zinc:ui';
import { createSignal } from 'zinc:ui/solid';
import { stroke, rrect } from 'zinc:gfx';
import { Card, CardHeader, CardContent, Button, theme, themeColor } from 'zinc:ui/kit';
import { Label, Body, Muted, RoleIcon, Surface } from './parts';

/** CUI's first two chart series (blue, orange), tuned per scheme; the kit's charts (ZN-1078.15) will carry them as theme tokens. */
function series(i: i32): i32 {
  const dark = ui.currentScheme() === 'dark';
  return i === 0 ? (dark ? 0x4892ed : 0x2a78d6) : (dark ? 0xe8672e : 0xeb6834);
}
function hex(c: i32): string { let s = (c & 0xffffff).toString(16); while (s.length < 6) s = '0' + s; return '[#' + s + ']'; }

/** A line over the values, scaled between their smallest and largest, with a dot where it ends. */
function Sparkline(props: { values: number[]; color: () => i32 }): i32 {
  return <Canvas className="h-[44px] w-full" onDraw={(x: i32, y: i32, w: i32, h: i32) => {
    let lo = props.values[0], hi = props.values[0];
    for (const v of props.values) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    const pts: number[] = [], step = (w - 6) / (props.values.length - 1);
    for (let i = 0; i < props.values.length; i++) { pts.push(x + 2 + i * step); pts.push(y + h - 4 - (props.values[i] - lo) / (hi - lo) * (h - 8)); }
    stroke(pts, 1.75, props.color() as u32, 255, false);
    rrect(pts[pts.length - 2] - 3, pts[pts.length - 1] - 3, 6, 6, 3, props.color() as u32, 255);
  }} />;
}

/** A metric: what it measures, the value, the change with its baseline (green when it is good news), the trend. */
function StatCard(props: { icon: string; label: string; value: string; delta: string; good: boolean; values: number[] }): i32 {
  const t = theme();
  return <Surface className="grow basis-0 gap-2 pb-4">
    <View className="flex-row items-center gap-2"><RoleIcon name={props.icon} role="mutedForeground" /><Muted text={props.label} /></View>
    <View className="flex-row items-center gap-2">
      <Text className={`text-[28px] font-medium tabular-nums text-${t.foreground}`}>{props.value}</Text>
      <RoleIcon name={props.good ? 'trending-down' : 'trending-up'} size={14} role={props.good ? 'success' : 'destructive'} />
      <Text className={`text-[13px] tabular-nums text-${props.good ? t.success : t.destructive}`}>{props.delta}</Text>
    </View>
    <Sparkline values={props.values} color={() => props.good ? series(0) : themeColor('destructive')} />
  </Surface>;
}

export function StatsRow(): i32 {
  return <View className="flex-row gap-[21px]">
    <StatCard icon="clock" label="Median build, 30 days" value="3m 42s" delta="-17.6%" good={true} values={[9, 7.2, 8, 6.4, 6.6, 5.4, 5, 4.2, 4.6, 3.3]} />
    <StatCard icon="triangle-alert" label="Flaky tests" value="7" delta="+2 this week" good={false} values={[2, 3, 2.1, 4, 3.1, 5, 4.2, 5.2, 6, 6]} />
  </View>;
}

// ---- the calendar: November 2026 starts on a Sunday; weeks begin on Monday
const WEEKDAYS: string[] = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
/** The 42 days shown: 26 to 31 October, November, then 1 to 6 December. */
const DAYS: i32[] = [];
for (let d = 26; d <= 31; d++) DAYS.push(-d);
for (let d = 1; d <= 30; d++) DAYS.push(d);
for (let d = 1; d <= 6; d++) DAYS.push(-d);
const WEEKS: i32[] = [0, 1, 2, 3, 4, 5];
const TODAY: i32 = 5;
const [picked, setPicked] = createSignal<i32>(17);
const SLOTS: string[] = ['09:00', '11:30', '14:00', '16:30'];
const [slot, setSlot] = createSignal<i32>(1);

/** One day: a number in a 36 px circle; today ringed, the picked day filled, the days of other months quiet. */
function Day(props: { day: i32 }): i32 {
  const t = theme(), inMonth = props.day > 0, on = (): boolean => picked() === props.day;
  const ring = inMonth && props.day === TODAY ? `border border-${t.input}` : '';
  return <View role="button" focusable onClick={() => { if (inMonth) setPicked(props.day); }}
    className={`w-[36px] h-[36px] items-center justify-center rounded-full ${ring} ${on() ? 'bg-' + t.primary : ''}`}>
    <Text className={`text-[13px] tabular-nums text-${on() ? t.primaryForeground : inMonth ? t.foreground : t.mutedForeground}`}>{'' + Math.abs(props.day)}</Text>
  </View>;
}

export function CalendarCard(): i32 {
  return <Surface className="flex-row gap-6 px-7">
    <View className="flex-col">
      <View className="flex-row items-center h-[36px] pr-1">
        <Label text="November 2026" className="grow text-[15px]" />
        <Button variant="ghost" size="icon" className="w-[30px] h-[30px]"><RoleIcon name="chevron-left" /></Button>
        <Button variant="ghost" size="icon" className="w-[30px] h-[30px]"><RoleIcon name="chevron-right" /></Button>
      </View>
      <View className="flex-row">{WEEKDAYS.map((w: string) => <Muted text={w} className="w-[36px] text-center" />)}</View>
      {WEEKS.map((wk: i32) => <View className="flex-row">{DAYS.slice(wk * 7, wk * 7 + 7).map((d: i32) => <Day day={d} />)}</View>)}
    </View>
    <View className="flex-col gap-3 grow basis-0 pt-2">
      <Label text="Release 2.4" className="text-[15px]" />
      <Muted text="Pick a window while the on-call team is in." />
      <View className="flex-col gap-2 pt-3">
        {SLOTS.map((s: string, i: i32) => <Button label={s} variant={slot() === i ? 'default' : 'outline'} className="w-full" onClick={() => setSlot(i)} />)}
      </View>
    </View>
  </Surface>;
}

// ---- build minutes, Linux and Windows, Monday to Sunday
const LINUX: number[] = [410, 485, 365, 530, 470, 95, 75];
const WINDOWS: number[] = [235, 300, 255, 325, 290, 40, 35];
const DAY_NAMES: string[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const TICKS: number[] = [600, 500, 400, 300, 200, 100, 0];
const PLOT_H: number = 180;

function LegendKey(props: { label: string; index: i32 }): i32 {
  return <View className="flex-row items-center gap-1.5">
    <View className={`w-[9px] h-[9px] rounded-[2px] bg-${hex(series(props.index))}`} />
    <Body text={props.label} />
  </View>;
}

export function ChartCard(): i32 {
  const t = theme();
  return <Card>
    <CardHeader title="Build minutes" description="Linux and Windows runners, last 7 days" />
    <CardContent className="gap-3">
      <View className="flex-row gap-5"><LegendKey label="Linux" index={0} /><LegendKey label="Windows" index={1} /></View>
      <View className={`flex-row h-[${PLOT_H + 24}px]`}>
        <View className="flex-col justify-between w-[36px] h-[192px] -mt-[6px]">
          {TICKS.map((v: number) => <Muted text={'' + v} small={true} className="tabular-nums" />)}
        </View>
        <View className="grow">
          {TICKS.map((v: number, i: i32) => <View className={`absolute left-0 right-0 h-px bg-${t.border} top-[${Math.round(i * PLOT_H / 6)}px]`} />)}
          <View className={`flex-row h-[${PLOT_H}px] items-end`}>
            {DAY_NAMES.map((d: string, i: i32) => <View className="flex-row grow basis-0 items-end justify-center gap-[6px]">
              <View className={`w-[18px] rounded-t-[3px] bg-${hex(series(0))} h-[${Math.round(LINUX[i] / 600 * PLOT_H)}px]`} />
              <View className={`w-[18px] rounded-t-[3px] bg-${hex(series(1))} h-[${Math.round(WINDOWS[i] / 600 * PLOT_H)}px]`} />
            </View>)}
          </View>
          <View className="flex-row pt-2">{DAY_NAMES.map((d: string) => <Muted text={d} className="grow basis-0 text-center" />)}</View>
        </View>
      </View>
    </CardContent>
  </Card>;
}
