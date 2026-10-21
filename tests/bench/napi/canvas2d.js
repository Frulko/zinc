// A hot Canvas 2D binding through the whole path (webenv.js wrapper, Node-API, canvas_ity): ZINC_WEB=1 zinc run tests/bench/napi/canvas2d.js --engine quickjs
const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
const g = cv.getContext('2d');
const N = 1000000;
let best = 1e9;
for (let r = 0; r < 7; r++) {
  const t = performance.now();
  for (let i = 0; i < N; i++) { g.beginPath(); g.moveTo(1, 2); }
  best = Math.min(best, performance.now() - t);
}
console.log(`beginPath+moveTo: ${(best * 1e6 / N).toFixed(1)} ns per pair`);
