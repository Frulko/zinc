import { equal, ok } from 'zinc:assert';
interface Key { id: string; }
interface Track { keys: Key[]; names: string[]; numbers: number[]; }
let receivers = 0, argumentsMade = 0, callbacks = 0;
function track(present: boolean): Track | undefined {
  receivers++;
  return present ? { keys: [{ id: 'a' }, { id: 'b' }], names: ['a', 'b'], numbers: [1, 2, 3] } : undefined;
}
function predicate(): (key: Key) => boolean { argumentsMade++; return (key: Key): boolean => { callbacks++; return key.id === 'b'; }; }
equal(track(false)?.keys.find(predicate()), undefined);
equal(receivers, 1); equal(argumentsMade, 0); equal(callbacks, 0);
equal(track(true)?.keys.find(predicate())?.id, 'b');
equal(receivers, 2); equal(argumentsMade, 1); equal(callbacks, 2);
equal(track(false)?.numbers.reduce((sum: number, n: number): number => sum + n, 0), undefined);
equal(track(true)?.numbers.reduce((sum: number, n: number): number => sum + n, 0), 6);
equal(track(true)?.numbers.map((n: number): number => n * 2).filter((n: number): boolean => n > 2).join(','), '4,6');
equal(track(false)?.numbers.map((n: number): number => n * 2).filter((n: number): boolean => n > 2).length, undefined);
equal(track(true)?.numbers.flatMap((n: number): number[] => [n, n]).length, 6);
equal(track(true)?.numbers.some((n: number): boolean => n === 2), true);
equal(track(false)?.numbers.every((n: number): boolean => n > 0), undefined);
track(false)?.numbers.forEach((n: number): void => { callbacks++; }); equal(callbacks, 2);
track(true)?.numbers.forEach((n: number): void => { callbacks++; }); equal(callbacks, 5);
function separator(): string { argumentsMade++; return '/'; }
equal(track(false)?.names.join(separator()), undefined); equal(argumentsMade, 1);
equal(track(true)?.names.join(separator()), 'a/b'); equal(argumentsMade, 2);
equal(track(true)?.keys.values().length, 2); equal(track(false)?.keys.values().length, undefined);
equal(track(true)?.keys.entries()[1][1].id, 'b');
const values: Key[] | null = track(true)?.keys ?? null;
equal(values?.find((key: Key): boolean => key.id === 'a')?.id, 'a');
function absentKeys(): Key[] | null { return null; }
const missing: Key[] | null = absentKeys();
equal(missing?.find(predicate()), undefined); equal(argumentsMade, 2);
function map(present: boolean): Map<string, number> | undefined { return present ? new Map<string, number>([['a', 2], ['b', 3]]) : undefined; }
function set(present: boolean): Set<string> | undefined { return present ? new Set<string>(['a', 'b']) : undefined; }
let total = 0;
map(false)?.forEach((value: number): void => { total += value; }); equal(total, 0);
map(true)?.forEach((value: number): void => { total += value; }); equal(total, 5);
equal(map(true)?.entries().length, 2); equal(map(false)?.entries().length, undefined);
equal(set(true)?.entries().length, 2); equal(set(false)?.keys().length, undefined);
let thrown = false;
try { track(true)?.numbers.find((value: number): boolean => { throw new Error('callback'); }); } catch (error) { thrown = true; }
ok(thrown);
console.log('optional collection: pass');
