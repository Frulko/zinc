interface P { value?: number; }
function f(p: P, flag: boolean): number { if (p.value !== undefined && (flag ? (p.value = undefined) === undefined : true)) return p.value; return 0; }
