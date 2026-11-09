// Fields initialised by a lambda call are typed from it and run (ZN-798; their errors: tests/golden/checker/errors/field_lambda_init.ts).
// A catch callback that only rethrows gives never: the promise keeps its type.
const BASE = 10;
class K {
  static table = (() => { const t: number[] = []; for (let i = 0; i < 3; i++) t.push(i * BASE); return t; })();
  label = ((n: number) => 'k' + n)(BASE);
  twice = [1, 2].map((v: number) => v * 2);
}
console.log(K.table.join(','), new K().label, new K().twice.join(','));
function named(ok: boolean): Promise<string> {
  const p = ok ? Promise.resolve('fine') : Promise.reject<string>(new Error('bad'));
  return p.then((s: string) => s + '!').catch((e: Error) => {
    console.log('seen ' + e.message);
    throw e;
  });
}
named(true).then((s: string) => console.log(s));
named(false).catch((e: Error) => console.log('rethrown ' + e.message));
