class Item {
  handle: i32;
  constructor(handle: i32) { this.handle = handle; }
}
const items: Item[] = [new Item(1)];
const item = items.find((item: Item) => item.handle === 1);
console.log(item === undefined ? 'missing' : 'found');
// This callback really captures its result, so its body must still be deferred.
const deferred = items.find((candidate: Item) => candidate.handle === 1 || deferred === undefined);
console.log(deferred === undefined ? 'missing' : 'found');
// Nested higher-order calls must preserve both callbacks' declared arity.
const nested = items.find((candidate: Item) => items.some((candidate: Item) => candidate.handle === 1));
console.log(nested === undefined ? 'missing' : 'found');
function later(callback: () => void): () => void { return callback; }
const caught = later(() => {
  try { throw new Error('caught'); }
  catch (caught) { console.log(caught.message); }
  finally { console.log(caught === caught ? 'self' : 'missing'); }
});
caught();
