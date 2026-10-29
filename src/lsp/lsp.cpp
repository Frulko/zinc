#include "lsp/lsp.h"
#include "tc/tc.h"

#include <algorithm>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <map>
#include <memory>
#include <set>
#include <sstream>

#include "frontend/check.h"
#include "frontend/modules.h"
#include "yyjson.h"

namespace fs = std::filesystem;
using namespace zn::frontend;

namespace zn::lsp {
namespace {

std::string quote(const std::string& t) {
  std::string q = "\"";
  for (char c : t) {
    if (c == '"' || c == '\\') { q += '\\'; q += c; }
    else if (c == '\n') q += "\\n";
    else if (c == '\t') q += "\\t";
    else if (static_cast<unsigned char>(c) < 32) { char b[8]; std::snprintf(b, sizeof b, "\\u%04x", c); q += b; }
    else q += c;
  }
  return q + "\"";
}

std::string uriToPath(const std::string& uri) {
  if (uri.rfind("file://", 0) != 0) return uri;
  std::string p = uri.substr(7), out;
  for (std::size_t i = 0; i < p.size(); ++i) {
    if (p[i] == '%' && i + 2 < p.size()) { out += static_cast<char>(std::strtol(p.substr(i + 1, 2).c_str(), nullptr, 16)); i += 2; }
    else out += p[i];
  }
  return out;
}
std::string pathToUri(const std::string& path) {
  std::string out = "file://";
  for (unsigned char c : path) {
    if (std::isalnum(c) || c == '/' || c == '-' || c == '_' || c == '.' || c == '~') out += static_cast<char>(c);
    else { char b[4]; std::snprintf(b, sizeof b, "%%%02X", c); out += b; }
  }
  return out;
}

// byte offsets <-> LSP positions (line, UTF-16 column)
struct Lines {
  std::vector<std::size_t> starts;
  explicit Lines(const std::string& t) { starts.push_back(0); for (std::size_t i = 0; i < t.size(); ++i) if (t[i] == '\n') starts.push_back(i + 1); }
  void pos(const std::string& t, std::size_t off, int& line, int& ch) const {
    off = std::min(off, t.size());
    auto it = std::upper_bound(starts.begin(), starts.end(), off);
    line = static_cast<int>(it - starts.begin()) - 1;
    ch = 0;
    for (std::size_t i = starts[line]; i < off;) {
      unsigned char c = static_cast<unsigned char>(t[i]);
      const int len = c < 0x80 ? 1 : c < 0xE0 ? 2 : c < 0xF0 ? 3 : 4;
      ch += len == 4 ? 2 : 1;
      i += len;
    }
  }
  std::size_t offset(const std::string& t, int line, int ch) const {
    if (line < 0) return 0;
    if (line >= static_cast<int>(starts.size())) return t.size();
    std::size_t i = starts[line];
    int col = 0;
    while (i < t.size() && t[i] != '\n' && col < ch) {
      unsigned char c = static_cast<unsigned char>(t[i]);
      const int len = c < 0x80 ? 1 : c < 0xE0 ? 2 : c < 0xF0 ? 3 : 4;
      col += len == 4 ? 2 : 1;
      i += len;
    }
    return i;
  }
};

// ---------------------------------------------------------------- what a declaration says of itself, read in its source
bool identChar(char c) { return std::isalnum(static_cast<unsigned char>(c)) || c == '_' || c == '$'; }
std::string trim(const std::string& t, const char* drop = " \t\r\n") {
  const std::size_t a = t.find_first_not_of(drop), b = t.find_last_not_of(drop);
  return a == std::string::npos ? std::string() : t.substr(a, b - a + 1);
}
bool startsWith(const std::string& t, const char* p) { return t.rfind(p, 0) == 0; }
bool endsWith(const std::string& t, const std::string& p) { return t.size() >= p.size() && t.compare(t.size() - p.size(), p.size(), p) == 0; }

// `step(dt: number, w: number): void`: a function or a method from its name to its body, on one line.
std::string signatureOf(const SourceFile& sf, const Node& n) {
  const std::string& t = sf.text;
  const char* base = t.data();
  std::size_t i = !n.text.empty() && n.text.data() >= base && n.text.data() < base + t.size() ? static_cast<std::size_t>(n.text.data() - base) : n.start;   // the node's text views the name
  std::string out;
  int depth = 0;
  for (; i < t.size() && i < n.end; ++i) {
    const char c = t[i];
    if (c == '(' || c == '[' || c == '<') ++depth;
    else if (c == ')' || c == ']' || (c == '>' && t[i - 1] != '=')) depth = std::max(0, depth - 1);
    else if (depth == 0 && (c == '{' || c == ';')) break;
    if (c == ' ' || c == '\t' || c == '\n' || c == '\r') { if (!out.empty() && out.back() != ' ') out += ' '; }
    else out += c;
  }
  return trim(out, " :");
}

// The parameters of a signature, as [start, end) in it.
std::vector<std::pair<std::size_t, std::size_t>> paramsOf(const std::string& label) {
  std::vector<std::pair<std::size_t, std::size_t>> out;
  const std::size_t open = label.find('(');
  if (open == std::string::npos) return out;
  int depth = 0;
  std::size_t from = open + 1;
  for (std::size_t i = open; i < label.size(); ++i) {
    const char c = label[i];
    if (c == '(' || c == '[' || c == '{' || c == '<') ++depth;
    else if (c == ')' || c == ']' || c == '}' || (c == '>' && label[i - 1] != '=')) --depth;
    if ((c == ',' && depth == 1) || (c == ')' && depth == 0)) {
      std::size_t a = from, b = i;
      while (a < b && label[a] == ' ') ++a;
      while (b > a && label[b - 1] == ' ') --b;
      if (b > a) out.push_back({a, b});
      from = i + 1;
      if (c == ')') break;
    }
  }
  return out;
}

// The comment right above the declaration at `pos` (or before it on its line): a /** */ block or a run of // lines,
// one cleaned line per line. Empty when there is none.
std::string commentAbove(const std::string& t, std::size_t pos) {
  pos = std::min(pos, t.size());
  std::size_t ls = pos == 0 ? std::string::npos : t.rfind('\n', pos - 1);
  ls = ls == std::string::npos ? 0 : ls + 1;
  std::vector<std::string> lines;
  const std::string head = trim(t.substr(ls, pos - ls));
  if (endsWith(head, "*/") && head.rfind("/*") != std::string::npos) lines.push_back(head.substr(head.rfind("/*")));
  else {
    bool block = false, opened = false;
    for (std::size_t s = ls; s > 0 && !opened;) {
      const std::size_t pe = s - 1;   // the line break
      std::size_t ps = pe == 0 ? std::string::npos : t.rfind('\n', pe - 1);
      ps = ps == std::string::npos ? 0 : ps + 1;
      const std::string line = trim(t.substr(ps, pe - ps));
      if (lines.empty() && endsWith(line, "*/")) block = true;
      if (block) opened = line.find("/*") != std::string::npos;
      else if (!startsWith(line, "//")) break;
      lines.insert(lines.begin(), line);
      s = ps;
    }
    if (block && !opened) lines.clear();
  }
  std::string out;
  for (std::string l : lines) {
    if (startsWith(l, "/*")) l = l.substr(l.find_first_not_of("/*") == std::string::npos ? l.size() : l.find_first_not_of("/*"));
    else if (startsWith(l, "//")) l = l.substr(2);
    if (endsWith(l, "*/")) l = l.substr(0, l.size() - 2);
    l = trim(l);
    if (startsWith(l, "*")) l = trim(l.substr(1));
    l = trim(l, " \t-=/");   // a ruler: `// ---- title`
    if (!l.empty()) out += l + "\n";
  }
  return out;
}

// What an editor shows of a declaration: its signature (or `class Name`; empty for a variable), its doc, the docs of its parameters.
struct About {
  std::string code, doc;
  std::vector<std::pair<std::string, std::string>> params;   // @param name text
};
void readComment(const std::string& raw, About& out) {
  std::stringstream ss(raw);
  int cur = -1;   // the text a line continues: the doc, or a parameter
  for (std::string l; std::getline(ss, l);) {
    if (startsWith(l, "@param ")) {
      std::string rest = trim(l.substr(7));
      if (!rest.empty() && rest[0] == '{') rest = trim(rest.substr(std::min(rest.size(), rest.find('}') + 1)));   // {type}
      std::size_t e = 0;
      while (e < rest.size() && identChar(rest[e])) ++e;
      out.params.push_back({rest.substr(0, e), trim(rest.substr(e), " \t-:")});
      cur = static_cast<int>(out.params.size()) - 1;
    } else if (startsWith(l, "@")) { out.doc += (out.doc.empty() ? "" : "\n") + l; cur = -1; }
    else { std::string& dst = cur < 0 ? out.doc : out.params[cur].second; dst += (dst.empty() ? "" : " ") + l; }
  }
}
std::size_t utf16(const std::string& t, std::size_t bytes) {
  std::size_t n = 0;
  for (std::size_t i = 0; i < bytes && i < t.size(); ++i) { const unsigned char c = static_cast<unsigned char>(t[i]); if ((c & 0xC0) != 0x80) n += c >= 0xF0 ? 2 : 1; }
  return n;
}

struct Analysis {
  Program prog;
  Checked checked;
  bool checkedOk = false;
  std::vector<Diag> diags;
};

struct Doc { std::string text; int version = 0; std::shared_ptr<Analysis> last; };   // last: the latest analysis that reached the type checker (answers survive a syntax error being typed)

class Server {
 public:
  explicit Server(std::string stdRoot) : stdRoot_(std::move(stdRoot)) {}
  int run();

