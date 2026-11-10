class Base { f(value: string): number { return 1; } }
class Derived extends Base { f(value: number): never { throw new Error("stop"); } }
