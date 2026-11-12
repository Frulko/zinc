#include "qjs/strip.h"

#include <algorithm>
#include <cctype>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <functional>
#include <memory>
#include <map>
#include <set>
#include <sstream>
#include <unordered_set>
#include <vector>

#include "frontend/diagnostics.h"
#include "frontend/jsx.h"
#include "frontend/lexer.h"
#include "frontend/modules.h"
#include "frontend/native_gen.h"
#include "frontend/parser.h"
#include "frontend/profile.h"
#include "frontend/project.h"
#include "frontend/resolve.h"

namespace zn::qjs {
const char* const kCollectionResultsModule = R"JS(// Private bridge for Zinc's typed array contract. Capture identities; never mutate globals or prototypes.
const mk = Map.prototype.keys, mv = Map.prototype.values, me = Map.prototype.entries;
const sk = Set.prototype.keys, sv = Set.prototype.values, se = Set.prototype.entries;
const ak = Array.prototype.keys, av = Array.prototype.values, ae = Array.prototype.entries;
const apply = Reflect.apply, from = Array.from;
export function collectionResult(receiver, key, direct = false, args = []) {
  const method = direct ? key : receiver[key];
  const result = apply(method, receiver, args);
  if (direct === 2) return result;
  return method === mk || method === mv || method === me || method === sk || method === sv || method === se ||
    method === ak || method === av || method === ae ? from(result) : result;
}
)JS";

std::string webMode(const std::string& entry);   // src/qjs/webenv.cpp: "" when the program does not ask for the web environment
namespace {
using namespace zn::frontend;

struct Edit { std::uint32_t from, to; std::string text; };  // text empty: blank the range (newlines kept)

struct Stripper {
  std::string_view s;
  const Ast& a;
  std::vector<Edit> edits;
  std::string err;
  std::uint32_t errPos = 0;

  Stripper(std::string_view src, const Ast& ast) : s(src), a(ast) {}

  const Node& n(std::uint32_t i) const { return a.nodes[i]; }
  void blank(std::uint32_t from, std::uint32_t to) { if (from < to && to <= s.size()) edits.push_back({from, to, ""}); }
  void fail(std::uint32_t pos, std::string msg) { if (err.empty()) { err = std::move(msg); errPos = pos; } }
  bool space(std::uint32_t i) const { return i < s.size() && std::isspace(static_cast<unsigned char>(s[i])); }

  // `: T` after a name: the colon (and a `?` or `!` before it) up to the end of the type, with the parentheses around the type
  void annotation(std::uint32_t type) {
    if (type == kNone) return;
    const Node& t = n(type);
    std::uint32_t from = t.start;
    int parens = 0;
    while (from > 0 && (space(from - 1) || s[from - 1] == '(')) { if (s[from - 1] == '(') parens++; from--; }
    if (from == 0 || s[from - 1] != ':') return;  // not an annotation we recognise (a synthetic type): leave it
    from--;
    std::uint32_t q = from;
    while (q > 0 && space(q - 1)) q--;
    if (q > 0 && (s[q - 1] == '?' || s[q - 1] == '!')) from = q - 1;
    std::uint32_t to = t.end;
    while (parens > 0) { while (space(to)) to++; if (to < s.size() && s[to] == ')') { to++; parens--; } else break; }
    blank(from, to);
  }

  // `<...>` that starts at or after `from` (only whitespace between): erased to its matching `>`
  void angles(std::uint32_t from) {
    while (from < s.size() && space(from)) from++;
    if (from >= s.size() || s[from] != '<') return;
    int depth = 0;
    for (std::uint32_t i = from; i < s.size(); ++i) {
      if (s[i] == '<') depth++;
      else if (s[i] == '>' && s[i - 1] != '=' && --depth == 0) { blank(from, i + 1); return; }   // not the `>` of a function type's `=>`
    }
  }
  // the angle brackets that hold the nodes `list` (type parameters or arguments): the `<` just before the first, up to the `>` after the last
  void bracketed(const std::vector<std::uint32_t>& list) {
    if (list.empty()) return;
    std::uint32_t first = n(list.front()).start;
    while (first > 0 && (space(first - 1) || s[first - 1] == '<')) { first--; if (s[first] == '<') break; }
    if (first < s.size() && s[first] == '<') angles(first);
  }

  // modifiers before a member's name: public private protected readonly abstract override declare, also after `static` (which stays)
  void modifiers(std::uint32_t at) {
    for (;;) {
      while (space(at)) at++;
      std::uint32_t e = at;
      while (e < s.size() && (std::isalnum(static_cast<unsigned char>(s[e])) || s[e] == '_' || s[e] == '$')) e++;
      std::string_view w = s.substr(at, e - at);
      const bool keep = w == "static";
      if (!keep && w != "public" && w != "private" && w != "protected" && w != "readonly" && w != "abstract" && w != "override" && w != "declare" && w != "accessor") return;  // accessor: a plain field
      std::uint32_t nx = e;
      while (space(nx)) nx++;
      if (nx >= s.size() || std::string_view("(:=;?<}!,)").find(s[nx]) != std::string_view::npos) return;  // a member that is called like a modifier
      if (!keep) blank(at, e);
      at = e;
    }
  }

  // `@name`, `@name.sub` and `@name(args)` just before a declaration (Zinc's @weak, @pooled(n)): the parser skips them and leaves no node, and
  // they mean nothing to JavaScript
  void decorators(std::uint32_t start) {
    for (;;) {
      std::uint32_t e = start;
      while (e > 0 && space(e - 1)) e--;
      std::uint32_t b = e;
      if (b > 0 && s[b - 1] == ')') { int depth = 0; while (b > 0) { --b; if (s[b] == ')') depth++; else if (s[b] == '(' && --depth == 0) break; } }
      while (b > 0 && (std::isalnum(static_cast<unsigned char>(s[b - 1])) || s[b - 1] == '_' || s[b - 1] == '$' || s[b - 1] == '.')) b--;
      if (b == 0 || b == e || s[b - 1] != '@') return;
      blank(b - 1, e);
      start = b - 1;
    }
  }

  // `constructor(private x: i32)`: the assignments `this.x = x;` go first in the body, after the `super(...)` call of a derived class
  void paramProperties(const Node& ctor) {
    std::string text;
    for (std::size_t k = 2; k < ctor.kids.size(); ++k) {
      const Node& p = n(ctor.kids[k]);
      if (p.flags & (kFlagPublic | kFlagPrivate | kFlagProtected | kFlagReadonly)) text += " this." + std::string(p.text) + " = " + std::string(p.text) + ";";
    }
    if (text.empty() || ctor.kids[1] == kNone) return;
    const Node& body = n(ctor.kids[1]);
    std::uint32_t at = body.start + 1;
    for (std::uint32_t k : body.kids) {   // after the `super(...)` statement, wherever it is in the body (code may come before it, as in TypeScript)
      const Node& st = n(k);
      if (st.flags & kFlagSynthetic) continue;
      if (st.kind == N::ExprStmt && !st.kids.empty() && n(st.kids[0]).kind == N::Call && n(n(st.kids[0]).kids[0]).kind == N::Super) { at = st.end; break; }
    }
    edits.push_back({at, at, text});
  }

  void enumDecl(const Node& x) {
    std::string name(x.text);
    std::string r = "var " + name + "; (function (" + name + ") { ";
    std::string prev;
    for (std::uint32_t k : x.kids) {
      const Node& m = n(k);
      std::string mn(m.text), value;
      if (!m.kids.empty() && m.kids[0] != kNone) value = std::string(s.substr(n(m.kids[0]).start, n(m.kids[0]).end - n(m.kids[0]).start));
      else value = prev.empty() ? "0" : prev + " + 1";
      std::string q = "\"" + mn + "\"";
      r += name + "[" + name + "[" + q + "] = " + value + "] = " + q + "; ";
      prev = name + "[" + q + "]";
    }
    r += "})(" + name + " || (" + name + " = {}));";
    edits.push_back({x.start, x.end, r});
  }