 private:
  std::string stdRoot_;
  std::map<std::string, Doc> docs_;   // uri -> text
  std::string dts_;                   // lib/gfx.d.ts and lib/modules.d.ts, read when a built-in module's doc is asked
  bool dtsRead_ = false;
  bool shutdown_ = false;

  bool read(const std::string& path, std::string& out) {
    auto it = docs_.find(pathToUri(path));
    if (it != docs_.end()) { out = it->second.text; return true; }
    std::ifstream f(path, std::ios::binary);
    if (!f) return false;
    std::stringstream ss; ss << f.rdbuf(); out = ss.str();
    return true;
  }
  std::shared_ptr<Analysis> analyze(const std::string& path, const std::string* override = nullptr) {
    auto a = std::make_shared<Analysis>();
    ReadFile rf = [&](const std::string& p, std::string& out) {
      if (override && p == path) { out = *override; return true; }
      return read(p, out);
    };
    a->prog = loadProgram(path, rf, false, stdRoot_);
    a->diags = a->prog.diags;
    if (a->diags.empty()) { a->checked = check(a->prog.ast); a->checkedOk = true; a->diags = a->checked.diags; }
    return a;
  }

  static void send(const std::string& json) { std::printf("Content-Length: %zu\r\n\r\n%s", json.size(), json.c_str()); std::fflush(stdout); }
  static void reply(const std::string& id, const std::string& result) { send("{\"jsonrpc\":\"2.0\",\"id\":" + id + ",\"result\":" + result + "}"); }
  static void notify(const std::string& method, const std::string& params) { send("{\"jsonrpc\":\"2.0\",\"method\":" + quote(method) + ",\"params\":" + params + "}"); }

  std::string range(const std::string& text, std::size_t a, std::size_t b) {
    Lines L(text);
    int l1, c1, l2, c2;
    L.pos(text, a, l1, c1);
    L.pos(text, b, l2, c2);
    return "{\"start\":{\"line\":" + std::to_string(l1) + ",\"character\":" + std::to_string(c1) + "},\"end\":{\"line\":" + std::to_string(l2) + ",\"character\":" + std::to_string(c2) + "}}";
  }

