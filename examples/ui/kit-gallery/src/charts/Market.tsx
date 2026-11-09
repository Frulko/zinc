import { createSignal } from 'zinc:ui/solid';
import { Button, Card, CardContent, CandlestickChart, ScatterChart, RadialGauge, Candle, ChartSeries, ScatterSeries } from 'zinc:ui/kit';
const prices: Candle[] = [
  { open: 42, high: 45, low: 41, close: 44, volume: 180 }, { open: 44, high: 46, low: 42, close: 43, volume: 140 },
  { open: 43, high: 47, low: 43, close: 46, volume: 210 }, { open: 46, high: 49, low: 44, close: 48, volume: 260 },
  { open: 48, high: 50, low: 46, close: 47, volume: 190 }, { open: 47, high: 48, low: 43, close: 44, volume: 170 },
  { open: 44, high: 47, low: 43, close: 46, volume: 200 }, { open: 46, high: 51, low: 45, close: 50, volume: 290 },
  { open: 50, high: 53, low: 49, close: 52, volume: 310 }, { open: 52, high: 54, low: 50, close: 51, volume: 230 },
  { open: 51, high: 55, low: 50, close: 54, volume: 320 }, { open: 54, high: 56, low: 52, close: 55, volume: 280 }
];
const average: ChartSeries[] = [{ name: '3-period average', values: [NaN, NaN, 44.3, 45.7, 47, 46.3, 45.7, 46.7, 49.3, 51, 52.3, 53.3] }];
const frames: ScatterSeries[] = [{ name: 'Software', points: [{ x: 100, y: 2.1 }, { x: 200, y: 3.7 }, { x: 400, y: 6.5 }, { x: 700, y: 10.2 }, { x: 1000, y: 14.3 }] }, { name: 'OpenGL', points: [{ x: 100, y: 1.2, size: 2 }, { x: 200, y: 1.6, size: 4 }, { x: 400, y: 2.3, size: 8 }, { x: 700, y: 3.2, size: 12 }, { x: 1000, y: 4.7, size: 16 }] }];
export function ChartsMarket(): i32 {
  const [load, setLoad] = createSignal<number>(76);
  return <View className="flex-col gap-4">
    <Button label="Change reported load" variant="outline" onClick={() => setLoad(load() === 76 ? 42 : 76)} />
    <View className="flex-row flex-wrap items-start gap-6">
      <Card className="w-full md:w-[480px] max-w-full"><CardContent><CandlestickChart label="NORTH · daily prices" candles={() => prices} labels={['Nov 2', '3', '4', '5', '6', '9', '10', '11', '12', '13', '16', '17']} overlays={() => average} format={(v: number) => '$' + v.toFixed(2)} /></CardContent></Card>
      <Card className="w-full md:w-[480px] max-w-full"><CardContent><ScatterChart label="Frame time by scene size" series={() => frames} xLabel="Nodes" yLabel="Frame time (ms)" format={(v: number) => v.toFixed(1) + ' ms'} /></CardContent></Card>
      <Card className="w-full md:w-[480px] max-w-full"><CardContent><RadialGauge label="CPU load" value={load} unit="%" bands={[{ to: 60, tone: 'success' }, { to: 85, tone: 'warning' }, { to: 100, tone: 'danger' }]} target={80} /></CardContent></Card>
      <Card className="w-full md:w-[480px] max-w-full"><CardContent><RadialGauge label="Disk occupancy" value={() => 68.4} unit="%" noNeedle ticks={-1} target={80} /></CardContent></Card>
    </View>
  </View>;
}
