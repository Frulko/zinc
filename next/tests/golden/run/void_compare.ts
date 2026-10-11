// A void call compared with undefined or null (ZN-155): run for its effects, the answer known (it crashed the lowering).
let calls = 0;
function f(): void { calls++; return; }
console.log(f() === undefined, f() !== undefined, f() == null, f() === null, calls);
