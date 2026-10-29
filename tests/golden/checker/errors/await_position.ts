async function one(): Promise<i32> { return 1; }
async function f(c: boolean): Promise<i32> {
  return c ? 1 + (await one()) : 0;
}
f(true);