  void publish(const std::string& uri, Doc& d) {
    const std::string path = uriToPath(uri);
    const std::shared_ptr<Analysis> now = analyze(path);
    if (now->checkedOk || !d.last) d.last = now;
    std::string items;
    int n = 0;
    for (const Diag& dg : now->diags) {
      if (dg.file >= now->prog.files.size() || now->prog.files[dg.file].path != path) continue;
      const std::string line = formatDiag(now->prog, dg);   // file:line:col: error Zxxxx: message
      std::size_t a = line.find(':'), b = line.find(':', a + 1), c = line.find(':', b + 1);
      const int ln = std::atoi(line.c_str() + a + 1) - 1, col = std::atoi(line.c_str() + b + 1) - 1;
      std::size_t m = line.find(": error ", c);
      std::string message = m == std::string::npos ? line.substr(c + 1) : line.substr(line.find(": ", m + 8) + 2);
      items += std::string(n++ ? "," : "") + "{\"range\":{\"start\":{\"line\":" + std::to_string(ln) + ",\"character\":" + std::to_string(col) + "},\"end\":{\"line\":" + std::to_string(ln) + ",\"character\":" + std::to_string(col + 1) + "}},\"severity\":1,\"code\":" + quote(dg.code) + ",\"source\":\"zinc\",\"message\":" + quote(message) + "}";
    }
    notify("textDocument/publishDiagnostics", "{\"uri\":" + quote(uri) + ",\"diagnostics\":[" + items + "]}");
  }

  // the innermost node of file 0 around `off` that satisfies `pred`
  template <class P>
  static std::uint32_t innermost(const Ast& ast, std::uint32_t file, std::size_t off, P pred) {
    std::uint32_t best = kNone;
    std::size_t bestLen = ~std::size_t{0};
    for (std::uint32_t i = 0; i < ast.nodes.size(); ++i) {
      const Node& n = ast.nodes[i];
      if (n.file != file || off < n.start || off > n.end || !pred(n)) continue;
      if (n.end - n.start <= bestLen) { best = i; bestLen = n.end - n.start; }
    }
    return best;
  }
  static std::size_t fileIndex(const Analysis& a, const std::string& path) { for (std::size_t i = 0; i < a.prog.files.size(); ++i) if (a.prog.files[i].path == path) return i; return 0; }

  // A document position as an offset in the text the nodes view (the JSX of a .tsx file is lowered: its map leads there), and a range back.
  static std::size_t nodeOffset(const SourceFile& sf, int line, int ch) {
    const std::string& doc = sf.map.empty() ? sf.text : sf.original;
    const std::size_t off = Lines(doc).offset(doc, line, ch);
    return sf.map.empty() ? off : loweredOffset(sf.map, static_cast<std::uint32_t>(off));
  }
  std::string docRange(const SourceFile& sf, std::size_t a, std::size_t b) {
    if (sf.map.empty()) return range(sf.text, a, b);
    return range(sf.original, sourceOffset(sf.map, static_cast<std::uint32_t>(a)), sourceOffset(sf.map, static_cast<std::uint32_t>(b)));
  }
  static std::uint32_t findNamed(const Ast& ast, std::uint32_t file, N kind, std::string_view text) {
    for (std::uint32_t i = 0; i < ast.nodes.size(); ++i) if (ast.nodes[i].kind == kind && ast.nodes[i].file == file && ast.nodes[i].text == text) return i;
    return kNone;
  }

  // The Field or Method node that declares member `name` of an object type, through its parents (kNone: a builtin's, or not an object).
  static std::uint32_t memberNode(const Analysis& a, TypeId t, std::string_view name) {
    const Checked& c = a.checked;
    const Ast& ast = a.prog.ast;
    if (t == kNoType || t >= c.types.size() || c.types[t].k != TK::Object) return kNone;
    std::set<std::uint32_t> seen;
    for (std::uint32_t o = c.types[t].obj; o != 0xFFFFFFFFu && o < c.objs.size() && seen.insert(o).second; o = c.objs[o].parent) {
      std::string_view cls = c.objs[o].name;
      cls = cls.substr(0, cls.find('<'));   // an instance of a generic class
      for (const Node& k : ast.nodes) {
        if ((k.kind != N::Class && k.kind != N::Interface) || k.text != cls) continue;
        for (std::size_t i = k.kind == N::Class ? kClassMembersFrom : 1; i < k.kids.size(); ++i) {
          if (k.kids[i] >= ast.nodes.size()) continue;
          const Node& m = ast.nodes[k.kids[i]];
          if ((m.kind == N::Method || m.kind == N::Field) && m.text == name) return k.kids[i];
        }
      }
    }
    return kNone;
  }
  // The declaration behind a node: of the symbol an identifier names, of the member `object.name` reads; a declaration is its own.
  static std::uint32_t declOf(const Analysis& a, std::uint32_t id) {
    const Node& n = a.prog.ast.nodes[id];
    if (n.kind == N::Ident) return id < a.checked.nodeSym.size() && a.checked.nodeSym[id] != kNone ? a.checked.syms[a.checked.nodeSym[id]].decl : kNone;
    if (n.kind == N::Member) return n.kids.empty() || n.kids[0] >= a.checked.nodeType.size() ? kNone : memberNode(a, a.checked.nodeType[n.kids[0]], n.text);
    return n.kind == N::Call ? kNone : id;
  }
  // The docs of the built-in modules ('zinc:gfx', 'zinc:sys'...): they are compiled from sources without comments, their declarations are in lib/*.d.ts.
  std::string builtinDoc(const std::string& spec, std::string_view name) {
    if (!dtsRead_) {
      dtsRead_ = true;
      for (const char* f : {"/../gfx.d.ts", "/../modules.d.ts"}) { std::ifstream in(stdRoot_ + f, std::ios::binary); std::stringstream ss; ss << in.rdbuf(); dts_ += ss.str() + "\n"; }
    }
    const std::size_t m = dts_.find("declare module '" + spec + "'");
    if (m == std::string::npos) return "";
    const std::size_t end = std::min(dts_.find("\ndeclare module", m + 1), dts_.size());
    for (const char* kw : {"function ", "const ", "class ", "interface ", "let "}) {
      const std::string key = kw + std::string(name);
      for (std::size_t at = dts_.find(key, m); at != std::string::npos && at < end; at = dts_.find(key, at + 1))
        if (at + key.size() < dts_.size() && !identChar(dts_[at + key.size()])) return commentAbove(dts_, at);
    }
    return "";
  }
  About about(const Analysis& a, std::uint32_t decl) {
    About out;
    if (decl == kNone || decl >= a.prog.ast.nodes.size()) return out;
    const Node& n = a.prog.ast.nodes[decl];
    if (n.file >= a.prog.files.size()) return out;
    const SourceFile& sf = a.prog.files[n.file];
    if (n.kind == N::Function || n.kind == N::Method) out.code = signatureOf(sf, n);
    else if (n.kind == N::Class) out.code = "class " + std::string(n.text);
    else if (n.kind == N::Interface) out.code = "interface " + std::string(n.text);
    std::string raw = commentAbove(sf.text, n.start);
    if (raw.empty() && startsWith(sf.path, "zinc:")) raw = builtinDoc(sf.path, n.text);
    readComment(raw, out);
    return out;
  }
  // `name(f64, f64): void` when only the type of a function is known (a builtin, a function value).
  static std::string typeSignature(const Checked& c, const std::string& name, TypeId t) {
    if (t == kNoType || t >= c.types.size() || c.types[t].k != TK::Func) return "";
    std::string out = name + "(";
    for (std::size_t i = 0; i < c.types[t].params.size(); ++i) out += (i ? ", " : "") + typeName(c, c.types[t].params[i]);
    return out + "): " + typeName(c, c.types[t].elem);
  }