  // The names the file reads as values: an imported name read only in types leaves its import, as TypeScript elides it (another
  // file's interface or alias is no export at run time: `import { Scene, TitleScene }` of game-2d)
  std::unordered_set<std::string_view> valueNames() const {
    std::vector<bool> spec(a.nodes.size());
    for (const Node& x : a.nodes) if (x.kind == N::ImportSpec) spec[x.kids[0]] = true;
    std::unordered_set<std::string_view> v;
    for (std::uint32_t i = 0; i < a.nodes.size(); ++i) {
      const Node& x = n(i);
      if (x.kind == N::Ident && !spec[i]) v.insert(x.text);
      else if (x.kind == N::ExportSpec) v.insert(x.text);
      else if (x.kind == N::Class && x.kids[0] != kNone) { std::string_view t = n(x.kids[0]).text; v.insert(t.substr(0, t.find('.'))); }  // `extends` reads a value
    }
    return v;
  }

  // `import X, { a, b as c } from './m'` (also `import type`): rewritten with the specifiers read as values; none left, nothing, as TypeScript
  // elides it (a module imported for its types is not evaluated: Athena Crisis's `import type Unit` would close an import cycle)
  void importDecl(const Node& x, const std::unordered_set<std::string_view>& values) {
    if (x.kids.empty()) {
      const auto selected = generatedModuleVariant(a, x, values);
      if (selected != x.text) edits.push_back({x.start, x.end, "import " + selected + ";"});
      return;
    }
    std::string def, ns, named;
    for (std::uint32_t k : x.kids) {
      const Node& sp = n(k);
      std::string_view local = n(sp.kids[0]).text;
      if (!values.count(local)) continue;
      if (sp.text == "*") ns = local;
      else if (sp.text == "default") def = local;
      else named += (named.empty() ? "" : ", ") + std::string(sp.text) + (sp.text == local ? "" : " as " + std::string(local));
    }
    std::string r = def;
    if (!ns.empty()) r += (r.empty() ? "" : ", ") + ("* as " + ns);
    else if (!named.empty()) r += (r.empty() ? "" : ", ") + ("{ " + named + " }");
    if (r.empty()) blank(x.start, x.end);
    else edits.push_back({x.start, x.end, "import " + r + " from " + generatedModuleVariant(a, x, values) + ";"});
  }

