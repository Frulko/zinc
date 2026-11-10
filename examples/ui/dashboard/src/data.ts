import { ChartSeries } from 'zinc:ui/kit';
export const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const slots = ['09:00', '11:30', '14:00', '16:30'];
export interface Runner { name: string; platform: string }
export function buildSeries(period: i32, platform: i32): ChartSeries[] {
  const values: ChartSeries[] = period === 0
    ? [{ name: 'Linux', values: [126, 142, 118, 167, 154, 45, 39] }, { name: 'macOS', values: [72, 85, 64, 93, 81, 22, 18] }]
    : [{ name: 'Linux', values: [110, 129, 101, 148, 133, 38, 32] }, { name: 'macOS', values: [68, 79, 59, 87, 76, 19, 16] }];
  return platform === 0 ? values : [values[platform - 1]];
}