  // ---- `import * as ns from '...'`: the loader turns each `ns.name` into a named import, so the module behind `ns` is found from the text
  // ponytail: by the module's path; a list of the aliases in ModuleInfo would end the guess
  const ModuleInfo* namespaceOf(const Doc& d, const std::string& text, const std::string& alias) {
    if (alias.empty() || !d.last) return nullptr;
    const std::size_t at = text.find("* as " + alias + " from");
    const std::size_t q = at == std::string::npos ? at : text.find_first_of("'\"", at);
    const std::size_t e = q == std::string::npos ? q : text.find(text[q], q + 1);
    if (e == std::string::npos) return nullptr;
    const std::string spec = text.substr(q + 1, e - q - 1), file(stdModuleFile(spec)), last = spec.substr(spec.find_last_of(":/") + 1);
    for (const ModuleInfo& m : d.last->prog.ast.modules) {
      if (m.path == spec || (!file.empty() && endsWith(m.path, "/" + file))) return &m;
      if (file.empty() && !last.empty() && (endsWith(m.path, "/" + last + ".ts") || endsWith(m.path, "/" + last + ".tsx") || endsWith(m.path, "/" + last + "/index.ts"))) return &m;
    }
    return nullptr;
  }
  // The top-level declaration of a module named `name` (kNone when it has none).
  static std::uint32_t declNamed(const Ast& ast, const ModuleInfo& m, std::string_view name) {
    for (std::uint32_t st : m.stmts) {
      const Node* n = &ast.nodes[st];
      std::uint32_t id = st;
      if (n->kind == N::Export && !n->kids.empty() && n->kids[0] < ast.nodes.size()) { id = n->kids[0]; n = &ast.nodes[id]; }
      if ((n->kind == N::Function || n->kind == N::Class || n->kind == N::Interface || n->kind == N::Enum || n->kind == N::TypeAlias) && n->text == name) return id;
      if (n->kind == N::VarDecl) for (std::uint32_t k : n->kids) if (ast.nodes[k].kind == N::Declarator && ast.nodes[k].text == name) return k;
    }
    return kNone;
  }
  // What a module exports: name -> declaration, through `export * from` and `export { a } from`.
  static void exportsOf(const Ast& ast, const ModuleInfo& m, std::map<std::string, std::uint32_t>& out, int depth = 0) {
    for (const ModuleExport& e : m.exports) {
      if (e.from != kNone) {
        if (depth > 3 || e.from >= ast.modules.size()) continue;
        if (e.all) exportsOf(ast, ast.modules[e.from], out, depth + 1);
        else { std::map<std::string, std::uint32_t> far; exportsOf(ast, ast.modules[e.from], far, depth + 1); if (far.count(std::string(e.local))) out.emplace(std::string(e.name), far[std::string(e.local)]); }
      } else if (const std::uint32_t id = declNamed(ast, m, e.local); id != kNone) out.emplace(std::string(e.name), id);
    }
  }
  static int kindOf(const Node& n) { return n.kind == N::Function ? 3 : n.kind == N::Method ? 2 : n.kind == N::Class ? 7 : n.kind == N::Interface || n.kind == N::TypeAlias ? 8 : n.kind == N::Enum ? 13 : n.kind == N::Field ? 5 : 6; }

  std::string hover(const std::string& uri, Doc& d, int line, int ch) {
    if (!d.last || !d.last->checkedOk) return "null";
    const std::string path = uriToPath(uri);
    const Analysis& a = *d.last;
    const std::uint32_t file = static_cast<std::uint32_t>(fileIndex(a, path));
    const SourceFile& sf = a.prog.files[file];
    const std::size_t off = nodeOffset(sf, line, ch);
    std::uint32_t id = innermost(a.prog.ast, file, off, [&](const Node& n) {
      return n.kind == N::Ident || n.kind == N::Declarator || n.kind == N::Param || n.kind == N::Function || n.kind == N::Method || n.kind == N::Field || n.kind == N::Member || n.kind == N::Call || n.kind == N::Class;
    });
    if (id == kNone) return "null";
    const Node& n = a.prog.ast.nodes[id];
    TypeId t = id < a.checked.nodeType.size() ? a.checked.nodeType[id] : kNoType;
    if (n.kind == N::Ident && id < a.checked.nodeSym.size() && a.checked.nodeSym[id] != kNone) t = a.checked.syms[a.checked.nodeSym[id]].type;
    const About ab = about(a, declOf(a, id));   // a function shows its signature, anything else its type; the doc comment under it
    if (t == kNoType && ab.code.empty()) return "null";
    const std::string label = n.kind == N::Call ? std::string("call") : n.text.empty() ? std::string("expression") : std::string(n.text);
    const std::string md = "```ts\n" + (ab.code.empty() ? label + ": " + typeName(a.checked, t) : ab.code) + "\n```" + (ab.doc.empty() ? "" : "\n\n" + ab.doc);
    return "{\"contents\":{\"kind\":\"markdown\",\"value\":" + quote(md) + "},\"range\":" + docRange(sf, n.start, n.end) + "}";
  }

