// Imports, exports, re-exports, aliases and initialisation order across files.
import './lib/counter';
import { Box, count, square, sq, seven, PI2 } from './lib';
import { bump as inc, Pair, Box as Crate } from './lib/counter';

function hidden(): i32 { return 1; }  // a different `hidden` from the one in math
console.log('main start', count);
const b: Box = new Box(21);
console.log(b.twice(), square(3), sq(4), seven(), hidden(), PI2);
console.log(inc(), count);
const p: Pair = [1, 2];
console.log(p[0] + p[1]);
console.log(Box.pick('a', 'b', false), Crate.pick(1, 2, true));   // static generic methods through a re-export and an alias
