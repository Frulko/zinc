// zinc-test: gradual
// A JavaScript program (DYN-14): `zinc infer` types it in memory, what stays untyped runs as Dyn.
function dist(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}
const p = { x: 1, y: 2 };
p.label = 'A';
console.log(dist(p, { x: 4, y: 6 }), p.label);

function scale(v, k) {
  return v * k;
}
console.log(scale(2, 3), scale(1.5, 4));

// untyped JSON: `order` stays Dyn
function total(order) {
  let t = 0;
  for (const it of order.items) t += it.qty * it.price;
  return t;
}
const order = JSON.parse('{"items":[{"qty":2,"price":1.5},{"qty":1,"price":4}],"id":"A7"}');
console.log(total(order), order.items.length, order.id);

let label;
label = 'total';
console.log(label.toUpperCase());
