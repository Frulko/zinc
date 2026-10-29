export interface Options { n: number }
export const make = (o: Options): number => o.n * 2;
export default function twice(n: number): number { return n * 2; }
