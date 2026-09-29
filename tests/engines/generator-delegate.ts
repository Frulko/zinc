function* inner(): Generator<number> { yield 3; yield 4; }
function* outer(): Generator<number> { yield 1; yield* [2]; yield* inner(); yield 5; }
function* text(): Generator<string> { yield* 'a😀b'; }
function* failure(): Generator<number> { yield 8; throw new Error('delegate failed'); }
function* guarded(): Generator<number> { try { yield* failure(); } catch (error) { console.log(error.message); yield 9; } }
for (const value of outer()) console.log(value);
for (const value of text()) console.log(value);
for (const value of guarded()) console.log(value);
