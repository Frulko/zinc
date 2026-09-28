// Control flow: loops with break / continue, do-while, logical operators and array predicates.
import { section } from '../report';

/** Sum of the odd numbers below 10, then decremented until it is at most 20. */
function oddSum(): i32 {
  let i = 0, sum = 0;
  while (true) {
    i++;
    if (i % 2 === 0) continue;
    if (i > 9) break;
    sum += i;
  }
  do {
    sum -= 1;
  } while (sum > 20);
  return sum;
}

export function controlFlow(): void {
  section('Control flow');
  const sum = oddSum();
  const empty: string = ''.slice(0, 0);
  const name = empty || 'anon';        // `||` picks the first truthy value
  console.log(sum, name, sum > 10 ? 'big' : 'small', [1, 2, 3].some(x => x > 2), [1, 2, 3].every(x => x > 2));
  console.log([5, 1, 4].reduce((a, b) => a + b, 0), [1, 2, 3, 4].filter(x => x % 2 === 0), [3, 1, 2].indexOf(2), [1, 2].concat([3]));
}
