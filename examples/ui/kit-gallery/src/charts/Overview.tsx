import { createSignal } from 'zinc:ui/solid';
import { Card, CardContent, Button, LineChart, AreaChart, BarChart, DonutChart, Sparkline, Gauge, ChartSeries, ChartItem, theme } from 'zinc:ui/kit';
const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const builds: ChartSeries[] = [{ name: 'Linux', values: [410, 490, 365, 535, 475, 98, 76] }, { name: 'Windows', values: [235, 300, 255, 330, 290, 42, 38] }];
const duration: ChartSeries[] = [{ name: 'Build minutes', values: [5.1, 4.7, 4.9, 4.4, 4.3, 4.1, 3.7] }];
const platforms: ChartItem[] = [{ label: 'Linux', value: 62 }, { label: 'Windows', value: 24 }, { label: 'macOS', value: 14 }];
export function ChartsOverview(): i32 {
  const [empty, setEmpty] = createSignal(false), [selection, setSelection] = createSignal('Select a data point with Enter or a click.');
  return <View className="flex-col gap-4">
    <View className="flex-row flex-wrap items-center gap-3"><Button label={empty() ? 'Restore samples' : 'Clear samples'} variant="outline" onClick={() => setEmpty(!empty())} /><Text className={`text-[12px] text-${theme().mutedForeground}`}>{selection()}</Text></View>
    <View className="flex-row flex-wrap items-start gap-6">
      <Card className="w-full md:w-[480px] max-w-full"><CardContent><LineChart label="Median build duration · last seven days" series={() => empty() ? [] : duration} labels={days} smooth format={(v: number) => v.toFixed(1) + 'm'} onSelect={(i: i32, s: i32) => setSelection(days[i] + ' selected')} /></CardContent></Card>
      <Card className="w-full md:w-[480px] max-w-full"><CardContent><AreaChart label="Runner utilization" series={() => empty() ? [] : [{ name: 'Busy runners', values: [14, 21, 17, 25, 20, 11, 8] }]} labels={days} min={0} max={30} /></CardContent></Card>
      <Card className="w-full md:w-[480px] max-w-full"><CardContent><BarChart label="Build minutes by platform" series={() => empty() ? [] : builds} labels={days} stacked onSelect={(i: i32, s: i32) => setSelection(days[i] + ' builds selected')} /></CardContent></Card>
      <Card className="w-full md:w-[480px] max-w-full"><CardContent><DonutChart label="Completed jobs by platform" items={() => empty() ? [] : platforms} onSelect={(i: i32, s: i32) => setSelection(platforms[i].label + ' selected')} /></CardContent></Card>
      <Card className="w-full md:w-[480px] max-w-full"><CardContent><Text className={`text-[13px] font-medium text-${theme().foreground}`}>Build duration trend</Text><Text className={`text-[28px] tabular-nums text-${theme().foreground}`}>3m 42s</Text><Text className={`text-[12px] text-${theme().success}`}>−17.6% compared with last month</Text><Sparkline label="Build duration history" values={() => empty() ? [] : [5.1, 4.7, 4.9, 4.4, 4.3, 4.1, 3.7]} height={80} /></CardContent></Card>
      <Card className="w-full md:w-[480px] max-w-full"><CardContent><Gauge label="Cache occupancy" value={() => empty() ? 0 : 68.4} unit="%" /></CardContent></Card>
    </View>
  </View>;
}
