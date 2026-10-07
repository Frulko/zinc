#include "frontend/desugar.h"

#include <deque>
#include <string>

#include "frontend/snippet.h"

namespace zn::frontend {

namespace {

using Id = std::uint32_t;
using Ids = std::vector<Id>;
using Holes = std::vector<Ids>;

// What the code being generated does with exceptions and jumps. Each is the name of a function or code ending in `return;`.
struct Ctx {
  std::string rej;         // function taking the Error; empty: let it propagate
  std::string brk, cont;   // code for `break` / `continue` of a loop that was turned into lambdas; empty: none
  std::vector<std::string> fins;  // the `finally` lambdas around this code, outermost first: a `return` runs them (innermost first) before it returns
};

struct Desugar {
  Ast& a;
  std::vector<Diag>& diags;
  int uid = 0;
  bool gen = false, vp = false;  // the function being rewritten: a generator, a Promise<void>
  Id anchor = 0;

  Node& n(Id i) { return a.nodes[i]; }
  std::string fresh(const char* p) { return p + std::to_string(++uid); }
  void unsupported(Id at, const std::string& what) { diags.push_back({kZUnsupported, n(at).start, what, n(at).file}); }
  Ids sn(const std::string& text, const Holes& h = {}) {
    Ids r = snippet(a, text, h, anchor);
    if (r.empty() && text.find_first_not_of(" \t\n") != std::string::npos) unsupported(anchor, "internal: async rewrite did not parse: " + text);
    return r;
  }
  Id exprStmt(Id e) { a.nodes.push_back({N::ExprStmt, n(e).start, n(e).end, "", {e}, 0, n(e).file}); return static_cast<Id>(a.nodes.size() - 1); }

  // Does the statement or expression hold an await or yield outside nested functions?
  bool susp(Id i) {
    if (i == kNone) return false;
    const Node& x = n(i);
    if (x.kind == N::Await || x.kind == N::Yield) return true;
    if (x.kind == N::FuncExpr || x.kind == N::Function || x.kind == N::Class) return false;
    for (Id k : x.kids) if (susp(k)) return true;
    return false;
  }
  Ids list(Id s) { if (s == kNone) return {}; if (n(s).kind == N::Block) return n(s).kids; return {s}; }

  std::string callK(const std::string& k) { return gen ? "__g.cont = " + k + "; return;" : k + "(); return;"; }
  std::string wrap(const Ctx& c, const std::string& inner) {
    if (c.rej.empty()) return inner;
    std::string e = fresh("__e");
    return "try { " + inner + " } catch (" + e + ") { " + c.rej + "(" + e + "); }";
  }
  void emitLambda(Ids& out, const std::string& name, const Ids& body, const Ctx& c) {
    Ids r = sn("const " + name + " = (): void => { " + wrap(c, "__H0;") + " };", {body});
    out.insert(out.end(), r.begin(), r.end());
  }

