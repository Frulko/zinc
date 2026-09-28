// Collections: Map and Set keep insertion order, object literals are checked against interfaces.
import { section } from '../report';

interface Point {
  x: number;
  y: number;
}

/** How many times each word appears, in order of first appearance. */
function wordCounts(sentence: string): Map<string, i32> {
  const counts: Map<string, i32> = new Map<string, i32>();
  for (const word of sentence.split(' ')) {
    const previous: i32 = counts.get(word) ?? 0;
    counts.set(word, previous + 1);
  }
  return counts;
}

export function collections(): void {
  section('Map and Set');
  const points = new Map<string, Point>();
  points.set('a', { x: 1, y: 2 });
  points.set('b', { x: 3, y: 4 });
  points.delete('a');
  points.set('c', { x: 5, y: 6 });
  for (const [key, point] of points) console.log(key, point);

  const seen = new Set<i32>();
  for (const value of [3, 1, 3, 2, 1]) seen.add(value);
  console.log('set', seen.size, seen.has(2), seen.values());

  const counts = wordCounts('the cat the hat the end');
  console.log(counts.keys(), counts.values());
}
