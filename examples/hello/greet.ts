export function greet(name: string): string {
  return 'Hello, ' + name + '!';
}
export class Counter {
  value: i32 = 0;
  inc(): void { this.value++; }
}