  void run() {
    const std::unordered_set<std::string_view> values = valueNames();
    for (std::uint32_t i = 0; i < a.nodes.size() && err.empty(); ++i) {
      const Node& x = n(i);
      if (x.flags & kFlagSynthetic) continue;
      switch (x.kind) {
        case N::Declarator: annotation(x.kids[0]); break;
        case N::Param:
          if (x.flags & (kFlagPublic | kFlagPrivate | kFlagProtected | kFlagReadonly)) modifiers(x.start);
          annotation(x.kids[0]);
          break;
        case N::Function: case N::FuncExpr: annotation(x.kids[0]); break;
        case N::Try:   // `catch (e: any)`: the parser reads the type and keeps no node of it, so the colon up to the clause's `)` goes
          if (x.kids[1] != kNone) {
            std::uint32_t from = n(x.kids[1]).end, to = from;
            while (space(to)) to++;
            if (to >= s.size() || s[to] != ':') break;
            for (int depth = 0; to < s.size() && (depth > 0 || s[to] != ')'); ++to) depth += (s[to] == '(' || s[to] == '[' || s[to] == '{') - (s[to] == ')' || s[to] == ']' || s[to] == '}');
            blank(from, to);
          }
          break;
        case N::Method:
          if ((x.flags & kFlagAbstract) && x.kids[1] == kNone) { blank(x.start, x.end); break; }
          annotation(x.kids[0]);
          modifiers(x.start);
          decorators(x.start);
          if (x.text == "constructor") paramProperties(x);
          break;
        case N::Field: annotation(x.kids[0]); modifiers(x.start); decorators(x.start); break;
        case N::Class: {
          modifiers(x.start);
          decorators(x.start);
          if (x.kids[0] != kNone) { const Node& e = n(x.kids[0]); if (!e.kids.empty()) angles(e.start + e.text.size()); }
          if (x.kids[1] != kNone) {  // `implements A, B`: from the keyword to the end of the list
            const Node& h = n(x.kids[1]);
            std::uint32_t k = h.start;
            while (k >= 10 && s.substr(k - 10, 10) != "implements") k--;
            if (k >= 10) blank(k - 10, h.end);
          }
          break;
        }
        case N::Interface: case N::TypeAlias: blank(x.start, x.end); break;
        case N::Import: importDecl(x, values); break;
        case N::ExportAll: case N::ExportList:
          if (x.flags & kFlagTypeOnly) blank(x.start, x.end);
          else if (!x.text.empty()) {
            const auto selected = generatedModuleVariant(a, x, values);
            if (selected != x.text) {
              const auto at = static_cast<std::uint32_t>(x.text.data() - s.data());
              edits.push_back({at, at + static_cast<std::uint32_t>(x.text.size()), selected});
            }
          }
          break;   // `export type { A } from './a'`
        case N::ExportSpec: if (x.flags & kFlagTypeOnly) blank(x.start, x.start + 4); break;   // `export { a, type B }`: the type exports as the binding `export var B` of its module
        case N::Export:
          decorators(x.start);
          if (!x.kids.empty() && x.kids[0] != kNone && (n(x.kids[0]).kind == N::Interface || n(x.kids[0]).kind == N::TypeAlias)) {
            // an exported type: a binding with no value, so that `export { Theme } from './theme'` and `import { Theme }` in a file that only
            // re-exports it still link (TypeScript elides them with the type information QuickJS does not have); merged with a value: nothing
            const std::string_view name = n(x.kids[0]).text;
            if (!name.empty() && !values.count(name)) edits.push_back({x.start, x.end, "export var " + std::string(name) + ";"});
            else blank(x.start, x.end);
          }
          break;
        case N::As: {
          std::uint32_t k = n(x.kids[0]).end;
          const std::string_view word = x.text.empty() ? std::string_view("as") : x.text;  // "as" or "satisfies"
          while (k + word.size() <= x.end && !(s.substr(k, word.size()) == word && (k == 0 || !std::isalnum(static_cast<unsigned char>(s[k - 1]))) && space(k + word.size()))) k++;
          blank(k, x.end);
          break;
        }
        case N::Empty: if (x.text == "declare") blank(x.start, x.end); break;  // an ambient declaration
        case N::NonNull: blank(x.end - 1, x.end); break;  // the `!`
        case N::Enum: enumDecl(x); break;
        default: break;
      }
    }
    for (auto& [id, list] : a.tparams) bracketed(list);
    for (auto& [id, list] : a.targs) bracketed(list);
  }
};

// ---- zinc:worker's typed messages on QuickJS (ZN-587): the record schemas the typed engines' checker computes from `new Worker<In, Out>` and
// from `self.onmessage = (e: MessageEvent<T>) => ...`, written into the program from the same types: `new Worker<In, Out>(__recTypes('<In>',
// '<Out>', entry))` and `self.onmessage = __recAs('<T>', handler)` (src/qjs/worker_js.cpp takes them). The types are looked up syntactically
// in the file and the files it imports by a relative path; one the schema text cannot name gives '' and the messages are cloned untyped.

// The interfaces and type aliases of `text` and of the files it imports by a relative path (theirs first: the file's own win).
void declarations(const std::string& text, const std::string& file, std::set<std::string>& seen, std::string& out, int depth = 0) {
  ParseResult pr = parse(text);
  if (pr.ast.root == kNone || depth > 8) return;
  const Ast& a = pr.ast;
  for (std::uint32_t st : a.nodes[a.root].kids) {
    const Node& im = a.nodes[st];
    if (im.kind != N::Import || im.text.size() < 4 || im.text[1] != '.') continue;
    const std::string base = normalize(dirOf(file) + "/" + std::string(im.text.substr(1, im.text.size() - 2)));
    for (const char* ext : {"", ".ts", ".tsx", "/index.ts"}) {
      std::ifstream in(base + ext, std::ios::binary);
      if (!in || !std::filesystem::is_regular_file(base + ext)) continue;
      if (seen.insert(base + ext).second) { std::stringstream ss; ss << in.rdbuf(); declarations(ss.str(), base + ext, seen, out, depth + 1); }
      break;
    }
  }
  for (std::uint32_t st : a.nodes[a.root].kids) {
    std::uint32_t d = st;
    if (a.nodes[d].kind == N::Export && !a.nodes[d].kids.empty() && a.nodes[d].kids[0] != kNone) d = a.nodes[d].kids[0];
    if (a.nodes[d].kind == N::Interface || a.nodes[d].kind == N::TypeAlias) out += text.substr(a.nodes[d].start, a.nodes[d].end - a.nodes[d].start) + "\n";
  }
}

std::string workerTypesForJs(const std::string& text, const std::string& file) {
  ParseResult pr = parse(text);
  if (pr.ast.root == kNone || !pr.diags.empty()) return text;
  const Ast& a = pr.ast;
  std::string decls;
  std::set<std::string> seen{file};
  bool any = false;
  std::vector<std::pair<std::uint32_t, std::string>> ins;   // (position, text to insert)
  auto schema = [&](std::uint32_t ty) {
    if (!any) { declarations(text, file, seen, decls); any = true; }
    return schemaOfType(decls, text.substr(a.nodes[ty].start, a.nodes[ty].end - a.nodes[ty].start));
  };
  for (std::uint32_t i = 0; i < a.nodes.size(); ++i) {
    const Node& x = a.nodes[i];
    if (x.kind == N::New && x.kids.size() == 2 && a.nodes[x.kids[0]].kind == N::Ident && a.nodes[x.kids[0]].text == "Worker") {
      auto t = a.targs.find(i);
      if (t == a.targs.end() || t->second.size() != 2) continue;
      const Node& arg = a.nodes[x.kids[1]];
      ins.push_back({arg.start, "__recTypes('" + schema(t->second[0]) + "', '" + schema(t->second[1]) + "', "});
      ins.push_back({arg.end, ")"});
    } else if (x.kind == N::Assign && x.text == "=" && x.kids.size() == 2) {
      const Node& lhs = a.nodes[x.kids[0]];
      const Node& fn = a.nodes[x.kids[1]];
      if (lhs.kind != N::Member || lhs.text != "onmessage" || a.nodes[lhs.kids[0]].kind != N::Ident || a.nodes[lhs.kids[0]].text != "self") continue;
      if (fn.kind != N::FuncExpr || fn.kids.size() < 3 || a.nodes[fn.kids[2]].kids.empty()) continue;
      const std::uint32_t pt = a.nodes[fn.kids[2]].kids[0];
      if (pt == kNone || a.nodes[pt].kind != N::TypeRef || a.nodes[pt].text != "MessageEvent" || a.nodes[pt].kids.size() != 1) continue;
      ins.push_back({fn.start, "__recAs('" + schema(a.nodes[pt].kids[0]) + "', "});
      ins.push_back({fn.end, ")"});
    }
  }
  if (ins.empty()) return text;
  std::stable_sort(ins.begin(), ins.end(), [](const auto& p, const auto& q) { return p.first > q.first; });
  std::string out = text;
  for (const auto& [at, t] : ins) out.insert(at, t);
  return out;
}

// ---- the checked copy out of `any` (D179): `const p: P = JSON.parse(s)` and `JSON.parse(s) as P` become `__dynAs('<schema of P>', JSON.parse(s))`
// (src/qjs/prelude.cpp), which keeps the declared fields and throws the typed engines' TypeError on a missing or wrong one. The types are looked up
// syntactically as for zinc:worker above; a type with no schema (a union of literals, a class, a generic) is left unchecked, as before.
// ponytail: only JSON.parse at a declaration or an `as` is a site; the checker's other conversion sites (arguments, returns, `any` variables) wait
// for types in this transform.
std::string dynCopiesForJs(const std::string& text, const std::string& file) {
  ParseResult pr = parse(text);
  if (pr.ast.root == kNone || !pr.diags.empty()) return text;
  const Ast& a = pr.ast;
  auto isParse = [&](std::uint32_t e) {
    if (e == kNone || a.nodes[e].kind != N::Call || a.nodes[e].kids.empty()) return false;
    const Node& c = a.nodes[a.nodes[e].kids[0]];
    return c.kind == N::Member && c.text == "parse" && !c.kids.empty() && a.nodes[c.kids[0]].kind == N::Ident && a.nodes[c.kids[0]].text == "JSON";
  };
  std::string decls;
  bool any = false;
  std::set<std::string> seen{file};
  std::vector<std::pair<std::uint32_t, std::string>> ins;
  auto site = [&](std::uint32_t ty, std::uint32_t call) {
    if (!any) { declarations(text, file, seen, decls); any = true; }
    const std::string schema = schemaOfType(decls, text.substr(a.nodes[ty].start, a.nodes[ty].end - a.nodes[ty].start), true);
    if (schema.empty()) return;
    ins.push_back({a.nodes[call].start, "__dynAs('" + schema + "', "});
    ins.push_back({a.nodes[call].end, ")"});
  };
  for (const Node& x : a.nodes) {
    if (x.flags & kFlagSynthetic) continue;
    if (x.kind == N::Declarator && x.kids.size() >= 2 && x.kids[0] != kNone && isParse(x.kids[1])) site(x.kids[0], x.kids[1]);
    else if (x.kind == N::As && x.text != "satisfies" && x.kids.size() == 2 && isParse(x.kids[0])) site(x.kids[1], x.kids[0]);
  }
  if (ins.empty()) return text;
  std::stable_sort(ins.begin(), ins.end(), [](const auto& p, const auto& q) { return p.first > q.first; });
  std::string out = text;
  for (const auto& [at, t] : ins) out.insert(at, t);
  return out;
}

// ---- typed numbers on QuickJS (ZN-796): the machine kinds the typed engines compute with (i32 and u32 wrap, u8/i8/u16/i16 wrap on store, f32
// rounds, an integer store truncates) written into the JavaScript before the types are erased, with the checker's rules (check.cpp `arith`, `assignable`):
// `a + 1` of an i32 is `((a + 1)|0)`, `a * b` is `Math.imul(a, b)`, `z = 7 / 2` into an i32 is `z = ((7 / 2)|0)`, `c += 10` of a u8 is
// `c = ((c + (10))&255)`, an f32 sum `Math.fround(f + g)`. The kinds are found syntactically: annotated variables, parameters, returns, fields read
// through `this`, arrays `T[]`, the functions and `this` methods of the file, and unannotated variables initialised from those.
// ponytail: a value of another object's field, an imported function or a method of another object is unknown (no wrap); i32/u32 `++`/`--` are left
// as they are (they wrap only past 2^31 and stay QuickJS's fast increment); a compound assignment to a target with side effects is left alone;
// out-of-range doubles (1e20, Infinity) convert as JavaScript's ToInt32, where the interpreter's conversion saturates.
enum class NK : std::uint8_t { None, Lit, F64, F32, I8, I16, I32, U8, U16, U32 };   // None: not a number the pass knows (treated as f64)

struct NumWraps {
  struct Bind { NK k = NK::None; bool arr = false, fn = false; NK ret = NK::None; std::vector<NK> params; };
  struct Cls { std::unordered_map<std::string_view, Bind> fields, methods; };
  struct Wrap { std::uint32_t from, to; int prio; std::string pre, post; };   // prio: 0 an operation's own wrap, 1 a conversion around it
  struct Rep { std::uint32_t from, to; std::string text; };

  std::string_view s;
  const Ast& a;
  std::vector<std::unordered_map<std::string_view, Bind>> scopes;
  std::vector<const Cls*> self;   // the class `this` is, nullptr in a function or a static member
  std::vector<NK> rets;
  std::vector<std::unique_ptr<Cls>> classes;
  std::vector<NK> kinds, pending;   // per node: its kind; the conversion its own operation wants, None when emitted or not needed
  std::vector<bool> coerced;        // per node: an integer store converts it, so its own i32/u32 wrap can go
  std::vector<Wrap> wraps;
  std::vector<Rep> reps;

  NumWraps(std::string_view src, const Ast& ast) : s(src), a(ast), kinds(ast.nodes.size(), NK::None), pending(ast.nodes.size(), NK::None), coerced(ast.nodes.size()) {}
  const Node& n(std::uint32_t i) const { return a.nodes[i]; }
  bool space(std::uint32_t i) const { return i < s.size() && std::isspace(static_cast<unsigned char>(s[i])); }
  static bool isInt(NK k) { return k >= NK::I8; }
  static bool wide(NK k) { return k == NK::I32 || k == NK::U32; }

