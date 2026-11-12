import type * as left from './a';
import type * as right from './barrel';
import type { Renamed as Alias } from './barrel';
import type { A } from './cycle-a';
interface Item { flag: boolean; }
interface Reply { left: left.Rules; right: right.Counted; alias: Alias; star: right.Rules; cycle?: A; local: Item; }
function check(ok: boolean): void { if (!ok) throw new Error('module checked copy'); }
const good: Reply = JSON.parse('{"left":{"item":{"title":"left"},"next":{"item":{"title":"next"}}},"right":{"item":{"count":2}},"alias":{"item":{"title":"alias"}},"star":{"item":{"title":"star"}},"cycle":{"title":"a","b":{"count":3,"a":{"title":"nested"}}},"local":{"flag":false}}');
check(good.left.item.title === 'left' && good.right.item.count === 2 && good.alias.item.title === 'alias' && good.star.item.title === 'star' && !good.local.flag);
let refused = 0;
function reject(run: () => void): void { try { run(); } catch (e) { check(e instanceof TypeError); refused++; return; } throw new Error('unchecked imported type'); }
reject(() => { const bad: left.Rules = JSON.parse('{"item":{"count":1}}'); });
reject(() => { const bad: right.Counted = JSON.parse('{"item":{"title":"wrong"}}'); });
reject(() => { const bad: Alias = JSON.parse('{"item":null}'); });
reject(() => { const bad: right.Rules = JSON.parse('{}'); });
reject(() => { const bad: A = JSON.parse('{"title":"ok","b":{"count":"wrong"}}'); });
check(refused === 5);
console.log('checked imports: pass');
