class Item {
  next: Item | null;
  constructor(public value: i32, next: Item | null) {
    this.next = next;
  }
}
type Maybe<T> = T | null;
type Pair = [i32, i32];
class Animal {
  constructor(public legs: i32) {}
}
class Dog extends Animal {
  constructor() {
    super(4);
  }
  bark(): i32 {
    return 1;
  }
}
class Bird extends Animal {
  constructor() {
    super(2);
  }
  fly(): i32 {
    return 2;
  }
}
function sum(list: Item | null): i32 {
  let total: i32 = 0;
  let cur: Item | null = list;
  while (cur !== null) {
    total += cur.value;
    cur = cur.next;
  }
  return total;
}
function firstValue(list: Maybe<Item>): i32 {
  if (list === null) return -1;
  return list.value;
}
function find(list: Item | null, v: i32): Item | null {
  let cur = list;
  while (cur !== null) {
    if (cur.value === v) return cur;
    cur = cur.next;
  }
  return null;
}
function describe(a: Animal): i32 {
  if (a instanceof Dog) return a.bark() * 10 + a.legs;
  if (a instanceof Bird) return a.fly() * 10 + a.legs;
  return 0;
}
function pick(c: boolean, d: Dog | null): i32 {
  return c && d !== null ? d.bark() : 0;
}
const list = new Item(1, new Item(2, new Item(3, null)));
const found = find(list, 2);
const missing = find(list, 9);
console.log(sum(list), firstValue(list), firstValue(null), found !== null ? found.value : -9, missing === null, describe(new Dog()), describe(new Bird()), pick(true, new Dog()), pick(true, null));
let n: Maybe<Item> = null;
console.log(n === null);
n = new Item(5, null);
console.log(n.value);