  static NK named(std::string_view t) {
    if (t == "i32") return NK::I32; if (t == "u32") return NK::U32; if (t == "u8") return NK::U8; if (t == "i8") return NK::I8;
    if (t == "u16") return NK::U16; if (t == "i16") return NK::I16; if (t == "f32") return NK::F32; if (t == "f64" || t == "number") return NK::F64;
    return NK::None;
  }
  Bind typeOf(std::uint32_t t) const {
    Bind b;
    if (t == kNone) return b;
    if (n(t).kind == N::TypeRef && n(t).kids.empty()) b.k = named(n(t).text);
    else if (n(t).kind == N::TypeArray && n(n(t).kids[0]).kind == N::TypeRef && n(n(t).kids[0]).kids.empty()) { b.k = named(n(n(t).kids[0]).text); b.arr = b.k != NK::None; }
    return b;
  }
  NK scalar(std::uint32_t t) const { const Bind b = typeOf(t); return b.arr ? NK::None : b.k; }   // the kind a store into a slot of type `t` converts to
  // an integer literal (with its sign): its value
  bool intLit(std::uint32_t i, double& v) const {
    const Node& x = n(i);
    if (x.kind == N::Unary && x.text == "-" && intLit(x.kids[0], v)) { v = -v; return true; }
    if (x.kind != N::Number) return false;
    std::string t;
    for (char c : x.text) if (c != '_') t += c;
    if (t.size() > 2 && t[0] == '0' && std::isalpha(static_cast<unsigned char>(t[1]))) {
      const int base = (t[1] == 'x' || t[1] == 'X') ? 16 : (t[1] == 'b' || t[1] == 'B') ? 2 : 8;
      v = static_cast<double>(std::strtoull(t.c_str() + 2, nullptr, base));
      return true;
    }
    if (t.find_first_of(".eEn") != std::string::npos) return false;
    v = std::strtod(t.c_str(), nullptr);
    return true;
  }
  static bool fits(double v, NK k) {
    switch (k) {
      case NK::I8: return v >= -128 && v <= 127;
      case NK::I16: return v >= -32768 && v <= 32767;
      case NK::I32: return v >= -2147483648.0 && v <= 2147483647.0;
      case NK::U8: return v >= 0 && v <= 255;
      case NK::U16: return v >= 0 && v <= 65535;
      case NK::U32: return v >= 0 && v <= 4294967295.0;
      case NK::F32: return v >= -16777216.0 && v <= 16777216.0;
      default: return true;
    }
  }
  // check.cpp `arith`: a literal takes the other operand's integer kind when it fits it; narrow kinds compute as i32
  NK arith(std::string_view op, std::uint32_t le, NK l, std::uint32_t re, NK r) const {
    double v = 0;
    NK x = l == NK::Lit ? (isInt(r) && intLit(le, v) && fits(v, r) ? r : NK::F64) : l == NK::None ? NK::F64 : l;
    NK y = r == NK::Lit ? (isInt(l) && intLit(re, v) && fits(v, l) ? l : NK::F64) : r == NK::None ? NK::F64 : r;
    if (x == NK::F64 || y == NK::F64) return NK::F64;
    if (x == NK::F32 || y == NK::F32) return NK::F32;
    if (op == "/" || op == "**") return NK::F64;
    auto w = [](NK k) { return k == NK::U32 ? NK::U32 : NK::I32; };
    return w(x) == w(y) ? w(x) : NK::F64;
  }
  static std::pair<std::string, std::string> conv(NK k) {
    switch (k) {
      case NK::I32: return {"((", ")|0)"};
      case NK::U32: return {"((", ")>>>0)"};
      case NK::U8: return {"((", ")&255)"};
      case NK::U16: return {"((", ")&65535)"};
      case NK::I8: return {"((", ")<<24>>24)"};
      case NK::I16: return {"((", ")<<16>>16)"};
      case NK::F32: return {"Math.fround(", ")"};
      default: return {"", ""};
    }
  }

  // The source range of an expression with the parentheses of its own leftmost and rightmost operands (the parser keeps no node for them):
  // `(a + b) * c` starts at the `(`.
  std::uint32_t lo(std::uint32_t i) const {
    const Node& x = n(i);
    const bool left = x.kind == N::Binary || x.kind == N::Assign || x.kind == N::Cond || x.kind == N::Call || x.kind == N::Member || x.kind == N::Index ||
                      x.kind == N::UpdatePost || x.kind == N::As || x.kind == N::NonNull;
    if (!left || x.kids.empty() || x.kids[0] == kNone || n(x.kids[0]).start != x.start) return x.start;
    std::uint32_t st = lo(x.kids[0]), p = hi(x.kids[0]);
    int k = 0;
    for (;;) { while (space(p)) p++; if (p < s.size() && s[p] == ')') { k++; p++; } else break; }
    for (; k > 0; --k) { std::uint32_t q = st; while (q > 0 && space(q - 1)) q--; if (q == 0 || s[q - 1] != '(') break; st = q - 1; }
    return st;
  }
  std::uint32_t hi(std::uint32_t i) const {
    const Node& x = n(i);
    std::uint32_t r = kNone;
    if (x.kind == N::Binary || x.kind == N::Assign) r = x.kids[1];
    else if (x.kind == N::Cond) r = x.kids[2];
    else if (x.kind == N::Unary || x.kind == N::UpdatePre) r = x.kids[0];
    if (r == kNone || n(r).end != x.end) return x.end;
    std::uint32_t e = hi(r), q = lo(r);
    int k = 0;
    for (;;) { while (q > 0 && space(q - 1)) q--; if (q > 0 && s[q - 1] == '(') { k++; q--; } else break; }
    for (; k > 0; --k) { std::uint32_t p = e; while (space(p)) p++; if (p >= s.size() || s[p] != ')') break; e = p + 1; }
    return e;
  }
  void wrap(std::uint32_t i, int prio, std::pair<std::string, std::string> pp) {
    if (n(i).flags & kFlagSynthetic) return;
    wraps.push_back({lo(i), hi(i), prio, std::move(pp.first), std::move(pp.second)});
  }
  // the operator between two operands: its position (only `)`, `(`, spaces and the operator lie between them)
  std::uint32_t opAt(std::uint32_t l, std::uint32_t r, std::string_view op) const {
    for (std::uint32_t p = hi(l), e = lo(r); p + op.size() <= e; ++p)
      if (s.substr(p, op.size()) == op && (op != "*" || (s[p + 1] != '*' && s[p + 1] != '/' && (p == 0 || s[p - 1] != '/')))) return p;
    return kNone;
  }
  // a store of node `v` (of kind `k`) into a slot of kind `slot`: the conversion the typed engines make
  void store(std::uint32_t v, NK k, NK slot) {
    if (v == kNone || !(isInt(slot) || slot == NK::F32) || k == slot) return;
    double lit = 0;
    if (k == NK::Lit && intLit(v, lit) && fits(lit, slot)) return;
    auto in = [&](std::initializer_list<NK> ks) { return std::find(ks.begin(), ks.end(), k) != ks.end(); };   // widening: always in range
    if ((slot == NK::I32 && in({NK::I8, NK::I16, NK::U8, NK::U16})) || (slot == NK::U32 && in({NK::U8, NK::U16})) || (slot == NK::I16 && in({NK::I8, NK::U8})) ||
        (slot == NK::U16 && k == NK::U8) || (slot == NK::F32 && in({NK::I8, NK::I16, NK::U8, NK::U16})))
      return;
    if (isInt(slot)) coerced[v] = true;
    wrap(v, 1, conv(slot));
  }

  const Bind* lookup(std::string_view name) const {
    for (auto it = scopes.rbegin(); it != scopes.rend(); ++it) { auto f = it->find(name); if (f != it->end()) return &f->second; }
    return nullptr;
  }
  void declare(std::string_view name, Bind b) { if (!name.empty() && !scopes.empty()) scopes.back()[name] = std::move(b); }
  void declarePattern(std::uint32_t p) {   // every name a destructuring pattern binds: unknown kinds
    if (p == kNone) return;
    if (n(p).kind == N::Ident) { declare(n(p).text, {}); return; }
    for (std::uint32_t k : n(p).kids) if (k != kNone && n(k).kind != N::TypeRef) declarePattern(k);
  }
  // the slot a target names: a variable, `this.field`, an element of a `T[]` variable or field
  Bind slotOf(std::uint32_t t) const {
    const Node& x = n(t);
    if (x.kind == N::Ident) { const Bind* b = lookup(x.text); return b && !b->fn ? *b : Bind{}; }
    if (x.kind == N::Member && n(x.kids[0]).kind == N::This && !self.empty() && self.back()) {
      auto f = self.back()->fields.find(x.text);
      if (f != self.back()->fields.end()) return f->second;
    }
    if (x.kind == N::Index) { Bind o = slotOf(x.kids[0]); if (o.arr) { o.arr = false; return o; } }
    return {};
  }
  // a target the pass may write twice (`c = c + v`): names, `this.f`, `a.b`, `a[i]` with a name or a literal index, on one line
  bool simple(std::uint32_t t) const {
    const Node& x = n(t);
    if (x.kind == N::Ident || x.kind == N::This) return true;
    if (x.kind == N::Member) return !(x.flags & kFlagOptional) && simple(x.kids[0]);
    if (x.kind == N::Index) return simple(x.kids[0]) && (n(x.kids[1]).kind == N::Ident || n(x.kids[1]).kind == N::Number);
    return false;
  }
  std::string textOf(std::uint32_t t) const { return std::string(s.substr(lo(t), hi(t) - lo(t))); }

