import { Card, CardHeader, CardContent, DonutChart, Progress, theme } from 'zinc:ui/kit';
import { Transaction, spending, money } from '../data';
export function Spending(p: { rows: () => Transaction[]; onCategory: (value: string) => void }): i32 {
  const used = (): number => -p.rows().filter((t: Transaction) => t.cents < 0).reduce((sum: number, t: Transaction) => sum + t.cents, 0);
  return <Card><CardHeader title="Spending" description="Select a category to filter transactions below" /><CardContent>
    <DonutChart label="Spending by category" items={() => spending(p.rows())} height={188} format={money} onSelect={(index: i32, series: i32) => p.onCategory(spending(p.rows())[index].label)} />
    <View className="flex-col gap-2"><Text className={`text-[13px] text-${theme().foreground}`}>{money(used()) + ' of $1800.00 monthly budget'}</Text><Progress label="Monthly spending budget" value={() => Math.min(100, used() / 1800)} /><Text className={`text-[12px] text-${theme().mutedForeground}`}>{used() <= 180000 ? money(180000 - used()) + ' remaining in this account view' : money(used() - 180000) + ' over budget'}</Text></View>
  </CardContent></Card>;
}
