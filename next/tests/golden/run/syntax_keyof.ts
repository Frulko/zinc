interface P { a: number; b: string }
type K = keyof P
const k: K = 'a'
console.log(k)
