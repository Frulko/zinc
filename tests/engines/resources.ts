import Store from './resources/store.spec';
const counter = Store.create(4);
const alias = Store.alias(counter);
console.log('identity', counter === alias, Store.get(alias), Store.live());
Store.set(alias, 9);
console.log('shared', Store.get(counter));
let sum: number = 0;
for (let i: i32 = 0; i < 100000; i++) {
  const value = Store.create(i);
  sum += Store.get(value);
}
console.log('collected', sum, Store.get(counter));
