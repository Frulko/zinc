// strings: string building (array-join, the portable way to avoid O(n^2)
// concatenation cost differences between engines) and splitting.
const N: i32 = 200000;

const parts: string[] = [];
for (let i: i32 = 0; i < N; i++) {
  parts.push(i.toString());
  parts.push(',');
}
const built: string = parts.join('');

const words: string[] = built.split(',');

let sum: number = 0;
for (const w of words) {
  if (w.length > 0) sum += w.length;
}

const sample: string = built.slice(0, 1000).toUpperCase();
let charSum: i32 = 0;
for (let i: i32 = 0; i < sample.length; i++) charSum += sample.charCodeAt(i);

console.log(built.length, words.length, sum, charSum);
