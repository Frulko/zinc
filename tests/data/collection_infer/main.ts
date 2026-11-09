import { equal, ok } from 'zinc:assert';
const groups = ['faces', 'people', 'faces'];
const unique = new Set(groups); equal(unique.size, 2); equal(unique.values().join(','), 'faces,people');
const copy = new Set(unique); copy.add('animals'); equal(unique.size, 2); equal(copy.size, 3);
const numbers: (number | null)[] = [1, null, 2]; const nullable = new Set(numbers); equal(nullable.size, 3); ok(nullable.has(null));
const empty: Set<string> = new Set(); const typed = new Set<string>([]); equal(empty.size + typed.size, 0);
const emptyNull = new Set<string>(null); const emptyUndef: Set<string> = new Set(undefined); equal(emptyNull.size + emptyUndef.size, 0);
const annotated: Set<number | null> = new Set([1, null]); equal(annotated.size, 2);
const chars = new Set('aab'); equal(chars.values().join(''), 'ab');
const entries: [string, i32][] = [['a', 1], ['b', 2], ['a', 3]];
const map = new Map(entries); equal(map.size, 2); equal(map.get('a') ?? -1, 3); equal(map.keys().join(','), 'a,b');
const literal = new Map([['left', 4], ['right', 5]]); equal(literal.get('left') ?? -1, 4);
const mapCopy = new Map(map); mapCopy.set('c', 6); equal(map.size, 2); equal(mapCopy.size, 3);
const emptyMap: Map<string, number> = new Map([]); equal(emptyMap.size, 0);
const mapNull = new Map<string, number>(null); const mapUndef: Map<string, number> = new Map(undefined); equal(mapNull.size + mapUndef.size, 0);
const typedMap: Map<string, number> = new Map([['a', 8]]); equal(typedMap.get('a') ?? -1, 8);
let yielded: i32 = 0, closed: i32 = 0;
function* values(): Generator<number> { try { yielded++; yield 7; yielded++; yield 8; } finally { closed++; } }
const generated = new Set(values()); equal(generated.size, 2); equal(yielded, 2); equal(closed, 1);
class IterableNumbers { [Symbol.iterator](): Generator<number> { return values(); } }
const custom = new Set(new IterableNumbers()); equal(custom.size, 2); equal(yielded, 4); equal(closed, 2);
function* pairs(): Generator<[string, number]> { yield ['one', 1]; yield ['two', 2]; }
const generatedMap = new Map(pairs()); equal(generatedMap.get('two') ?? -1, 2);
const entrySet = new Set<[string, i32]>(entries); const setMap = new Map(entrySet); equal(setMap.get('a') ?? -1, 3);
let calls: i32 = 0;
function getGroups(): string[] { calls++; return groups; }
const once = new Set(getGroups()); equal(once.size, 2); equal(calls, 1, 'iterable evaluated once');
console.log('collection inference: pass');
