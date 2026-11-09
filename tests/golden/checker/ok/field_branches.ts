// A field assigned in both branches of an if/else of the constructor is initialized, readonly too, as tsc accepts it; a branch that throws needs no assignment.
class Range {
  readonly lo: number;
  readonly hi: number;
  readonly label: string;
  constructor(a: number, b: number) {
    if (a <= b) {
      this.lo = a;
      this.hi = b;
    } else {
      this.lo = b;
      this.hi = a;
    }
    if (a === b) this.label = 'point';
    else if (a < b) { this.label = 'up'; }
    else if (a > b) this.label = 'down';
    else throw new Error('NaN');
  }
}
const r = new Range(5, 2);
console.log(r.lo, r.hi, r.label);
