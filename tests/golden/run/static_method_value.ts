// A static method used as a function value (ZN-364, React Native's `Easing.inOut(Easing.ease)`): it is passed, stored and called like a function.
class Ease {
  static linear(t: number): number { return t; }
  static square(t: number): number { return t * t; }
  static inOut(e: (t: number) => number): (t: number) => number { return (t: number): number => t < 0.5 ? e(t * 2) / 2 : 1 - e((1 - t) * 2) / 2; }
}
const curves: ((t: number) => number)[] = [Ease.linear, Ease.square, Ease.inOut(Ease.square)];
for (const f of curves) console.log(`${f(0.25)} ${f(0.75)}`);
const pick = (sq: boolean): ((t: number) => number) => sq ? Ease.square : Ease.linear;
console.log(`${pick(true)(0.5)} ${pick(false)(0.5)}`);
