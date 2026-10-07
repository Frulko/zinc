// Promise statics: reject, resolve(p), all, allSettled, race, any, withResolvers, the executor's reject, and the order of microtasks against timers
function fail(n: number): Promise<number> { return Promise.reject(new Error('bad ' + n)) }
fail(1).catch((e) => { console.log(e.message); return 0 })
const r = Promise.reject<number>(new Error('typed'))
r.catch((e) => { console.log(e.message); return 0 })

const a = Promise.resolve(1)
const b = Promise.resolve(a)
console.log(a === b)

Promise.all([Promise.resolve(1), Promise.resolve(2)]).then((vs) => { console.log('all', vs.length, vs[0] + vs[1]) })
Promise.allSettled([Promise.resolve(1), Promise.reject<number>(new Error('x'))]).then((rs) => { console.log(rs.length, rs[0].status, rs[1].status, rs[1].reason?.message) })
Promise.race([Promise.resolve(1), Promise.resolve(2)]).then((v) => { console.log('race', v) })
Promise.any([Promise.reject<number>(new Error('a')), Promise.resolve(3)]).then((v) => { console.log('any', v) })
Promise.any([Promise.reject<number>(new Error('a'))]).catch((e) => { console.log('any failed'); return 0 })

const w = Promise.withResolvers<number>()
w.promise.then((v) => { console.log('w', v) })
w.resolve(9)

const p = new Promise<number>((resolve, reject) => { reject(new Error('rej')) })
p.catch((e) => { console.log('p', e.message); return 1 })
const q = new Promise<number>((resolve, reject) => { setTimeout(() => { resolve(5) }, 1) })
q.then((v) => { console.log('q', v) })

setTimeout(() => { console.log('timer') }, 0)
queueMicrotask(() => { console.log('micro') })
Promise.resolve(2).then((v) => { console.log('then', v) })
console.log('sync')

// a promise that only rejects fits any Promise<T>
const never = (m: string) => Promise.reject(new Error('x ' + m))
let open = false
const g = (): Promise<string> => open ? Promise.resolve('ok') : never('closed')
g().catch((e) => { console.log(e.message); return '' })
