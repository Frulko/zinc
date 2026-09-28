// jsonout: build a deterministic array of small objects and JSON.stringify
// it once at the end, single console.log of the JSON text.
interface Item {
  id: i32;
  name: string;
  value: number;
  active: boolean;
}

const N: i32 = 500;
const items: Item[] = [];
for (let i: i32 = 0; i < N; i++) {
  items.push({ id: i, name: 'item-' + i.toString(), value: i * 0.5, active: i % 2 === 0 });
}

console.log(JSON.stringify(items));
