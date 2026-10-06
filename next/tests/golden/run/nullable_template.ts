// `${x}` and join of nullable numbers and booleans: null prints "null" in a template and nothing in join, as in JavaScript.
const a: (number | null)[] = [1, null, 3];
console.log(`${a[0]} ${a.join(',')} ${a[1]}`);
const b: (boolean | null)[] = [true, null];
console.log(`${b[0]}|${b[1]}|${b.join('-')}`);
