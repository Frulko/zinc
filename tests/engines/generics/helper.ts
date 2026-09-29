export function forwarded<T>(value: T): T { return value; }
// Neither template is instantiated merely because its module is imported.
export function unusedGeneric<T>(values: T[]): T { return values[0]; }
export function unusedSort(): number[] { return [3, 1, 2].sort((a, b) => a - b); }
