interface H { cb(x: number): number }
const h: H = { cb: (x: number, y: number) => x + y }
