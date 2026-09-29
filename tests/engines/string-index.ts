const text = 'A😀é';
console.log('units', text[0], text[1].charCodeAt(0), text[2].charCodeAt(0), text[3]);
let visits: i32 = 0;
function source(): string { visits++; return text; }
function position(): i32 { visits++; return 3; }
console.log('once', source()[position()], visits);
console.log('absent', text[-1] === undefined, text[4] === undefined, text[0.5] === undefined, text[1] !== undefined);
