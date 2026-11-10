import { createSignal, createMemo } from 'zinc:ui/solid';
import { env } from 'zinc:sys';
import { Tabs, Switch, theme, setTheme, LIGHT, DARK, heading } from 'zinc:ui/kit';
import { accounts, accountTransactions, Transaction, money } from './data';
import { Accounts } from './components/Accounts';
import { Market } from './components/Market';
import { Spending } from './components/Spending';
import { Transactions } from './components/Transactions';
export function App(): i32 {
  const [account, setAccount] = createSignal<i32>(0), [month, setMonth] = createSignal<i32>(0);
  const [category, setCategory] = createSignal(''), [dark, setDark] = createSignal(env('FINANCE_DARK') === '1');
  const rows = createMemo(() => accountTransactions(account(), month()), [] as Transaction[]);
  const income = (): number => rows().filter((t: Transaction) => t.cents > 0).reduce((sum: number, t: Transaction) => sum + t.cents, 0);
  const outgoing = (): number => -rows().filter((t: Transaction) => t.cents < 0).reduce((sum: number, t: Transaction) => sum + t.cents, 0);
  return <ScrollView className={`w-full h-full bg-${theme().background}`}><View className="flex-col gap-6 p-4 md:p-6 xl:p-8">
    <View className="flex-row flex-wrap items-center gap-4"><View className="grow flex-col gap-1"><Text className={heading(2)}>Cedar Finance</Text><Text className={`text-[13px] text-${theme().mutedForeground}`}>A quieter view of your money · fictional local accounts</Text></View><Switch label="Dark" checked={dark} onChange={(value: boolean) => { setDark(value); setTheme(value ? DARK : LIGHT); }} /></View>
    <Accounts selected={account} onSelect={(index: i32) => { setAccount(index); setCategory(''); }} />
    <View className="flex-row flex-wrap gap-4 items-center"><Text className={`grow text-[15px] font-medium text-${theme().foreground}`}>{accounts[account()] + ' activity'}</Text><Tabs label="Activity month" items={['November', 'October']} selected={month} onSelect={(index: i32) => { setMonth(index); setCategory(''); }} /></View>
    <View className={`flex-row flex-wrap gap-x-12 gap-y-4 p-4 rounded-[18px] border border-${theme().border} bg-${theme().card}`}>
      <View className="grow basis-[180px] flex-col gap-2"><Text className={`text-[12px] text-${theme().mutedForeground}`}>Money in</Text><Text className={`text-[28px] tabular-nums text-${theme().foreground}`}>{money(income())}</Text></View>
      <View className="grow basis-[180px] flex-col gap-2"><Text className={`text-[12px] text-${theme().mutedForeground}`}>Money out</Text><Text className={`text-[28px] tabular-nums text-${theme().foreground}`}>{money(outgoing())}</Text></View>
      <View className="grow basis-[180px] flex-col gap-2"><Text className={`text-[12px] text-${theme().mutedForeground}`}>Net cash flow</Text><Text className={`text-[28px] tabular-nums text-${theme().foreground}`}>{money(income() - outgoing())}</Text></View>
    </View>
    <View className="flex-row flex-wrap items-start gap-6"><View className="grow-[1.4] basis-[480px] min-w-0"><Market month={month} /></View><View className="grow basis-[320px] min-w-0"><Spending rows={rows} onCategory={setCategory} /></View></View>
    <Transactions rows={rows} category={category} onCategory={setCategory} />
    <Text className={`text-[12px] text-${theme().mutedForeground}`}>USD sample data only. Balances are current snapshots; activity is filtered by month. No bank, trading, payment or storage service is connected. Changes reset on close.</Text>
  </View></ScrollView>;
}
