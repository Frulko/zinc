console.log([1, 2].flatMap((n: number): string | [number, number] => n === 1 ? 'a' : [n, n]).join(','));