  Bind fnOf(const Node& f) const {   // Function, FuncExpr, Method: [returnType, body, Param...]
    Bind b;
    b.fn = true;
    b.ret = scalar(f.kids[0]);
    for (std::size_t k = 2; k < f.kids.size(); ++k) b.params.push_back((n(f.kids[k]).flags & kFlagRest) ? NK::None : scalar(n(f.kids[k]).kids[0]));
    return b;
  }
  void function(const Node& f, const Cls* thisCls) {
    scopes.emplace_back();
    self.push_back(thisCls);
    rets.push_back(scalar(f.kids[0]));
    for (std::size_t k = 2; k < f.kids.size(); ++k) {
      const Node& p = n(f.kids[k]);
      if (p.kids.size() > 1 && p.kids[1] != kNone) store(p.kids[1], visit(p.kids[1]), scalar(p.kids[0]));
      if (p.kids.size() > 2 && p.kids[2] != kNone) declarePattern(p.kids[2]);
      else declare(p.text, (p.flags & kFlagRest) ? Bind{} : typeOf(p.kids[0]));
    }
    if (f.kids[1] != kNone) visit(f.kids[1]);
    rets.pop_back();
    self.pop_back();
    scopes.pop_back();
  }
  void hoist(const Node& block) {   // function declarations are visible from the start of their block
    for (std::uint32_t k : block.kids) {
      std::uint32_t d = k;
      if (d != kNone && n(d).kind == N::Export && !n(d).kids.empty()) d = n(d).kids[0];
      if (d == kNone) continue;
      if (n(d).kind == N::Function) declare(n(d).text, fnOf(n(d)));
      else if (n(d).kind == N::Class) declare(n(d).text, {});
    }
  }
  void classDecl(const Node& c) {
    auto cls = std::make_unique<Cls>();
    for (std::size_t k = kClassMembersFrom; k < c.kids.size(); ++k) {
      const Node& m = n(c.kids[k]);
      if (m.flags & kFlagStatic) continue;
      if (m.kind == N::Field) cls->fields[m.text] = typeOf(m.kids[0]);
      else if (m.kind == N::Method && !(m.flags & kFlagGetter)) {
        cls->methods[m.text] = fnOf(m);
        if (m.text == "constructor")
          for (std::size_t q = 2; q < m.kids.size(); ++q)
            if (n(m.kids[q]).flags & (kFlagPublic | kFlagPrivate | kFlagProtected | kFlagReadonly)) cls->fields[n(m.kids[q]).text] = typeOf(n(m.kids[q]).kids[0]);
      }
    }
    for (std::size_t k = kClassMembersFrom; k < c.kids.size(); ++k) {
      const Node& m = n(c.kids[k]);
      const Cls* me = (m.flags & kFlagStatic) ? nullptr : cls.get();
      if (m.kind == N::Field && m.kids[1] != kNone) {
        self.push_back(me);
        store(m.kids[1], visit(m.kids[1]), scalar(m.kids[0]));
        self.pop_back();
      } else if (m.kind == N::Method) function(m, me);
    }
    classes.push_back(std::move(cls));
  }

  // `c += v`, `c++` of a narrow kind or an f32: `c = conv(c op (v))`
  void compound(const Node& x, NK slot) {
    const std::uint32_t t = x.kids[0], v = x.kids[1];
    const std::string op(x.text.substr(0, x.text.size() - 1));
    if (op == "&&" || op == "||" || op == "??" || !simple(t)) return;
    const std::string tt = textOf(t);
    if (tt.find('\n') != std::string::npos) return;
    const NK vk = kinds[v];
    NK r = (op == "&" || op == "|" || op == "^" || op == "<<" || op == ">>") ? NK::I32 : op == ">>>" ? NK::U32 : arith(op, t, slot, v, vk);
    if (r == slot && op != "+" && op != "-" && op != "*" && op != "%" && !(slot == NK::F32 && op == "/")) return;   // already the slot's kind
    const std::uint32_t at = opAt(t, v, x.text);
    if (at == kNone) return;
    std::string pre, post;
    if (op == "*" && wide(slot) && r == slot) {
      pre = "Math.imul(" + tt + ", (";
      post = slot == NK::U32 ? "))>>>0)" : "))";
      if (slot == NK::U32) pre = "(" + pre;
    } else {
      auto [cp, cs] = conv(slot);
      pre = cp + tt + " " + op + " (";
      post = ")" + cs;
    }
    reps.push_back({at, at + static_cast<std::uint32_t>(x.text.size()), "= " + pre});
    wraps.push_back({lo(v), hi(v), 2, "", post});
  }
  void update(std::uint32_t i, const Node& x, NK k, bool used) {
    const std::uint32_t t = x.kids[0];
    if (wide(k) || !(isInt(k) || k == NK::F32) || (used && k == NK::F32) || !simple(t) || (x.flags & kFlagSynthetic)) return;
    const std::string tt = textOf(t), op = x.text == "++" ? "+" : "-", back = x.text == "++" ? "-" : "+";
    if (tt.find('\n') != std::string::npos) return;
    auto [cp, cs] = conv(k);
    std::string r = "(" + tt + " = " + cp + tt + " " + op + " 1" + cs + ")";
    if (used && x.kind == N::UpdatePost) r = cp + r + " " + back + " 1" + cs;   // the old value: the new one stepped back in the same kind
    reps.push_back({lo(i), hi(i), r});
  }

