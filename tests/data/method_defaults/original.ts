class Buffer {
  lines: string[] = ['one', 'two'];
  text(last: number = this.lines.length - 1): string { return this.lines[last]; }
}
const buffer = new Buffer();
console.log(buffer.text());
