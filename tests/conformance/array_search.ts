// zinc-test: skip ps1
// (NaN has no fixed-point representation)
// Array search methods with their optional index arguments, SameValueZero includes, findLast / findLastIndex,
// reduceRight and fill ranges (ES2015-ES2023); found missing by zinc compat (test262 built-ins/Array).
const a = [1, 2, 3, 2, 1];
console.log(a.indexOf(2), a.indexOf(2, 2), a.indexOf(2, -2), a.indexOf(9), a.indexOf(1, 99), a.indexOf(1, -99));
console.log(a.lastIndexOf(2), a.lastIndexOf(2, 2), a.lastIndexOf(2, -3), a.lastIndexOf(1, -6), a.lastIndexOf(3, 99));
console.log(a.includes(3), a.includes(3, 3), a.includes(1, -1), a.includes(7));
const f = [NaN, 0.5, -0];
console.log(f.includes(NaN), f.indexOf(NaN), f.includes(0), f.lastIndexOf(0));
console.log(a.findLast(x => x > 1), a.findLastIndex(x => x > 1), a.findLastIndex(x => x > 5), a.findLast((x, i) => i < 2));
console.log(a.reduceRight((acc, x, i) => `${acc}${x}@${i} `, '>'), [[1, 2], [3]].reduceRight((acc: number[], x) => acc.concat(x), []).join());
const w = ['a', 'b', 'c', 'd'];
console.log(w.lastIndexOf('a'), w.includes('d', 3), w.findLast(s => s < 'c'));
console.log([0, 0, 0, 0, 0].fill(7, 1, 3).join(), [0, 0, 0].fill(1, -1).join(), [0, 0, 0].fill(2, 5).join(), [0, 0, 0].fill(3, 0, -2).join());
