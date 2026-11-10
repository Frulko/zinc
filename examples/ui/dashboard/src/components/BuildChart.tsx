import { createSignal } from 'zinc:ui/solid';
import { Card, CardHeader, CardContent, Tabs, BarChart, theme } from 'zinc:ui/kit';
import { days, buildSeries } from '../data';
export function BuildChart(p: { period: () => i32 }): i32 {
  const [platform, setPlatform] = createSignal<i32>(0);
  const [selection, setSelection] = createSignal('Select a bar to inspect its build minutes.');
  const select = (index: i32, series: i32): void => {
    const item = buildSeries(p.period(), platform())[series];
    setSelection((p.period() === 0 ? 'This week · ' : 'Last week · ') + days[index] + ' · ' + item.name + ' · ' + String(item.values[index]) + ' minutes');
  };
  return <Card><CardHeader title="Build minutes" description={p.period() === 0 ? 'November 9–15 · time used by platform' : 'November 2–8 · time used by platform'} />
    <CardContent>
      <Tabs label="Chart platform" items={['All', 'Linux', 'macOS']} selected={platform} onSelect={(index: i32) => { setPlatform(index); setSelection('Select a bar to inspect its build minutes.'); }} />
      <BarChart label="Build minutes by platform and weekday" labels={days} series={() => buildSeries(p.period(), platform())} height={220} format={(value: number) => String(Math.round(value)) + 'm'} onSelect={select} />
      <Text role="status" className={`text-[12px] text-${theme().mutedForeground}`}>{selection()}</Text>
    </CardContent>
  </Card>;
}
