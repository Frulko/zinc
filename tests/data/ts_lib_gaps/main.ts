// ZN-1050: number toLocaleString, JSON.stringify with a replacer and integer keys first, an `any` as a condition (expected.out is Node's output)
const n: number = 1234567.891;
console.log(n.toLocaleString());
console.log((0.5).toLocaleString(), (-9876.54321).toLocaleString(), (42).toLocaleString('en-US'), (-0.0001).toLocaleString(), (999.9996).toLocaleString());
console.log(n.toLocaleString(undefined, { maximumFractionDigits: 1 }), (3).toLocaleString('en-US', { minimumFractionDigits: 2 }), (1234.5).toLocaleString('en-US', { useGrouping: false }));
console.log((NaN).toLocaleString(), (1 / 0).toLocaleString(), (-1 / 0).toLocaleString());

const o: any = JSON.parse('{"b":1,"10":2,"a":3,"2":4}');
console.log(JSON.stringify(o));
o['1'] = 5;
console.log(JSON.stringify(o));
const rec = { name: 'x', secret: 'y', n: 3 };
console.log(JSON.stringify(rec, (k: string, v: any) => k === 'secret' ? undefined : v));
console.log(JSON.stringify(o, (k: string, v: any) => typeof v === 'number' ? v * 10 : v, 2));
const tree: any = JSON.parse('{"list":[1,"s",{"x":2}],"drop":true}');
console.log(JSON.stringify(tree, (k: string, v: any) => k === 'drop' ? undefined : typeof v === 'number' ? v + 1 : v));
console.log(JSON.stringify([1, 2, 3], (k: string, v: any) => v === 2 ? undefined : v));

const flag: any = JSON.parse('true');
const empty: any = JSON.parse('""');
console.log(flag ? 'yes' : 'no', empty ? 'full' : 'empty');
if (o.b) console.log('if any');
const pick = (v: any): any => typeof v === 'number' ? v * 2 : v;
console.log(JSON.stringify(pick(o)), pick(4));
