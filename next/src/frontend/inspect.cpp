#include "frontend/inspect.h"

#include <algorithm>
#include <cctype>
#include <set>

namespace zn::frontend {
namespace {

bool isIdent(const std::string& s) {
  if (s.empty() || std::isdigit(static_cast<unsigned char>(s[0]))) return false;
  for (char ch : s) if (!(std::isalnum(static_cast<unsigned char>(ch)) || ch == '_' || ch == '$')) return false;
  return true;
}

TypeId typeOfObj(const Checked& c, std::uint32_t obj) {
  for (TypeId t = 0; t < c.types.size(); ++t) if (c.types[t].k == TK::Object && c.types[t].obj == obj) return t;
  return kNoType;
}

int depthOf(const Checked& c, std::uint32_t o) {
  int d = 0;
  for (; o != 0xFFFFFFFFu && d < 1000; o = c.objs[o].parent) ++d;
  return d;
}

// Instance fields, inherited first.
void fieldsOf(const Checked& c, std::uint32_t obj, std::vector<const Member*>& out) {
  if (c.objs[obj].parent != 0xFFFFFFFFu) fieldsOf(c, c.objs[obj].parent, out);
  for (const Member& m : c.objs[obj].members) if (!m.method && !m.isStatic) out.push_back(&m);
}

// The concrete classes that can be the dynamic type of a value of class or interface `obj`, most derived first.
std::vector<std::uint32_t> implementations(const Checked& c, std::uint32_t obj) {
  std::vector<std::uint32_t> r;
  for (std::uint32_t o = 0; o < c.objs.size(); ++o) {
    const ObjInfo& oi = c.objs[o];
    if (o == obj || !oi.isClass || oi.isAbstract || oi.isTemplate || oi.isTuple || oi.isRecord || typeOfObj(c, o) == kNoType) continue;
    if (c.objs[obj].isInterface ? objAssignable(c, o, obj) : isSubclass(c, o, obj)) r.push_back(o);
  }
  std::stable_sort(r.begin(), r.end(), [&](std::uint32_t x, std::uint32_t y) { return depthOf(c, x) > depthOf(c, y); });
  return r;
}

bool isFloatNum(Num n) { return n == Num::f64 || n == Num::f32 || n == Num::fx12 || n == Num::fx16; }

bool inspectableRec(const Checked& c, TypeId t, std::set<TypeId>& seen) {
  if (t == kNoType) return false;
  const Type& x = c.types[t];
  switch (x.k) {
    case TK::Num: case TK::Bool: case TK::Str: case TK::Null: case TK::Func: return true;
    case TK::Array: case TK::Set: return seen.count(t) || (seen.insert(t), inspectableRec(c, x.elem, seen));
    case TK::Map: return seen.count(t) || (seen.insert(t), inspectableRec(c, x.params[0], seen) && inspectableRec(c, x.elem, seen));
    case TK::Union: {
      std::size_t objs = 0;
      for (TypeId m : x.params) { if (m == 5 /* tNull */) continue; if (c.types[m].k != TK::Object) return false; ++objs; }
      if (objs != 1) return false;
      for (TypeId m : x.params) if (m != 5 && !inspectableRec(c, m, seen)) return false;
      return true;
    }
    case TK::Object: {
      if (seen.count(t)) return true;
      seen.insert(t);
      const ObjInfo& oi = c.objs[x.obj];
      if (oi.isTemplate) return false;
      std::vector<const Member*> fs;
      fieldsOf(c, x.obj, fs);
      for (const Member* m : fs) if (!isIdent(m->name) && !oi.isTuple) return false;
      for (const Member* m : fs) if (!inspectableRec(c, m->type, seen)) return false;
      if (!oi.isTuple && !oi.isRecord) for (std::uint32_t o : implementations(c, x.obj)) if (!inspectableRec(c, typeOfObj(c, o), seen)) return false;
      return true;
    }
    default: return false;
  }
}

std::string numCall(const Checked& c, TypeId t) { return isFloatNum(c.types[t].num) ? "__num(v)" : "`${v}`"; }

}  // namespace

std::string inspectFmtName(TypeId t) { return "__fmt" + std::to_string(t); }
std::string inspectLogName(TypeId t) { return "__log" + std::to_string(t); }
std::string inspectAliasName(TypeId t) { return "__T" + std::to_string(t); }
std::string inspectClassName(TypeId t) { return "__C" + std::to_string(t); }

bool inspectable(const Checked& c, TypeId t) {
  std::set<TypeId> seen;
  return inspectableRec(c, t, seen);
}

std::string inspectFunction(const Checked& c, TypeId t, bool withLog, std::vector<TypeId>& deps, std::vector<TypeId>& classes) {
  const Type& x = c.types[t];
  std::string head = "function " + inspectFmtName(t) + "(v: " + inspectAliasName(t) + ", c: i32[], lvl: i32): string {\n";
  std::string body;
  auto call = [&](TypeId ct, const std::string& val, const char* lv) { deps.push_back(ct); return inspectFmtName(ct) + "(" + val + ", c, " + lv + ")"; };
  auto reduce = [&](const std::string& open, const std::string& close, bool arr, bool numeric, const std::string& more) {
    return "  return __reduce(c, out, " + std::string("'', ") + open + ", " + close + ", l, " + (arr ? "true" : "false") + ", " + (numeric ? "true" : "false") + ", " + more + ");\n";
  };
  switch (x.k) {
    case TK::Num: body = "  return " + numCall(c, t) + ";\n"; break;
    case TK::Bool: body = "  return `${v}`;\n"; break;
    case TK::Str: body = "  return __q(v);\n"; break;
    case TK::Null: body = "  return 'null';\n"; break;
    case TK::Func: body = "  return '[Function (anonymous)]';\n"; break;
    case TK::Array: {
      body += "  if (v.length === 0) return '[]';\n  if (lvl > 2) return '[Array]';\n  const l: i32 = lvl + 1;\n  c[1] = l;\n  const out: string[] = [];\n";
      body += "  const n: i32 = v.length > 100 ? 100 : v.length;\n  c[0] += 2;\n  for (let i: i32 = 0; i < n; i++) out.push(" + call(x.elem, "v[i]", "l") + ");\n  c[0] -= 2;\n";
      body += "  if (v.length > n) out.push('... ' + (v.length - n) + ' more item' + (v.length - n > 1 ? 's' : ''));\n";
      body += reduce("'['", "']'", true, c.types[x.elem].k == TK::Num, "v.length > n");
      break;
    }
    case TK::Set: {
      body += "  if (v.size === 0) return 'Set(0) {}';\n  if (lvl > 2) return '[Set]';\n  const l: i32 = lvl + 1;\n  c[1] = l;\n  const out: string[] = [];\n";
      body += "  const items = v.values();\n  c[0] += 2;\n  for (const e of items) out.push(" + call(x.elem, "e", "l") + ");\n  c[0] -= 2;\n";
      body += reduce("'Set(' + v.size + ') {'", "'}'", false, false, "false");
      break;
    }
    case TK::Map: {
      body += "  if (v.size === 0) return 'Map(0) {}';\n  if (lvl > 2) return '[Map]';\n  const l: i32 = lvl + 1;\n  c[1] = l;\n  const out: string[] = [];\n";
      body += "  const ks = v.keys();\n  const vs = v.values();\n  c[0] += 2;\n  for (let i: i32 = 0; i < ks.length; i++) out.push(" + call(x.params[0], "ks[i]", "l") + " + ' => ' + " + call(x.elem, "vs[i]", "l") + ");\n  c[0] -= 2;\n";
      body += reduce("'Map(' + v.size + ') {'", "'}'", false, false, "false");
      break;
    }
    case TK::Union: {
      TypeId member = kNoType;
      for (TypeId m : x.params) if (m != 5) member = m;
      body = "  if (v === null) return 'null';\n  return " + call(member, "v", "lvl") + ";\n";
      break;
    }
    case TK::Object: {
      const ObjInfo& oi = c.objs[x.obj];
      std::vector<const Member*> fs;
      fieldsOf(c, x.obj, fs);
      std::string cname = oi.name.substr(0, oi.name.find('<'));
      if (oi.isTuple) {
        if (fs.empty()) { body = "  return '[]';\n"; break; }
        bool numeric = true;
        for (const Member* m : fs) numeric = numeric && c.types[m->type].k == TK::Num;
        body += "  if (lvl > 2) return '[Array]';\n  const l: i32 = lvl + 1;\n  c[1] = l;\n  const out: string[] = [];\n  c[0] += 2;\n";
        for (const Member* m : fs) body += "  out.push(" + call(m->type, "v[" + m->name + "]", "l") + ");\n";
        body += "  c[0] -= 2;\n" + reduce("'['", "']'", true, numeric, "false");
        break;
      }
      bool plain = oi.isRecord;  // object literals print without a class name
      // a class or interface: the dynamic type decides, most derived first
      if (!plain) {
        for (std::uint32_t o : implementations(c, x.obj)) {
          TypeId ot = typeOfObj(c, o);
          classes.push_back(ot);
          body += "  if (v instanceof " + inspectClassName(ot) + ") return " + call(ot, "v", "lvl") + ";\n";
        }
        if (oi.isInterface || oi.isAbstract) { body += "  return '[Object]';\n"; break; }
      }
      std::string prefix = plain ? "" : cname + " ";
      if (fs.empty()) { body += "  return '" + prefix + "{}';\n"; break; }
      body += "  if (lvl > 2) return '[" + (plain ? std::string("Object") : cname) + "]';\n  const l: i32 = lvl + 1;\n  c[1] = l;\n  const out: string[] = [];\n  c[0] += 2;\n";
      for (const Member* m : fs) body += "  out.push('" + m->name + ": ' + " + call(m->type, "v." + m->name, "l") + ");\n";
      body += "  c[0] -= 2;\n" + reduce("'" + prefix + "{'", "'}'", false, false, "false");
      break;
    }
    default: body = "  return '[unknown]';\n"; break;
  }
  std::string text = head + body + "}\n";
  if (withLog) text += "function " + inspectLogName(t) + "(v: " + inspectAliasName(t) + "): string {\n  return " + inspectFmtName(t) + "(v, [0, 0], 0);\n}\n";
  return text;
}

const char* inspectPrelude() {
  return R"ZN(
function __num(v: number): string {
  return v === 0 && 1 / v < 0 ? '-0' : `${v}`;
}
function __hex2(n: i32): string {
  const d: string = '0123456789ABCDEF';
  return d.charAt((n >> 4) & 15) + d.charAt(n & 15);
}
function __q(s: string): string {
  let quote: string = "'";
  if (s.includes("'")) {
    if (!s.includes('"')) quote = '"';
    else if (!s.includes('`') && !s.includes('${')) quote = '`';
  }
  let plain: boolean = true;
  for (let i: i32 = 0; i < s.length; i++) {
    const k: i32 = s.charCodeAt(i);
    if (k < 32 || k === 127 || k === 92 || s.charAt(i) === quote) plain = false;
  }
  if (plain) return quote + s + quote;
  let out: string = quote;
  for (let i: i32 = 0; i < s.length; i++) {
    const k: i32 = s.charCodeAt(i);
    const ch: string = s.charAt(i);
    if (ch === quote || k === 92) out += '\\' + ch;
    else if (k === 10) out += '\\n';
    else if (k === 9) out += '\\t';
    else if (k === 13) out += '\\r';
    else if (k === 8) out += '\\b';
    else if (k === 12) out += '\\f';
    else if (k === 11) out += '\\v';
    else if (k < 32 || k === 127) out += '\\x' + __hex2(k);
    else out += ch;
  }
  return out + quote;
}
function __padStart(s: string, width: i32): string {
  return s.length >= width ? s : ' '.repeat(width - s.length) + s;
}
function __padEnd(s: string, width: i32): string {
  return s.length >= width ? s : s + ' '.repeat(width - s.length);
}
function __below(output: string[], start: i32, base: string): boolean {
  let total: i32 = output.length + start;
  if (total + output.length > 80) return false;
  for (const s of output) {
    total += s.length;
    if (total > 80) return false;
  }
  return base === '' || !base.includes('\n');
}
function __group(c: i32[], output: string[], numeric: boolean, more: boolean): string[] {
  let total: i32 = 0;
  let maxLen: i32 = 0;
  const n: i32 = more ? output.length - 1 : output.length;
  const dataLen: i32[] = [];
  for (let i: i32 = 0; i < n; i++) {
    const len: i32 = output[i].length;
    dataLen.push(len);
    total += len + 2;
    if (maxLen < len) maxLen = len;
  }
  const actualMax: i32 = maxLen + 2;
  if (actualMax * 3 + c[0] < 80 && (total / actualMax > 5 || maxLen <= 6)) {
    const averageBias: number = Math.sqrt(actualMax - total / output.length);
    const biasedMax: number = Math.max(actualMax - 3 - averageBias, 1);
    const byShape: number = Math.round(Math.sqrt(2.5 * biasedMax * n) / biasedMax);
    const byWidth: number = Math.floor((80 - c[0]) / actualMax);
    const columns: i32 = Math.min(Math.min(byShape, byWidth), 12) | 0;
    if (columns <= 1) return output;
    const tmp: string[] = [];
    const maxLine: i32[] = [];
    for (let i: i32 = 0; i < columns; i++) {
      let lineLength: i32 = 0;
      for (let j: i32 = i; j < n; j += columns) if (dataLen[j] > lineLength) lineLength = dataLen[j];
      maxLine.push(lineLength + 2);
    }
    for (let i: i32 = 0; i < n; i += columns) {
      const max: i32 = Math.min(i + columns, n) | 0;
      let str: string = '';
      let j: i32 = i;
      for (; j < max - 1; j++) {
        const cell: string = output[j] + ', ';
        str += numeric ? __padStart(cell, maxLine[j - i]) : __padEnd(cell, maxLine[j - i]);
      }
      str += numeric ? __padStart(output[j], maxLine[j - i] - 2) : output[j];
      tmp.push(str);
    }
    if (more) tmp.push(output[n]);
    return tmp;
  }
  return output;
}
function __reduce(c: i32[], output: string[], base: string, open: string, close: string, level: i32, isArray: boolean, numeric: boolean, more: boolean): string {
  let out: string[] = output;
  const entries: i32 = out.length;
  if (isArray && entries > 6) out = __group(c, out, numeric, more);
  if (c[1] - level < 3 && entries === out.length) {
    const start: i32 = out.length + c[0] + open.length + base.length + 10;
    if (__below(out, start, base)) {
      const joined: string = out.join(', ');
      if (!joined.includes('\n')) return (base === '' ? '' : base + ' ') + open + ' ' + joined + ' ' + close;
    }
  }
  const indentation: string = '\n' + ' '.repeat(c[0]);
  return (base === '' ? '' : base + ' ') + open + indentation + '  ' + out.join(',' + indentation + '  ') + indentation + close;
}
)ZN";
}

}  // namespace zn::frontend
