function outer(): number {
 function f(a: number, people: number[] = []): number { return people.length + a; }
 return f(1);
}
function outer2(): number {
 let t = 0;
 function f(a: number, k: number = 5): void { t += k + a; }
 f(1);
 return t;
}
console.log(outer2());
console.log(outer());
