function two(n: number): string { return `${Math.floor(n)}`.padStart(2, '0'); }
const a = two(1);
console.log(a);
const b = two(25);
console.log(b);
const c = two(1) + ':' + two(2);
console.log(c);
