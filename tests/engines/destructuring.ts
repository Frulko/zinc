import { value as left, bump, read } from './destructuring/left';
import * as right from './destructuring/right';
interface Leaf { text: string; code: i32 }
interface Item { count: i32; nested: Leaf }
let calls: i32 = 0;
function source(): Item { calls++; console.log('source', calls); return { count: 7, nested: { text: 'kept', code: 11 } }; }
console.log('before', left, right.value);
export let { count, nested: { text: word, code } } = source();
console.log('after', count, word, code, calls, right.label);
const numbers: i32[] = [4, 8, 12];
const [first, , third] = numbers;
const [one, [two, three]]: [i32, [i32, i32]] = [1, [2, 3]];
console.log('arrays', first, third, one, two, three);
function pair(): [() => i32, (n: i32) => void] {
  let n: i32 = 20;
  return [(): i32 => n, (value: i32): void => { n = value; }];
}
const [get, set] = pair();
set(29);
console.log('closures', get(), bump(), left, read(), right.value);
function mutate(): void { count += 2; word = word + '!'; }
mutate();
function churn(): void { for (let i: i32 = 0; i < 3000; i++) { const temp: Leaf = { text: 'garbage' + i, code: i }; if (temp.code < 0) console.log(temp.text); } }
churn();
console.log('retained', count, word, code, get(), calls);
