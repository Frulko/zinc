import { createSignal, onCleanup } from 'zinc:ui/solid';
export function state<T>(value: T): [() => T, (value: T) => void] { return createSignal<T>(value); }
export function cleanup(fn: () => void): void { onCleanup(fn); }
export function cleanupCount(value: i32): i32 { return value; }
