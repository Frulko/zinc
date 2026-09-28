// mapset: Map/Set heavy workload with a deterministic xorshift32 PRNG
// (Math.random is a Zinc-only deterministic extension, not portable to
// QuickJS/Node, so we roll our own integer PRNG for identical sequences).
let state: u32 = 88172645;
function nextRand(): u32 {
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return state >>> 0;
}

const N: i32 = 200000;
const m: Map<i32, i32> = new Map<i32, i32>();
const s: Set<i32> = new Set<i32>();

for (let i: i32 = 0; i < N; i++) {
  const k: i32 = nextRand() % 50000;
  m.set(k, (m.get(k) ?? 0) + 1);
  s.add(k);
}

let hits: i32 = 0;
for (let i: i32 = 0; i < N; i++) {
  const k: i32 = nextRand() % 50000;
  if (s.has(k)) hits++;
}

let sumCounts: i32 = 0;
for (const v of m.values()) sumCounts += v;

console.log(m.size, s.size, hits, sumCounts);
