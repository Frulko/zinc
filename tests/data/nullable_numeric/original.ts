function maybe(m: Map<string, string> | null): number | undefined { return m?.values().length; }
console.log(maybe(new Map<string, string>([['key', 'value']])));