  NK visit(std::uint32_t i, bool used = true) {
    if (i == kNone) return NK::None;
    const Node& x = n(i);
    if (x.flags & kFlagSynthetic) return NK::None;
    NK k = NK::None;
    switch (x.kind) {
      case N::Program: case N::Block:
        scopes.emplace_back();
        hoist(x);
        for (std::uint32_t c : x.kids) visit(c, false);
        scopes.pop_back();
        return NK::None;
      case N::Declarator: {
        Bind b = typeOf(x.kids[0]);
        const std::uint32_t init = x.kids.size() > 1 ? x.kids[1] : kNone;
        NK v = visit(init);
        if (x.kids[0] != kNone && b.arr && init != kNone && n(init).kind == N::Array) {   // `const a: u8[] = [300, 7 / 2]`: each element is a store
          for (std::uint32_t e : n(init).kids) if (n(e).kind != N::Spread && n(e).kind != N::Empty) store(e, kinds[e], b.k);
        } else if (x.kids[0] != kNone) store(init, v, b.arr ? NK::None : b.k);
        else if (init != kNone && n(init).kind == N::FuncExpr) b = fnOf(n(init));   // `const f = (v: i32): i32 => ...`: called like a function
        else if (init != kNone) { b = {}; b.k = v == NK::Lit ? NK::F64 : v; }
        if (x.kids.size() > 2 && x.kids[2] != kNone) declarePattern(x.kids[2]);
        else declare(x.text, b);
        break;
      }
      case N::Function: function(x, nullptr); break;
      case N::FuncExpr: function(x, (x.flags & kFlagArrow) && !self.empty() ? self.back() : nullptr); break;
      case N::Class: classDecl(x); break;
      case N::For: case N::ForOf: case N::ForIn:
        scopes.emplace_back();
        if (x.kind == N::For) { visit(x.kids[0], false); visit(x.kids[1]); visit(x.kids[2], false); visit(x.kids[3], false); }
        else {
          const NK it = visit(x.kids[1]);
          (void)it;
          const Node& d = n(n(x.kids[0]).kind == N::VarDecl ? n(x.kids[0]).kids[0] : x.kids[0]);
          Bind e;
          if (x.kind == N::ForOf && n(x.kids[1]).kind == N::Ident) { const Bind* ab = lookup(n(x.kids[1]).text); if (ab && ab->arr) e.k = ab->k; }
          if (d.kind == N::Declarator) { if (d.kids.size() > 2 && d.kids[2] != kNone) declarePattern(d.kids[2]); else declare(d.text, e); }
          visit(x.kids[2], false);
        }
        scopes.pop_back();
        return NK::None;
      case N::Try:
        visit(x.kids[0], false);
        scopes.emplace_back();
        if (x.kids[1] != kNone) declarePattern(x.kids[1]);
        visit(x.kids[2], false);
        scopes.pop_back();
        visit(x.kids[3], false);
        return NK::None;
      case N::Return:
        if (!x.kids.empty() && x.kids[0] != kNone) store(x.kids[0], visit(x.kids[0]), rets.empty() ? NK::None : rets.back());
        break;
      case N::ExprStmt: visit(x.kids[0], false); break;
      case N::Interface: case N::TypeAlias: case N::Import: case N::ExportList: case N::ExportAll: case N::Enum: case N::Empty:
        return NK::None;
      case N::Number: { double v; k = intLit(i, v) ? NK::Lit : NK::F64; break; }
      case N::Ident: { const Bind* b = lookup(x.text); k = b && !b->fn && !b->arr ? b->k : NK::None; break; }
      case N::Unary: {
        NK o = visit(x.kids[0]);
        if (x.text == "~") k = NK::I32;
        else if (x.text == "+") k = o == NK::Lit ? NK::F64 : o;
        else if (x.text == "-") {
          k = o;
          if (isInt(o)) pending[i] = o;   // -x of an integer kind wraps in its kind (-(-2147483648), -u8)
        }
        break;
      }
      case N::Binary: {
        const std::string_view op = x.text;
        const NK l = visit(x.kids[0], op != ","), r = visit(x.kids[1], op == "," ? used : true);
        if (op == ",") k = r;
        else if (op == "&" || op == "|" || op == "^" || op == "<<" || op == ">>") k = NK::I32;
        else if (op == ">>>") k = NK::U32;
        else if (op == "+" || op == "-" || op == "*" || op == "/" || op == "%" || op == "**") {
          k = arith(op, x.kids[0], l, x.kids[1], r);
          if (k == NK::F32) wrap(i, 0, conv(NK::F32));
          else if (wide(k) && op == "*") {
            const std::uint32_t at = opAt(x.kids[0], x.kids[1], "*");
            if (at != kNone && !(x.flags & kFlagSynthetic)) {
              reps.push_back({at, at + 1, ","});
              wrap(i, 0, k == NK::U32 ? std::pair<std::string, std::string>{"(Math.imul(", ")>>>0)"} : std::pair<std::string, std::string>{"Math.imul(", ")"});
            }
          } else if (wide(k)) pending[i] = k;
        }
        break;
      }
      case N::Assign: {
        const std::uint32_t t = x.kids[0], v = x.kids[1];
        if (n(t).kind == N::Member || n(t).kind == N::Index) for (std::uint32_t c : n(t).kids) visit(c);
        else if (n(t).kind != N::Ident) visit(t);
        const NK vk = visit(v);
        const Bind slot = slotOf(t);
        const NK sk = slot.arr ? NK::None : slot.k;
        if (x.text == "=") store(v, vk, sk);
        else if (isInt(sk) || sk == NK::F32) compound(x, sk);
        k = (isInt(sk) || sk == NK::F32) ? sk : x.text == "=" ? vk : NK::None;
        break;
      }
      case N::UpdatePre: case N::UpdatePost: {
        const Bind slot = slotOf(x.kids[0]);
        if (n(x.kids[0]).kind != N::Ident) visit(x.kids[0]);
        k = slot.arr ? NK::None : slot.k;
        update(i, x, k, used);
        break;
      }
      case N::Cond: {
        visit(x.kids[0]);
        const NK t = visit(x.kids[1]), e = visit(x.kids[2]);
        k = t == e ? t : (t == NK::Lit && isInt(e)) ? e : (e == NK::Lit && isInt(t)) ? t : NK::None;
        break;
      }
      case N::Call: {
        const std::uint32_t callee = x.kids[0];
        const Bind* fb = nullptr;
        Bind method;
        if (n(callee).kind == N::Ident) { const Bind* b = lookup(n(callee).text); if (b && b->fn) fb = b; }
        else {
          visit(callee);
          const Node& c = n(callee);
          if (c.kind == N::Member && n(c.kids[0]).kind == N::This && !self.empty() && self.back()) {
            auto m = self.back()->methods.find(c.text);
            if (m != self.back()->methods.end()) { method = m->second; fb = &method; }
          } else if (c.kind == N::Member && n(c.kids[0]).kind == N::Ident && n(c.kids[0]).text == "Math" && !lookup("Math"))
            k = c.text == "imul" ? NK::I32 : c.text == "fround" ? NK::F32 : NK::None;
        }
        for (std::size_t a1 = 1; a1 < x.kids.size(); ++a1) {
          const NK ak = visit(x.kids[a1]);
          if (fb && a1 - 1 < fb->params.size() && n(x.kids[a1]).kind != N::Spread) store(x.kids[a1], ak, fb->params[a1 - 1]);
        }
        if (fb) k = fb->ret;
        break;
      }
      case N::Member:
        visit(x.kids[0]);
        if (n(x.kids[0]).kind == N::This) { Bind b = slotOf(i); k = b.arr ? NK::None : b.k; }
        break;
      case N::Index: {
        visit(x.kids[0]);
        visit(x.kids[1]);
        const Bind b = slotOf(i);
        k = b.arr ? NK::None : b.k;
        break;
      }
      case N::As: {
        const NK e = visit(x.kids[0]);
        const Bind b = typeOf(x.kids[1]);
        if (!b.arr && (isInt(b.k) || b.k == NK::F32)) { store(x.kids[0], e, b.k); k = b.k; }
        else k = b.k == NK::F64 ? NK::F64 : NK::None;
        break;
      }
      case N::NonNull: k = visit(x.kids[0]); break;
      case N::Prop: if (!x.kids.empty()) { visit(x.kids[0]); if (x.kids.size() > 1) visit(x.kids[1]); } break;
      default:
        if (x.kind >= N::TypeRef && x.kind <= N::TypeParam) return NK::None;
        if (x.kind == N::TypeObject || x.kind == N::TypeOther) return NK::None;
        for (std::uint32_t c : x.kids) visit(c);
        break;
    }
    // the i32/u32 wraps of the operands: dropped where this node converts them again (a bitwise operator, an i32 `+`/`-` that wraps itself,
    // Math.imul, an integer store), emitted otherwise
    const bool bitwise = x.kind == N::Binary && (x.text == "&" || x.text == "|" || x.text == "^" || x.text == "<<" || x.text == ">>" || x.text == ">>>");
    const bool chain = x.kind == N::Binary && pending[i] != NK::None && (x.text == "+" || x.text == "-");
    const bool imul = x.kind == N::Binary && x.text == "*" && wide(k);
    for (std::uint32_t c : x.kids) {
      if (c == kNone || pending[c] == NK::None) continue;
      const bool drop = wide(pending[c]) && (bitwise || imul || coerced[c] || (chain && pending[c] == pending[i]));
      if (!drop) wrap(c, 0, conv(pending[c]));
      pending[c] = NK::None;
    }
    kinds[i] = k;
    return k;
  }

