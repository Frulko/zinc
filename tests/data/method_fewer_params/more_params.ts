interface H { cb(x: number): number }
class C implements H { cb(x: number, y: number): number { return x + y } }
