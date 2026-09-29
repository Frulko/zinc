const values: i32[] = [0, 1, 2, 3, 4, 5];
console.log('middle', values.splice(1, 2), values);
console.log('negative', values.splice(-2, 1), values);
console.log('past end', values.splice(90, 2), values);
console.log('zero', values.splice(1, -1), values);
console.log('explicit undefined', values.splice(1, undefined), values);
console.log('tail', values.splice(1), values);
console.log('before start', values.splice(-99, 99), values);
console.log('empty', values.splice(-1), values);
const texts: string[] = ['keep', 'removed', 'last'];
const removed = texts.splice(1, 1);
removed[0] += '!';
console.log('independent', texts, removed);
const objects: { label: string }[] = [{ label: 'first' }, { label: 'retained' }, { label: 'third' }];
const keep = objects.splice(1, 1);
let sum: number = 0;
for (let n: i32 = 0; n < 3000; n++) {
  const temporary: { label: string }[] = [{ label: `one-${n}` }, { label: `two-${n}` }];
  const cut = temporary.splice(0, 1);
  sum += cut[0].label.length;
}
keep[0].label += '!';
console.log('collected', keep[0].label, objects[0].label, objects[1].label, removed[0], sum);
