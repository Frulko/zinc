interface H { cb(x: number, y: number): number }
class C implements H { cb(x: string): number { return 1 } }
