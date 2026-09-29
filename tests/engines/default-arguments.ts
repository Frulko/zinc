let calls: i32 = 0;
function next(): i32 { calls++; return calls; }
function label(value: string, suffix: string = '!'): string { return value + suffix; }
function total(value: number, added: number = 7): number { return value + added; }
function fresh(value: i32 = next()): i32 { return value; }
console.log(label('hello'), label('hello', '?'), label('hello', undefined));
console.log(total(3), total(3, 9));
console.log(fresh(), fresh(20), fresh(), calls);
