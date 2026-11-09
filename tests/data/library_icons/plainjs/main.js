const value = new Proxy({ n: 42 }, { get: (target, key) => Reflect.get(target, key) });
if (value.n !== 42) throw new Error('plain JavaScript loader changed');
console.log('plain JS: pass');
