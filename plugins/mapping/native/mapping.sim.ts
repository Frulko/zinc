// sim: no GPU; commands are accepted and ignored so programs still run on the oracle.
let count = 0;
export default {
  command(address: string, _n: number[], _s: string[]): boolean { if (address === '/add') count++; return true; },
  toJson(): string { return '{"version":1,"layers":[]}'; },
  fromJson(_json: string): boolean { return false; },
  layerJson(_layer: number): string { return '{}'; },
  info(): string { return `{"layers":${count},"selected":-1,"aspect":1.333}`; },
  layerCount(): number { return count; },
};
