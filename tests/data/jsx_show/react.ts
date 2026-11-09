import { useState } from 'zinc:ui/react';
export function state<T>(initial: T): [() => T, (value: T) => void] {
  const [value, setValue] = useState<T>(initial);
  return [() => value, setValue];
}
export function cleanup(fn: () => void): void {}
export function cleanupCount(value: i32): i32 { return 0; }
