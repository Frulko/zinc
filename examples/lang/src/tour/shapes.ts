// Shapes: an interface, an abstract base class with a static counter, and two subclasses.
// Methods are dispatched virtually (C++ virtual calls); `public` constructor parameters become fields.

export interface Shape {
  name(): string;
  area(): number;
}

export abstract class Base implements Shape {
  static created: i32 = 0;

  constructor(public label: string) {
    Base.created++;
  }

  abstract area(): number;

  /** "rect(6.00)" */
  name(): string {
    return `${this.label}(${this.area().toFixed(2)})`;
  }
}

export class Circle extends Base {
  constructor(public r: number) {
    super('circle');
  }

  area(): number {
    return Math.PI * this.r * this.r;
  }
}

export class Rect extends Base {
  w: number;
  h: number;

  constructor(w: number, h: number) {
    super('rect');
    this.w = w;
    this.h = h;
  }

  area(): number {
    return this.w * this.h;
  }

  get isSquare(): boolean {
    return this.w === this.h;
  }
}
