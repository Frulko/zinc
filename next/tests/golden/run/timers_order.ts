// timers against promises and microtasks: the order is Node's (a delay of 0 counts as 1, equal times run in creation order), clearTimeout and clearInterval
// cancel, and an interval keeps its period (it does not drift: each run is scheduled from the planned time)
const log: string[] = []
const mark = (s: string): void => { log.push(s) }
setTimeout(() => { mark('t10') }, 10)
setTimeout(() => { mark('t0a') }, 0)
setTimeout(() => { mark('t1') }, 1)
setTimeout(() => { mark('t0b') }, 0)
const cancelled = setTimeout(() => { mark('never') }, 5)
clearTimeout(cancelled)
Promise.resolve().then(() => { mark('p1') })
queueMicrotask(() => { mark('m1') })
let n = 0
const id = setInterval(() => {
  n++
  mark('i' + n)
  if (n === 3) { clearInterval(id) }
}, 4)
const t0 = Date.now()
setTimeout(() => { mark('late') }, 50)
setTimeout(() => { console.log(log.join(' ')); console.log(Date.now() - t0 >= 50) }, 60)
mark('sync')
