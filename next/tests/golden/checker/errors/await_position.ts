async function one(): Promise<i32> { return 1; }
async function f(): Promise<i32> {
  return 1 + (await one());
}
f();
