import { Card, CardContent, Heatmap, Treemap, RadarChart, Funnel, Waffle, Sankey, ChartItem, ChartSeries, SankeyLink } from 'zinc:ui/kit';
const modules: ChartItem[] = [{ label: 'Layout', value: 55 }, { label: 'Text', value: 42 }, { label: 'Drawing', value: 35 }, { label: 'Input', value: 24 }, { label: 'Assets', value: 18 }, { label: 'Audio', value: 9 }];
const stages: ChartItem[] = [{ label: 'Visited', value: 12840 }, { label: 'Signed up', value: 4210 }, { label: 'Activated', value: 2380 }, { label: 'Subscribed', value: 860 }];
const sources = ['Search', 'Social', 'Referral', 'Sign up', 'Bounced', 'Trial', 'Paid', 'Churned'];
const links: SankeyLink[] = [{ from: 0, to: 3, value: 420 }, { from: 1, to: 3, value: 260 }, { from: 2, to: 3, value: 180 }, { from: 0, to: 4, value: 120 }, { from: 1, to: 4, value: 90 }, { from: 3, to: 5, value: 860 }, { from: 5, to: 6, value: 580 }, { from: 5, to: 7, value: 280 }];
const releases: ChartSeries[] = [{ name: '2.3', values: [72, 84, 68, 78, 91] }, { name: '2.4', values: [88, 91, 80, 89, 94] }];
const traffic = [12, 20, 34, 28, 18, 10, 18, 35, 48, 42, 31, 14, 23, 30, 66, 55, 39, 20, 20, 28, 52, 48, 25, 18, 17, 25, 41, 36, 28, 13];
export function ChartsDistributions(): i32 {
  return <View className="flex-row flex-wrap items-start gap-6">
    <Card className="w-full md:w-[480px] max-w-full"><CardContent><Heatmap label="Runner traffic by weekday" values={() => traffic} rows={5} columns={6} rowLabels={['Mon', 'Tue', 'Wed', 'Thu', 'Fri']} columnLabels={['00', '04', '08', '12', '16', '20']} format={(v: number) => String(v) + ' jobs'} /></CardContent></Card>
    <Card className="w-full md:w-[480px] max-w-full"><CardContent><Treemap label="Bundle size by module" items={() => modules} format={(v: number) => String(v) + ' KB'} /></CardContent></Card>
    <Card className="w-full md:w-[480px] max-w-full"><CardContent><RadarChart label="Release readiness" series={() => releases} axes={['Speed', 'Coverage', 'Size', 'Stability', 'Access']} max={100} /></CardContent></Card>
    <Card className="w-full md:w-[480px] max-w-full"><CardContent><Funnel label="Project activation" items={() => stages} /></CardContent></Card>
    <Card className="w-full md:w-[480px] max-w-full"><CardContent><Waffle label="Installed platforms · 100 machines" items={() => [{ label: 'Linux', value: 62 }, { label: 'Windows', value: 24 }, { label: 'macOS', value: 14 }]} /></CardContent></Card>
    <Card className="w-full md:w-[480px] max-w-full"><CardContent><Sankey label="From first visit to paid project" nodes={sources} links={() => links} /></CardContent></Card>
  </View>;
}
