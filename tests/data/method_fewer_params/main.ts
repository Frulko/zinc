// A method may take fewer parameters than the interface or base method it implements; an object literal may stand for an interface of methods.
interface Handler { run(x: number, y: number): number; tick(n: number): void }

class Sum implements Handler {
  total = 0
  run(x: number): number { return x * 10 }
  tick(): void { this.total++ }
}
class Fixed implements Handler {
  run(): number { return 7 }
  tick(n: number): void { console.log('tick', n) }
}

class Base {
  go(a: number, b: string): string { return b + a }
}
class Derived extends Base {
  go(a: number): string { return 'derived' + a }
}

const hs: Handler[] = [new Sum(), new Fixed()]
for (const h of hs) { console.log(h.run(1, 2)); h.tick(5) }
const base: Base = new Derived()
console.log(base.go(3, 'x'))
console.log(new Base().go(4, 'y'))

const lit: Handler = { run: (x: number, y: number) => x + y, tick: (n: number) => console.log('lit tick', n) }
console.log(lit.run(2, 3)); lit.tick(1)
const shorthand: Handler = { run(x, y) { return x - y }, tick(n) { console.log('short tick', n) } }
console.log(shorthand.run(9, 4)); shorthand.tick(2)
const fewer: Handler = { run: () => 42, tick() {} }
console.log(fewer.run(1, 2)); fewer.tick(3)
const rec = { run: (x: number, y: number) => x * y, tick: (n: number) => console.log('rec tick', n) }
const viaRec: Handler = rec
console.log(viaRec.run(6, 7)); viaRec.tick(8)
