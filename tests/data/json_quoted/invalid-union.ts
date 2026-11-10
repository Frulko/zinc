function write(value: string | number): string { return JSON.stringify({ 'quoted-key': value }); }
console.log(write(1));
