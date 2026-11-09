// The Quiet theme's gallery: the layout of CUI's components screen (github.com/yappologistic/CUI, MIT, docs/images/showcase/components.png),
// 1440 x 980, three columns of cards on the page colour.
import { theme } from 'zinc:ui/kit';
import { RunnerCard, NotifyCard, CacheCard } from './left';
import { StatsRow, CalendarCard, ChartCard } from './middle';
import { ReviewersCard, ReleaseCard, CoverageCard, MatrixCard } from './right';

export function Gallery(): i32 {
  return <View className={`flex-row items-start gap-[21px] h-full px-[41px] pt-[70px] bg-${theme().background}`}>
    <View className="flex-col gap-[21px] w-[405px]"><RunnerCard /><NotifyCard /><CacheCard /></View>
    <View className="flex-col gap-[21px] w-[506px]"><StatsRow /><CalendarCard /><ChartCard /></View>
    <View className="flex-col gap-[21px] w-[405px]"><ReviewersCard /><ReleaseCard /><CoverageCard /><MatrixCard /></View>
  </View>;
}
