const ok = new Promise<number>((resolve) => { resolve(1) })
ok.finally(() => { console.log('f1') }).then((v) => { console.log('v', v) })
const bad = new Promise<number>((resolve) => { resolve(2) })
bad.then((v) => { if (v > 1) throw new Error('late'); return v })
  .finally(() => { console.log('f2') })
  .catch((e) => { console.log('caught', e.message); return 0 })
async function g(): Promise<void> { console.log('g') }
g().finally(() => { console.log('f3') })
