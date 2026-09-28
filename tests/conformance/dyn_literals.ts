// zinc-test: gradual
// Regression: an untyped object literal pushed into an `unknown[]` with an array or object member (typing the member
// asked the literal for the member's type, which asked the member again: compiler stack overflow).
const rows: unknown[] = [];
for (let i = 0; i < 3; i++) rows.push({ id: i, name: `row ${i}`, tags: ['a', 'b'], pos: { x: i, y: i * 1.5 } });
console.log(JSON.stringify(rows));
