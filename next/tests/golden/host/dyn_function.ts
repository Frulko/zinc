// DynFunction (ZN-168): typed functions passed where zinc:script wants a host function get an adapter that converts the dynamic arguments like JavaScript
const fns: DynFunction[] = [];
function call(f: DynFunction, a: unknown[]): unknown { return f(a); }
const logged: string[] = [];
fns.push((msg: string) => { logged.push(msg); });
fns.push((a: number, b: number) => a + b);
fns.push((r: i32, g: i32, b: i32) => { logged.push(r + ',' + g + ',' + b); });
fns.push((v: unknown, flag: boolean) => `${typeof v}/${flag}`);
const args0: unknown[] = ['hello'];
call(fns[0], args0);
const args1: unknown[] = [2, '3'];
console.log(call(fns[1], args1));
const args2: unknown[] = [255, '128', 3.9];
call(fns[2], args2);
const args3: unknown[] = [[1], 0];
console.log(call(fns[3], args3));
console.log(logged.join('|'));
