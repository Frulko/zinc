import { Candle, ChartItem } from 'zinc:ui/kit';
export interface Transaction { id: string; account: i32; month: i32; day: string; merchant: string; category: string; cents: number; note: string }
export const accounts = ['All accounts', 'Everyday', 'Reserve', 'Investments'];
export const categories = ['Housing', 'Food', 'Travel', 'Subscriptions'];
export const balances = [3013032, 628032, 1420000, 965000];
export const transactions: Transaction[] = [
  { id: 'n1', account: 1, month: 0, day: '2026-11-10', merchant: 'Cedar Studio', category: 'Income', cents: 320000, note: 'November salary · sample payroll' },
  { id: 'n2', account: 1, month: 0, day: '2026-11-09', merchant: 'Maple House', category: 'Housing', cents: -112000, note: 'Monthly rent · standing order' },
  { id: 'n3', account: 1, month: 0, day: '2026-11-08', merchant: 'Saturday Market', category: 'Food', cents: -6840, note: 'Weekly groceries · debit card' },
  { id: 'n4', account: 1, month: 0, day: '2026-11-07', merchant: 'City Rail', category: 'Travel', cents: -4800, note: 'Monthly commuter pass · debit card' },
  { id: 'n5', account: 1, month: 0, day: '2026-11-06', merchant: 'Paper Cloud', category: 'Subscriptions', cents: -1299, note: 'Storage subscription · debit card' },
  { id: 'n6', account: 1, month: 0, day: '2026-11-05', merchant: 'Corner Bakery', category: 'Food', cents: -1250, note: 'Lunch with a friend · debit card' },
  { id: 'n7', account: 2, month: 0, day: '2026-11-04', merchant: 'Reserve interest', category: 'Income', cents: 2450, note: 'Monthly interest · fictional rate' },
  { id: 'n8', account: 3, month: 0, day: '2026-11-03', merchant: 'North Fund', category: 'Income', cents: 7200, note: 'Sample dividend · no security is held' },
  { id: 'o1', account: 1, month: 1, day: '2026-10-30', merchant: 'Cedar Studio', category: 'Income', cents: 320000, note: 'October salary · sample payroll' },
  { id: 'o2', account: 1, month: 1, day: '2026-10-28', merchant: 'Maple House', category: 'Housing', cents: -112000, note: 'Monthly rent · standing order' },
  { id: 'o3', account: 1, month: 1, day: '2026-10-25', merchant: 'Saturday Market', category: 'Food', cents: -9420, note: 'Weekly groceries · debit card' },
  { id: 'o4', account: 1, month: 1, day: '2026-10-22', merchant: 'Coast Rail', category: 'Travel', cents: -8600, note: 'Weekend return ticket · debit card' },
  { id: 'o5', account: 1, month: 1, day: '2026-10-20', merchant: 'Paper Cloud', category: 'Subscriptions', cents: -1299, note: 'Storage subscription · debit card' },
  { id: 'o6', account: 2, month: 1, day: '2026-10-18', merchant: 'Reserve interest', category: 'Income', cents: 2380, note: 'Monthly interest · fictional rate' },
  { id: 'o7', account: 3, month: 1, day: '2026-10-15', merchant: 'North Fund', category: 'Income', cents: 6500, note: 'Sample dividend · no security is held' }
];
export function money(cents: number): string { return (cents < 0 ? '−$' : '$') + (Math.abs(cents) / 100).toFixed(2); }
export function accountTransactions(account: i32, month: i32): Transaction[] { return transactions.filter((t: Transaction) => t.month === month && (account === 0 || t.account === account)); }
export function spending(rows: Transaction[]): ChartItem[] {
  return categories.map((category: string, index: i32) => ({ label: category, value: -rows.filter((t: Transaction) => t.category === category).reduce((sum: number, t: Transaction) => sum + t.cents, 0), color: index === 0 ? 'accent' : index === 1 ? 'mutedForeground' : index === 2 ? 'border' : 'foreground' })).filter((item: ChartItem) => item.value > 0);
}
export function fundCandles(month: i32): Candle[] {
  const closes = month === 0 ? [102, 101, 104, 106, 105, 108, 109, 107, 110, 112] : [96, 98, 97, 99, 100, 98, 101, 103, 100, 102];
  return closes.map((close: number, i: i32) => ({ open: i === 0 ? close - 1 : closes[i - 1], high: Math.max(i === 0 ? close - 1 : closes[i - 1], close) + 2, low: Math.min(i === 0 ? close - 1 : closes[i - 1], close) - 2, close, volume: 100 + i * 17 }));
}
