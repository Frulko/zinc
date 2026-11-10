class Box {
  constructor(public value: string) {}
  update(values: string[], suffix: string): void { values.push(this.value + suffix); }
  pick(values: string[], index: i32): string { return values[index]; }
}
class LoudBox extends Box {
  update(values: string[], suffix: string): void { values.push(this.value + suffix.toUpperCase()); }
}
function append(values: string[], value: string): void { values.push(value); }
function pick(values: string[], index: i32): string { return values[index]; }
function apply(box: Box, values: string[]): string {
  box.update(values, 'x');
  return box.pick(values, values.length - 1);
}
function fail(values: string[]): string {
  values.push('before throw');
  throw new Error('expected');
}
function exercise(): void {
  const values: string[] = ['first'];
  const kept = new Box('kept');
  append(values, kept.value);
  console.log(pick(values, 1), kept.value);
  console.log(apply(new LoudBox('virtual'), values));
  values.reverse();
  console.log(values.join('|'), kept.value);
  try { console.log(fail(values)); } catch (error) { console.log(error.message, kept.value); }
  console.log(values.join('|'));
}
exercise();
