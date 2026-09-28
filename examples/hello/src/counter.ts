// A counter with a step and a history of its values: a class with fields, methods and a getter.

export class Counter {
  value: i32 = 0;
  private step: i32;
  private history: i32[] = [];

  constructor(step: i32) {
    this.step = step;
  }

  increment(): void {
    this.value += this.step;
    this.history.push(this.value);
  }

  reset(): void {
    this.value = 0;
    this.history = [];
  }

  /** Every value the counter went through, oldest first. */
  get trail(): string {
    return this.history.join(' -> ');
  }
}
