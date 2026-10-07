// Regular expressions: one million tests of an email-like pattern, a global replace over a long text and a split, timed by Date.now (bench/regexp.js is the same program for QuickJS).
const text = 'The quick brown fox jumps over the lazy dog, 12 times; call 555-1234 or mail fox@example.com now. '.repeat(200);
const email = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const words = /\b\w+\b/g;
let t0 = Date.now();
let hits = 0;
for (let i = 0; i < 20000; i++) if (email.test(text)) hits++;
const t1 = Date.now();
let n = 0;
for (let i = 0; i < 20; i++) n += text.replace(words, (w) => w.toUpperCase()).length;
const t2 = Date.now();
let parts = 0;
for (let i = 0; i < 200; i++) parts += text.split(/[ ,;.]+/).length;
const t3 = Date.now();
console.log('test', hits, 'replace', n, 'split', parts);
console.log('ms: test', t1 - t0, 'replace', t2 - t1, 'split', t3 - t2);
