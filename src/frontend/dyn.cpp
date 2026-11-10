#include "frontend/dyn.h"

#include <algorithm>
#include <functional>
#include <set>

#include "frontend/inspect.h"

namespace zn::frontend {

namespace {

TypeId typeOfObject(const Checked& c, std::uint32_t obj) { return c.typeOfObj(obj); }

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
    case TK::Func:
      if (seen.count(t)) return true;
      seen.insert(t);
      if (c.types[x.elem].k != TK::Void && !convertibleRec(c, x.elem, seen)) return false;
      for (TypeId p : x.params) if (!convertibleRec(c, p, seen)) return false;
      return !x.rest && !x.variadic;
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
std::string dynSubName(TypeId t) { return "__dynSub" + std::to_string(t); }
std::string dynDownName(TypeId t) { return "__dynDown" + std::to_string(t); }

bool dynConvertible(const Checked& c, TypeId t) {
  std::set<TypeId> seen;
  return convertibleRec(c, t, seen);
}

std::string dynConverter(const Ast& ast, const Checked& c, TypeId t, bool to, std::vector<std::pair<TypeId, bool>>& deps, std::vector<TypeId>& formatters,
                         const std::function<std::string(const Member&)>& methodHelper) {
  const Type x = c.types[t];
  std::string A = inspectAliasName(t);
  auto toCall = [&](TypeId ct, const std::string& v) { deps.push_back({ct, true}); return dynToName(ct) + "(" + v + ")"; };
  auto fromCall = [&](TypeId ct, const std::string& v) { deps.push_back({ct, false}); return dynFromName(ct) + "(" + v + ")"; };
  auto isDynT = [&](TypeId ct) { return c.types[ct].k == TK::Any || isDynClassName(c, ct); };
  auto toExpr = [&](TypeId ct, const std::string& v) { return isDynT(ct) ? v : toCall(ct, v); };
  auto fromExpr = [&](TypeId ct, const std::string& v) { return isDynT(ct) ? v : fromCall(ct, v); };
  std::string head = to ? "function " + dynToName(t) + "(v: " + A + "): any {\n" : "function " + dynFromName(t) + "(d: any): " + A + " {\n";
  std::string body, extra;   // extra: a function declared with it (__dynSub)
  switch (x.k) {
    case TK::Num: body = to ? "  return new DynNum(v);\n" : "  return __dynToNum(d);\n"; break;
    case TK::Bool: body = to ? "  return new DynBool(v);\n" : "  return __dynToBool(d);\n"; break;
    case TK::Str: body = to ? "  return new DynStr(v);\n" : "  return __dynToStr(d);\n"; break;
    case TK::Func: {
      std::string args, params, boxed;
      for (std::size_t k = 0; k < x.params.size(); ++k) {
        const auto parameter = x.params[k];
        args += (k ? ", " : "") + fromExpr(parameter, "__dynArg(a, " + std::to_string(k) + ")");
        params += (k ? ", " : "") + std::string("p") + std::to_string(k) + ": " + (isDynT(parameter) ? "any" : inspectAliasName(parameter));
        if (!isDynT(parameter)) deps.push_back({parameter, true});
        boxed += (k ? ", " : "") + toExpr(parameter, "p" + std::to_string(k));
      }
      if (to) {
        const std::string call = "v(" + args + ")";
        body = "  return new DynFn(__fnName(__classname(v)), __identity(v), (self: unknown, a: unknown[]): unknown => { " +
          (c.types[x.elem].k == TK::Void ? call + "; return __undef;" : "return " + toExpr(x.elem, call) + ";") + " });\n";
      } else {
        const std::string call = "__dynCall(d, [" + boxed + "], 'value')";
        body = "  if (!(d instanceof DynFn)) throw new TypeError('value is not callable');\n  return (" + params + "): " + (c.types[x.elem].k == TK::Void ? "void" : isDynT(x.elem) ? "any" : inspectAliasName(x.elem)) + " => { " +
          (c.types[x.elem].k == TK::Void ? call + ";" : "return " + fromExpr(x.elem, call) + ";") + " };\n";
      }
      break;
    }
    case TK::Array:
      // any[] and a Dyn array share one array, as in JavaScript: a push through either is seen by the other (a copy would break aliasing)
      if (c.types[x.elem].k == TK::Any) body = to ? "  return new DynArr(v);\n" : "  if (d instanceof DynArr) return d.items;\n  throw new TypeError('cannot convert Dyn (' + __dynTypeName(d) + ') to array');\n";
      else if (to) body = "  const r: any[] = [];\n  for (let i: i32 = 0; i < v.length; i++) r.push(" + toExpr(x.elem, "v[i]") + ");\n  return new DynArr(r);\n";
      else body = "  if (d instanceof DynArr) {\n    const r: " + A + " = [];\n    for (let i: i32 = 0; i < d.items.length; i++) r.push(" + fromExpr(x.elem, "d.items[i]") + ");\n    return r;\n  }\n  throw new TypeError('cannot convert Dyn (' + __dynTypeName(d) + ') to array');\n";
      break;
    case TK::Union: {
      TypeId member = kNoType;
      for (TypeId m : x.params) if (m != 5) member = m;
      if (to) body = "  if (v === null) return " + std::string(x.undef ? "__undef" : "__null") + ";\n  return " + toExpr(member, "v") + ";\n";
      else body = "  if (d.kind() " + std::string(isDynT(member) ? (x.undef ? "=== 0" : "=== 1") : "<= 1") + ") return null;\n  return " + fromExpr(member, "d") + ";\n";
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
        if (fmtOk || jsonOk) formatters.push_back(t);
        std::string get = "(n: string): any => {\n    switch (n) {\n", set = "(n: string, w: any): void => {\n    switch (n) {\n", has = "(n: string): boolean => false";
        std::string hasExpr;
        for (const Member* m : fs) {
          if (m->access != 0 || c.types[m->type].k == TK::Func || !isIdentName(m->name) || !dynConvertible(c, m->type)) continue;
          get += "      case '" + m->name + "': return " + toExpr(m->type, "v." + m->name) + ";\n";
          if (!m->readonly) set += "      case '" + m->name + "': v." + m->name + " = " + fromExpr(m->type, "w") + "; break;\n";
          hasExpr += (hasExpr.empty() ? "" : " || ") + std::string("n === '") + m->name + "'";
        }
        // Public methods (overrides first): function identity belongs to the declaration, and the call supplies its receiver.
        std::set<std::string> seenM;
        for (std::uint32_t o = x.obj; o != 0xFFFFFFFFu; o = c.objs[o].parent)
          for (const Member& m : c.objs[o].members) {
            if (!m.method || m.getter || m.isStatic || m.access != 0 || !isIdentName(m.name) || m.name.rfind("__", 0) == 0 || m.name == "constructor") continue;
            if (!seenM.insert(m.name).second || c.types[m.type].k != TK::Func) continue;
            const Type f = c.types[m.type];
            const bool isVoid = c.types[f.elem].k == TK::Void;
            bool ok = !f.rest && (isVoid || dynConvertible(c, f.elem));
            for (TypeId p : f.params) ok = ok && dynConvertible(c, p);
            if (!ok) continue;
            std::function<bool(std::uint32_t)> usesThis = [&](std::uint32_t node) {
              if (node == kNone) return false;
              const Node& n = ast.nodes[node];
              if (n.kind == N::This || n.kind == N::Super) return true;
              for (std::uint32_t kid : n.kids) if (usesThis(kid)) return true;
              return false;
            };
            const bool receiver = m.decl != kNone && usesThis(m.decl);
            const TypeId owner = typeOfObject(c, m.owner);
            const std::string helper = receiver ? methodHelper(m) : "";
            // shortcut: super/private-brand and unsupported method bodies keep the checked declaring-class receiver.
            const std::string object = receiver && helper.empty() ? fromExpr(owner, "self") : "v";
            std::string invoke = "(self: unknown, a: unknown[]): unknown => {\n";
            auto call = [&](std::size_t argc) {
              std::string text = helper.empty() ? "(" + object + ")." + m.name + "(" : helper + "(self";
              for (std::size_t k = 0; k < argc; ++k) text += (k || !helper.empty() ? ", " : "") + fromExpr(f.params[k], "__dynArg(a, " + std::to_string(k) + ")");
              text += ")";
              return isVoid ? text + "; return __undef;" : "return " + toExpr(f.elem, text) + ";";
            };
            for (std::size_t argc = f.minArgs; argc < f.params.size(); ++argc)
              invoke += "      if (a.length === " + std::to_string(argc) + ") { " + call(argc) + " }\n";
            invoke += "      " + call(f.params.size()) + "\n    }";
            get += "      case '" + m.name + "': return new DynFn('" + m.name + "', " + std::to_string(m.owner) + ", " + invoke + ");\n";
            hasExpr += (hasExpr.empty() ? "" : " || ") + std::string("n === '") + m.name + "'";
          }
        get += "    }\n    return __undef;\n  }";
        set += "    }\n  }";
        if (!hasExpr.empty()) has = "(n: string): boolean => " + hasExpr;
        const bool sub = oi.isClass && !oi.isTemplate && !(oi.isRecord && fs.empty());
        if (sub) {   // an instance of a subclass (or of a class shared as the record): its own view, with its fields
          body = "  const sub: any = " + dynSubName(t) + "(v);\n  if (sub.kind() !== 0) return sub;\n";
          extra = "function " + dynSubName(t) + "(v: " + A + "): any {\n  return __undef;\n}\n";
        }
        const Member* iterator = lookupMember(c, x.obj, "[Symbol.iterator]", false);
        const bool symbolPrelude = std::any_of(c.objs.begin(), c.objs.end(), [](const ObjInfo& info) { return info.name == "DynSymbol"; });
        const bool iterable = symbolPrelude && iterator && iterator->method && c.types[iterator->type].k == TK::Func;
        std::string clone;
        if (symbolPrelude) {
          clone = ", (): string => { ";
          if (cname == "__ArrayIterator" || cname == "__StringIterator" || cname == "__MapIterator" || cname == "__SetIterator" || cname == "__ProtocolIterator")
            clone += "const error = new Error('Iterator cannot be cloned'); error.name = 'DataCloneError'; throw error; ";
          else {
            clone += "const out: string[] = []; ";
            std::size_t field = 0;
            for (const Member* member : fs) if (member->access == 0 && c.types[member->type].k != TK::Func && isIdentName(member->name) && dynConvertible(c, member->type)) {
              const auto value = "v" + std::to_string(field++);
              clone += "const " + value + ": Dyn = " + toExpr(member->type, "o." + member->name) + "; const e" + value + " = __dynCloneJson(" + value + "); if (!__dynJsonOmit(" + value + ")) out.push(__jsonQuote('" + member->name + "') + ':' + e" + value + "); ";
            }
            clone += "return '{' + out.join(',') + '}'; ";
          }
          clone += "}";
        }
        const std::string iter = iterable ? ", (): any => " + toExpr(c.types[iterator->type].elem, "o[Symbol.iterator]()") : "";
        body += "  const o: " + A + " = v;\n  return " + std::string(iterable ? "new DynIterableRefT<" : symbolPrelude ? "new DynCloneRefT<" : "new DynRefT<") + A + ">(o, " + tagList + ", '" + cname + "', " + get + ", " + set + ", " + has + ",\n    " +
               (fmtOk ? "(c: i64[], lvl: i32): string => " + inspectFmtName(t) + "(o, c, lvl)" : "(c: i64[], lvl: i32): string => '[Object]'") + ",\n    " +
               (jsonOk ? "(): string => " + jsonName(t) + "(o)" : "(): string => '{}'") + clone + iter + ");\n";
      } else {
        body = "  if (d instanceof DynRef && d.exact(" + std::to_string(t) + ")) return (d as DynRefT<" + A + ">).o;\n";
        if (oi.isClass && !oi.isTemplate && !(oi.isRecord && fs.empty())) {   // the view of an instance of a subclass (or of a class shared as the record) is that object; a later module may declare its class
          body += "  const sub: " + A + " | null = " + dynDownName(t) + "(d);\n  if (sub !== null) return sub;\n";
          extra = "function " + dynDownName(t) + "(d: any): " + A + " | null {\n  return null;\n}\n";
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
  return head + body + "}\n" + extra;
}

const char* iteratorPrelude() {
  return R"ZN(
enum __IteratorPhase { Ready, Body, Closed }
class __ProtocolIterator<T, R> {
  state: __IteratorPhase = __IteratorPhase.Ready;
  value: T[] = [];
  constructor(public pull: () => R, public done: (r: R) => boolean, public read: (r: R) => T, public finish: () => void) {}
  transition(next: __IteratorPhase): void {
    if (this.state === __IteratorPhase.Closed && next !== __IteratorPhase.Closed) throw new TypeError('Iterator is closed');
    this.state = next;
    if (next === __IteratorPhase.Closed) this.value = [];
  }
  advance(readValue: boolean): boolean {
    if (this.state === __IteratorPhase.Closed) return false;
    this.transition(__IteratorPhase.Ready);
    const result: R = this.pull();
    if (this.done(result)) { this.transition(__IteratorPhase.Closed); return false; }
    if (readValue) this.value = [this.read(result)];
    this.transition(__IteratorPhase.Body);
    return true;
  }
  step(): boolean { return this.advance(true); }
  skip(): boolean { return this.advance(false); }
  begin(): void { this.transition(__IteratorPhase.Body); }
  close(): void {
    const previous: __IteratorPhase = this.state;
    this.transition(__IteratorPhase.Closed);
    if (previous === __IteratorPhase.Body) this.finish();
  }
}
class __SequenceResult<T> {
  constructor(public done: boolean, public value: T | undefined = null) {}
}
class __ArrayIterator<T> {
  private index: i32 = 0;
  private state: __IteratorPhase = __IteratorPhase.Ready;
  private items: T[] | null = null;
  constructor(items: T[]) { this.items = items; }
  private transition(next: __IteratorPhase): void {
    if (this.state === __IteratorPhase.Closed && next !== __IteratorPhase.Closed) throw new TypeError('Iterator is closed');
    this.state = next;
    if (next === __IteratorPhase.Closed) this.items = null;
  }
  next(): __SequenceResult<T> {
    if (this.state === __IteratorPhase.Closed) return new __SequenceResult<T>(true);
    const backing = this.items;
    if (backing === null) throw new TypeError('Iterator backing is unavailable');
    if (this.index >= backing.length) { this.transition(__IteratorPhase.Closed); return new __SequenceResult<T>(true); }
    const value: T = backing[this.index++];
    return new __SequenceResult<T>(false, value);
  }
  [Symbol.iterator](): __ArrayIterator<T> { return this; }
}
class __MapIterator<K, V> {
  private cursor: u32[] = [0, 0];
  private state: __IteratorPhase = __IteratorPhase.Ready;
  private collection: Map<K, V> | null = null;
  constructor(collection: Map<K, V>) { this.collection = collection; }
  private transition(next: __IteratorPhase): void {
    if (this.state === __IteratorPhase.Closed && next !== __IteratorPhase.Closed) throw new TypeError('Iterator is closed');
    this.state = next;
    if (next === __IteratorPhase.Closed) this.collection = null;
  }
  next(): __SequenceResult<[K, V]> {
    if (this.state === __IteratorPhase.Closed) return new __SequenceResult<[K, V]>(true);
    const backing = this.collection;
    if (backing === null) throw new TypeError('Iterator backing is unavailable');
    const index: i32 = backing.__iteratorNext(this.cursor);
    if (index < 0) { this.transition(__IteratorPhase.Closed); return new __SequenceResult<[K, V]>(true); }
    const pair: [K, V] = [backing.__iteratorKey(index), backing.__iteratorValue(index)];
    return new __SequenceResult<[K, V]>(false, pair);
  }
  [Symbol.iterator](): __MapIterator<K, V> { return this; }
}
class __SetIterator<T> {
  private cursor: u32[] = [0, 0];
  private state: __IteratorPhase = __IteratorPhase.Ready;
  private collection: Set<T> | null = null;
  constructor(collection: Set<T>) { this.collection = collection; }
  private transition(next: __IteratorPhase): void {
    if (this.state === __IteratorPhase.Closed && next !== __IteratorPhase.Closed) throw new TypeError('Iterator is closed');
    this.state = next;
    if (next === __IteratorPhase.Closed) this.collection = null;
  }
  next(): __SequenceResult<T> {
    if (this.state === __IteratorPhase.Closed) return new __SequenceResult<T>(true);
    const backing = this.collection;
    if (backing === null) throw new TypeError('Iterator backing is unavailable');
    const index: i32 = backing.__iteratorNext(this.cursor);
    if (index < 0) { this.transition(__IteratorPhase.Closed); return new __SequenceResult<T>(true); }
    return new __SequenceResult<T>(false, backing.__iteratorValue(index));
  }
  [Symbol.iterator](): __SetIterator<T> { return this; }
}
class __StringIterator {
  private index: i32 = 0;
  private state: __IteratorPhase = __IteratorPhase.Ready;
  private text: string | null = null;
  constructor(text: string) { this.text = text; }
  private transition(next: __IteratorPhase): void {
    if (this.state === __IteratorPhase.Closed && next !== __IteratorPhase.Closed) throw new TypeError('Iterator is closed');
    this.state = next;
    if (next === __IteratorPhase.Closed) this.text = null;
  }
  next(): __SequenceResult<string> {
    if (this.state === __IteratorPhase.Closed) return new __SequenceResult<string>(true);
    const backing = this.text;
    if (backing === null) throw new TypeError('Iterator backing is unavailable');
    if (this.index >= backing.length) { this.transition(__IteratorPhase.Closed); return new __SequenceResult<string>(true); }
    const point: i32 = backing.codePointAt(this.index);
    this.index += point > 65535 ? 2 : 1;
    const value: string = String.fromCodePoint(point);
    return new __SequenceResult<string>(false, value);
  }
  [Symbol.iterator](): __StringIterator { return this; }
}
)ZN";
}

std::string iteratorDynPrelude(bool symbols) {
  return std::string(R"ZN(function __dynIteratorDone(r: Dyn): boolean {
  if (r.kind() < 5 || r.kind() === 9) throw new TypeError('Iterator result is not an object');
  return __dynTruthy(__dynGet(r, 'done'));
}
function __dynIteratorClose(it: Dyn): void {
  const method: Dyn = __dynGet(it, 'return');
  if (method.kind() <= 1) return;
  if (!(method instanceof DynFn)) throw new TypeError('Iterator return is not callable');
  const result: Dyn = method.f(it, []);
  if (result.kind() < 5 || result.kind() === 9) throw new TypeError('Iterator return result is not an object');
}
function __dynAcquireIterator(src: Dyn): __ProtocolIterator<Dyn, Dyn> {
)ZN") + (symbols ? R"ZN(  const method: Dyn = __dynGetD(src, __symbolIterator());
  if (!(method instanceof DynFn)) throw new TypeError('Value is not iterable');
  const it: Dyn = method.f(src, []);
  if (!__dynObject(it)) throw new TypeError('Iterator is not an object');
)ZN" : R"ZN(  let it: Dyn = __undef;
  if (src instanceof DynArr) it = new __ArrayIterator<any>(src.items);
  else if (src instanceof DynStr) it = new __StringIterator(src.v);
  else throw new TypeError('Value is not iterable');
)ZN") + R"ZN(  const next: Dyn = __dynGet(it, 'next');
  if (!(next instanceof DynFn)) throw new TypeError('Iterator next is not callable');
  return new __ProtocolIterator<Dyn, Dyn>(() => next.f(it, []), __dynIteratorDone, (r: Dyn): Dyn => __dynGet(r, 'value'), (): void => __dynIteratorClose(it));
}
)ZN";
}

std::string dynPrelude(bool symbols) {
  std::string source = R"ZN(
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
// SYMBOL_BEGIN
class DynSymbol extends Dyn {
  constructor(public readonly description: string | undefined) { super(); }
  kind(): i32 { return 9; }
  toString(): string { return 'Symbol(' + (this.description === null ? '' : this.description) + ')'; }
}
enum __SymbolPhase { Cold, Ready }
let __symbolRegistryValue: Map<string, DynSymbol> | null = null;
let __symbolRegistryPhase: __SymbolPhase = __SymbolPhase.Cold;
function __symbolRegistryTransition(next: __SymbolPhase): void {
  if (__symbolRegistryPhase !== __SymbolPhase.Cold || next !== __SymbolPhase.Ready) throw new Error('Invalid symbol initialization');
  __symbolRegistryPhase = next;
}
function __symbolRegistry(): Map<string, DynSymbol> {
  if (__symbolRegistryPhase === __SymbolPhase.Cold) {
    __symbolRegistryValue = new Map<string, DynSymbol>();
    __symbolRegistryTransition(__SymbolPhase.Ready);
  }
  return __symbolRegistryValue as Map<string, DynSymbol>;
}
let __symbolIteratorValue: DynSymbol | null = null;
let __symbolIteratorPhase: __SymbolPhase = __SymbolPhase.Cold;
function __symbolIteratorTransition(next: __SymbolPhase): void {
  if (__symbolIteratorPhase !== __SymbolPhase.Cold || next !== __SymbolPhase.Ready) throw new Error('Invalid symbol initialization');
  __symbolIteratorPhase = next;
}
function __symbolIterator(): DynSymbol {
  if (__symbolIteratorPhase === __SymbolPhase.Cold) {
    __symbolIteratorValue = new DynSymbol('Symbol.iterator');
    __symbolIteratorTransition(__SymbolPhase.Ready);
  }
  return __symbolIteratorValue as DynSymbol;
}
let __symbolAsyncIteratorValue: DynSymbol | null = null;
let __symbolAsyncIteratorPhase: __SymbolPhase = __SymbolPhase.Cold;
function __symbolAsyncIteratorTransition(next: __SymbolPhase): void {
  if (__symbolAsyncIteratorPhase !== __SymbolPhase.Cold || next !== __SymbolPhase.Ready) throw new Error('Invalid symbol initialization');
  __symbolAsyncIteratorPhase = next;
}
function __symbolAsyncIterator(): DynSymbol {
  if (__symbolAsyncIteratorPhase === __SymbolPhase.Cold) {
    __symbolAsyncIteratorValue = new DynSymbol('Symbol.asyncIterator');
    __symbolAsyncIteratorTransition(__SymbolPhase.Ready);
  }
  return __symbolAsyncIteratorValue as DynSymbol;
}
let __symbolDisposeValue: DynSymbol | null = null;
let __symbolDisposePhase: __SymbolPhase = __SymbolPhase.Cold;
function __symbolDisposeTransition(next: __SymbolPhase): void {
  if (__symbolDisposePhase !== __SymbolPhase.Cold || next !== __SymbolPhase.Ready) throw new Error('Invalid symbol initialization');
  __symbolDisposePhase = next;
}
function __symbolDispose(): DynSymbol {
  if (__symbolDisposePhase === __SymbolPhase.Cold) {
    __symbolDisposeValue = new DynSymbol('Symbol.dispose');
    __symbolDisposeTransition(__SymbolPhase.Ready);
  }
  return __symbolDisposeValue as DynSymbol;
}
function __makeSymbol(description: Dyn = __undef): DynSymbol {
  if (description.kind() === 0) return new DynSymbol(null);
  return new DynSymbol(__dynToString(description));
}
function __symbolValue(value: Dyn): DynSymbol {
  if (value instanceof DynSymbol) return value;
  throw new TypeError('Value is not a symbol');
}
function __symbolFor(value: Dyn): DynSymbol {
  const key: string = __dynToString(value);
  const old: DynSymbol | undefined = __symbolRegistry().get(key);
  if (old !== null) return old;
  const made: DynSymbol = new DynSymbol(key);
  __symbolRegistry().set(key, made);
  return made;
}
function __symbolKeyFor(value: Dyn): string | undefined {
  if (!(value instanceof DynSymbol)) throw new TypeError('Symbol.keyFor requires a symbol');
  if (__symbolRegistryPhase === __SymbolPhase.Cold) return null;
  for (const key of __symbolRegistry().keys()) if (__symbolRegistry().get(key) === value) return key;
  return null;
}
function __symbolJson(d: Dyn): any {
  if (__dynJsonOmit(d)) return __undef;
  return new DynStr(__dynJson(d));
}
function __dynToString(d: Dyn): string {
  if (d.kind() === 9) throw new TypeError('Cannot convert a Symbol value to a string');
  return __dynString(d);
}
function __dynObject(d: Dyn): boolean { return d.kind() >= 5 && d.kind() !== 9; }
function __dynCloneJson(d: Dyn): string {
  if (d.kind() === 9) { const error = new Error('Symbol cannot be cloned'); error.name = 'DataCloneError'; throw error; }
  if (d instanceof DynArr) {
    const out: string[] = [];
    for (const value of d.items) { const encoded = __dynCloneJson(value); out.push(__dynJsonOmit(value) ? 'null' : encoded); }
    return '[' + out.join(',') + ']';
  }
  if (d instanceof DynObj) {
    const out: string[] = [];
    for (const key of __dynKeys(d)) {
      const value: Dyn = d.map.get(key) as Dyn;
      const encoded = __dynCloneJson(value);
      if (!__dynJsonOmit(value)) out.push(__jsonQuote(key) + ':' + encoded);
    }
    return '{' + out.join(',') + '}';
  }
  if (d instanceof DynRef) return d.cloneJson();
  return __dynJson(d);
}
function __dynStructuredClone(d: Dyn): Dyn { return __jsonParse(__dynCloneJson(d)); }
// SYMBOL_END
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
// What Object.freeze and Object.defineProperty set on an any object (ZN-161.01); none until one of them is called. The non-enumerable
// properties live outside `map`, so keys, JSON and console.log, which walk the map (the runtime too), leave them out.
class DynAttrs {
// SYMBOL_BEGIN
  symbols: Map<DynSymbol, Dyn> = new Map<DynSymbol, Dyn>();
  symbolHidden: Set<DynSymbol> = new Set<DynSymbol>();
  symbolFixed: Set<DynSymbol> = new Set<DynSymbol>();
  symbolSealed: Set<DynSymbol> = new Set<DynSymbol>();
// SYMBOL_END
  frozen: boolean = false;
  hidden: Map<string, Dyn> = new Map<string, Dyn>();
  fixed: Set<string> = new Set<string>();  // the keys that are not writable
  names: string[] = [];                     // every own key in the order it was made, hidden or not (getOwnPropertyNames)
}
class DynObj extends Dyn {
  constructor(public map: Map<string, Dyn>, public attrs: DynAttrs | null = null) { super(); }  // the runtime makes DynObjs too: a zero attrs is null
  kind(): i32 { return 6; }
  toString(): string { return '[object Object]'; }
}
// A method value has declaration identity; only a member call supplies a receiver.
class DynFn extends Dyn {
  constructor(public name: string, public self: i64, public f: (self: unknown, a: unknown[]) => unknown) { super(); }
  kind(): i32 { return 8; }
  toString(): string { return 'function ' + this.name + '() { [native code] }'; }
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
// SYMBOL_BEGIN
  iterable(): boolean { return false; }
  iterate(): any { return __undef; }
  cloneJson(): string { return this.json(); }
// SYMBOL_END
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

// SYMBOL_BEGIN
class DynCloneRefT<T> extends DynRefT<T> {
  constructor(o: T, tags: i32[], name: string, get: (n: string) => any, set: (n: string, v: any) => void,
              has: (n: string) => boolean, fmt: (c: i64[], lvl: i32) => string, json: () => string, public cloner: () => string) {
    super(o, tags, name, get, set, has, fmt, json);
  }
  cloneJson(): string { return this.cloner(); }
}
class DynIterableRefT<T> extends DynCloneRefT<T> {
  constructor(o: T, tags: i32[], name: string, get: (n: string) => any, set: (n: string, v: any) => void,
              has: (n: string) => boolean, fmt: (c: i64[], lvl: i32) => string, json: () => string, cloner: () => string, public iterator: () => any) {
    super(o, tags, name, get, set, has, fmt, json, cloner);
  }
  iterable(): boolean { return true; }
  iterate(): any { return this.iterator(); }
}
// SYMBOL_END

// DynFunction (zinc:script host functions): any function, called with an array of dynamic arguments. A typed function passed where one is expected gets an
// adapter from the checker (check.cpp, dynFunctionAdapter): each argument converted JavaScript-style, the result boxed.
type DynFunction = (args: unknown[]) => unknown;
function __dynArg(a: unknown[], i: i32): unknown { return i < a.length ? a[i] : __undef; }
// The carriers of `unknown` through a native call (lowerRequireNative): JSON text in and out; undefined is the empty text.
function __nativeJson(v: unknown): string {
  const d: any = v;
  if (d instanceof DynUndef) return '';
  return JSON.stringify(v);
}
function __nativeValue(s: string): unknown {
  if (s.length === 0) return __undef;
  const d: any = JSON.parse(s);
  return d;
}
// A record of a native spec (ZN-850): its bytes (include/zn/rec.h) from a Dyn view of the value, and back into a Dyn tree, by the schema text.
// ponytail: a typed value is seen through DynRefs (the record, the items of a list), which the runtime cannot walk: it goes through its JSON text
// first (NaN and Infinity become null, which a number field refuses); a typed encoder generated per record is the upgrade if parameters get large
function __recEnc(v: unknown, s: string): u8[] { return __recEncode(JSON.parse(JSON.stringify(v)), s); }
function __recDec(b: u8[], s: string): any { return __recDecode(b, s, __null); }
function __nativeArgs(s: string): unknown[] {
  const r: unknown[] = [];
  const d: any = JSON.parse(s);
  if (d instanceof DynArr) for (let i: i32 = 0; i < d.items.length; i++) r.push(d.items[i]);
  return r;
}
function __dynString(d: Dyn): string { return d instanceof DynStr ? d.v : d.toString(); }

const __undef: any = new DynUndef();
const __null: any = new DynNull();

function __dynTypeName(d: Dyn): string {
  const k: i32 = d.kind();
  if (k === 0) return 'undefined';
  if (k === 1) return 'null';
  if (k === 2) return 'boolean';
  if (k === 3) return 'number';
  if (k === 4) return 'string';
// SYMBOL_BEGIN
  if (k === 9) return 'symbol';
// SYMBOL_END
  if (k === 5) return 'array';
  if (k === 8) return 'function';
  return 'object';
}
function __dynTypeof(d: Dyn): string {
  const k: i32 = d.kind();
// SYMBOL_BEGIN
  if (k === 9) return 'symbol';
// SYMBOL_END
  if (k === 0) return 'undefined';
  if (k === 2) return 'boolean';
  if (k === 3) return 'number';
  if (k === 4) return 'string';
  if (k === 8) return 'function';
  return 'object';
}
// f(...) or d.m(...) on an any value: the function it holds, called with the arguments as any values (`what` names it in the error)
function __dynMethod(o: Dyn, key: string): Dyn {
  const f: Dyn = __dynGet(o, key);
  if (f instanceof DynFn) return new DynFn(f.name, f.self, (unused: unknown, args: unknown[]): unknown => f.f(o, args));
  return f;
}
function __dynMethodD(o: Dyn, key: Dyn): Dyn {
  const f: Dyn = __dynGetD(o, key);
  if (f instanceof DynFn) return new DynFn(f.name, f.self, (unused: unknown, args: unknown[]): unknown => f.f(o, args));
  return f;
}
function __dynCall(f: Dyn, args: unknown[], what: string): unknown {
  if (f instanceof DynFn) return f.f(__undef, args);
  throw new TypeError(what + ' is not a function');
}
function __dynTruthy(d: Dyn): boolean {
  if (d instanceof DynBool) return d.v;
  if (d instanceof DynNum) return d.v !== 0 && d.v === d.v;
  if (d instanceof DynStr) return d.v.length > 0;
  return d.kind() > 1;
}
function __dynIsNull(d: Dyn): boolean { return d.kind() === 1; }
function __dynIsUndef(d: Dyn): boolean { return d.kind() === 0; }
// A Dyn stored into an `unknown | undefined` slot (`b?: unknown`, `x?: unknown`): its undefined is the slot's null, what a missing one holds (ZN-877)
function __dynOpt(d: Dyn): Dyn | undefined {
  if (d.kind() === 0) return null;
  return d;
}
function __dynChain(d: Dyn | undefined): Dyn | undefined {
  if (d === null || d.kind() <= 1) return null;
  return d;
}
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

function __dynPrim(d: Dyn): any { return d.kind() >= 5 && d.kind() !== 9 ? new DynStr(d.toString()) : d; }
function __dynNumber(d: Dyn): f64 {
// SYMBOL_BEGIN
  if (d.kind() === 9) throw new TypeError('Cannot convert a Symbol value to a number');
// SYMBOL_END
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
// SYMBOL_BEGIN
  if (a.kind() === 9 || b.kind() === 9) throw new TypeError('Cannot convert a Symbol value to a number');
// SYMBOL_END
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
function __dynBitAnd(a: Dyn, b: Dyn): any { return new DynNum(__dynNumber(a) & __dynNumber(b)); }
function __dynBitOr(a: Dyn, b: Dyn): any { return new DynNum(__dynNumber(a) | __dynNumber(b)); }
function __dynBitXor(a: Dyn, b: Dyn): any { return new DynNum(__dynNumber(a) ^ __dynNumber(b)); }
function __dynShl(a: Dyn, b: Dyn): any { return new DynNum(__dynNumber(a) << __dynNumber(b)); }
function __dynShr(a: Dyn, b: Dyn): any { return new DynNum(__dynNumber(a) >> __dynNumber(b)); }
function __dynUshr(a: Dyn, b: Dyn): any { return new DynNum(__dynNumber(a) >>> __dynNumber(b)); }
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
  if (a instanceof DynFn && b instanceof DynFn) return a.self === b.self && a.name === b.name;   // one method declaration, including reads from different instances
  if (a instanceof DynArr && b instanceof DynArr) return __identity(a.items) === __identity(b.items);   // two views of one any[]
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
function __dynSameValue(a: Dyn, b: Dyn): boolean {
  if (a instanceof DynNum && b instanceof DynNum) {
    if (a.v === b.v) return a.v !== 0 || 1 / a.v === 1 / b.v;
    return a.v !== a.v && b.v !== b.v;
  }
  return __dynSeq(a, b);
}
function __dynEq(a: Dyn, b: Dyn): boolean {
  const ka: i32 = a.kind();
  const kb: i32 = b.kind();
  if (ka === kb) return __dynSeq(a, b);
  if (ka <= 1 && kb <= 1) return true;
  if (ka <= 1 || kb <= 1) return false;
// SYMBOL_BEGIN
  if (ka === 9 || kb === 9) return false;
// SYMBOL_END
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
    const at: DynAttrs | null = o.attrs;
    if (at !== null && at.hidden.has(k)) { const h: Dyn = at.hidden.get(k) ?? __undef; return h; }
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
// SYMBOL_BEGIN
  if (o instanceof DynSymbol) {
    if (k === 'description') return o.description === null ? __undef : new DynStr(o.description);
    if (k === 'toString') return new DynFn('toString', 0, (self: unknown, args: unknown[]): unknown => new DynStr(o.toString()));
    return __undef;
  }
// SYMBOL_END
  if (o instanceof DynRef) return o.get(k);
  throw new TypeError("Cannot read properties of " + o.toString() + " (reading '" + k + "')");
}
function __dynGetD(o: Dyn, key: Dyn): any {
// SYMBOL_BEGIN
  if (key instanceof DynSymbol) {
    if (key === __symbolIterator()) {
      if (o instanceof DynRef && o.iterable()) return new DynFn('[Symbol.iterator]', 0, (self: unknown, args: unknown[]): unknown => (o as DynRef).iterate());
      if (o instanceof DynArr) { const items: any[] = o.items; return new DynFn('[Symbol.iterator]', 0, (self: unknown, args: unknown[]): unknown => new __ArrayIterator<any>(items)); }
      if (o instanceof DynStr) { const text: string = o.v; return new DynFn('[Symbol.iterator]', 0, (self: unknown, args: unknown[]): unknown => new __StringIterator(text)); }
    }
    if (o instanceof DynObj && o.attrs !== null) return o.attrs.symbols.get(key) ?? __undef;
    if (o.kind() <= 1) throw new TypeError('Cannot read properties of null or undefined');
    return __undef;
  }
// SYMBOL_END
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
  if (o instanceof DynObj) {
    const at: DynAttrs | null = o.attrs;
    if (at !== null) {
      if (at.fixed.has(k)) throw new TypeError("Cannot assign to read only property '" + k + "' of object '#<Object>'");
      if (at.hidden.has(k)) { at.hidden.set(k, v); return; }
      if (!o.map.has(k)) {
        if (at.frozen) throw new TypeError('Cannot add property ' + k + ', object is not extensible');
        at.names.push(k);
      }
    }
    o.map.set(k, v);
    return;
  }
  if (o instanceof DynArr) {
    const i: i32 = __indexOfKey(k);
    if (i >= 0) { __dynSetN(o, i, v); return; }
    return;
  }
  if (o instanceof DynRef) { o.set(k, v); return; }
  throw new TypeError("Cannot set properties of " + o.toString() + " (setting '" + k + "')");
}
function __dynSetD(o: Dyn, key: Dyn, v: any): void {
// SYMBOL_BEGIN
  if (key instanceof DynSymbol) {
    if (o instanceof DynObj) {
      const at: DynAttrs = __dynAttrs(o);
      if (at.symbolFixed.has(key)) throw new TypeError('Cannot assign to read only symbol property');
      if (!at.symbols.has(key) && at.frozen) throw new TypeError('Cannot add property, object is not extensible');
      at.symbols.set(key, v);
      return;
    }
    throw new TypeError('Cannot set a symbol property on this value');
  }
// SYMBOL_END
  if (key instanceof DynNum) { __dynSetN(o, key.v, v); return; }
  __dynSet(o, key.toString(), v);
}
function __dynIn(key: Dyn, o: Dyn): boolean {
// SYMBOL_BEGIN
  if (key instanceof DynSymbol) {
    if (!__dynObject(o)) throw new TypeError("Cannot use 'in' operator on a primitive");
    return o instanceof DynObj && o.attrs !== null && o.attrs.symbols.has(key);
  }
// SYMBOL_END
  const k: string = key.toString();
  if (o instanceof DynObj) { const at: DynAttrs | null = o.attrs; return o.map.has(k) || (at !== null && at.hidden.has(k)); }
  if (o instanceof DynArr) { const i: i32 = __indexOfKey(k); return (i >= 0 && i < o.items.length) || k === 'length'; }
  if (o instanceof DynRef) return o.has(k);
  throw new TypeError("Cannot use 'in' operator to search for '" + k + "' in " + o.toString());
}
function __dynIter(d: Dyn): any[] {
  const it = __dynAcquireIterator(d);
  const result: any[] = [];
  try { while (it.step()) result.push(it.value[0]); }
  catch (error) { try { it.close(); } catch (closeError) {} throw error; }
  finally { it.close(); }
  return result;
}
function __dynForOf(d: Dyn): any[] {
  if (d instanceof DynArr) return d.items;
  return __dynIter(d);
}
// d.m(...) on an any value (ZN-1035): the method of the real array or string it holds, so push, splice and sort change the array the any holds
function __dynItems(d: Dyn, m: string): any[] {
  if (d instanceof DynArr) return d.items;
  throw new TypeError(__dynTypeName(d) + ' has no method ' + m + '()');
}
function __dynStrOf(d: Dyn, m: string): string {
  if (d instanceof DynStr) return d.v;
  throw new TypeError(__dynTypeName(d) + ' has no method ' + m + '()');
}
// sort() with no comparator, as JavaScript sorts: by the text of each element, undefined last
function __dynSortCmp(p: any, q: any): number {
  const a: Dyn = p;
  const b: Dyn = q;
  if (a.kind() === 0 || b.kind() === 0) return (a.kind() === 0 ? 1 : 0) - (b.kind() === 0 ? 1 : 0);
  const x: string = a.toString();
  const y: string = b.toString();
  return x < y ? -1 : x > y ? 1 : 0;
}
function __dynIncludes(d: Dyn, x: any, from: f64 = 0): boolean {
  if (d instanceof DynStr) return d.v.indexOf(__dynString(x), from) >= 0;
  return __dynItems(d, 'includes').includes(x, from);
}
function __dynIndexOf(d: Dyn, x: any, from: f64 = 0): f64 {
  if (d instanceof DynStr) return d.v.indexOf(__dynString(x), from);
  return __dynItems(d, 'indexOf').indexOf(x, from);
}
function __dynSlice(d: Dyn, s: f64 = 0, e: f64 = 2147483647): any {
  if (d instanceof DynStr) { const r: any = d.v.slice(s, e); return r; }
  return new DynArr(__dynItems(d, 'slice').slice(s, e));
}
// for...in over a Dyn: the keys JavaScript lists, array indices first in ascending order, then the other keys in insertion order
function __dynKeys(d: Dyn): string[] {
  const r: string[] = [];
  if (d instanceof DynArr) { for (let i: i32 = 0; i < d.items.length; i++) r.push('' + i); return r; }
  if (d instanceof DynStr) { for (let i: i32 = 0; i < d.v.length; i++) r.push('' + i); return r; }
  if (d instanceof DynObj) return __keyOrder(d.map.keys());
  return r;  // ponytail: a typed object seen through a Dyn (DynRef) lists no keys; add a keys row to DynRefT if a program needs them
}
// ---- Object statics on any values (ZN-161.01)
function __dynAttrs(o: DynObj): DynAttrs {
  const at: DynAttrs | null = o.attrs;
  if (at !== null) return at;
  const made: DynAttrs = new DynAttrs();
  made.names = o.map.keys();
  o.attrs = made;
  return made;
}
function __dynOwnNames(d: Dyn): string[] {
  if (d.kind() <= 1) throw new TypeError('Cannot convert undefined or null to object');
  const r: string[] = __dynKeys(d);
  if (d instanceof DynArr || d instanceof DynStr) r.push('length');
  if (d instanceof DynObj) {
    const at: DynAttrs | null = d.attrs;
    if (at !== null) return __keyOrder(at.names);
  }
  return r;
}
// SYMBOL_BEGIN
function __dynOwnSymbols(d: Dyn): DynSymbol[] {
  if (d.kind() <= 1) throw new TypeError('Cannot convert undefined or null to object');
  if (d instanceof DynObj && d.attrs !== null) return d.attrs.symbols.keys();
  return [];
}
function __dynDefineKey(o: Dyn, key: Dyn, v: any, hasValue: boolean, w: i32, e: i32, c: i32): any {
  if (!(key instanceof DynSymbol)) return __dynDefine(o, key.toString(), v, hasValue, w, e);
  if (!(o instanceof DynObj)) throw new TypeError('Object.defineProperty called on non-object');
  const at: DynAttrs = __dynAttrs(o);
  const exists: boolean = at.symbols.has(key);
  if (!exists && at.frozen) throw new TypeError('Cannot define property, object is not extensible');
  const cur: Dyn = at.symbols.get(key) ?? __undef;
  const sealed: boolean = exists && (at.frozen || at.symbolSealed.has(key));
  if (sealed && (c === 1 || (e !== -1 && (e === 1) === at.symbolHidden.has(key)) ||
      (at.symbolFixed.has(key) && (w === 1 || (hasValue && !__dynSameValue(cur, v)))))) throw new TypeError('Cannot redefine symbol property');
  at.symbols.set(key, hasValue ? v : cur);
  if (e === 0 || (!exists && e === -1)) at.symbolHidden.add(key);
  else if (e === 1) at.symbolHidden.delete(key);
  if (w === 0 || (!exists && w === -1)) at.symbolFixed.add(key);
  else if (w === 1) at.symbolFixed.delete(key);
  if (c === 0 || (!exists && c === -1)) at.symbolSealed.add(key); else if (c === 1) at.symbolSealed.delete(key);
  return o;
}
// SYMBOL_END
function __dynOwnEnum(d: Dyn, k: string): boolean { return d instanceof DynObj ? d.map.has(k) : d.kind() > 1 && d.kind() !== 9 && __dynIn(new DynStr(k), d); }
// ponytail: an array is frozen in its object form only (its own methods, push and splice, still change it); a typed object seen through an
// any is not frozen either (its type says what may change)
function __dynFreeze(d: Dyn): any {
  const r: any = d;
  if (d instanceof DynObj) {
    const at: DynAttrs = __dynAttrs(d);
// SYMBOL_BEGIN
    for (const key of at.symbols.keys()) at.symbolFixed.add(key);
// SYMBOL_END
    at.frozen = true;
    for (const k of d.map.keys()) at.fixed.add(k);
    for (const k of at.hidden.keys()) at.fixed.add(k);
  }
  return r;
}
function __dynAssign(t: Dyn, s: Dyn): void {
  if (s.kind() <= 1) return;
  if (t.kind() <= 1) throw new TypeError('Cannot convert undefined or null to object');
  for (const k of __dynKeys(s)) __dynSet(t, k, __dynGet(s, k));
// SYMBOL_BEGIN
  if (s instanceof DynObj && s.attrs !== null) {
    const at: DynAttrs = s.attrs;
    for (const key of at.symbols.keys()) if (!at.symbolHidden.has(key)) __dynSetD(t, key, at.symbols.get(key) ?? __undef);
  }
// SYMBOL_END
}
function __dynFromEntries(d: Dyn): any {
  const o: Dyn = new DynObj(new Map<string, Dyn>());
  for (const x of d) {
    const it: Dyn = x;
    if (it.kind() < 5 || it.kind() === 9) throw new TypeError('Iterator value ' + it.toString() + ' is not an entry object');
    const key: Dyn = __dynGetN(it, 0);
    __dynSetD(o, key, __dynGetN(it, 1));
  }
  return o;
}
// w and e: -1 when the descriptor leaves writable or enumerable out (false for a new property, unchanged for an existing one), else 0 or 1
function __dynDefine(o: Dyn, k: string, v: any, hasValue: boolean, w: i32, e: i32): any {
  const r: any = o;
  if (o instanceof DynObj) {
    const at: DynAttrs = __dynAttrs(o);
    const exists: boolean = o.map.has(k) || at.hidden.has(k);
    if (!exists && at.frozen) throw new TypeError('Cannot define property ' + k + ', object is not extensible');
    const hv: Dyn | undefined = at.hidden.get(k);
    const mv: Dyn | undefined = o.map.get(k);
    const cur: Dyn = hv !== undefined ? hv : mv !== undefined ? mv : __undef;
    const val: Dyn = hasValue ? v : cur;
    if (exists && at.fixed.has(k) && hasValue && !__dynSameValue(cur, val)) throw new TypeError('Cannot redefine property: ' + k);
    const enumerable: boolean = e === 1 || (e === -1 && exists && !at.hidden.has(k));
    const writable: boolean = w === 1 || (w === -1 && exists && !at.fixed.has(k));
    if (enumerable) { at.hidden.delete(k); o.map.set(k, val); } else { o.map.delete(k); at.hidden.set(k, val); }
    if (writable) at.fixed.delete(k); else at.fixed.add(k);
    if (!exists) at.names.push(k);
    return r;
  }
  if (o.kind() < 5 || o.kind() === 9) throw new TypeError('Object.defineProperty called on non-object');
  if (hasValue) __dynSet(o, k, v);
  return r;
}
// keys in JavaScript's order: array indices first, ascending, then the others as inserted
function __keyOrder(ks: string[]): string[] {
  const r: string[] = [];
  const idx: i32[] = [];
  for (const k of ks) { const i: i32 = __indexOfKey(k); if (i >= 0 && '' + i === k) idx.push(i); }
  idx.sort((a: i32, b: i32): number => a - b);
  for (const i of idx) r.push('' + i);
  for (const k of ks) { const i: i32 = __indexOfKey(k); if (!(i >= 0 && '' + i === k)) r.push(k); }
  return r;
}
function __dynObjOf(keys: string[], vals: any[]): any {
  const m: Map<string, Dyn> = new Map<string, Dyn>();
  for (let i: i32 = 0; i < keys.length; i++) m.set(keys[i], vals[i]);
  return new DynObj(m);
}
function __dynArrOf(items: any[]): any { return new DynArr(items); }
function __dynJoin(d: Dyn): string { return d.kind() <= 1 ? '' : d.toString(); }

// SYMBOL_BEGIN
function __dynHasSymbolProperties(d: DynObj): boolean {
  const at: DynAttrs | null = d.attrs;
  if (at === null) return false;
  for (const key of at.symbols.keys()) if (!at.symbolHidden.has(key)) return true;
  return false;
}
// SYMBOL_END

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
    const ks: string[] = __dynKeys(d);
    c[0] += 2;
    for (let i: i32 = 0; i < ks.length; i++) out.push((__isIdentName(ks[i]) ? ks[i] : __q(ks[i])) + ': ' + __fmtDyn(d.map.get(ks[i]) ?? __undef, c, l));
// SYMBOL_BEGIN
    if (d.attrs !== null) {
      const at: DynAttrs = d.attrs;
      for (const key of at.symbols.keys()) if (!at.symbolHidden.has(key)) out.push(key.toString() + ': ' + __fmtDyn(at.symbols.get(key) ?? __undef, c, l));
    }
// SYMBOL_END
    c[0] -= 2;
    return __reduce(c, out, __ref(c, id), '{', '}', l, false, false, false);
  }
  if (d instanceof DynRef) return d.fmt(c, lvl);
  if (d instanceof DynFn) return '[Function: ' + d.name + ']';
  return d.toString();
}
function __logDyn(d: Dyn): string {
  if (d instanceof DynStr) return d.v;
  return __fmtDyn(d, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 0);
}

// ---- JSON
function __dynJsonOmit(d: Dyn): boolean { return d.kind() === 0 || d.kind() === 8 || d.kind() === 9; }
function __dynJson(d: Dyn): string {
  const fast: string = __jsonOut(d);   // the runtime walks the tree; '' when it holds a typed object view
  if (fast.length > 0) return fast;
  return __dynJsonSlow(d);
}
function __dynJsonSlow(d: Dyn): string {
// SYMBOL_BEGIN
  if (d.kind() === 9) return '';
// SYMBOL_END
  if (d instanceof DynNum) return __jsonNum(d.v);
  if (d instanceof DynStr) return __jsonQuote(d.v);
  if (d instanceof DynBool) return d.v ? 'true' : 'false';
  if (d instanceof DynArr) {
    const out: string[] = [];
    for (let i: i32 = 0; i < d.items.length; i++) out.push(__dynJsonOmit(d.items[i]) ? 'null' : __dynJson(d.items[i]));
    return '[' + out.join(',') + ']';
  }
  if (d instanceof DynObj) {
    const out: string[] = [];
    const ks: string[] = __dynKeys(d);   // array indices first, ascending, as JavaScript orders the keys
    for (let i: i32 = 0; i < ks.length; i++) {
      const v: Dyn = d.map.get(ks[i]) ?? __undef;
      if (!__dynJsonOmit(v)) out.push(__jsonQuote(ks[i]) + ':' + __dynJson(v));
    }
    return '{' + out.join(',') + '}';
  }
  if (d instanceof DynRef) return d.json();
  return 'null';
}

// JSON.stringify(v, replacer): the replacer is called with each key and value (the root with ''), from the top down, on the value as JSON reads it
// (toJSON applied); what it returns is written, its own properties walked in turn, and a property it makes undefined is left out (null in an array)
function __jsonApply(root: any, f: (k: string, v: any) => any): any { return __jsonApplyAt('', root, f); }
function __jsonApplyAt(key: string, v: Dyn, f: (k: string, v: any) => any): Dyn {
  const r: Dyn = f(key, v);
  if (r instanceof DynArr) {
    const items: any[] = [];
    for (let i: i32 = 0; i < r.items.length; i++) { const x: Dyn = __jsonApplyAt('' + i, r.items[i], f); items.push(x.kind() === 0 ? __null : x); }
    return new DynArr(items);
  }
  if (r instanceof DynObj) {
    const m: Map<string, Dyn> = new Map<string, Dyn>();
    for (const k of __dynKeys(r)) { const x: Dyn = __jsonApplyAt(k, r.map.get(k) ?? __undef, f); if (x.kind() !== 0) m.set(k, x); }
    return new DynObj(m);
  }
  return r;
}

function __jsonParse(s: string): any {
  const v: any = __jsonNative(s, __null);  // the runtime builds the Dyn tree; null (0) when the text is not JSON
  if (__identity(v) === 0) throw new SyntaxError('JSON.parse: invalid JSON');
  return v;
}
)ZN";
  // Symbol operations are absent from programs that do not name the primitive.
  for (std::size_t begin = source.find("// SYMBOL_BEGIN\n"); begin != std::string::npos; begin = source.find("// SYMBOL_BEGIN\n")) {
    const std::size_t end = source.find("// SYMBOL_END\n", begin);
    if (symbols) { source.erase(end, 14); source.erase(begin, 16); }
    else source.erase(begin, end + 14 - begin);
  }
  if (!symbols) source += "\nfunction __dynStructuredClone(d: Dyn): Dyn { return __jsonParse(__dynJson(d)); }\n";
  if (symbols) {
    auto replace = [&](const std::string& from, const std::string& to) {
      for (std::size_t at = source.find(from); at != std::string::npos; at = source.find(from, at + to.size())) source.replace(at, from.size(), to);
    };
    replace("r += it.toString();", "r += __dynToString(it);");
    replace("const x: string = a.toString();", "const x: string = __dynToString(a);");
    replace("const y: string = b.toString();", "const y: string = __dynToString(b);");
    replace("d.v.indexOf(__dynString(x), from)", "d.v.indexOf(__dynToString(x), from)");
    const std::string emptyObject = "if (d.map.size === 0) return '{}';";
    const auto empty = source.find(emptyObject);
    source.replace(empty, emptyObject.size(), "if (d.map.size === 0 && !__dynHasSymbolProperties(d)) return '{}';");
    const auto join = source.find("function __dynJoin(d: Dyn): string { return d.kind() <= 1 ? '' : d.toString(); }");
    source.replace(join, 80, "function __dynJoin(d: Dyn): string { return d.kind() <= 1 ? '' : __dynToString(d); }");
  }
  if (!symbols) {
    const auto loop = source.find("for (const x of d) {");
    source.replace(loop, 20, "for (const x of __dynIter(d)) {");
    const std::size_t begin = source.find("function __dynIter(d: Dyn): any[] {");
    const std::size_t end = source.find("// d.m(...)", begin);
    source.replace(begin, end - begin, R"ZN(function __dynIter(d: Dyn): any[] {
  if (d instanceof DynArr) return d.items.slice();
  if (d instanceof DynStr) { const r: any[] = []; for (let i: i32 = 0; i < d.v.length;) { const point: i32 = d.v.codePointAt(i); r.push(new DynStr(String.fromCodePoint(point))); i += point > 65535 ? 2 : 1; } return r; }
  throw new TypeError(__dynTypeName(d) + ' is not iterable');
}
function __dynForOf(d: Dyn): any[] { if (d instanceof DynArr) return d.items; return __dynIter(d); }
)ZN");
  }
  return source;
}

}  // namespace zn::frontend
