export let label = 'module';
export function setLabel(value: string): void { label = value; }
export class BorrowSource {
  name = 'source';
  greet(prefix: string = label + ':'): string { return prefix + this.name; }
  defaults(first: string = this.name, second: string = first + '!'): string { return first + '/' + second; }
  rename(value: string): string { this.name = value; return this.name; }
  arrow(): string { const read = (): string => this.name; return read(); }
  nested(): string { class Inner { name = 'inner'; read(): string { return this.name; } } return this.name + '/' + new Inner().read(); }
  optional(value?: any): string { return this.name + '/' + typeof value; }
  fail(): string { throw new Error(this.name); }
}
