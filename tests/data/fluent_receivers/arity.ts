class Chain { next(): Chain { return this; } private hidden(): void {} take(n: number): void {} value: number = 1; }
const value = new Chain().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next();
value.take();