  // Statements without await or yield that are part of the rewritten function: returns and the jumps of rewritten loops.
  Id fix(Id s, const Ctx& c, int loops, int sw) {
    if (s == kNone) return s;
    Node& x = n(s);
    switch (x.kind) {
      case N::Return: {
        std::string t;
        Holes h;
        if (!c.fins.empty()) {  // inside try...finally: the value is computed, the finally blocks run, then the function ends
          std::string done = gen ? "__g.done = true;" : vp ? "__p.resolveWith();" : x.kids[0] == kNone ? "__p.resolveWith();" : "__p.resolveWith(__rv);";
          std::string chain = done;
          for (const std::string& f : c.fins) chain = f + "((): void => { " + chain + " });";  // outermost wraps last, so the innermost runs first
          if (gen && x.kids[0] != kNone) unsupported(s, "'return' with a value in a generator");
          bool value = x.kids[0] != kNone && !gen;
          Ids r = sn(std::string("{ ") + (value ? (vp ? "__H0; " : "const __rv = __H0; ") : "") + chain + " return; }", value ? Holes{{vp ? exprStmt(x.kids[0]) : x.kids[0]}} : Holes{});
          return r.empty() ? s : r[0];
        }
        if (gen) {
          if (x.kids[0] != kNone) unsupported(s, "'return' with a value in a generator");
          t = "{ __g.done = true; return; }";
        } else if (x.kids[0] == kNone) t = "{ " + std::string(vp ? "__p.resolveWith(); " : "") + "return; }";
        else if (vp) { h = {{x.kids[0]}}; t = "{ __H0; __p.resolveWith(); return; }"; h[0] = {exprStmt(x.kids[0])}; }
        else { h = {{x.kids[0]}}; t = "{ __p.resolveWith(__H0); return; }"; }
        Ids r = sn(t, h);
        return r.empty() ? s : r[0];
      }
      case N::Break: { if (c.brk.empty() || loops > 0 || sw > 0) return s; Ids r = sn("{ " + c.brk + " }"); return r.empty() ? s : r[0]; }
      case N::Continue: { if (c.cont.empty() || loops > 0) return s; Ids r = sn("{ " + c.cont + " }"); return r.empty() ? s : r[0]; }
      case N::Block: for (Id& k : x.kids) k = fix(k, c, loops, sw); return s;
      case N::If: x.kids[1] = fix(x.kids[1], c, loops, sw); x.kids[2] = fix(x.kids[2], c, loops, sw); return s;
      case N::For: x.kids[3] = fix(x.kids[3], c, loops + 1, sw); return s;
      case N::ForOf: case N::ForIn: x.kids[2] = fix(x.kids[2], c, loops + 1, sw); return s;
      case N::While: x.kids[1] = fix(x.kids[1], c, loops + 1, sw); return s;
      case N::DoWhile: x.kids[0] = fix(x.kids[0], c, loops + 1, sw); return s;
      case N::Try: for (int k : {0, 2, 3}) x.kids[k] = fix(x.kids[k], c, loops, sw); return s;
      case N::Switch:
        for (std::size_t k = 1; k < x.kids.size(); ++k) for (std::size_t j = 1; j < n(x.kids[k]).kids.size(); ++j) n(x.kids[k]).kids[j] = fix(n(x.kids[k]).kids[j], c, loops, sw + 1);
        return s;
      default: return s;
    }
  }

  // The statements of `l` followed by `tail` (code), with every await and yield turned into a continuation.
  Ids S(const Ids& l, const Ctx& c, const std::string& tail) {
    Ids out;
    for (std::size_t i = 0; i < l.size(); ++i) {
      if (!susp(l[i])) { out.push_back(fix(l[i], c, 0, 0)); continue; }
      T(l[i], Ids(l.begin() + static_cast<std::ptrdiff_t>(i) + 1, l.end()), c, tail, out);
      return out;
    }
    Ids t = sn(tail);
    out.insert(out.end(), t.begin(), t.end());
    return out;
  }

  Id expr(const std::string& text) { Ids r = sn(text + ";"); return r.empty() ? kNone : n(r[0]).kids[0]; }

  void loop(Ids& out, const Ctx& c, const std::string& kt, Id cond, const Ids& body, Id update) {
    std::string L = fresh("__loop"), NX = fresh("__next");
    std::string again = callK(update != kNone ? NX : L);
    Ctx lc = c;
    std::string release = L + " = (): void => { };";  // the loop's lambda names itself: drop that reference when the loop ends so nothing is left in a cycle
    lc.brk = release + " " + kt + " return;";
    lc.cont = again;
    Holes h{{}, {}, S(body, lc, again)};
    std::string text = "let " + L + ": () => void = (): void => { };\n";
    if (gen) text += "__g.onClose.push((): void => { " + L + " = (): void => { }; });\n";  // a generator abandoned in the middle of this loop lets go of it
    if (update != kNone) {
      h[1] = {exprStmt(update)};
      text += "const " + NX + " = (): void => { " + (c.rej.empty() ? "__H1; " : "try { __H1; } catch (__eu) { " + c.rej + "(__eu); return; } ") + callK(L) + " };\n";
    }
    Id test = cond;
    if (test == kNone) test = expr("true");
    h[0] = {test};
    text += L + " = (): void => { " + wrap(c, "if (!(__H0)) { " + release + " " + kt + " return; } __H2;") + " };\n" + callK(L);
    Ids r = sn(text, h);
    out.insert(out.end(), r.begin(), r.end());
  }

