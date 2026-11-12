// shortcut: D224 leaves optional machine-store coercion syntax-only on QuickJS; add fractional inputs when checker types reach that transform.
function check(ok: boolean, why: string): void { if (!ok) throw new Error(why); }
function signed(flag: boolean): number {
  const integer: number = 2;
  let value: i32 | undefined = undefined;
  try { if (flag) value = integer; else value = [1, 2, 3].length; }
  catch (error) { return -1; }
  if (value === undefined) return -2;
  return value;
}
function unsigned(flag: boolean): number {
  const high: u32 = 4294967295;
  const integer: number = 3;
  let value: u32 | undefined = undefined;
  try { if (flag) value = high; else value = integer; }
  catch (error) { return -1; }
  if (value === undefined) return -2;
  return value;
}
check(signed(true) === 2 && signed(false) === 3, 'declared signed numeric storage');
check(unsigned(true) === 4294967295 && unsigned(false) === 3, 'declared unsigned numeric storage');
console.log('try machine flow: pass');
