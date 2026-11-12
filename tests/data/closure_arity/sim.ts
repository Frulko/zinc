class Item {
  handle: i32;
  constructor(handle: i32) { this.handle = handle; }
}
let items: Item[] = [new Item(1)];
function gattTree(handle: i32): string {
  const item = items.find((item: Item) => item.handle === handle);
  return item === undefined ? '' : 'found';
}
export default { gattTree: (handle: i32): string => gattTree(handle) };