  // ---- awaits inside expressions: hoisted, in evaluation order, into temporaries so every statement left has one of the supported shapes
  static std::deque<std::string>& nameStore() { static std::deque<std::string> v; return v; }  // the text of generated identifiers: nodes view it, so it outlives the pass
  Id mkIdent(const std::string& nm, Id at) {
    nameStore().push_back(nm);
    a.nodes.push_back({N::Ident, n(at).start, n(at).end, nameStore().back(), {}, 0, n(at).file});
    return static_cast<Id>(a.nodes.size() - 1);
  }
  bool trivialOperand(Id i) const {  // evaluating it earlier or later is not observable
    switch (a.nodes[i].kind) {
      case N::Ident: case N::This: case N::Number: case N::String: case N::Literal: case N::FuncExpr: case N::TypeRef: return true;
      default: return false;
    }
  }
  bool hoistableKind(Id i) const {
    switch (a.nodes[i].kind) {
      case N::Call: case N::New: case N::Member: case N::Index: case N::Binary: case N::Unary: case N::Cond: case N::Array: case N::ObjectLit: case N::Template: case N::As: case N::NonNull: return true;
      default: return false;
    }
  }
  Id hoist(Id e, Ids& pre) {  // `const t = e;` before the statement
    std::string t = fresh("__v");
    Ids st = sn("const " + t + " = __H0;", {{e}});
    pre.insert(pre.end(), st.begin(), st.end());
    return mkIdent(t, e);
  }
  // The expression with its awaits replaced by temporaries; the statements that compute them are appended to `pre`.
  Id lin(Id i, Ids& pre) {
    if (!susp(i)) return i;
    N kind = n(i).kind;
    if (kind == N::Await) {
      Id e = lin(n(i).kids[0], pre);
      std::string t = fresh("__v");
      a.nodes.push_back({N::Await, n(i).start, n(i).end, "", {e}, 0, n(i).file});  // built by hand: the snippet parser reads `await` only inside an async function
      Id aw = static_cast<Id>(a.nodes.size() - 1);
      Ids st = sn("const " + t + " = __H0;", {{aw}});
      pre.insert(pre.end(), st.begin(), st.end());
      nameStore().push_back(t);
      n(i).kind = N::Ident; n(i).text = nameStore().back(); n(i).kids.clear();
      return i;
    }
    if (kind == N::Yield) { unsupported(i, "'yield' used as a value"); return i; }
    if (kind == N::Binary && (n(i).text == "&&" || n(i).text == "||" || n(i).text == "??")) {
      Id l = lin(n(i).kids[0], pre);
      if (!susp(n(i).kids[1])) { n(i).kids[0] = l; return i; }
      std::string t = fresh("__v"), op(n(i).text);  // the right operand runs only when the left one lets it: `let t = l; if (t) { ...; t = r; }`
      Ids decl = sn("let " + t + " = __H0;", {{l}});
      Ids rpre;
      Id r = lin(n(i).kids[1], rpre);
      Ids set = sn(t + " = __H0;", {{r}});
      rpre.insert(rpre.end(), set.begin(), set.end());
      std::string test = op == "&&" ? t : op == "||" ? "!" + t : t + " === null";
      Ids ifs = sn("if (" + test + ") { __H0; }", {rpre});
      pre.insert(pre.end(), decl.begin(), decl.end());
      pre.insert(pre.end(), ifs.begin(), ifs.end());
      return mkIdent(t, i);
    }
    if (kind == N::Cond) {
      if (susp(n(i).kids[1]) || susp(n(i).kids[2])) { unsupported(i, "'await' in a branch of '?:' (use if/else)"); return i; }
      Id c0 = lin(n(i).kids[0], pre);
      n(i).kids[0] = c0;
      return i;
    }
    std::vector<Id> ks = n(i).kids;
    int last = -1;
    for (std::size_t k = 0; k < ks.size(); ++k) if (ks[k] != kNone && susp(ks[k])) last = static_cast<int>(k);
    for (int k = 0; k <= last; ++k) {
      Id ko = ks[static_cast<std::size_t>(k)];
      if (ko == kNone) continue;
      Id r = lin(ko, pre);
      if (k < last && !trivialOperand(r) && hoistableKind(r) && !(kind == N::Call && k == 0)) r = hoist(r, pre);
      else if (k < last && kind == N::Call && k == 0 && n(r).kind == N::Member && !trivialOperand(n(r).kids[0]) && hoistableKind(n(r).kids[0])) n(r).kids[0] = hoist(n(r).kids[0], pre);  // obj.m(...): obj is evaluated first
      n(i).kids[static_cast<std::size_t>(k)] = r;
    }
    return i;
  }
  // The statement has the shape T handles directly: `await e;`, `yield e;`, `x = await e;`, `const x = await e;`, `return await e;` with e free of awaits.
  bool simpleForm(Id s) {
    const Node& x = n(s);
    if (x.kind == N::ExprStmt) {
      const Node& in = n(x.kids[0]);
      if (in.kind == N::Await || in.kind == N::Yield) return !susp(in.kids[0]);
      return in.kind == N::Assign && n(in.kids[1]).kind == N::Await && !susp(in.kids[0]) && !susp(n(in.kids[1]).kids[0]);
    }
    if (x.kind == N::VarDecl) {
      if (x.kids.size() != 1) return false;
      const Node& d = n(x.kids[0]);
      return d.kids.size() >= 2 && (d.kids.size() < 3 || d.kids[2] == kNone) && d.kids[1] != kNone && n(d.kids[1]).kind == N::Await && !susp(n(d.kids[1]).kids[0]) && x.text != "var" && x.text != "using";
    }
    if (x.kind == N::Return) return x.kids[0] != kNone && n(x.kids[0]).kind == N::Await && !susp(n(x.kids[0]).kids[0]);
    return false;
  }
  // Rewrites a statement whose awaits sit in expressions into statements of the supported shapes (appended to `R`); false when there is nothing to do.
  bool normalize(Id s, Ids& R) {
    std::size_t before = diags.size();
    bool done = normalize0(s, R);
    if (diags.size() > before) { R.clear(); return false; }  // something is unsupported: leave the statement as it is (T reports it)
    return done;
  }
  bool normalize0(Id s, Ids& R) {
    Node& x0 = n(s);
    N kind = x0.kind;
    if (simpleForm(s)) return false;
    switch (kind) {
      case N::ExprStmt: case N::Return: case N::Throw: {
        Id e = n(s).kids[0];
        if (e == kNone || !susp(e)) return false;
        Ids pre;
        Id e2 = lin(e, pre);
        R = pre;
        bool bareTemp = kind == N::ExprStmt && n(e2).kind == N::Ident && n(e2).text.substr(0, 4) == "__v" && e2 == e;  // `await f(await g());`: nothing is left to evaluate
        if (!bareTemp) { n(s).kids[0] = e2; R.push_back(s); }
        return true;
      }
      case N::VarDecl: {
        bool any = false;
        for (Id d : n(s).kids) if (n(d).kids.size() >= 2 && susp(n(d).kids[1])) any = true;
        if (!any) return false;
        std::vector<Id> ds = n(s).kids;
        for (Id d : ds) {
          Ids pre;
          if (n(d).kids.size() >= 2 && n(d).kids[1] != kNone) n(d).kids[1] = lin(n(d).kids[1], pre);
          R.insert(R.end(), pre.begin(), pre.end());
          a.nodes.push_back(n(s));
          Id one = static_cast<Id>(a.nodes.size() - 1);
          n(one).kids = {d};
          R.push_back(one);
        }
        return true;
      }
      case N::If: case N::Switch: case N::ForOf: case N::ForIn: {
        std::size_t hk = kind == N::ForOf || kind == N::ForIn ? 1 : 0;
        Id h = n(s).kids[hk];
        if (h == kNone || !susp(h)) return false;
        Ids pre;
        n(s).kids[hk] = lin(h, pre);
        R = pre;
        R.push_back(s);
        return true;
      }
      case N::While: {  // while (await c) body  =>  while (true) { pre; if (!c') break; body }
        Id cnd = n(s).kids[0];
        if (!susp(cnd)) return false;
        Ids pre;
        Id c2 = lin(cnd, pre);
        Ids r = sn("while (true) { __H0; if (!(__H1)) { break; } __H2; }", {pre, {c2}, list(n(s).kids[1])});
        if (r.empty()) return false;
        R = r;
        return true;
      }
      case N::For: {
        if (susp(n(s).kids[2])) { unsupported(s, "'await' in the update of a 'for' loop"); return false; }
        Id cnd = n(s).kids[1];
        if (cnd == kNone || !susp(cnd)) return false;
        Ids pre;
        Id c2 = lin(cnd, pre);
        Ids blk = sn("{ __H0; if (!(__H1)) { break; } __H2; }", {pre, {c2}, list(n(s).kids[3])});
        if (blk.empty()) return false;
        n(s).kids[1] = kNone;
        n(s).kids[3] = blk[0];
        R = {s};
        return true;
      }
      default: return false;
    }
  }

