// dynsum: the Dyn kernel: parse a JSON document into dynamic values and walk it (any, JSON.parse, property reads, `for...of`).
const parts: string[] = [];
for (let i = 0; i < 2000; i++) parts.push(`{"id":${i},"v":${i % 17},"tags":["a","b"]}`);
const text = '[' + parts.join(',') + ']';
let total = 0;
for (let r = 0; r < 20; r++) {
  const d: any = JSON.parse(text);
  for (const o of d) total += o.v + o.tags.length;
}
console.log(total);
