// zinc:script fast paths: values that are numbers, strings, booleans or null cross without the generic JSON machinery (the output must be what JSON gives), and
// zinc:script/fast calls numbers with no text at all (up to four numbers in, one out, in both directions).
// zinc-test: requires heap>=4M
import { Script, ScriptError } from 'zinc:script';
import { exposeNum, callNum } from 'zinc:script/fast';

const vm = new Script({ memoryLimit: 8 << 20, timeLimitMs: 200 });

// generic path, primitives: what the script sees and what comes back
const seen: string[] = [];
vm.expose('echo', (v: unknown) => { seen.push(JSON.stringify(v)); return v; });
vm.expose('num', (a: number, b: number) => a * b);
vm.expose('str', (s: string, n: number) => s + ':' + n);
vm.expose('flag', (b: boolean) => !b);
console.log(JSON.stringify(vm.eval('[echo(1), echo(-0), echo(1.5), echo(0.1), echo(1e21), echo(2147483648), echo(-9007199254740991), echo(NaN), echo(Infinity)]')));
console.log(JSON.stringify(vm.eval('[echo("a\\"b\\\\c\\n\\t\\u0001é€😀"), echo(""), echo(true), echo(null), echo(undefined)]')));
console.log(seen.join(' '));
console.log(vm.eval('[num(6, 7), num("3", 2), num(), str("x", 1.25), str("é", -3), flag(false), flag(1)]'));
console.log(JSON.stringify(vm.eval('[echo([1, "two", [3]]), echo({a: 1, b: "x", c: [true, null]}), echo({n: {m: 2}})]')));

// host -> script, flat primitive arguments take the direct path, anything nested the generic one
vm.eval('function pick(a, b, c) { return [typeof a, typeof b, typeof c, a, b, c]; }');
console.log(JSON.stringify(vm.call('pick', [1, 'two', true])));
console.log(JSON.stringify(vm.call('pick', [-2.5, 'a,b]', null])));
console.log(JSON.stringify(vm.call('pick', [{ k: 1 }, [2], 'x'])));
console.log(JSON.stringify(vm.call('pick', ['quote"inside', 'back\\slash', 'nl\nline'])));
console.log(JSON.stringify(vm.call('pick', [])));

// the script's results, primitives and not
vm.eval('function r1() { return 42; } function r2() { return "s\\"q"; } function r3() { return null; } function r4() { return undefined; } function r5() { return { a: [1, 2] }; } function r6() { return 0.1 + 0.2; } function r7() { return 123456789012345678; }');
console.log(JSON.stringify(vm.call('r1', [])), JSON.stringify(vm.call('r2', [])), JSON.stringify(vm.call('r3', [])), vm.call('r4', []) === undefined, JSON.stringify(vm.call('r5', [])), JSON.stringify(vm.call('r6', [])), JSON.stringify(vm.call('r7', [])));

// zinc:script/fast
exposeNum(vm, 'add', (a: number, b: number, c: number, d: number) => a + b + c + d);
exposeNum(vm, 'half', (a: number, b: number, c: number, d: number) => a / 2);
exposeNum(vm, 'boom', (a: number, b: number, c: number, d: number) => { throw new Error('bad ' + a); });
console.log(vm.eval('[add(1, 2, 3, 4), add(1.5, 2), add(), half(5), half("8"), add(1, 2, 3, 4, 100)]'));
try { vm.eval('boom(7)'); } catch (e) { console.log('boom ->', (e as ScriptError).type, (e as ScriptError).message); }
vm.eval('function twice(a, b) { return (a + b) * 2; } function nope() { return "text"; } function undef() { } function thrower() { throw new TypeError("no"); }');
const twice = vm.fn('twice')!, nope = vm.fn('nope')!, undef = vm.fn('undef')!, thrower = vm.fn('thrower')!;
console.log(callNum(twice, 2, 3, 4, 0, 0), callNum(twice, 1, 5, 0, 0, 0), callNum(twice, 0, 0, 0, 0, 0));
console.log(callNum(nope, 0, 0, 0, 0, 0), callNum(undef, 0, 0, 0, 0, 0));
try { callNum(thrower, 0, 0, 0, 0, 0); } catch (e) { console.log('thrower ->', (e as ScriptError).type, (e as ScriptError).message); }
console.log(callNum(twice, 2, 1, 2, 0, 0));   // a failed call leaves the engine usable
vm.dispose();
