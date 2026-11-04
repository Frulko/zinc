export const ROW_HEIGHT: i32 = 52;
export const BACKGROUND: i32 = 0x161616;
export const THEME_IDS: string[] = ['heat', 'graphite', 'ocean', 'lime', 'candy'];
export const THEME_NAMES: string[] = ['Heat Map', 'Graphite', 'Ocean', 'Lime', 'Candy'];

const HEAT: string[] = ['#f51c16', '#f43c17', '#f45017', '#f86a16', '#f38316', '#f39717', '#efaa19', '#efb819', '#efc51c'];
const GRAPHITE: string[] = ['#34454e', '#3b4c55', '#42535c', '#495a63', '#50616a', '#576871', '#5e6f78', '#65767f', '#6c7d86'];
const OCEAN: string[] = ['#147cf9', '#1388fa', '#1193fa', '#119ff9', '#10aaf7', '#10b3f2', '#13bceb', '#1bc4e5', '#27ccdf'];
const LIME: string[] = ['#55a300', '#62ae00', '#71b800', '#80c200', '#91cb00', '#a0d300', '#b0dc00', '#bde200', '#cce900'];
const CANDY: string[] = ['#db2b71', '#e3357b', '#e83e85', '#ee488d', '#f15297', '#f45c9f', '#f768a9', '#f974b1', '#fb80ba'];

export function rowColor(theme: string, index: number, count: number): string {
  let palette = HEAT;
  if (theme === 'graphite') palette = GRAPHITE;
  else if (theme === 'ocean') palette = OCEAN;
  else if (theme === 'lime') palette = LIME;
  else if (theme === 'candy') palette = CANDY;
  const position = Math.max(0, Math.min(8, Math.round(index * 8 / Math.max(1, count - 1))));
  return palette[position];
}
