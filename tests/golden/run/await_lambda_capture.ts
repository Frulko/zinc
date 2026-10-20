// an awaited call whose argument is a lambda that declares a variable assigned by an inner lambda: checked once (it used to point at stale symbols)
function listen(cb: (s: string) => void): Promise<string> { cb('x'); return Promise.resolve('srv'); }
function onBytes(f: (b: u8[]) => void): void { f([1, 2]); f([3]); }
async function serve(): Promise<string> {
  const srv = await listen((s: string) => {
    let buf: u8[] = [];
    onBytes((b: u8[]) => { buf = buf.concat(b); });
    console.log(s, buf.length);
  });
  return srv;
}
serve().then((r) => console.log(r));
// the same for `await new Promise(...)` whose executor hands a captured callback to a nested lambda
async function wait(): Promise<void> {
  await new Promise<void>((resolve) => { setTimeout(() => { resolve(); }, 1); });
  console.log('waited');
}
wait();
