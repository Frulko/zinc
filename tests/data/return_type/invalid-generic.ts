function identity<T>(value: T): T { return value; }
const result: ReturnType<typeof identity> = 42;
console.log(result.missing);
