// The Quiet theme's gallery: a components screen,
// Columns wrap with the available width; every card stays reachable in the page scroll.
import { theme } from 'zinc:ui/kit';
import { RunnerCard, NotifyCard, CacheCard } from './left';
import { StatsRow, CalendarCard, ChartCard } from './middle';
import { ReviewersCard, ReleaseCard, CoverageCard, MatrixCard } from './right';

export function Gallery(): i32 {
  return <ScrollView className={`h-full bg-${theme().background}`}><View className="flex-row flex-wrap items-start gap-[21px] p-4 md:p-6 xl:px-[41px] xl:pt-[70px] xl:pb-6">
    <View className="flex-col gap-[21px] grow basis-[300px] min-w-0"><RunnerCard /><NotifyCard /><CacheCard /></View>
    <View className="flex-col gap-[21px] grow-[1.25] basis-[380px] min-w-0"><StatsRow /><CalendarCard /><ChartCard /></View>
    <View className="flex-col gap-[21px] grow basis-[300px] min-w-0"><ReviewersCard /><ReleaseCard /><CoverageCard /><MatrixCard /></View>
  </View></ScrollView>;
}
