let x: i32 = 1;
{
  let x: f64 = 2.5;
  console.log(x);
}
function f(x: string): string {
  return x + "!";
}
for (let x: i32 = 0; x < 2; x++) console.log(x);
console.log(x, f("a"));
