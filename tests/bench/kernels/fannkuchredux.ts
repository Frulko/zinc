// fannkuch-redux style kernel, n=10: enumerate all permutations in
// lexicographic order (std::next_permutation-style), count pancake flips
// needed to bring the first element to front, track max flips and an
// alternating checksum. Not the canonical Steinhaus-Johnson-Trotter
// enumeration order used by the official benchmark, so the checksum value
// differs from published fannkuch-redux results; it is still a valid,
// deterministic cross-engine comparison since all four engines run the
// exact same algorithm. See docs/reports/PERF.md.
const N: i32 = 10;

function flips(arr: i32[]): i32 {
  const p: i32[] = arr.slice();
  let count: i32 = 0;
  let first: i32 = p[0];
  while (first !== 0) {
    let lo: i32 = 0;
    let hi: i32 = first;
    while (lo < hi) {
      const t: i32 = p[lo];
      p[lo] = p[hi];
      p[hi] = t;
      lo++;
      hi--;
    }
    count++;
    first = p[0];
  }
  return count;
}

function nextPermutation(a: i32[]): boolean {
  const n: i32 = a.length;
  let i: i32 = n - 2;
  while (i >= 0 && a[i] >= a[i + 1]) i--;
  if (i < 0) return false;
  let j: i32 = n - 1;
  while (a[j] <= a[i]) j--;
  const t: i32 = a[i]; a[i] = a[j]; a[j] = t;
  let lo: i32 = i + 1, hi: i32 = n - 1;
  while (lo < hi) {
    const t2: i32 = a[lo]; a[lo] = a[hi]; a[hi] = t2;
    lo++; hi--;
  }
  return true;
}

let perm: i32[] = [];
for (let i: i32 = 0; i < N; i++) perm.push(i);

let maxFlips: i32 = 0;
let checksum: i32 = 0;
let sign: i32 = 1;
let going: boolean = true;
while (going) {
  const f: i32 = flips(perm);
  if (f > maxFlips) maxFlips = f;
  checksum += sign * f;
  sign = -sign;
  going = nextPermutation(perm);
}
console.log(maxFlips, checksum);