  void T(Id s, const Ids& rest, const Ctx& c, const std::string& tail, Ids& out) {
    {
      Ids R;
      if (normalize(s, R)) {
        Ids all = R;
        all.insert(all.end(), rest.begin(), rest.end());
        Ids r = S(all, c, tail);
        out.insert(out.end(), r.begin(), r.end());
        return;
      }
    }
    Node& x = n(s);
    auto add = [&](const Ids& v) { out.insert(out.end(), v.begin(), v.end()); };
    enum Form { Other, Plain, Decl, Assign, Ret, Yield } form = Other;
    Id e = kNone, target = kNone, ann = kNone;
    std::string name, op;
    bool isLet = false;
    if (x.kind == N::ExprStmt) {
      const Node& in = n(x.kids[0]);
      if (in.kind == N::Await) { form = Plain; e = in.kids[0]; }
      else if (in.kind == N::Yield) { form = Yield; e = in.kids[0]; }
      else if (in.kind == N::Assign && n(in.kids[1]).kind == N::Await && !susp(in.kids[0])) { form = Assign; op = std::string(in.text); target = in.kids[0]; e = n(in.kids[1]).kids[0]; }
    } else if (x.kind == N::VarDecl && x.kids.size() == 1 && n(x.kids[0]).kids.size() >= 2 && (n(x.kids[0]).kids.size() < 3 || n(x.kids[0]).kids[2] == kNone) && n(x.kids[0]).kids[1] != kNone && n(n(x.kids[0]).kids[1]).kind == N::Await && x.text != "var" && x.text != "using") {
      const Node& d = n(x.kids[0]);
      form = Decl; e = n(d.kids[1]).kids[0]; ann = d.kids[0]; name = std::string(d.text); isLet = x.text == "let";
    } else if (x.kind == N::Return && x.kids[0] != kNone && n(x.kids[0]).kind == N::Await) { form = Ret; e = n(x.kids[0]).kids[0]; }
    if (form != Other) {
      if (e == kNone) { unsupported(s, "'yield' without a value"); return; }
      if (susp(e)) { unsupported(s, "nested 'await' or 'yield'"); return; }
      std::string tmp = fresh("__t");
      if (form == Yield) {
        std::string k = fresh("__k");
        emitLambda(out, k, S(rest, c, tail), c);
        add(sn("__g.value = [__H0]; __g.cont = " + k + "; return;", {{e}}));
        return;
      }
      Holes h{{e}, {}, {}};
      std::string param = tmp, pre;
      if (form == Ret) pre = vp ? "__p.resolveWith(); " : "__p.resolveWith(" + tmp + "); ";
      else {
        h[1] = S(rest, c, tail);
        if (form == Decl && !isLet) { param = name + (ann != kNone ? ": __H2" : ""); if (ann != kNone) h[2] = {ann}; }
        else if (form == Decl) { pre = "let " + name + (ann != kNone ? ": __H2" : "") + " = " + tmp + "; "; if (ann != kNone) h[2] = {ann}; }
        else if (form == Assign) { pre = "__H2 " + op + " " + tmp + "; "; h[2] = {target}; }
        pre += wrap(c, "__H1;");
      }
      add(sn("__await(__H0, (" + param + ") => { " + pre + " }, " + c.rej + ");", h));
      return;
    }
    // a compound statement: what follows it becomes a lambda the branches end with
    std::string kt = tail;
    if (!rest.empty()) { std::string k = fresh("__k"); emitLambda(out, k, S(rest, c, tail), c); kt = callK(k); }
    switch (x.kind) {
      case N::Block: add(sn("{ __H0; }", {S(x.kids, c, kt)})); return;
      case N::If: add(sn("if (__H0) { __H1; } else { __H2; }", {{x.kids[0]}, S(list(x.kids[1]), c, kt), S(list(x.kids[2]), c, kt)})); return;
      case N::While: loop(out, c, kt, x.kids[0], list(x.kids[1]), kNone); return;
      case N::For: {
        if (x.kids[0] != kNone) out.push_back(n(x.kids[0]).kind == N::VarDecl ? x.kids[0] : exprStmt(x.kids[0]));
        loop(out, c, kt, x.kids[1], list(x.kids[3]), x.kids[2]);
        return;
      }
      case N::ForOf: {
        const Node& d = n(x.kids[0]);
        if (d.text.empty() || (d.kids.size() > 2 && d.kids[2] != kNone)) { unsupported(s, "destructuring in 'for...of' around await or yield"); return; }
        std::string arr = fresh("__a"), idx = fresh("__i");
        add(sn("const " + arr + " = __H0; let " + idx + ": i32 = 0;", {{x.kids[1]}}));
        Ids body = sn(std::string(x.text) + " " + std::string(d.text) + " = " + arr + "[" + idx + "]; " + idx + "++;");
        Ids rest2 = list(x.kids[2]);
        body.insert(body.end(), rest2.begin(), rest2.end());
        loop(out, c, kt, expr(idx + " < " + arr + ".length"), body, kNone);
        return;
      }
      case N::Try: {
        std::string h = fresh("__h"), ev = x.kids[1] != kNone ? std::string(n(x.kids[1]).text) : fresh("__ce");
        Ctx oc = c;       // what the try body and the catch block run under
        std::string kt2 = kt;
        if (x.kids[3] != kNone) {  // finally: a lambda taking the continuation; every way out of the try runs it first
          std::string F = fresh("__fin"), nx = fresh("__nx"), rf = fresh("__rf");
          add(sn("const " + F + " = (" + nx + ": () => void): void => { " + wrap(c, "__H0;") + " };", {S(list(x.kids[3]), c, nx + "(); return;")}));
          std::string again = c.rej.empty() ? "throw __fe;" : c.rej + "(__fe);";
          add(sn("const " + rf + " = (__fe: Error): void => { " + F + "((): void => { " + again + " }); };"));
          kt2 = F + "((): void => { " + kt + " }); return;";
          oc.rej = rf;
          oc.fins.push_back(F);
          if (!c.brk.empty()) oc.brk = F + "((): void => { " + c.brk + " }); return;";
          if (!c.cont.empty()) oc.cont = F + "((): void => { " + c.cont + " }); return;";
        }
        Ctx bc = oc;
        if (x.kids[2] != kNone) {
          add(sn("const " + h + " = (" + ev + ": Error): void => { " + wrap(oc, "__H0;") + " };", {S(list(x.kids[2]), oc, kt2)}));
          bc.rej = h;
        } else if (x.kids[3] == kNone) { unsupported(s, "'try' without catch or finally"); return; }
        std::string handler = bc.rej;
        add(sn("try { __H0; } catch (__ex) { " + handler + "(__ex); }", {S(list(x.kids[0]), bc, kt2)}));
        return;
      }
      default: unsupported(s, "'await' or 'yield' in this statement"); return;
    }
  }

