// Three async gaps met by the iPod's Genius worker: narrowing across awaits, then() of a Promise<void> with an async callback,
// and covariant promises (Promise<R> as Promise<R | null>). The output is Node's.
interface R { a: i32; }
interface Big { a: i32; b: string; }

function maybe(v: i32): Promise<R | null> {
  const r: R = { a: v };
  if (v < 0) return Promise.resolve(null);
  return Promise.resolve(r);   // Promise<R> where Promise<R | null> is returned
}
async function direct(): Promise<R | null> { const r: R = { a: 3 }; return r; }
async function adopted(): Promise<R | null> { const r: R = { a: 4 }; return Promise.resolve(r); }
function takes(p: Promise<R | null>): Promise<i32> { return p.then((x) => (x === null ? -1 : x.a)); }
function widened(): Promise<R> { const b: Big = { a: 5, b: 'big' }; return Promise.resolve(b); }

// a const from an await keeps its narrowing after a later await
async function narrowed(): Promise<void> {
  const o = await maybe(1);
  if (o === null) return;
  await maybe(2);
  console.log('const', o.a);
  const t: R | null = await maybe(6);
  if (t === null) return;
  await maybe(0);
  console.log('typed const', t.a);
  let l = await maybe(7);   // a let never assigned again narrows as a const
  if (l === null) return;
  await maybe(0);
  console.log('let', l.a);
  const { a } = await direct() ?? { a: 0 };
  await maybe(0);
  console.log('destructured', a);
  let m = await maybe(8);   // assigned again: still a let
  await maybe(0);
  m = await maybe(-1);
  console.log('let reassigned', m === null ? 'null' : 'R');
}

async function main(): Promise<void> {
  await narrowed();
  const x = await maybe(2);
  console.log('maybe', x === null ? -1 : x.a);
  const y = await direct();
  console.log('direct', y === null ? -1 : y.a);
  const z = await adopted();
  console.log('adopted', z === null ? -1 : z.a);
  const r: R = { a: 9 };
  console.log('takes', await takes(Promise.resolve(r)));
  console.log('widened', (await widened()).a);

  const p: Promise<void> = Promise.resolve();
  await p.then(async (): Promise<void> => { console.log('in'); }).then(() => { console.log('after'); });
  console.log('done');
}
main();
