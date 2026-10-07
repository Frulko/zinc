async function one(): Promise<i32> { return 1; }
async function f(c: boolean): Promise<i32> {
  return c ? await one() : 0;
}
f(true);
