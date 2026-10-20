import Beep from './native/beep.spec';
export function ping(): i32 { return Beep.ping(); }
export function greet(name: string, loud: boolean): string { return Beep.greet(name, loud); }
export function watch(cb: (n: i32, label: string) => void): void { Beep.watch(cb); }
