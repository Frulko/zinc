function read(key: string): number { const value = { 'a-b': 1 }; return value[key]; }
console.log(read('a-b'));
