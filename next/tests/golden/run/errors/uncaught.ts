function f(): i32 { throw new Error("boom"); }
console.log("start");
f();
console.log("never");