  void function(Id f) {
    Node& x = n(f);
    bool async = x.flags & kFlagAsync, g = x.flags & kFlagGenerator;
    if (!async && !g) return;
    if (async && g) { unsupported(f, "async generators"); return; }
    if (x.kids[1] == kNone) return;
    Id ret = x.kids[0];
    anchor = f;
    gen = g;
    vp = false;
    Id t = kNone;
    if (ret == kNone || n(ret).kind != N::TypeRef) { unsupported(f, async ? "an async function without a Promise<T> return type" : "a generator without a Generator<T> return type"); return; }
    if (async && n(ret).text == "PromiseV") vp = true;
    else if (n(ret).text == (async ? "Promise" : "Generator") && n(ret).kids.size() == 1) t = n(ret).kids[0];
    else { unsupported(ret, async ? "return type of an async function other than Promise<T>" : "return type of a generator other than Generator<T>"); return; }
    Ids body = n(x.kids[1]).kids, nb;
    if (async) {
      Ctx c;
      c.rej = "__rej";
      Ids code = S(body, c, vp ? "__p.resolveWith();" : "");
      nb = sn(std::string("const __p = ") + (vp ? "__newPromiseV()" : "__newPromise<__H0>()") + ";\n" +
              "const __rej = (__e: Error): void => { __p.rejectWith(__e); };\n" +
              "const __start = (): void => { try { __H1; } catch (__e0) { __rej(__e0); } };\n__start();\nreturn __p;",
              {t == kNone ? Ids{} : Ids{t}, code});
    } else {
      Ids code = S(body, Ctx{}, "__g.done = true;");
      nb = sn("const __g = new Generator<__H0>();\n__g.cont = (): void => { __H1; };\nreturn __g;", {{t}, code});
    }
    n(x.kids[1]).kids = nb;
  }

