const callback: unknown = (value: unknown): unknown => value;
const restored = callback as (value: unknown) => unknown;
const result: string = restored('value');
