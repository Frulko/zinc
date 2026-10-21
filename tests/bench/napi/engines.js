// JavaScript against calls into zinc on each engine (ZN-773.03): zinc run tests/bench/napi/engines.js --engine quickjs|jsc
const now = () => __host_loopNow();
function fib(n) { return n < 2 ? n : fib(n - 1) + fib(n - 2); }
let t = now(); fib(30); const tFib = now() - t;
t = now(); const a = []; for (let i = 0; i < 1e6; i++) a.push({ x: i, y: i * 2 }); let s = 0; for (const o of a) s += o.x + o.y; const tObj = now() - t;
t = now(); let str = ''; for (let i = 0; i < 2e5; i++) str += String.fromCharCode(65 + i % 26); const parts = str.split('A').map(x => x.toLowerCase()).join('-'); const tStr = now() - t;
const N = 1e6; t = now(); for (let i = 0; i < N; i++) __host_loopNow(); const tHost = (now() - t) * 1e6 / N;
console.log(`fib(30) ${tFib.toFixed(0)} ms, 1M objects ${tObj.toFixed(0)} ms, strings ${tStr.toFixed(0)} ms, host call ${tHost.toFixed(0)} ns`);
