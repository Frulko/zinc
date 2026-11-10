import { createSignal } from 'zinc:ui/solid';
import { env } from 'zinc:sys';
import { Metric, Tabs, Switch, theme, setTheme, LIGHT, DARK, heading } from 'zinc:ui/kit';
import { BuildChart } from './components/BuildChart';
import { ReleaseCalendar } from './components/ReleaseCalendar';
import { RunnerForm } from './components/RunnerForm';
import { Preferences } from './components/Preferences';
export function App(): i32 {
  const [period, setPeriod] = createSignal<i32>(0);
  const [dark, setDark] = createSignal(env('DASHBOARD_DARK') === '1');
  return <ScrollView className={`w-full h-full bg-${theme().background}`}>
    <View className="flex-col gap-6 p-4 md:p-6 xl:p-8">
      <View className="flex-row flex-wrap gap-4 items-center">
        <View className="grow flex-col gap-1">
          <Text className={heading(2)}>Workshop builds</Text>
          <Text className={`text-[13px] text-${theme().mutedForeground}`}>A small team's release desk · local sample data</Text>
        </View>
        <Switch label="Dark" checked={dark} onChange={(value: boolean) => { setDark(value); setTheme(value ? DARK : LIGHT); }} />
      </View>
      <Tabs label="Reporting period" items={['This week', 'Last week']} selected={period} onSelect={setPeriod} />
      <View className="flex-row flex-wrap gap-4">
        <Metric className="grow basis-[240px] min-w-0" label="Successful jobs" value={() => period() === 0 ? '248' : '221'} delta={() => period() === 0 ? 12.2 : 8.3} deltaLabel="% vs previous week" history={() => period() === 0 ? [24, 31, 28, 42, 49, 37, 37] : [21, 28, 26, 35, 43, 34, 34]} />
        <Metric className="grow basis-[240px] min-w-0" label="Median build" value={() => period() === 0 ? '3m 42s' : '4m 08s'} delta={() => period() === 0 ? -10.5 : -4.2} deltaLabel="% vs previous week" lowerIsBetter history={() => period() === 0 ? [4.5, 4.3, 4.4, 4.1, 3.9, 3.8, 3.7] : [4.9, 4.6, 4.7, 4.5, 4.3, 4.2, 4.1]} />
        <Metric className="grow basis-[240px] min-w-0" label="Failed jobs" value={() => period() === 0 ? '3' : '5'} delta={() => period() === 0 ? -2 : 1} deltaLabel="jobs vs previous week" lowerIsBetter history={() => period() === 0 ? [1, 0, 0, 1, 0, 1, 0] : [1, 1, 0, 1, 0, 1, 1]} />
      </View>
      <View className="flex-row flex-wrap items-start gap-6">
        <View className="flex-col grow-[1.4] basis-[520px] min-w-0 gap-6"><BuildChart period={period} /><ReleaseCalendar /></View>
        <View className="flex-col grow basis-[320px] min-w-0 gap-6"><RunnerForm /><Preferences /></View>
      </View>
      <Text className={`text-[12px] text-${theme().mutedForeground}`}>Changes reset when this window closes. No build server is contacted.</Text>
    </View>
  </ScrollView>;
}
