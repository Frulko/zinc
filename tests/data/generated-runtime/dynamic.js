import * as direct from 'zinc:platform';
import { BOARD } from 'zinc:board';
const target = 'zinc:' + 'platform';
const dynamic = await import({toString() { return target; }});
console.log(dynamic === direct, dynamic.BOARD === BOARD);