  std::string run() {
    visit(a.root, false);
    if (wraps.empty() && reps.empty()) return std::string(s);
    // events by position: closings (the inner first), openings (the outer first), then a replacement (an operator, or a `c++` the openings enclose)
    struct Ev { std::uint32_t at; int phase; std::int64_t order; const std::string* text; std::uint32_t skip; };
    std::vector<Ev> ev;
    for (const Wrap& w : wraps) {
      const std::int64_t span = static_cast<std::int64_t>(w.to - w.from) * 4;
      if (!w.post.empty()) ev.push_back({w.to, 0, span + w.prio, &w.post, 0});
      if (!w.pre.empty()) ev.push_back({w.from, 1, -(span + w.prio), &w.pre, 0});
    }
    for (const Rep& r : reps) ev.push_back({r.from, 2, 0, &r.text, r.to - r.from});
    std::stable_sort(ev.begin(), ev.end(), [](const Ev& p, const Ev& q) { return p.at != q.at ? p.at < q.at : p.phase != q.phase ? p.phase < q.phase : p.order < q.order; });
    std::string out;
    out.reserve(s.size() + ev.size() * 8);
    std::uint32_t at = 0;
    for (const Ev& e : ev) {
      if (e.at < at) continue;   // inside a replaced range
      out.append(s.substr(at, e.at - at));
      out += *e.text;
      at = e.at + e.skip;
    }
    out.append(s.substr(at));
    return out;
  }
};

// Zinc's public collection methods return snapshot arrays, whereas ECMAScript returns iterators. Rewrite calls,
// not prototypes: the private module checks the *called function's* captured native identity, leaving user methods alone.
struct CollectionCalls {
  std::string_view s;
  const Ast& a;
  NumWraps ranges;
  std::vector<std::uint32_t> parent, roots;
  struct Scope { std::string marker; std::vector<std::string> names; };
  struct Insertion { std::uint32_t at; std::string text; bool used = false; };
  std::map<std::uint32_t, Scope> temporaries;
  std::vector<Insertion> insertions;
  std::string helper;
  unsigned next = 0;
  CollectionCalls(std::string_view text, const Ast& ast) : s(text), a(ast), ranges(text, ast), parent(ast.nodes.size(), kNone) {
    helper = "__znCollectionResult";
    while (s.find(helper) != std::string_view::npos) helper += '_';
    for (std::uint32_t i = 0; i < a.nodes.size(); ++i) for (auto kid : a.nodes[i].kids) if (kid != kNone) parent[kid] = i;
  }
  const Node& n(std::uint32_t i) const { return a.nodes[i]; }
  static bool chain(N k) { return k == N::Member || k == N::Index || k == N::Call; }
  std::string method(std::uint32_t i) const {
    const Node& x = n(i);
    if (x.kind != N::Member) return "";
    const std::string_view name = x.text;
    return name == "keys" || name == "values" || name == "entries" ? std::string(name) : "";
  }
  bool joins(std::uint32_t p, std::uint32_t c) const {
    // Parentheses end an optional chain: `(m?.values()).length` still throws on an absent m.
    return chain(n(p).kind) && n(p).kids[0] == c &&
      (!(n(c).flags & (kFlagOptional | kFlagChain)) || (n(p).flags & (kFlagOptional | kFlagChain)));
  }
  bool suspends(std::uint32_t i) const {
    if (n(i).kind == N::Await || n(i).kind == N::Yield) return true;
    // A nested function keeps its own await/yield context.
    if (n(i).kind == N::FuncExpr || n(i).kind == N::Function) return false;
    for (auto kid : n(i).kids) if (kid != kNone && suspends(kid)) return true;
    return false;
  }
  std::uint32_t scope(std::uint32_t i) const {
    for (auto p = parent[i]; p != kNone; p = parent[p])
      if (n(p).kind == N::Function || n(p).kind == N::FuncExpr || n(p).kind == N::Method) return n(p).kids[1];
    return a.root;
  }
  std::string raw(std::uint32_t from, std::uint32_t to, bool end = false) {
    std::string out;
    for (auto& ins : insertions) {
      if (ins.used || ins.at < from || ins.at > to || (ins.at == to && !end)) continue;
      out += s.substr(from, ins.at - from); from = ins.at;
      out += ins.text; ins.used = true;
    }
    out += s.substr(from, to - from);
    return out;
  }
  std::string range(std::uint32_t from, std::uint32_t to) {
    std::string out;
    std::uint32_t at = from;
    for (auto root : roots) {
      const auto lo = ranges.lo(root), hi = ranges.hi(root);
      if (lo < at || hi > to) continue;
      out += raw(at, lo, true);
      std::string replacement = expression(root);
      const auto original = s.substr(lo, hi - lo);
      const auto missing = std::count(original.begin(), original.end(), '\n') - std::count(replacement.begin(), replacement.end(), '\n');
      if (missing > 0) replacement = "(" + replacement + std::string(missing, '\n') + ")";
      out += replacement;
      at = hi;
    }
    out += raw(at, to, true);
    return out;
  }
  std::string expr(std::uint32_t i) { return range(ranges.lo(i), ranges.hi(i)); }
  std::string expression(std::uint32_t root) {
    std::vector<std::uint32_t> steps;
    auto base = root;
    while (chain(n(base).kind)) {
      const auto child = n(base).kids[0];
      steps.push_back(base);
      if (!joins(base, child)) { base = child; break; }
      base = child;
    }
    std::reverse(steps.begin(), steps.end());
    const bool locals = suspends(root);
    auto bind = [&](const std::string& value, const std::function<std::string(const std::string&)>& body) {
      const std::string tmp = helper + std::to_string(next++);
      if (locals) {
        temporaries[scope(root)].names.push_back(tmp);
        return "(" + tmp + "=(" + value + ")," + body(tmp) + ")";
      }
      return "(" + tmp + " => (" + body(tmp) + "))(" + value + ")";
    };
    std::function<std::string(std::string, std::size_t, bool)> emit;
    auto guard = [&](const std::string& value, const std::function<std::string(const std::string&)>& body) {
      return bind(value, [&](const std::string& tmp) { return tmp + " == null ? undefined : (" + body(tmp) + ")"; });
    };
    emit = [&](std::string value, std::size_t at, bool checked) -> std::string {
      if (at == steps.size()) return value;
      const Node& x = n(steps[at]);
      if (!checked && (x.flags & kFlagOptional)) return guard(value, [&](const std::string& tmp) { return emit(tmp, at, true); });
      if (x.kind == N::Member || x.kind == N::Index) {
        const std::string access = x.kind == N::Member ? "." + std::string(x.text) : "[" + expr(x.kids[1]) + "]";
        if (at + 1 < steps.size() && n(steps[at + 1]).kind == N::Call) {
          const Node& call = n(steps[at + 1]);
          const std::string key = call.kids.size() == 1 && n(x.kids[0]).kind != N::Super ? method(steps[at]) : "";
          std::string args;
          for (std::size_t j = 1; j < call.kids.size(); ++j) { if (j != 1) args += ','; args += expr(call.kids[j]); }
          if (call.flags & kFlagOptional) {
            return bind(value, [&](const std::string& obj) { return guard(obj + access, [&](const std::string& fn) {
              return emit(key.empty() ? helper + "(" + obj + "," + fn + ",2,[" + args + "])" : helper + "(" + obj + "," + fn + ",true)", at + 2, false);
            }); });
          }
          return emit(key.empty() ? value + access + "(" + args + ")" : helper + "(" + value + ",'" + key + "')", at + 2, false);
        }
        return emit(value + access, at + 1, false);
      }
      std::string args;
      for (std::size_t j = 1; j < x.kids.size(); ++j) { if (j != 1) args += ','; args += expr(x.kids[j]); }
      return emit(value + "(" + args + ")", at + 1, false);
    };
    return emit(n(base).kind == N::Super ? "super" : "(" + expr(base) + ")", 0, false);
  }
  std::string run() {
    for (std::uint32_t i = 0; i < a.nodes.size(); ++i) {
      if (n(i).kind != N::Call || n(i).kids.size() != 1 || method(n(i).kids[0]).empty()) continue;
      if (n(n(i).kids[0]).kind == N::Member && n(n(n(i).kids[0]).kids[0]).kind == N::Super) continue;
      auto root = i;
      while (parent[root] != kNone && joins(parent[root], root)) root = parent[root];
      roots.push_back(root);
    }
    if (roots.empty()) return std::string(s);
    std::sort(roots.begin(), roots.end(), [&](auto x, auto y) { return ranges.lo(x) != ranges.lo(y) ? ranges.lo(x) < ranges.lo(y) : ranges.hi(x) > ranges.hi(y); });
    roots.erase(std::unique(roots.begin(), roots.end()), roots.end());
    // A suspension must stay in its original async/generator body: use invocation-local temporaries instead of an arrow guard.
    for (auto root : roots) if (suspends(root)) temporaries.try_emplace(scope(root));
    for (auto& [body, vars] : temporaries) {
      vars.marker = "/*" + helper + "Scope" + std::to_string(body) + "*/";
      const bool expressionBody = n(body).kind == N::Block && n(body).kids.size() == 1 && n(n(body).kids[0]).kind == N::Return &&
        n(n(body).kids[0]).start == n(body).start;
      if (body == a.root) insertions.push_back({0, vars.marker});
      else if (!expressionBody) insertions.push_back({n(body).start + 1, vars.marker});
      else {
        const auto fn = parent[body];
        auto from = n(body).start;
        for (const auto& t : lex(s.substr(n(fn).start, n(body).start - n(fn).start), false))
          if (s.substr(n(fn).start + t.start, t.end - t.start) == "=>") from = n(fn).start + t.end;
        insertions.push_back({from, "{" + vars.marker + "return ("});
        insertions.push_back({n(fn).end, ");}"});
      }
    }
    std::stable_sort(insertions.begin(), insertions.end(), [](const auto& x, const auto& y) { return x.at < y.at; });
    std::string out = range(0, s.size());
    const auto newline = out.find('\n');
    const auto prelude = out.rfind("#!", 0) == 0 ? (newline == std::string::npos ? out.size() : newline + 1) : 0;
    out.insert(prelude, "import { collectionResult as " + helper + " } from 'zinc:internal/collection-results';");
    for (const auto& [body, vars] : temporaries) {
      std::string decl;
      for (const auto& name : vars.names) { if (!decl.empty()) decl += ','; decl += name; }
      if (!decl.empty()) decl = "let " + decl + ";";
      const auto at = out.find(vars.marker);
      if (at != std::string::npos) out.replace(at, vars.marker.size(), decl);
    }
    return out;
  }
};

std::string collectionCallsForJs(const std::string& text) {
  if (text.find("keys") == std::string::npos && text.find("values") == std::string::npos && text.find("entries") == std::string::npos) return text;
  ParseResult pr = parse(text);
  if (pr.ast.root == kNone || !pr.diags.empty()) return text;
  return CollectionCalls(text, pr.ast).run();
}

// Only a file that names a machine number kind runs the pass.
bool namesNumberKind(std::string_view t) {
  for (std::size_t p = t.find_first_of("iuf"); p != std::string_view::npos; p = t.find_first_of("iuf", p + 1)) {
    if (p > 0 && (std::isalnum(static_cast<unsigned char>(t[p - 1])) || t[p - 1] == '_' || t[p - 1] == '$')) continue;
    std::size_t e = p + 1;
    while (e < t.size() && std::isdigit(static_cast<unsigned char>(t[e]))) e++;
    if (e < t.size() && (std::isalnum(static_cast<unsigned char>(t[e])) || t[e] == '_' || t[e] == '$')) continue;
    const std::string_view w = t.substr(p, e - p);
    if (w == "i8" || w == "i16" || w == "i32" || w == "u8" || w == "u16" || w == "u32" || w == "f32") return true;
  }
  return false;
}

std::string numberKindsForJs(const std::string& text) {
  if (!namesNumberKind(text)) return text;
  ParseResult pr = parse(text);
  if (pr.ast.root == kNone || !pr.diags.empty()) return text;
  NumWraps w(text, pr.ast);
  return w.run();
}

}  // namespace