  std::string definition(const std::string& uri, Doc& d, int line, int ch) {
    if (!d.last || !d.last->checkedOk) return "null";
    const std::string path = uriToPath(uri);
    const Analysis& a = *d.last;
    const std::uint32_t file = static_cast<std::uint32_t>(fileIndex(a, path));
    const std::size_t off = nodeOffset(a.prog.files[file], line, ch);
    std::uint32_t id = innermost(a.prog.ast, file, off, [](const Node& n) { return n.kind == N::Ident || n.kind == N::Member; });
    const std::uint32_t decl = id == kNone ? kNone : declOf(a, id);
    if (decl == kNone || decl >= a.prog.ast.nodes.size()) return "null";
    const Node& dn = a.prog.ast.nodes[decl];
    if (dn.file >= a.prog.files.size() || startsWith(a.prog.files[dn.file].path, "zinc:")) return "null";   // a built-in module has no file
    const SourceFile& sf = a.prog.files[dn.file];
    // the name inside the declaration node, not the whole declaration
    std::size_t at = sf.text.find(std::string(dn.text), dn.start);
    const std::size_t from = !dn.text.empty() && at != std::string::npos && at < dn.end ? at : dn.start;
    const std::size_t to = !dn.text.empty() && from != dn.start ? from + dn.text.size() : dn.end;
    return "{\"uri\":" + quote(pathToUri(sf.path)) + ",\"range\":" + docRange(sf, from, to) + "}";
  }

  std::string symbols(const std::string& uri, Doc& d) {
    if (!d.last) return "[]";
    const std::string path = uriToPath(uri);
    const Analysis& a = *d.last;
    const std::uint32_t file = static_cast<std::uint32_t>(fileIndex(a, path));
    const std::string& text = a.prog.files[file].text;
    const Ast& ast = a.prog.ast;
    std::string out;
    int count = 0;
    auto add = [&](std::string& dst, int& n, const Node& node, const std::string& name, int kind, const std::string& children) {
      dst += std::string(n++ ? "," : "") + "{\"name\":" + quote(name) + ",\"kind\":" + std::to_string(kind) + ",\"range\":" + range(text, node.start, node.end) + ",\"selectionRange\":" + range(text, node.start, node.end) + ",\"children\":[" + children + "]}";
    };
    auto members = [&](const Node& cls) {
      std::string kids;
      int k = 0;
      for (std::size_t i = cls.kind == N::Class ? kClassMembersFrom : 1; i < cls.kids.size(); ++i) {
        const Node& m = ast.nodes[cls.kids[i]];
        if (m.kind == N::Method) add(kids, k, m, std::string(m.text), m.text == "constructor" ? 9 : 6, "");
        else if (m.kind == N::Field) add(kids, k, m, std::string(m.text), 8, "");
      }
      return kids;
    };
    std::vector<std::uint32_t> stmts;
    if (!ast.modules.empty()) { for (const ModuleInfo& m : ast.modules) if (m.file == file) stmts = m.stmts; }
    else if (ast.root != kNone) stmts = ast.nodes[ast.root].kids;
    for (std::uint32_t s : stmts) {
      const Node* n = &ast.nodes[s];
      if (n->kind == N::Export && !n->kids.empty()) n = &ast.nodes[n->kids[0]];
      switch (n->kind) {
        case N::Function: add(out, count, *n, std::string(n->text), 12, ""); break;
        case N::Class: add(out, count, *n, std::string(n->text), 5, members(*n)); break;
        case N::Interface: add(out, count, *n, std::string(n->text), 11, members(*n)); break;
        case N::Enum: add(out, count, *n, std::string(n->text), 10, ""); break;
        case N::TypeAlias: add(out, count, *n, std::string(n->text), 26, ""); break;
        case N::VarDecl: for (std::uint32_t k : n->kids) { const Node& dcl = ast.nodes[k]; if (dcl.kind == N::Declarator && !dcl.text.empty()) add(out, count, dcl, std::string(dcl.text), n->text == "const" ? 14 : 13, ""); } break;
        default: break;
      }
    }
    return "[" + out + "]";
  }

