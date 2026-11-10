class Base { f(): never { throw new Error("stop"); } }
class Derived extends Base { f(): number { return 1; } }
