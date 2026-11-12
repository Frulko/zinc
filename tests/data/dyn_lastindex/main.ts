let caseNumber: i32 = 0;
function eq(actual: number, expected: number): void {
  caseNumber++;
  if (actual !== expected) throw new Error(`lastIndexOf case ${caseNumber}: ${actual} != ${expected}`);
}
const a: any = ['hits', 'other', 'hits'];
eq(a.lastIndexOf('hits'), 2);
eq(a.lastIndexOf('hits', undefined), 0);
eq(a.lastIndexOf('hits', NaN), 0);
eq(a.lastIndexOf('hits', -1), 2);
eq(a.lastIndexOf('hits', -2), 0);
eq(a.lastIndexOf('hits', -4), -1);
eq(a.lastIndexOf('hits', 1.9), 0);
eq(a.lastIndexOf('hits', -1.9), 2);
eq(a.lastIndexOf('hits', Infinity), 2);
eq(a.lastIndexOf('hits', -Infinity), -1);
eq(a.lastIndexOf('hits', 4294967296), 2);
eq(a.lastIndexOf('missing'), -1);
const empty: any = [];
eq(empty.lastIndexOf('hits'), -1);
const obj: any = { id: 1 };
const other: any = { id: 1 };
const values: any = [obj, 0, NaN, '0', false, undefined, obj];
eq(values.lastIndexOf(obj), 6);
eq(values.lastIndexOf(other), -1);
eq(values.lastIndexOf(NaN), -1);
eq(values.lastIndexOf(-0), 1);
eq(values.lastIndexOf('0'), 3);
eq(values.lastIndexOf(false), 4);
eq(values.lastIndexOf(), 5);
eq(values.lastIndexOf(undefined, undefined), -1);
const text: any = 'aba12aba';
eq(text.lastIndexOf('aba'), 5);
eq(text.lastIndexOf('aba', undefined), 5);
eq(text.lastIndexOf('aba', NaN), 5);
eq(text.lastIndexOf('aba', -1), 0);
eq(text.lastIndexOf('aba', 4.9), 0);
eq(text.lastIndexOf('aba', Infinity), 5);
eq(text.lastIndexOf('aba', -Infinity), 0);
eq(text.lastIndexOf(12), 3);
eq(text.lastIndexOf(''), 8);
eq(text.lastIndexOf('', 2.9), 2);
eq(text.lastIndexOf('missing'), -1);
eq(a.lastIndexOf('hits', '2'), 2);
eq(a.lastIndexOf('hits', null), 0);
eq(a.lastIndexOf('hits', true), 0);
const symbol: any = Symbol('needle');
const symbols: any = [symbol, Symbol('needle'), symbol];
eq(symbols.lastIndexOf(symbol), 2);
let caught: i32 = 0;
try { text.lastIndexOf(symbol); } catch (error) { caught++; }
try { a.lastIndexOf('hits', symbol); } catch (error) { caught++; }
if (caught !== 2) throw new Error('symbol conversions');
const undefText: any = 'undefinedundefined';
eq(undefText.lastIndexOf(), 9);
const typed: string[] = ['hits', 'other', 'hits'];
eq(typed.lastIndexOf('hits'), 2);
eq(typed.lastIndexOf('hits', -2), 0);
eq(a.indexOf('hits'), 0);
if (!a.includes('other') || a.slice(1).length !== 2) throw new Error('existing searches');
let order: string = '';
function receiver(): any { order += 'r'; return a; }
function needle(): string { order += 'n'; return 'hits'; }
function position(): number { order += 'p'; return 2; }
function extra(): number { order += 'e'; return 0; }
eq(receiver().lastIndexOf(needle(), position(), extra()), 2);
if (order !== 'rnpe') throw new Error(order);
order = '';
const nil: any = null;
try { nil.lastIndexOf(needle()); } catch (error) { order += 'c'; }
if (order !== 'c') throw new Error('null receiver: ' + order);
console.log('dynamic lastIndexOf: pass');
