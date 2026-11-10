import { createSignal } from 'zinc:ui/solid';
import { Card, CardHeader, CardContent, CandlestickChart, theme } from 'zinc:ui/kit';
import { fundCandles } from '../data';
export function Market(p: { month: () => i32 }): i32 {
  const [selected, setSelected] = createSignal<i32>(-1);
  return <Card><CardHeader title="North Fund" description="Fictional unit prices · first ten trading sessions" /><CardContent>
    <CandlestickChart label="North Fund daily open, high, low and close" candles={() => fundCandles(p.month())} labels={['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']} height={208} format={(value: number) => '$' + value.toFixed(2)} onSelect={(index: i32, series: i32) => setSelected(index)} />
    <Text role="status" className={`text-[12px] text-${theme().mutedForeground}`}>{selected() < 0 ? 'Arrows inspect · Enter selects · +/− zoom · 0 fits' : (p.month() === 0 ? 'November' : 'October') + ' session ' + String(selected() + 1) + ' · close $' + fundCandles(p.month())[selected()].close.toFixed(2)}</Text>
  </CardContent></Card>;
}
