class Plain { x: i32 = 1; }
function a(): void { throw 'text'; }
function b(): void { throw new Plain(); }
function c(): i32 {
  try { return 1; } catch (e) { console.log(e.message); }
}
{
  using p = new Plain();
}
try { } catch (e) { e.nothing; }
