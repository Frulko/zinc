// Optional catch binding (ZN-160): `catch { }` without a variable, in plain code, a function, with finally and in an async function.
try { throw new Error('x'); } catch { console.log('caught'); }

function parse(s: string): number {
  try {
    if (s === '') throw new RangeError('empty');
    return s.length;
  } catch {
    return -1;
  } finally {
    console.log('checked', s);
  }
}
console.log(parse('abc'), parse(''));

async function load(ok: boolean): Promise<string> {
  try {
    await Promise.resolve(1);
    if (!ok) throw new Error('nope');
    return 'loaded';
  } catch {
    return 'fallback';
  }
}
load(true).then((v) => console.log(v));
load(false).then((v) => console.log(v));
