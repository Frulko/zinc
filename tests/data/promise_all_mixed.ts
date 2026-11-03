class D { n: i32 = 1; }
async function str(): Promise<string> { return 'x'; }
async function obj(): Promise<D> { return new D(); }
async function opt(): Promise<D | null> { return null; }
async function none(): Promise<void> { }
async function bad(): Promise<string> { throw new Error('boom'); }
async function late(): Promise<D> { await none(); await none(); throw new Error('late'); }
async function main(): Promise<void> {
  const [s, d, e] = await Promise.all([str(), obj(), opt()]);
  console.log(s.length, d.n, e === null);
  const [a, , c] = await Promise.all([str(), none(), obj()]);
  console.log(a, c.n);
  const [x, y] = await Promise.all([str(), str()]);
  console.log(x + y);
  await Promise.all([str(), obj(), none()]);
  const r = await Promise.all([str(), obj()]);
  console.log(r[0], r[1].n);
  const pair: [Promise<string>, Promise<D>] = [str(), obj()];
  const t = await Promise.all(pair);
  console.log(t[0], t[1].n);
  const [l, o] = await Promise.all([(async (): Promise<string> => 'lambda')(), obj()]);
  console.log(l, o.n);
  const same = await Promise.all([str(), str()]);
  console.log(same.map((v: string): string => v + '!').join(','));
  try { const [p, q] = await Promise.all([bad(), obj()]); console.log(p, q.n); } catch (err) { console.log('caught', err.message); }
  try { const [p, q] = await Promise.all([str(), late()]); console.log(p, q.n); } catch (err) { console.log('caught', err.message); }
}
main();
