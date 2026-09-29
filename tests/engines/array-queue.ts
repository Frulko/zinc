const values: i32[] = [2, 3];
console.log('front', values.unshift(1), values.join(','), values.shift(), values.join(','));
const joined = values.concat([4, 5]);
console.log('concat', joined.join(','), values.join(','), joined === values);
console.log('self', values.concat(values).join(','), values.join(','));
const empty: i32[] = [];
const removed: i32 = empty.shift();
console.log('empty', removed, empty.length, empty.unshift(8), empty.shift(), empty.length);
console.log('empty concat', empty.concat(empty).length);
interface Item { value: string }
const first: Item = {value:'first'};
const references: Item[] = [first, {value:'second'}];
references.unshift(references[1]);
const root = references.shift();
console.log('refs', root.value, references[0] === first, references[1] === root);
const aliases = references.concat(references);
aliases[2].value = 'changed';
console.log('shared elements', references[0].value, aliases[0] === aliases[2]);
for (let i: i32 = 0; i < 2000; i++) {
  const temporary: Item[] = [{value:'garbage'}];
  temporary.unshift(first); temporary.shift(); const copied = temporary.concat(temporary);
}
console.log('retained', root.value, first.value, aliases[1].value);
const blanks: Item[] = [];
console.log('empty ref', blanks.shift() == null);
const strings: string[] = [], bools: boolean[] = [];
console.log('empty defaults', strings.shift() === '', strings.pop() === '', bools.shift() === false, empty.pop());
