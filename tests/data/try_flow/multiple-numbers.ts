function signed(): i32 { return -1; }
function unsigned(): u32 { return 4294967295; }
function f(flag: boolean): number {
  let value: i32 | u32 | undefined = undefined;
  try { if (flag) value = signed(); else value = unsigned(); } catch (error) { return -1; }
  if (value === undefined) return -2;
  return value / 2;
}
