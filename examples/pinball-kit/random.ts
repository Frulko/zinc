// The cabinet art's existing LCG, with instance-local state for reproducible game and effect streams.
export class Random {
  constructor(private state: i32 = 12345) {}
  next(): number {
    this.state = (Math.imul(this.state, 1103515245) + 12345) & 0x7fffffff;
    return this.state / 2147483647;
  }
}