bool stripTypes(std::string_view src, const std::string& file, std::string& out, std::string& err) {
  auto lineCol = [&](std::uint32_t pos) {
    std::uint32_t line = 1, col = 1;
    for (std::uint32_t i = 0; i < pos && i < src.size(); ++i) { if (src[i] == '\n') { line++; col = 1; } else col++; }
    return file + ":" + std::to_string(line) + ":" + std::to_string(col);
  };
  ParseResult pr = parse(src);
  if (!pr.diags.empty()) { err = forPerson({pr.diags[0]}, src, file); return false; }   // as the typed engines print it (ZN-774.34)
  Stripper st(src, pr.ast);
  st.run();
  if (!st.err.empty()) { err = lineCol(st.errPos) + ": " + st.err; return false; }
  std::sort(st.edits.begin(), st.edits.end(), [](const Edit& x, const Edit& y) { return x.from != y.from ? x.from < y.from : x.to > y.to; });
  out.clear();
  std::uint32_t at = 0;
  for (const Edit& e : st.edits) {
    if (e.from < at) {  // inside an earlier edit: its range is already gone (a nested type erased with its parent)
      if (e.to <= at) continue;
    }
    std::uint32_t from = std::max(e.from, at);
    out.append(src.substr(at, from - at));
    std::string_view gone = src.substr(from, e.to - from);
    if (e.text.empty()) { for (char c : gone) out += c == '\n' ? '\n' : ' '; }
    else {
      out += e.text;
      for (char c : gone) if (c == '\n') out += '\n';  // the lines stay where they were
    }
    at = e.to;
  }
  out.append(src.substr(at));
  return true;
}

bool toJavaScript(std::string_view src, const std::string& file, std::string& out, std::string& err, bool zincCollections) {
  auto ends = [&](std::string_view x) { return file.size() >= x.size() && file.compare(file.size() - x.size(), x.size(), x) == 0; };
  const bool tsx = ends(".tsx"), ts = tsx || ends(".ts") || file.rfind("zinc:", 0) == 0;
  if (!ts) {   // plain JavaScript: as written, with URL and the browser's WebSocket when it reads them as globals (ZN-1008)
    out = generatedModuleImportsForJs(src);
    const zn::frontend::Profile* cur = zn::frontend::currentProfile();
    if ((cur && std::string_view(cur->name) == "web") || (src.find("URL") == std::string_view::npos && src.find("WebSocket") == std::string_view::npos)) return true;
    if (!webMode(file).empty()) return true;   // a page (ZINC_WEB, "web" in zinc.json): webenv.js's own URL and WebSocket are the globals, createObjectURL included
    ParseResult pr = parse(src);
    if (pr.diags.empty() && pr.ast.root != kNone) out += jsImportsOf(pr.ast);
    return true;
  }
  std::string text(src), original;
  std::vector<Diag> diags;
  std::vector<SrcPiece> map;
  if (uiPreset() == "react-native") text = rewriteReactNativeImports(text, tsx);   // as the typed loader does (ZN-367.05)
  if (text.find("requireNative<") != std::string::npos) text = recordSchemasForJs(text);
  if (text.find("zinc:worker") != std::string::npos) text = workerTypesForJs(text, file);   // the message schemas of zinc:worker (ZN-587), before the types are erased   // the record schemas of a native spec (ZN-850), before the types are erased
  if (text.find("JSON.parse") != std::string::npos) text = dynCopiesForJs(text, file);   // D179's checked copy, before the types are erased
  if (text.find("StyleSheet") != std::string::npos) text = lowerStyleSheets(text, diags, 0, tsx);
  if (tsx && diags.empty()) {
    original = text;
    std::set<std::string> importedFns;   // functions of other .tsx files that return JSX: `{rows.map(importedRow)}` mounts them
    const std::set<std::string> classTags = jsxClassTags(file, text, ModuleResolver().read, &importedFns);   // components written as classes (Inferno, React), read from the files
    // zinc dev --target web (ZINC_WEB_HOT=1): a project component gets its Fast Refresh proxy, as in the typed engine's hot mode
    const char* hotWeb = std::getenv("ZINC_WEB_HOT");
    const bool hot = hotWeb && hotWeb[0] == '1' && file.rfind("zinc:", 0) != 0 && file.find("/lib/std/") == std::string::npos;
    const char* dev = std::getenv("ZINC_DEV");   // a dev run: component names for the inspector, as the typed loader records them (jsx.h devFile)
    const bool devNames = dev && std::string(dev) == "1" && !libraryModule(file);
    text = lowerJsx(text, diags, 0, &classTags, &map, hot, devNames ? file : std::string(), false, libraryModule(file), &importedFns);
  }
  if (!diags.empty()) {   // the lowering's own positions are in the source the user wrote
    err.clear();
    err = forPerson(diags, original.empty() ? std::string_view(text) : std::string_view(original), file);
    return false;
  }
  if (!ends("lib/std/web.ts") && !ends("lib/std/fetch.ts") && !ends("lib/std/subtle.ts")) {   // the web globals the typed loader imports for a file (navigator, fetch...)
    ParseResult pr = parse(text);
    const zn::frontend::Profile* cur = zn::frontend::currentProfile();
    const bool onWeb = cur && std::string_view(cur->name) == "web";   // the browser has fetch, URL, TextEncoder...: no import makes them the polyfills
    if (!onWeb && pr.diags.empty() && pr.ast.root != kNone) text += webImportsOf(pr.ast);
  }
  if (zincCollections) text = collectionCallsForJs(text);
  text = numberKindsForJs(text);   // i32 wraps, f32 rounding and integer stores, while the types are still there (ZN-796)
  return stripTypes(text, file, out, err);
}

}  // namespace zn::qjs
