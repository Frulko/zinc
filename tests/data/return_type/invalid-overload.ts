function overloaded(value: number): number;
function overloaded(value: string): string;
function overloaded(value: string | number): string | number { return value; }
type Result = ReturnType<typeof overloaded>;
