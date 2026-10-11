// `let s;` without a type (ZN-155): typed by its first assignment, as the prototype does; a read before it is Z0109.
let s;
s = 1;
console.log(s + 1);
let t;
t = 'a';
console.log(t + '!');
class P { x = 1; }
let p;
p = new P();
function f(): number { let k; k = 2; return k * 3; }
let unused;
console.log(p.x, f());
