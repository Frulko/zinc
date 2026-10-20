// zinc debug's expressions (ZN-371.05): conditions, logpoints, watches with their types, closures, globals, an uncaught exception.
class Box { label: string; size: number; open: boolean; constructor(label: string, size: number) { this.label = label; this.size = size; this.open = false; } }

let calls = 0;

function grow(boxes: Box[], by: number): number {
  let total = 0;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    b.size += by;
    total += b.size;
  }
  calls++;
  return total;
}

function counter(start: number): () => number {
  let n = start;
  return (): number => {
    n += 1;
    return n;
  };
}

const boxes = [new Box('a', 1), new Box('b', 2), new Box('c', 3)];
console.log(grow(boxes, 10));
const next = counter(5);
next();
console.log(next());
if (calls > 0) throw new Error('done with ' + calls + ' call');
