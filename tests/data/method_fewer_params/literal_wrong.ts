interface H { cb(x: number): number }
const h: H = { cb: (x: string) => 1 }
