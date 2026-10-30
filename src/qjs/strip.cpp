#include "qjs/strip.h"

#include <algorithm>
#include <cctype>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <set>
#include <sstream>
#include <unordered_set>
#include <vector>

#include "frontend/diagnostics.h"
#include "frontend/jsx.h"
#include "frontend/modules.h"
#include "frontend/native_gen.h"
#include "frontend/parser.h"
#include "frontend/profile.h"
#include "frontend/project.h"
#include "frontend/resolve.h"

namespace zn::qjs {
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
    if (x.kids.empty()) return;
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
    else edits.push_back({x.start, x.end, "import " + r + " from " + std::string(x.text) + ";"});
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
        case N::ExportList: if (x.flags & kFlagTypeOnly) blank(x.start, x.end); break;   // `export type { A } from './a'`
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

}  // namespace

bool stripTypes(std::string_view src, const std::string& file, std::string& out, std::string& err) {
  auto lineCol = [&](std::uint32_t pos) {
    std::uint32_t line = 1, col = 1;
    for (std::uint32_t i = 0; i < pos && i < src.size(); ++i) { if (src[i] == '\n') { line++; col = 1; } else col++; }
    return file + ":" + std::to_string(line) + ":" + std::to_string(col);
  };
  ParseResult pr = parse(src);
  if (!pr.diags.empty()) { err = lineCol(pr.diags[0].pos) + ": " + pr.diags[0].detail; return false; }
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

bool toJavaScript(std::string_view src, const std::string& file, std::string& out, std::string& err) {
  auto ends = [&](std::string_view x) { return file.size() >= x.size() && file.compare(file.size() - x.size(), x.size(), x) == 0; };
  const bool tsx = ends(".tsx"), ts = tsx || ends(".ts") || file.rfind("zinc:", 0) == 0;
  if (!ts) { out.assign(src); return true; }
  std::string text(src), original;
  std::vector<Diag> diags;
  std::vector<SrcPiece> map;
  if (uiPreset() == "react-native") text = rewriteReactNativeImports(text, tsx);   // as the typed loader does (ZN-367.05)
  if (text.find("requireNative<") != std::string::npos) text = recordSchemasForJs(text);
  if (text.find("zinc:worker") != std::string::npos) text = workerTypesForJs(text, file);   // the message schemas of zinc:worker (ZN-587), before the types are erased   // the record schemas of a native spec (ZN-850), before the types are erased
  if (text.find("StyleSheet") != std::string::npos) text = lowerStyleSheets(text, diags, 0, tsx);
  if (tsx && diags.empty()) {
    original = text;
    const std::set<std::string> classTags = jsxClassTags(file, text, ModuleResolver().read);   // components written as classes (Inferno, React), read from the files
    // zinc dev --target web (ZINC_WEB_HOT=1): a project component gets its Fast Refresh proxy, as in the typed engine's hot mode
    const char* hotWeb = std::getenv("ZINC_WEB_HOT");
    const bool hot = hotWeb && hotWeb[0] == '1' && file.rfind("zinc:", 0) != 0 && file.find("/lib/std/") == std::string::npos;
    const char* dev = std::getenv("ZINC_DEV");   // a dev run: component names for the inspector, as the typed loader records them (jsx.h devFile)
    const bool devNames = dev && std::string(dev) == "1" && !libraryModule(file);
    text = lowerJsx(text, diags, 0, &classTags, &map, hot, devNames ? file : std::string());
  }
  if (!diags.empty()) {   // the lowering's own positions are in the source the user wrote
    err.clear();
    for (const Diag& d : diags) err += (err.empty() ? "" : "\n") + format(d, original.empty() ? std::string_view(text) : std::string_view(original), file);
    return false;
  }
  if (!ends("lib/std/web.ts") && !ends("lib/std/fetch.ts") && !ends("lib/std/subtle.ts")) {   // the web globals the typed loader imports for a file (navigator, fetch...)
    ParseResult pr = parse(text);
    const zn::frontend::Profile* cur = zn::frontend::currentProfile();
    const bool onWeb = cur && std::string_view(cur->name) == "web";   // the browser has fetch, URL, TextEncoder...: no import makes them the polyfills
    if (!onWeb && pr.diags.empty() && pr.ast.root != kNone) text += webImportsOf(pr.ast);
  }
  return stripTypes(text, file, out, err);
}

}  // namespace zn::qjs
