const s = JSON.stringify([1], (k: string, v: number): number => v, 2);
console.log(s);
