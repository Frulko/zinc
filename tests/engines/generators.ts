function* range(n: i32): Generator<i32> {
  console.log('start generator', n);
  for (let i: i32 = 0; i < n; i++) yield i * i;
}
function* broken(): Generator<string> {
  const kept = { value: 'kept' };
  yield kept.value;
  throw new Error('generator failure');
}
const values = range(5);
console.log('created');
let sum: i32 = 0;
for (const value of values) sum += value;
console.log('sum', sum);
for (const value of values) console.log('unexpected', value);
function consumeBroken(): void { for (const value of broken()) console.log('value', value); }
try { consumeBroken(); }
catch (error) { console.log('caught', error.message); }
function* churn(): Generator<string> {
  const retained = { text: 'alive' };
  for (let i = 0; i < 3000; i++) {
    const text = 'item:' + i;
    yield text;
    if (retained.text !== 'alive') throw new Error('lost root');
  }
}
let count: i32 = 0;
for (const text of churn()) { if (text === 'item:' + count) count++; }
console.log('collected', count);
