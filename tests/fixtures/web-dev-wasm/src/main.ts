// zinc dev --target web --engine wasm (tests/t1/web_dev_wasm.sh): the test edits this line and expects the page to print the new number.
const n: i32 = 6 * 7;
console.log('wasm says ' + n);
