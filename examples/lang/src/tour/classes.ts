// Classes and generics: virtual dispatch, sorting objects, `instanceof` narrowing, and generic code that is
// compiled once per type argument (C++ templates).
import { section } from '../report';
import { Shape, Base, Circle, Rect } from './shapes';

/** A last-in, first-out stack of any element type. */
class Stack<T> {
  items: T[] = [];

  push(value: T): void {
    this.items.push(value);
  }

  pop(): T {
    return this.items.pop();
  }

  get size(): i32 {
    return this.items.length;
  }
}

function first<T>(values: T[]): T {
  return values[0];
}

export function classes(): void {
  section('Classes');
  const shapes: Shape[] = [new Circle(1), new Rect(2, 3), new Rect(4, 4)];
  for (const shape of shapes) console.log(shape.name());
  console.log('created', Base.created);

  const bySize = shapes.slice().sort((a, b) => a.area() - b.area());
  console.log(bySize.map(shape => shape.name()).join(' < '));

  // `instanceof` narrows the interface type to the class, so Rect members become available
  const last = shapes[2];
  if (last instanceof Rect) console.log('square?', last.isSquare, last.w);
}

export function generics(): void {
  section('Generics');
  const stack = new Stack<string>();
  stack.push('a');
  stack.push('b');
  console.log(stack.pop(), stack.size, first([10, 20]));
}
