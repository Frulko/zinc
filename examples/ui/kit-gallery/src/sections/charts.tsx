import { env } from 'zinc:sys';
import { heading, theme } from 'zinc:ui/kit';
import { ChartsOverview } from '../charts/Overview';
import { ChartsDistributions } from '../charts/Distributions';
import { ChartsMarket } from '../charts/Market';
export function ChartsSection(): i32 {
  const page = env('GALLERY');
  return <View className="flex-col gap-6">
    <Text className={heading(3)}>Charts</Text>
    <Text className={`text-[13px] text-${theme().mutedForeground}`}>Tab to a chart. Arrows inspect, Enter selects. Focus the price chart to zoom with + / −, fit with 0, or pan with a drag.</Text>
    <Show when={page === '' || page === 'charts' || page === 'charts-overview'}><ChartsOverview /></Show>
    <Show when={page === '' || page === 'charts' || page === 'charts-distributions'}><ChartsDistributions /></Show>
    <Show when={page === '' || page === 'charts' || page === 'charts-market'}><ChartsMarket /></Show>
  </View>;
}
