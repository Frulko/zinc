const absent: Map<string | null, string> | null = null;
console.log((absent as Map<string | null, string>).has(null));
