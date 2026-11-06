import N from './native/pyhost.spec';
export function start(entry: string, paths: string, dispatch: (fn: i32, a: f64, b: f64, c: f64, d: f64, e: f64, s: string) => f64): void { N.start(entry, paths, dispatch); }
export function invoke(id: i32, a: f64): f64 { return N.invoke(id, a); }
export function invokeStr(id: i32): string { return N.invokeStr(id); }