  std::string completion(const std::string& uri, Doc& d, int line, int ch) {
    const std::string path = uriToPath(uri);
    const std::string& text = d.text;
    const std::size_t off = Lines(text).offset(text, line, ch);
    std::string items;
    int n = 0;
    auto add = [&](const std::string& label, int kind, const std::string& detail, const std::string& doc = "") {
      items += std::string(n++ ? "," : "") + "{\"label\":" + quote(label) + ",\"kind\":" + std::to_string(kind) + ",\"detail\":" + quote(detail) + (doc.empty() ? "" : ",\"documentation\":" + quote(doc)) + "}";
    };
    // module specifier: inside the quotes of `from '...'` / `import '...'`
    {
      std::size_t ls = text.rfind('\n', off == 0 ? 0 : off - 1);
      ls = ls == std::string::npos ? 0 : ls + 1;
      const std::string head = text.substr(ls, off - ls);
      const std::size_t q1 = head.rfind('\''), q2 = head.rfind('"');
      const std::size_t q = q1 == std::string::npos ? q2 : q2 == std::string::npos ? q1 : std::max(q1, q2);
      if (q != std::string::npos && (head.find("import") != std::string::npos || head.find("from") != std::string::npos) && std::count(head.begin(), head.end(), head[q]) % 2 == 1) {
        const std::string prefix = head.substr(q + 1);
        std::set<std::string> specs = {"zinc:gfx", "zinc:sys", "zinc:fs", "zinc:storage", "zinc:assets", "zinc:os", "zinc:events", "zinc:gpio", "zinc:wifi", "zinc:espnow", "zinc:osc", "zinc:net", "zinc:telemetry", "zinc:platform", "zinc:process", "zinc:script", "zinc:web", "zinc:ui", "zinc:ui/solid", "zinc:ui/react", "zinc:ui/kit", "zinc:ui/history", "zinc:system", "zinc:devtools", "zinc:assert"};
        std::error_code ec;
        for (const auto& e : fs::directory_iterator(stdRoot_, ec)) if (e.path().extension() == ".ts") specs.insert("zinc:" + e.path().stem().string());
        for (const std::string& s : specs) if (s.rfind(prefix, 0) == 0) add(s, 9, "module");
        return "{\"isIncomplete\":false,\"items\":[" + items + "]}";
      }
    }
    // member access: the name being typed after the dot gives way to a placeholder, the text is analysed and the members of the object's type are listed
    std::size_t b = off;
    while (b > 0 && identChar(text[b - 1])) --b;
    if (b > 0 && text[b - 1] == '.') {
      std::size_t ob = b - 1;
      while (ob > 0 && identChar(text[ob - 1])) --ob;
      if (const ModuleInfo* m = namespaceOf(d, text, text.substr(ob, b - 1 - ob))) {   // ns. : what the module exports
        std::map<std::string, std::uint32_t> ex;
        exportsOf(d.last->prog.ast, *m, ex);
        for (const auto& [name, id] : ex) {
          const About ab = about(*d.last, id);
          const TypeId t = id < d.last->checked.nodeType.size() ? d.last->checked.nodeType[id] : kNoType;
          add(name, kindOf(d.last->prog.ast.nodes[id]), !ab.code.empty() ? ab.code : t != kNoType && d.last->checkedOk ? typeName(d.last->checked, t) : "", ab.doc);
        }
        return "{\"isIncomplete\":false,\"items\":[" + items + "]}";
      }
      std::string patched = text;
      patched.replace(b, off - b, "__zn_complete__");
      auto a = analyze(path, &patched);
      const std::uint32_t file = static_cast<std::uint32_t>(fileIndex(*a, path));
      std::uint32_t id = findNamed(a->prog.ast, file, N::Member, "__zn_complete__");
      if (id != kNone && a->checkedOk) {
        const Node& mem = a->prog.ast.nodes[id];
        TypeId t = mem.kids.empty() ? kNoType : a->checked.nodeType[mem.kids[0]];
        if (t != kNoType && t < a->checked.types.size()) {
          const Type& ty = a->checked.types[t];
          if (ty.k == TK::Object && ty.obj < a->checked.objs.size()) {
            std::set<std::uint32_t> seen;
            std::set<std::string> names;
            for (std::uint32_t o = ty.obj; o != 0xFFFFFFFFu && o < a->checked.objs.size() && seen.insert(o).second; o = a->checked.objs[o].parent)
              for (const Member& m : a->checked.objs[o].members) {
                if (m.access != 0 || !names.insert(m.name).second) continue;
                const About ab = about(*a, memberNode(*a, t, m.name));
                add(m.name, m.method ? 2 : 5, m.method && !ab.code.empty() ? ab.code : m.method ? typeSignature(a->checked, m.name, m.type) : typeName(a->checked, m.type), ab.doc);
              }
          } else if (ty.k == TK::Str) { for (const char* s : {"length", "charAt", "charCodeAt", "indexOf", "slice", "split", "toUpperCase", "toLowerCase", "trim", "startsWith", "endsWith", "includes", "replace", "padStart", "padEnd", "at"}) add(s, 6, "string"); }
          else if (ty.k == TK::Array) { for (const char* s : {"length", "push", "pop", "shift", "unshift", "slice", "splice", "indexOf", "includes", "map", "filter", "reduce", "forEach", "join", "sort", "reverse", "find", "some", "every", "at"}) add(s, 6, "array"); }
        }
      }
      return "{\"isIncomplete\":false,\"items\":[" + items + "]}";
    }
    // names in scope: this file's and the imported ones, the globals, the locals of the functions around the position; then the keywords.
    // Everything is sent whatever is typed: the editor filters (and can match `sw` to strokeWidth).
    std::set<std::string> seen;
    if (d.last && d.last->checkedOk) {
      const Analysis& a = *d.last;
      const Ast& ast = a.prog.ast;
      const std::uint32_t file = static_cast<std::uint32_t>(fileIndex(a, path));
      const std::size_t at = nodeOffset(a.prog.files[file], line, ch);
      std::set<std::string_view> imported;
      for (const ModuleInfo& m : ast.modules) if (m.file == file) for (const ModuleImport& im : m.imports) imported.insert(im.local);
      for (const Symbol& s : a.checked.syms) {
        const std::string name(s.name);
        // not the engine's own: __host_* and the names the loader makes (ns$name); a host function's name can be a view of freed text
        if (name.empty() || name.rfind("__", 0) == 0 || name.find("_host_") != std::string::npos || seen.count(name) || std::isdigit(static_cast<unsigned char>(name[0])) || !std::all_of(name.begin(), name.end(), [](char c) { return identChar(c) && c != '$'; })) continue;
        if (s.decl != kNone && s.decl < ast.nodes.size()) {
          if (ast.nodes[s.decl].file != file && !imported.count(s.name)) continue;   // another module's own name
          if (s.ownerFn < ast.nodes.size()) { const Node& fn = ast.nodes[s.ownerFn]; if (fn.file != file || at < fn.start || at > fn.end) continue; }   // a local of another function
        }
        seen.insert(name);
        const About ab = about(a, s.decl);
        const bool fn = s.kind == SymKind::Func || s.kind == SymKind::GenericFunc || (s.kind == SymKind::Builtin && s.type < a.checked.types.size() && a.checked.types[s.type].k == TK::Func);
        const std::string sig = !ab.code.empty() ? ab.code : fn ? typeSignature(a.checked, name, s.type) : "";
        add(name, fn ? 3 : s.kind == SymKind::Class || s.kind == SymKind::GenericClass ? 7 : s.kind == SymKind::Enum ? 13 : s.kind == SymKind::TypeAlias || s.kind == SymKind::GenericAlias ? 8 : 6,
            !sig.empty() ? sig : typeName(a.checked, s.type), ab.doc);
      }
    }
    for (const char* kw : {"const", "let", "function", "class", "interface", "type", "enum", "return", "if", "else", "for", "while", "switch", "import", "export", "new", "this", "true", "false", "null", "async", "await", "try", "catch", "finally", "throw", "break", "continue", "case", "default", "do", "of", "in", "extends", "implements", "static", "readonly", "private", "public", "typeof", "instanceof", "as", "from", "void", "undefined"})
      if (seen.insert(kw).second) add(kw, 14, "keyword");
    return "{\"isIncomplete\":false,\"items\":[" + items + "]}";
  }

