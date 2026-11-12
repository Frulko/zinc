function f(flag: boolean): void {
  let value: number | undefined = undefined;
  try { if (flag) value = [1, 2].length; } catch (error) { return; }
  const bad: number = value;
}
