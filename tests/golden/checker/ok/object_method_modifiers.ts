// Methods of an object literal: async and string-named
const store = {
  async load(key: string): Promise<string> { return key + '!'; },
  'size'(): number { return 3; },
};
async function main(): Promise<void> {
  console.log(await store.load('a'), store.size());
}
main();