  void run() {
    auto count = static_cast<Id>(a.nodes.size());
    for (Id i = 0; i < count; ++i) {  // the types and static calls first
      Node& x = n(i);
      if (x.kind == N::TypeRef && x.text == "Promise" && x.kids.size() == 1 && n(x.kids[0]).kind == N::TypeRef && n(x.kids[0]).text == "void") { x.text = "PromiseV"; x.kids.clear(); }
      else if (x.kind == N::New && n(x.kids[0]).kind == N::Ident && n(x.kids[0]).text == "Promise" && a.targs.count(i) && a.targs[i].size() == 1 && n(a.targs[i][0]).text == "void") {
        n(x.kids[0]).text = "PromiseV";
        a.targs.erase(i);
      } else if (x.kind == N::Call && n(x.kids[0]).kind == N::Member && n(n(x.kids[0]).kids[0]).kind == N::Ident && n(n(x.kids[0]).kids[0]).text == "Promise") {
        Node& m = n(x.kids[0]);
        if (m.text == "all") { m.kind = N::Ident; m.text = "__all"; m.kids.clear(); }
        else if (m.text == "reject") { m.kind = N::Ident; m.text = "__rejectedP"; m.kids.clear(); }
        else if (m.text == "race") { m.kind = N::Ident; m.text = "__race"; m.kids.clear(); }
        else if (m.text == "any") { m.kind = N::Ident; m.text = "__any"; m.kids.clear(); }
        else if (m.text == "allSettled") { m.kind = N::Ident; m.text = "__allSettled"; m.kids.clear(); }
        else if (m.text == "withResolvers") { m.kind = N::Ident; m.text = "__withResolvers"; m.kids.clear(); }
        else if (m.text == "resolve") { m.kind = N::Ident; m.text = x.kids.size() == 1 ? "__resolvedV" : "__resolved"; m.kids.clear(); }
      }
    }
    for (Id i = 0; i < count; ++i) {
      N k = n(i).kind;
      if (k == N::Function) function(i);
      else if ((k == N::Method || k == N::FuncExpr) && (n(i).flags & kFlagAsync) && !(n(i).flags & kFlagGenerator)) function(i);  // the same body rewrite (async methods, arrows and function expressions); `this` is captured by the arrow it makes
      else if ((k == N::FuncExpr || k == N::Method) && (n(i).flags & (kFlagAsync | kFlagGenerator))) unsupported(i, k == N::Method ? "generator methods" : "generator expressions");
    }
  }
};

}  // namespace

void desugarAsync(Ast& a, std::vector<Diag>& diags) { Desugar{a, diags}.run(); }

}  // namespace zn::frontend
