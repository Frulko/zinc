// `x! = v`, `xs[i]!++`, `o.n! += 1`: a non-null assertion on an assignment target asserts nothing at run time
const xs: number[] = [1, 2, 3];
xs[0]!++;
++xs[1]!;
xs[2]! += 10;
const o: { n: number } = { n: 1 };
o.n! = 5;
console.log(xs.join(","), o.n);
