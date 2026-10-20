// `this.owner` of two classes is two paths of two types (the narrowing key used to be shared)
class Base { x: i32 = 1; }
class Other { y: i32 = 2; }
class Sig { private owner: Base | null; constructor(o: Base) { this.owner = o; } }
class URL2 { q: string = ''; setQ(s: string): void { this.q = s; } }
class Params {
  private owner: URL2 | null = null;
  attach(u: URL2): void { this.owner = u; }
  changed(): void { const u = this.owner; if (u !== null) u.setQ('a'); }
}
const p = new Params(); const u = new URL2(); p.attach(u); p.changed(); console.log(u.q);
