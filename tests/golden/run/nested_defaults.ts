function outer(): string {
 let calls = 0;
 function local(a: number = 3, values: number[] = []): string {
  calls++; values.push(a);
  return `${calls}|${a}|${values.length}`;
 }
 const alias = local;
 return [local(),alias(0),local(2,[9])].join(';');
}
console.log(outer());
function derived(): string {
 const offset = 1;
 function local(a: number = 4, b: number = a*2): number { return b+offset; }
 return [local(),local(0),local(2,0)].join(',');
}
console.log(derived());
