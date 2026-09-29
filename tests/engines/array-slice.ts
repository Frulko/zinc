const values: i32[] = [1, 2, 3, 4];
console.log(values.slice().join(), values.slice(2).join(), values.slice(-3, -1).join());
console.log(values.slice(-20, 20).join(), values.slice(3, 1).length, values.slice(20).length);
const copy = values.slice(); copy[0] = 9;
console.log(values.join(), copy.join());
class Item { constructor(public value: i32) {} }
const objects: Item[] = [new Item(7), new Item(8)];
const retained = objects.slice(1); objects.pop(); retained[0].value = 11;
let total: i32 = 0;
for (let i: i32 = 0; i < 1500; i++) total += values.slice(-2)[0];
console.log(retained[0].value, total, values.join());
