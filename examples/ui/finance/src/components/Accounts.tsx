import { Button, theme } from 'zinc:ui/kit';
import { accounts, balances, money } from '../data';
export function Accounts(p: { selected: () => i32; onSelect: (index: i32) => void }): i32 {
  return <View className="flex-row flex-wrap gap-3">
    {accounts.map((name: string, index: i32) => <Button variant="outline" pressed={p.selected() === index} ariaLabel={'Show ' + name} onClick={() => p.onSelect(index)} className={`grow basis-[220px] min-w-0 h-[92px] justify-start ${p.selected() === index ? 'border-' + theme().accent : ''}`}>
      <View className="flex-col gap-2"><Text className={`text-[12px] text-${p.selected() === index ? theme().accent : theme().mutedForeground}`}>{name}</Text><Text className={`text-[22px] tabular-nums font-medium text-${theme().foreground}`}>{money(balances[index])}</Text></View>
    </Button>)}
  </View>;
}
