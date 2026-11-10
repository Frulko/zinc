function createValue() { return { value: 42 }; }
const result: ReturnType<typeof createValue> = createValue();
console.log(result.missing);