  // The call the position is in: the signature of what is called, its parameters, the one being typed (the commas before the position), the docs.
  std::string signatureHelp(const std::string& uri, Doc& d, int line, int ch) {
    const std::string path = uriToPath(uri);
    const std::string& text = d.text;
    const std::size_t off = Lines(text).offset(text, line, ch);
    std::size_t open = std::string::npos;
    int depth = 0, active = 0;
    for (std::size_t i = off; i-- > 0 && off - i < 4000;) {
      const char c = text[i];
      if (c == '"' || c == '\'' || c == '`') {   // a string is skipped whole
        const std::size_t q = i == 0 ? std::string::npos : text.rfind(c, i - 1);
        if (q == std::string::npos || text.find('\n', q) < i) break;
        i = q;
      } else if (c == ')' || c == ']' || c == '}') ++depth;
      else if (c == '(' || c == '[' || c == '{') { if (depth == 0) { if (c == '(') open = i; break; } --depth; }
      else if (c == ',' && depth == 0) ++active;
      else if (c == ';' && depth == 0) break;
    }
    if (open == std::string::npos) return "null";
    std::size_t e = open;
    while (e > 0 && text[e - 1] == ' ') --e;
    std::size_t b = e;
    while (b > 0 && identChar(text[b - 1])) --b;
    std::size_t w = b;
    while (w > 0 && text[w - 1] == ' ') --w;
    std::size_t w0 = w;
    while (w0 > 0 && identChar(text[w0 - 1])) --w0;
    const std::string name = text.substr(b, e - b), before = text.substr(w0, w - w0);   // before: `new`, `function`
    static const std::set<std::string> notCalls = {"if", "for", "while", "switch", "catch", "function", "return", "constructor", "typeof", "await"};
    if (name.empty() || notCalls.count(name) || before == "function") return "null";

    About ab;
    if (b > 0 && text[b - 1] == '.') {
      std::size_t ob = b - 1;
      while (ob > 0 && identChar(text[ob - 1])) --ob;
      if (const ModuleInfo* m = namespaceOf(d, text, text.substr(ob, b - 1 - ob))) {   // ns.name(
        std::map<std::string, std::uint32_t> ex;
        exportsOf(d.last->prog.ast, *m, ex);
        if (ex.count(name)) ab = about(*d.last, ex[name]);
      } else for (const char* placeholder : {"__zn_complete__(", "__zn_complete__"}) {   // object.name( : the type of the object, with the call set aside
        std::string patched = text;
        patched.replace(b, off - b, placeholder);
        auto a = analyze(path, &patched);
        const std::uint32_t id = a->checkedOk ? findNamed(a->prog.ast, static_cast<std::uint32_t>(fileIndex(*a, path)), N::Member, "__zn_complete__") : kNone;
        if (id == kNone || a->prog.ast.nodes[id].kids.empty()) continue;
        const TypeId t = a->checked.nodeType[a->prog.ast.nodes[id].kids[0]];
        ab = about(*a, memberNode(*a, t, name));
        if (ab.code.empty() && t != kNoType && t < a->checked.types.size() && a->checked.types[t].k == TK::Object) {
          std::set<std::uint32_t> seen;
          for (std::uint32_t o = a->checked.types[t].obj; o < a->checked.objs.size() && seen.insert(o).second; o = a->checked.objs[o].parent)
            for (const Member& mb : a->checked.objs[o].members) if (mb.name == name && ab.code.empty()) ab.code = typeSignature(a->checked, name, mb.type);
        }
        break;
      }
    } else if (d.last && d.last->checkedOk) {   // name( and new Name( : a symbol of the last analysis
      const Analysis& a = *d.last;
      for (const Symbol& s : a.checked.syms) {
        if (s.name != name) continue;
        const bool cls = s.kind == SymKind::Class || s.kind == SymKind::GenericClass;
        if (cls != (before == "new")) continue;
        if (cls && s.decl < a.prog.ast.nodes.size()) {
          const Node& c = a.prog.ast.nodes[s.decl];
          ab.code = "new " + name + "()";
          for (std::size_t i = kClassMembersFrom; i < c.kids.size(); ++i)
            if (c.kids[i] < a.prog.ast.nodes.size() && a.prog.ast.nodes[c.kids[i]].kind == N::Method && a.prog.ast.nodes[c.kids[i]].text == "constructor") {
              ab = about(a, c.kids[i]);
              ab.code = "new " + name + ab.code.substr(std::min(ab.code.size(), std::string("constructor").size()));
            }
          if (ab.doc.empty()) ab.doc = about(a, s.decl).doc;
        } else {
          ab = about(a, s.decl);
          if (ab.code.empty() || startsWith(ab.code, "class ")) ab.code = typeSignature(a.checked, name, s.type);
        }
        if (!ab.code.empty()) break;
      }
    }
    if (ab.code.empty()) return "null";
    std::string params;
    const auto ps = paramsOf(ab.code);
    for (std::size_t i = 0; i < ps.size(); ++i) {
      std::string pname = ab.code.substr(ps[i].first, ps[i].second - ps[i].first), pdoc;
      pname = pname.substr(pname.find_first_not_of('.') == std::string::npos ? 0 : pname.find_first_not_of('.'));
      std::size_t pe = 0;
      while (pe < pname.size() && identChar(pname[pe])) ++pe;
      for (const auto& [pn, pd] : ab.params) if (pn == pname.substr(0, pe)) pdoc = pd;
      params += std::string(i ? "," : "") + "{\"label\":[" + std::to_string(utf16(ab.code, ps[i].first)) + "," + std::to_string(utf16(ab.code, ps[i].second)) + "]" + (pdoc.empty() ? "" : ",\"documentation\":" + quote(pdoc)) + "}";
    }
    if (!ps.empty()) active = std::min(active, static_cast<int>(ps.size()) - 1);
    return "{\"signatures\":[{\"label\":" + quote(ab.code) + (ab.doc.empty() ? "" : ",\"documentation\":" + quote(ab.doc)) + ",\"parameters\":[" + params + "]}],\"activeSignature\":0,\"activeParameter\":" + std::to_string(active) + "}";
  }
};

bool readMessage(std::string& body) {
  std::size_t len = 0;
  std::string line;
  bool any = false;
  while (true) {
    line.clear();
    int c;
    while ((c = std::getchar()) != EOF && c != '\n') line += static_cast<char>(c);
    if (c == EOF && line.empty()) return false;
    any = true;
    if (!line.empty() && line.back() == '\r') line.pop_back();
    if (line.empty()) break;
    if (line.rfind("Content-Length:", 0) == 0) len = static_cast<std::size_t>(std::atol(line.c_str() + 15));
  }
  (void)any;
  body.assign(len, '\0');
  return std::fread(body.data(), 1, len, stdin) == len;
}

int Server::run() {
  zn::frontend::followModuleSuffixes(true);   // go to definition lands where tsc's moduleSuffixes do (Screen.android.tsx), as the editor shows it
  std::string body;
  while (readMessage(body)) {
    yyjson_doc* doc = yyjson_read(body.c_str(), body.size(), 0);
    if (!doc) continue;
    yyjson_val* root = yyjson_doc_get_root(doc);
    yyjson_val* mv = yyjson_obj_get(root, "method");
    yyjson_val* idv = yyjson_obj_get(root, "id");
    yyjson_val* params = yyjson_obj_get(root, "params");
    const std::string method = mv && yyjson_is_str(mv) ? yyjson_get_str(mv) : "";
    std::string id;
    if (idv) id = yyjson_is_str(idv) ? quote(yyjson_get_str(idv)) : std::to_string(static_cast<long long>(yyjson_get_sint(idv)));
    auto str = [&](yyjson_val* v, const char* k) { yyjson_val* x = v ? yyjson_obj_get(v, k) : nullptr; return x && yyjson_is_str(x) ? std::string(yyjson_get_str(x)) : std::string(); };
    yyjson_val* td = params ? yyjson_obj_get(params, "textDocument") : nullptr;
    const std::string uri = str(td, "uri");
    yyjson_val* pos = params ? yyjson_obj_get(params, "position") : nullptr;
    const int line = pos ? static_cast<int>(yyjson_get_sint(yyjson_obj_get(pos, "line"))) : 0;
    const int ch = pos ? static_cast<int>(yyjson_get_sint(yyjson_obj_get(pos, "character"))) : 0;

    if (method == "initialize") {
      reply(id, "{\"capabilities\":{\"textDocumentSync\":1,\"hoverProvider\":true,\"definitionProvider\":true,\"documentSymbolProvider\":true,\"completionProvider\":{\"triggerCharacters\":[\".\",\"'\",\"\\\"\",\"/\"]},\"signatureHelpProvider\":{\"triggerCharacters\":[\"(\",\",\"]}},\"serverInfo\":{\"name\":\"zinc\",\"version\":\"" + std::string(zn::tc::version()) + "\"}}");
    } else if (method == "shutdown") { shutdown_ = true; reply(id, "null"); }
    else if (method == "exit") { yyjson_doc_free(doc); return shutdown_ ? 0 : 1; }
    else if (method == "textDocument/didOpen") {
      yyjson_val* v = td ? yyjson_obj_get(td, "text") : nullptr;
      Doc& d = docs_[uri];
      d.text = v && yyjson_is_str(v) ? yyjson_get_str(v) : "";
      d.version = td ? static_cast<int>(yyjson_get_sint(yyjson_obj_get(td, "version"))) : 0;
      publish(uri, d);
    } else if (method == "textDocument/didChange") {
      yyjson_val* changes = params ? yyjson_obj_get(params, "contentChanges") : nullptr;
      if (changes && yyjson_arr_size(changes) > 0) {
        yyjson_val* last = yyjson_arr_get(changes, yyjson_arr_size(changes) - 1);   // full document sync
        yyjson_val* v = yyjson_obj_get(last, "text");
        Doc& d = docs_[uri];
        d.text = v && yyjson_is_str(v) ? yyjson_get_str(v) : d.text;
        publish(uri, d);
      }
    } else if (method == "textDocument/didClose") {
      docs_.erase(uri);
      notify("textDocument/publishDiagnostics", "{\"uri\":" + quote(uri) + ",\"diagnostics\":[]}");
    } else if (!id.empty() && docs_.count(uri)) {
      Doc& d = docs_[uri];
      if (method == "textDocument/hover") reply(id, hover(uri, d, line, ch));
      else if (method == "textDocument/definition") reply(id, definition(uri, d, line, ch));
      else if (method == "textDocument/documentSymbol") reply(id, symbols(uri, d));
      else if (method == "textDocument/completion") reply(id, completion(uri, d, line, ch));
      else if (method == "textDocument/signatureHelp") reply(id, signatureHelp(uri, d, line, ch));
      else reply(id, "null");
    } else if (!id.empty()) reply(id, "null");
    yyjson_doc_free(doc);
  }
  return shutdown_ ? 0 : 1;
}

}  // namespace

int serve(const std::string& stdRoot) { Server s(stdRoot); return s.run(); }

}  // namespace zn::lsp
