let count=0;
function mark(label:string):number { count++; console.log(label,count); return count; }
function add(a:number,b:number):number { return a+b; }
function* sequence():Generator<number,number,number> { const total=mark('before yield')+(yield 1); const call=add(mark('before argument'),yield 2); return total+call; }
const g=sequence();console.log(g.next());console.log('middle');console.log(g.next(10));console.log(g.next(20));
async function sequenceAsync():Promise<void> { console.log('sum',mark('before await')+await 3);console.log('args',add(mark('before await argument'),await 4)); }
sequenceAsync();console.log('sync');
function* aggregates():Generator<number,number,number> { const pair=[mark('array before'),yield 3]; const record={a:mark('object before'),b:yield 4}; const two=(yield 5)+(yield 6); return pair[0]+pair[1]+record.a+record.b+two; }
const a=aggregates();console.log(a.next(),a.next(30),a.next(40),a.next(50),a.next(60));
let operation=(n:number):number=>n+1;
function* callable():Generator<number,number,number>{return operation(yield 9);}
const cb=callable();console.log(cb.next());operation=(n:number):number=>n+10;console.log(cb.next(20));
