class Loader {
  count: i32 = 0;
  private async step(n: i32): Promise<i32> { this.count += n; return this.count; }
  async run(): Promise<i32> {
    const a = await this.step(2);
    const b = await this.step(3);
    return a + b;
  }
}
const l = new Loader();
l.run().then((v: i32) => console.log('done', v, l.count));
console.log('start');
