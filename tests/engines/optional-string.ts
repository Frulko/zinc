interface Options { label?: string; }
function read(options?: Options): string { return options?.label ?? 'fallback'; }
function present(options?: Options): boolean { return options?.label !== undefined; }
const absent: Options = {};
const blank: Options = { label: '' };
const named: Options = { label: 'named' };
console.log('values', read(), read(absent), read(blank), read(named));
console.log('presence', present(), present(absent), present(blank), present(named));
let calls: i32 = 0;
function source(): Options { calls++; return blank; }
console.log('once', source()?.label ?? 'wrong', calls);
