#include "frontend/dyn.h"

#include <set>

#include "frontend/inspect.h"

namespace zn::frontend {

namespace {

TypeId typeOfObject(const Checked& c, std::uint32_t obj) {
  for (TypeId t = 0; t < c.types.size(); ++t) if (c.types[t].k == TK::Object && c.types[t].obj == obj) return t;
  return kNoType;
}

bool isIdentName(const std::string& s) {
  if (s.empty() || std::isdigit(static_cast<unsigned char>(s[0]))) return false;
  for (char ch : s) if (!(std::isalnum(static_cast<unsigned char>(ch)) || ch == '_' || ch == '$')) return false;
  return true;
}

// Instance fields, inherited first.
void fieldsOfObj(const Checked& c, std::uint32_t obj, std::vector<const Member*>& out) {
  if (c.objs[obj].parent != 0xFFFFFFFFu) fieldsOfObj(c, c.objs[obj].parent, out);
  for (const Member& m : c.objs[obj].members) if (!m.method && !m.isStatic) out.push_back(&m);
}

bool isDynClassName(const Checked& c, TypeId t) {
  const Type& x = c.types[t];
  if (x.k != TK::Object) return false;
  for (std::uint32_t o = x.obj; o != 0xFFFFFFFFu; o = c.objs[o].parent) if (c.objs[o].name == "Dyn") return true;
  return false;
}

bool convertibleRec(const Checked& c, TypeId t, std::set<TypeId>& seen) {
  if (t == kNoType) return false;
  const Type& x = c.types[t];
  switch (x.k) {
    case TK::Num: case TK::Bool: case TK::Str: case TK::Any: return true;
    case TK::Array: return seen.count(t) || (seen.insert(t), convertibleRec(c, x.elem, seen));
    case TK::Union: {
      std::size_t members = 0;
      for (TypeId m : x.params) { if (m == 5) continue; ++members; if (!convertibleRec(c, m, seen)) return false; }
      return members == 1;
    }
    case TK::Object: {
      if (isDynClassName(c, t)) return true;
      if (seen.count(t)) return true;
      seen.insert(t);
      const ObjInfo& oi = c.objs[x.obj];
      if (oi.isTemplate || oi.isInterface) return false;
      std::vector<const Member*> fs;
      fieldsOfObj(c, x.obj, fs);
      for (const Member* m : fs) {
        if (c.types[m->type].k == TK::Func) continue;  // functions are not part of the view
        // a public field the view cannot show (a Map, a function) is left out of it
      }
      return true;
    }
    default: return false;
  }
}

}  // namespace

std::string dynToName(TypeId t) { return "__dynTo" + std::to_string(t); }
std::string dynFromName(TypeId t) { return "__dynFrom" + std::to_string(t); }

bool dynConvertible(const Checked& c, TypeId t) {
  std::set<TypeId> seen;
  return convertibleRec(c, t, seen);
}

std::string dynConverter(const Checked& c, TypeId t, bool to, std::vector<std::pair<TypeId, bool>>& deps, std::vector<TypeId>& formatters) {
  const Type& x = c.types[t];
  std::string A = inspectAliasName(t);
  auto toCall = [&](TypeId ct, const std::string& v) { deps.push_back({ct, true}); return dynToName(ct) + "(" + v + ")"; };
  auto fromCall = [&](TypeId ct, const std::string& v) { deps.push_back({ct, false}); return dynFromName(ct) + "(" + v + ")"; };
  auto isDynT = [&](TypeId ct) { return c.types[ct].k == TK::Any || isDynClassName(c, ct); };
  auto toExpr = [&](TypeId ct, const std::string& v) { return isDynT(ct) ? v : toCall(ct, v); };
  auto fromExpr = [&](TypeId ct, const std::string& v) { return isDynT(ct) ? v : fromCall(ct, v); };
  std::string head = to ? "function " + dynToName(t) + "(v: " + A + "): any {\n" : "function " + dynFromName(t) + "(d: any): " + A + " {\n";
  std::string body;
  switch (x.k) {
    case TK::Num: body = to ? "  return new DynNum(v);\n" : "  return __dynToNum(d);\n"; break;
    case TK::Bool: body = to ? "  return new DynBool(v);\n" : "  return __dynToBool(d);\n"; break;
    case TK::Str: body = to ? "  return new DynStr(v);\n" : "  return __dynToStr(d);\n"; break;
    case TK::Array:
      if (to) body = "  const r: any[] = [];\n  for (let i: i32 = 0; i < v.length; i++) r.push(" + toExpr(x.elem, "v[i]") + ");\n  return new DynArr(r);\n";
      else body = "  if (d instanceof DynArr) {\n    const r: " + A + " = [];\n    for (let i: i32 = 0; i < d.items.length; i++) r.push(" + fromExpr(x.elem, "d.items[i]") + ");\n    return r;\n  }\n  throw new TypeError('cannot convert Dyn (' + __dynTypeName(d) + ') to array');\n";
      break;
    case TK::Union: {
      TypeId member = kNoType;
      for (TypeId m : x.params) if (m != 5) member = m;
      if (to) body = "  if (v === null) return __null;\n  return " + toExpr(member, "v") + ";\n";
      else body = "  if (d.kind() <= 1) return null;\n  return " + fromExpr(member, "d") + ";\n";
      break;
    }
    case TK::Object: {
      const ObjInfo& oi = c.objs[x.obj];
      std::vector<const Member*> fs;
      fieldsOfObj(c, x.obj, fs);
      if (oi.isTuple) {
        if (to) {
          body = "  const r: any[] = [];\n";
          for (const Member* m : fs) body += "  r.push(" + toExpr(m->type, "v[" + m->name + "]") + ");\n";
          body += "  return new DynArr(r);\n";
        } else {
          body = "  if (d instanceof DynArr) {\n    const r: " + A + " = [";
          for (std::size_t k = 0; k < fs.size(); ++k) body += (k ? ", " : "") + fromExpr(fs[k]->type, "__dynGetN(d, " + std::to_string(k) + ")");
          body += "];\n    return r;\n  }\n  throw new TypeError('cannot convert Dyn (' + __dynTypeName(d) + ') to tuple');\n";
        }
        break;
      }
      std::vector<TypeId> tags;
      for (std::uint32_t o = x.obj; o != 0xFFFFFFFFu; o = c.objs[o].parent) { TypeId ot = typeOfObject(c, o); if (ot != kNoType) tags.push_back(ot); }
      std::string cname = oi.name.substr(0, oi.name.find('<'));
      if (oi.isRecord) cname = "Object";
      if (to) {
        std::string tagList = "[";
        for (std::size_t k = 0; k < tags.size(); ++k) tagList += (k ? ", " : "") + std::to_string(tags[k]);
        tagList += "]";
        bool fmtOk = inspectable(c, t), jsonOk = jsonable(c, t);
        if (fmtOk) formatters.push_back(t);
        std::string get = "(n: string): any => {\n    switch (n) {\n", set = "(n: string, w: any): void => {\n    switch (n) {\n", has = "(n: string): boolean => false";
        std::string hasExpr;
        for (const Member* m : fs) {
          if (m->access != 0 || c.types[m->type].k == TK::Func || !isIdentName(m->name) || !dynConvertible(c, m->type)) continue;
          get += "      case '" + m->name + "': return " + toExpr(m->type, "v." + m->name) + ";\n";
          if (!m->readonly) set += "      case '" + m->name + "': v." + m->name + " = " + fromExpr(m->type, "w") + "; break;\n";
          hasExpr += (hasExpr.empty() ? "" : " || ") + std::string("n === '") + m->name + "'";
        }
        get += "    }\n    return __undef;\n  }";
        set += "    }\n  }";
        if (!hasExpr.empty()) has = "(n: string): boolean => " + hasExpr;
        body = "  const o: " + A + " = v;\n  return new DynRefT<" + A + ">(o, " + tagList + ", '" + cname + "', " + get + ", " + set + ", " + has + ",\n    " +
               (fmtOk ? "(c: i64[], lvl: i32): string => " + inspectFmtName(t) + "(o, c, lvl)" : "(c: i64[], lvl: i32): string => '[Object]'") + ",\n    " +
               (jsonOk ? "(): string => " + jsonName(t) + "(o)" : "(): string => '{}'") + ");\n";
      } else {
        body = "  if (d instanceof DynRef && d.exact(" + std::to_string(t) + ")) return (d as DynRefT<" + A + ">).o;\n";
        if (oi.isClass && !oi.isRecord && !oi.isTemplate)   // the view of an instance of a subclass is typed with that subclass
          for (std::uint32_t so = 0; so < c.objs.size(); ++so) {
            const ObjInfo& si = c.objs[so];
            TypeId st = so != x.obj && si.isClass && !si.isRecord && !si.isTemplate && !si.isAbstract && isSubclass(c, so, x.obj) ? typeOfObject(c, so) : kNoType;
            if (st != kNoType) deps.push_back({st, false});   // its alias must exist too
            if (st != kNoType) body += "  if (d instanceof DynRef && d.exact(" + std::to_string(st) + ")) return (d as DynRefT<" + inspectAliasName(st) + ">).o;\n";
          }
        if (oi.isRecord) {
          body += "  if (d instanceof DynObj || d instanceof DynRef) {\n    const r: " + A + " = { ";
          bool first = true;
          for (const Member* m : fs) {
            body += std::string(first ? "" : ", ") + m->name + ": " + fromExpr(m->type, "__dynGet(d, '" + m->name + "')");
            first = false;
          }
          body += " };\n    return r;\n  }\n";
        }
        body += "  throw new TypeError('cannot convert Dyn (' + __dynTypeName(d) + ') to " + cname + "');\n";
      }
      break;
    }
    default: body = "  throw new TypeError('no conversion');\n"; break;
  }
  return head + body + "}\n";
}

const char* dynPrelude() {
  return R"ZN(
abstract class Dyn {
  abstract kind(): i32;
  abstract toString(): string;
}
class DynUndef extends Dyn {
  kind(): i32 { return 0; }
  toString(): string { return 'undefined'; }
}
class DynNull extends Dyn {
  kind(): i32 { return 1; }
  toString(): string { return 'null'; }
}
class DynBool extends Dyn {
  constructor(public v: boolean) { super(); }
  kind(): i32 { return 2; }
  toString(): string { return this.v ? 'true' : 'false'; }
}
class DynNum extends Dyn {
  constructor(public v: f64) { super(); }
  kind(): i32 { return 3; }
  toString(): string { return `${this.v}`; }
}
class DynStr extends Dyn {
  constructor(public v: string) { super(); }
  kind(): i32 { return 4; }
  toString(): string { return this.v; }
}
class DynArr extends Dyn {
  constructor(public items: any[]) { super(); }
  kind(): i32 { return 5; }
  toString(): string {
    let r: string = '';
    for (let i: i32 = 0; i < this.items.length; i++) {
      const it: Dyn = this.items[i];
      if (i > 0) r += ',';
      if (it.kind() > 1) r += it.toString();
    }
    return r;
  }
}
class DynObj extends Dyn {
  constructor(public map: Map<string, Dyn>) { super(); }
  kind(): i32 { return 6; }
  toString(): string { return '[object Object]'; }
}
abstract class DynRef extends Dyn {
  constructor(public tags: i32[], public className: string) { super(); }
  kind(): i32 { return 7; }
  toString(): string { return '[object Object]'; }
  hasTag(t: i32): boolean { return this.tags.indexOf(t) >= 0; }
  exact(t: i32): boolean { return this.tags[0] === t; }
  abstract get(n: string): any;
  abstract set(n: string, v: any): void;
  abstract has(n: string): boolean;
  abstract fmt(c: i64[], lvl: i32): string;
  abstract json(): string;
  abstract identity(): i64;
}
class DynRefT<T> extends DynRef {
  constructor(public o: T, tags: i32[], className: string, public getter: (n: string) => any, public setter: (n: string, v: any) => void,
              public hasser: (n: string) => boolean, public formatter: (c: i64[], lvl: i32) => string, public jsoner: () => string) { super(tags, className); }
  get(n: string): any { return this.getter(n); }
  set(n: string, v: any): void { this.setter(n, v); }
  has(n: string): boolean { return this.hasser(n); }
  fmt(c: i64[], lvl: i32): string { return this.formatter(c, lvl); }
  json(): string { return this.jsoner(); }
  identity(): i64 { return __identity(this.o); }
}

const __undef: any = new DynUndef();
const __null: any = new DynNull();

function __dynTypeName(d: Dyn): string {
  const k: i32 = d.kind();
  if (k === 0) return 'undefined';
  if (k === 1) return 'null';
  if (k === 2) return 'boolean';
  if (k === 3) return 'number';
  if (k === 4) return 'string';
  if (k === 5) return 'array';
  return 'object';
}
function __dynTypeof(d: Dyn): string {
  const k: i32 = d.kind();
  if (k === 0) return 'undefined';
  if (k === 2) return 'boolean';
  if (k === 3) return 'number';
  if (k === 4) return 'string';
  return 'object';
}
function __dynTruthy(d: Dyn): boolean {
  if (d instanceof DynBool) return d.v;
  if (d instanceof DynNum) return d.v !== 0 && d.v === d.v;
  if (d instanceof DynStr) return d.v.length > 0;
  return d.kind() > 1;
}
function __dynIsNull(d: Dyn): boolean { return d.kind() === 1; }
function __dynIsUndef(d: Dyn): boolean { return d.kind() === 0; }
function __dynIsNullish(d: Dyn): boolean { return d.kind() <= 1; }
function __dynIsArray(d: Dyn): boolean { return d.kind() === 5; }
function __dynIsTag(d: Dyn, t: i32): boolean { return d instanceof DynRef && d.hasTag(t); }

function __dynToNum(d: Dyn): f64 {
  if (d instanceof DynNum) return d.v;
  throw new TypeError('cannot convert Dyn (' + __dynTypeName(d) + ') to number');
}
function __dynToBool(d: Dyn): boolean {
  if (d instanceof DynBool) return d.v;
  throw new TypeError('cannot convert Dyn (' + __dynTypeName(d) + ') to boolean');
}
function __dynToStr(d: Dyn): string {
  if (d instanceof DynStr) return d.v;
  throw new TypeError('cannot convert Dyn (' + __dynTypeName(d) + ') to string');
}

function __dynPrim(d: Dyn): any { return d.kind() >= 5 ? new DynStr(d.toString()) : d; }
function __dynNumber(d: Dyn): f64 {
  if (d instanceof DynNum) return d.v;
  if (d instanceof DynBool) return d.v ? 1 : 0;
  if (d instanceof DynStr) return __toNumber(d.v);
  const k: i32 = d.kind();
  if (k === 1) return 0;
  if (k === 0) return NaN;
  return __toNumber(d.toString());
}
function __dynAdd(a: Dyn, b: Dyn): any {
  const fast: any = __dynAddFast(a, b);
  if (__identity(fast) !== 0) return fast;
  const pa: Dyn = __dynPrim(a);
  const pb: Dyn = __dynPrim(b);
  if (pa instanceof DynStr || pb instanceof DynStr) return new DynStr(pa.toString() + pb.toString());
  return new DynNum(__dynNumber(pa) + __dynNumber(pb));
}
function __dynAddNum(t: f64, d: Dyn): f64 {  // total += d where total is a number: no boxing of the total in the common case
  if (d instanceof DynNum) return t + d.v;
  return __dynToNum(__dynAdd(new DynNum(t), d));
}
function __dynSub(a: Dyn, b: Dyn): any { return new DynNum(__dynNumber(a) - __dynNumber(b)); }
function __dynMul(a: Dyn, b: Dyn): any { return new DynNum(__dynNumber(a) * __dynNumber(b)); }
function __dynDiv(a: Dyn, b: Dyn): any { return new DynNum(__dynNumber(a) / __dynNumber(b)); }
function __dynMod(a: Dyn, b: Dyn): any { return new DynNum(__dynNumber(a) % __dynNumber(b)); }
function __dynPow(a: Dyn, b: Dyn): any { return new DynNum(Math.pow(__dynNumber(a), __dynNumber(b))); }
function __dynNeg(a: Dyn): any { return new DynNum(-__dynNumber(a)); }
function __dynPos(a: Dyn): any { return new DynNum(__dynNumber(a)); }
function __dynLt(a: Dyn, b: Dyn): boolean {
  const pa: Dyn = __dynPrim(a);
  const pb: Dyn = __dynPrim(b);
  if (pa instanceof DynStr && pb instanceof DynStr) return pa.v < pb.v;
  return __dynNumber(pa) < __dynNumber(pb);
}
function __dynGt(a: Dyn, b: Dyn): boolean { return __dynLt(b, a); }
function __dynLe(a: Dyn, b: Dyn): boolean {
  const pa: Dyn = __dynPrim(a);
  const pb: Dyn = __dynPrim(b);
  if (pa instanceof DynStr && pb instanceof DynStr) return pa.v <= pb.v;
  return __dynNumber(pa) <= __dynNumber(pb);
}
function __dynGe(a: Dyn, b: Dyn): boolean { return __dynLe(b, a); }
function __dynSame(a: Dyn, b: Dyn): boolean {
  if (a instanceof DynRef && b instanceof DynRef) return a.identity() === b.identity();
  return __identity(a) === __identity(b);
}
function __dynSeq(a: Dyn, b: Dyn): boolean {
  const k: i32 = a.kind();
  if (k !== b.kind()) return false;
  if (a instanceof DynNum && b instanceof DynNum) return a.v === b.v;
  if (a instanceof DynStr && b instanceof DynStr) return a.v === b.v;
  if (a instanceof DynBool && b instanceof DynBool) return a.v === b.v;
  if (k <= 1) return true;
  return __dynSame(a, b);
}
function __dynEq(a: Dyn, b: Dyn): boolean {
  const ka: i32 = a.kind();
  const kb: i32 = b.kind();
  if (ka === kb) return __dynSeq(a, b);
  if (ka <= 1 && kb <= 1) return true;
  if (ka <= 1 || kb <= 1) return false;
  if (ka >= 5 && kb >= 5) return false;
  if (ka >= 5) return __dynEq(__dynPrim(a), b);
  if (kb >= 5) return __dynEq(a, __dynPrim(b));
  return __dynNumber(a) === __dynNumber(b);
}
function __dynAnd(a: Dyn, b: () => any): any { return __dynTruthy(a) ? b() : a; }
function __dynOr(a: Dyn, b: () => any): any { return __dynTruthy(a) ? a : b(); }
function __dynNullish(a: Dyn, b: () => any): any { return a.kind() <= 1 ? b() : a; }

function __indexOfKey(k: string): i32 {
  if (k.length === 0 || k.length > 9) return -1;
  let r: i32 = 0;
  for (let i: i32 = 0; i < k.length; i++) {
    const c: i32 = k.charCodeAt(i);
    if (c < 48 || c > 57) return -1;
    r = r * 10 + (c - 48);
  }
  return k.length > 1 && k.charAt(0) === '0' ? -1 : r;
}
function __dynGetN(o: Dyn, i: f64): any {
  if (o instanceof DynArr) return i >= 0 && i < o.items.length && i === Math.floor(i) ? o.items[i] : __undef;
  if (o instanceof DynStr) return i >= 0 && i < o.v.length && i === Math.floor(i) ? new DynStr(o.v.charAt(i)) : __undef;
  return __dynGet(o, `${i}`);
}
function __dynGet(o: Dyn, k: string): any {
  const fast: any = __dynGetFast(o, __undef, k);
  if (__identity(fast) !== 0) return fast;
  if (o instanceof DynObj) {
    const v: Dyn = o.map.get(k) ?? __undef;
    return v;
  }
  if (o instanceof DynArr) {
    if (k === 'length') return new DynNum(o.items.length);
    const i: i32 = __indexOfKey(k);
    return i >= 0 ? __dynGetN(o, i) : __undef;
  }
  if (o instanceof DynStr) {
    if (k === 'length') return new DynNum(o.v.length);
    const i: i32 = __indexOfKey(k);
    return i >= 0 ? __dynGetN(o, i) : __undef;
  }
  if (o instanceof DynRef) return o.get(k);
  throw new TypeError("Cannot read properties of " + o.toString() + " (reading '" + k + "')");
}
function __dynGetD(o: Dyn, key: Dyn): any {
  if (key instanceof DynNum) return __dynGetN(o, key.v);
  return __dynGet(o, key.toString());
}
function __dynSetN(o: Dyn, i: f64, v: any): void {
  if (o instanceof DynArr && i >= 0 && i === Math.floor(i)) {
    while (o.items.length < i) o.items.push(__undef);
    if (i < o.items.length) o.items[i] = v; else o.items.push(v);
    return;
  }
  __dynSet(o, `${i}`, v);
}
function __dynSet(o: Dyn, k: string, v: any): void {
  if (o instanceof DynObj) { o.map.set(k, v); return; }
  if (o instanceof DynArr) {
    const i: i32 = __indexOfKey(k);
    if (i >= 0) { __dynSetN(o, i, v); return; }
    return;
  }
  if (o instanceof DynRef) { o.set(k, v); return; }
  throw new TypeError("Cannot set properties of " + o.toString() + " (setting '" + k + "')");
}
function __dynSetD(o: Dyn, key: Dyn, v: any): void {
  if (key instanceof DynNum) { __dynSetN(o, key.v, v); return; }
  __dynSet(o, key.toString(), v);
}
function __dynIn(key: Dyn, o: Dyn): boolean {
  const k: string = key.toString();
  if (o instanceof DynObj) return o.map.has(k);
  if (o instanceof DynArr) { const i: i32 = __indexOfKey(k); return (i >= 0 && i < o.items.length) || k === 'length'; }
  if (o instanceof DynRef) return o.has(k);
  throw new TypeError("Cannot use 'in' operator to search for '" + k + "' in " + o.toString());
}
function __dynIter(d: Dyn): any[] {
  if (d instanceof DynArr) return d.items.slice();
  if (d instanceof DynStr) { const r: any[] = []; for (let i: i32 = 0; i < d.v.length; i++) r.push(new DynStr(d.v.charAt(i))); return r; }
  throw new TypeError(__dynTypeName(d) + ' is not iterable');
}
function __dynObjOf(keys: string[], vals: any[]): any {
  const m: Map<string, Dyn> = new Map<string, Dyn>();
  for (let i: i32 = 0; i < keys.length; i++) m.set(keys[i], vals[i]);
  return new DynObj(m);
}
function __dynArrOf(items: any[]): any { return new DynArr(items); }
function __dynJoin(d: Dyn): string { return d.kind() <= 1 ? '' : d.toString(); }

// ---- console.log
function __isIdentName(s: string): boolean {
  if (s.length === 0) return false;
  for (let i: i32 = 0; i < s.length; i++) {
    const c: i32 = s.charCodeAt(i);
    const letter: boolean = (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 36;
    if (!(letter || (i > 0 && c >= 48 && c <= 57))) return false;
  }
  return true;
}
function __fmtDyn(d: Dyn, c: i64[], lvl: i32): string {
  if (d instanceof DynNum) return __num(d.v);
  if (d instanceof DynStr) return __q(d.v);
  if (d instanceof DynBool) return d.v ? 'true' : 'false';
  if (d instanceof DynArr) {
    if (d.items.length === 0) return '[]';
    const id: i64 = __identity(d);
    for (let k: i32 = 0; k < lvl; k++) if (c[2 + k] === id) return __circ(c, id);
    if (lvl > 2) return '[Array]';
    c[2 + lvl] = id;
    const l: i32 = lvl + 1;
    c[1] = l;
    const out: string[] = [];
    const n: i32 = d.items.length > 100 ? 100 : d.items.length;
    let numeric: boolean = true;
    c[0] += 2;
    for (let i: i32 = 0; i < n; i++) {
      numeric = numeric && d.items[i] instanceof DynNum;
      out.push(__fmtDyn(d.items[i], c, l));
    }
    c[0] -= 2;
    if (d.items.length > n) out.push('... ' + (d.items.length - n) + ' more item' + (d.items.length - n > 1 ? 's' : ''));
    return __reduce(c, out, __ref(c, id), '[', ']', l, true, numeric, d.items.length > n);
  }
  if (d instanceof DynObj) {
    if (d.map.size === 0) return '{}';
    const id: i64 = __identity(d);
    for (let k: i32 = 0; k < lvl; k++) if (c[2 + k] === id) return __circ(c, id);
    if (lvl > 2) return '[Object]';
    c[2 + lvl] = id;
    const l: i32 = lvl + 1;
    c[1] = l;
    const out: string[] = [];
    const ks: string[] = d.map.keys();
    c[0] += 2;
    for (let i: i32 = 0; i < ks.length; i++) out.push((__isIdentName(ks[i]) ? ks[i] : __q(ks[i])) + ': ' + __fmtDyn(d.map.get(ks[i]) ?? __undef, c, l));
    c[0] -= 2;
    return __reduce(c, out, __ref(c, id), '{', '}', l, false, false, false);
  }
  if (d instanceof DynRef) return d.fmt(c, lvl);
  return d.toString();
}
function __logDyn(d: Dyn): string {
  if (d instanceof DynStr) return d.v;
  return __fmtDyn(d, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 0);
}

// ---- JSON
function __dynJson(d: Dyn): string {
  const fast: string = __jsonOut(d);   // the runtime walks the tree; '' when it holds a typed object view
  if (fast.length > 0) return fast;
  return __dynJsonSlow(d);
}
function __dynJsonSlow(d: Dyn): string {
  if (d instanceof DynNum) return __jsonNum(d.v);
  if (d instanceof DynStr) return __jsonQuote(d.v);
  if (d instanceof DynBool) return d.v ? 'true' : 'false';
  if (d instanceof DynArr) {
    const out: string[] = [];
    for (let i: i32 = 0; i < d.items.length; i++) out.push(d.items[i].kind() === 0 ? 'null' : __dynJson(d.items[i]));
    return '[' + out.join(',') + ']';
  }
  if (d instanceof DynObj) {
    const out: string[] = [];
    const ks: string[] = d.map.keys();
    for (let i: i32 = 0; i < ks.length; i++) {
      const v: Dyn = d.map.get(ks[i]) ?? __undef;
      if (v.kind() !== 0) out.push(__jsonQuote(ks[i]) + ':' + __dynJson(v));
    }
    return '{' + out.join(',') + '}';
  }
  if (d instanceof DynRef) return d.json();
  return 'null';
}

function __jsonParse(s: string): any {
  const v: any = __jsonNative(s, __null);  // the runtime builds the Dyn tree; null (0) when the text is not JSON
  if (__identity(v) === 0) throw new SyntaxError('JSON.parse: invalid JSON');
  return v;
}
)ZN";
}

}  // namespace zn::frontend
