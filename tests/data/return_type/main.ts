import { equal } from 'zinc:assert';
function createValue() { return { value: 42, label: 'model', read: (): number => 42 }; }
type Value = ReturnType<typeof createValue>;
const result: Value = createValue();
equal(result.value, 42); equal(result.label, 'model'); equal(result.read(), 42);
type Named = (n: number) => { count: number };
const named: ReturnType<Named> = { count: 3 };
equal(named.count, 3);
type Extract<F extends () => number> = ReturnType<F>;
const extracted: Extract<() => number> = 4;
equal(extracted, 4);
const dynamic: ReturnType<any> = 5;
equal(typeof dynamic, 'number');
function identity<T>(value: T): T { return value; }
const unknownResult: ReturnType<typeof identity> = 'unknown result';
equal(typeof unknownResult, 'string');
function constrained<T extends number[]>(value: T): T { return value; }
const numbers: ReturnType<typeof constrained> = [1, 2];
equal(numbers[1], 2);
function boxed<T>(value: T) { return { value }; }
const box: ReturnType<typeof boxed> = { value: 7 };
equal(typeof box.value, 'number');
function noValue(): void {}
function runVoid(fn: () => ReturnType<typeof noValue>): void { fn(); }
runVoid(noValue);
console.log('return type: pass');
