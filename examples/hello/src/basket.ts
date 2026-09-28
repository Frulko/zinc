// A shopping basket: arrays of typed records, map / filter, loops, and a Map used as a tally.

export interface Item {
  name: string;
  aisle: string;
  priceCents: i32;
}

export const BASKET: Item[] = [
  { name: 'apples', aisle: 'fruit', priceCents: 320 },
  { name: 'bread', aisle: 'bakery', priceCents: 250 },
  { name: 'pears', aisle: 'fruit', priceCents: 410 },
  { name: 'milk', aisle: 'dairy', priceCents: 115 },
  { name: 'cherries', aisle: 'fruit', priceCents: 690 },
];

/** Sum of the prices, in cents (integers: no rounding surprises). */
export function totalCents(items: Item[]): i32 {
  let sum: i32 = 0;
  for (const item of items) sum += item.priceCents;
  return sum;
}

/** Names of the items that cost more than `cents`. */
export function pricierThan(items: Item[], cents: i32): string[] {
  return items.filter((item: Item) => item.priceCents > cents).map((item: Item) => item.name);
}

/** How many items come from each aisle, in order of first appearance. */
export function countByAisle(items: Item[]): Map<string, i32> {
  const counts: Map<string, i32> = new Map<string, i32>();
  for (const item of items) {
    const previous: i32 = counts.get(item.aisle) ?? 0;
    counts.set(item.aisle, previous + 1);
  }
  return counts;
}

/** 1234 -> "12.34" */
export function euros(cents: i32): string {
  const whole = Math.floor(cents / 100);
  const rest = `${cents % 100}`.padStart(2, '0');
  return `${whole}.${rest}`;
}
