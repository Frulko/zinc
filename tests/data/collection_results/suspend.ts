import { equal } from 'zinc:assert';
const m = new Map<string, string>([['one','value']]);
async function at(receiver: Map<string,string>|null): Promise<void> {
  equal(receiver?.values()[await Promise.resolve(0)], receiver === null ? undefined : 'value');
}
const arrow = async (receiver: Map<string,string>|null) => (receiver?.values()[await Promise.resolve(0)]);
async function main(): Promise<void> {
  await at(m); await at(null); equal(await arrow(m), 'value'); equal(await arrow(null), undefined);
  console.log('suspending collection chain: pass');
}
main();

function* values(receiver: Map<string,string>|null) { return receiver?.values()[yield 0]; }
const g = values(m); equal(g.next().value, 0); equal(g.next(0).value, 'value');
