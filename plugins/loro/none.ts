// `undefined` for a `T | undefined` result of index.ts. That file has Dyn values, where `undefined` is the Dyn one; this file has
// none, so here it is the typed undefined of the interpreter and the AOT, and JavaScript's own on the QuickJS engine.
export function none<T>(): T | undefined { return undefined; }
