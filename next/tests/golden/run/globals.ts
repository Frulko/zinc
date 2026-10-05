let counter: i32 = 0;
const LIMIT: f64 = 2.5;
function bump(by: i32): i32 {
  counter += by;
  return counter;
}
function scaled(): f64 {
  return counter * LIMIT;
}
for (let i: i32 = 1; i <= 4; i++) bump(i);
console.log(counter, scaled(), bump(0));
