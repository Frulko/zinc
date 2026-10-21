// A CommonJS module (ts_syntax.ts): module.exports is its default export, its require of a file is resolved before it runs
const helper = require('./helper.cjs');
let n = 0;
module.exports = { next: () => helper.inc(n++), name: helper.name };
