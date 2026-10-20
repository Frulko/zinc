function count(n: i32): i32 {
  let total: i32 = 0;
  for (let i: i32 = 0; i < n; i++) {
    if (i % 2 === 0) continue;
    total += i;
  }
  let j: i32 = 0;
  while (j < 10) {
    j++;
    if (j > 5) break;
  }
  do { total--; } while (total > 100);
  return total + j;
}
console.log(count(20));
