// The callee of undefined_into_any.ts: it takes `any`, its caller has no Dyn value of its own
export function kind(v: any): string { return v === undefined ? 'undefined' : v === null ? 'null' : typeof v; }
