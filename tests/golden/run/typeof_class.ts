// typeof of a class (ZN-155): 'function', as in JavaScript (it was refused: a class used as a value).
class A {}
class B<T> { v: T | null = null; }
console.log(typeof A, typeof B, typeof new A());
