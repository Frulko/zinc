import { equal, ok } from 'zinc:assert';
export function exercise(): void {
  let effects: i32 = 0, cleaned: i32 = 0;
  const cleanup = (): void => { cleaned++; };
  function effect(callback: () => (() => void) | undefined): (() => void) | undefined { effects++; return callback(); }
  ok(effect(() => { return undefined; }) === undefined, 'explicit undefined');
  ok(effect(() => {}) === undefined, 'implicit undefined');
  const missing: (() => void) | undefined = undefined;
  ok(missing === undefined, 'typed variable');
  const result = effect(() => cleanup);
  if (result === undefined) throw new Error('cleanup missing');
  ok(result === cleanup, 'typed callback identity'); result();
  let selected: (() => void) | undefined = effect(() => effects > 0 ? cleanup : undefined);
  if (selected !== undefined) selected();
  selected = effect(() => { if (effects < 0) return cleanup; return undefined; });
  ok(selected === undefined, 'branch nullish ABI');
  function optionalNull(callback: () => (() => void) | null): (() => void) | null { return callback(); }
  ok(optionalNull(() => null) === null, 'explicit null');
  const retained: (() => void)[] = [];
  for (let i: i32 = 0; i < 3; i++) {
    const value = effect(() => i % 2 === 0 ? () => { cleaned++; } : undefined);
    if (value !== undefined) retained.push(value);
  }
  for (const value of retained) value();
  equal(effects, 8, 'effect callbacks called once'); equal(cleaned, 4, 'real cleanups invoked once');
  console.log('nullable cleanup: pass');
}
