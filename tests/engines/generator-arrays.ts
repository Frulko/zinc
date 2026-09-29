const original: number[] = [1,2];
function* arrays(): Generator<number[],number[]> { yield original; return original; }
const source=arrays(); const first=source.next();
if(!first.done){ console.log('same', first.value===original); first.value.push(3); }
console.log('original',original);
const last=source.next(); console.log('terminal',last.value===original,last.value);
const other=arrays().next(); console.log('boxed same',first.value===other.value);
function* receive(): Generator<number[],number[],number[]> { const next=yield original; next.push(4); return next; }
const receiver=receive(); receiver.next(); const sent:number[]=[7];console.log('sent',receiver.next(sent).value,sent);
const nested:number[][]=[[8]];
function* nests(): Generator<number[][]> { yield nested; }
const result=nests().next(); if(!result.done){result.value[0].push(9); console.log(result.value===nested,nested);}
function* owned(): Generator<number[]> { yield [32]; }
const retained = owned().next();
let total: i32 = 0;
for (let i: i32 = 0; i < 1500; i++) { const noise: string[] = ['noise ' + i]; total += noise.length; }
if (!retained.done) { retained.value.push(33); console.log('retained', retained.value, total); }
