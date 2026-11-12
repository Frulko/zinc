const callback: unknown = (value: string): string => value;
const restored = callback as (value: string) => string;
restored(42);
