interface P { x: number; y: number }
interface Q extends P { z: number }
class B implements Q { x: number = 1; y: number = 2; z: number = 3 }
const q: Q = { x: 1, y: 2, z: 3 }
console.log(q.x + q.y, q.z, new B().z)
