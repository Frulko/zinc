#include "sim/scenario.h"

#include <yaml.h>
#define STB_IMAGE_STATIC
#define STB_IMAGE_IMPLEMENTATION
#define STBI_ONLY_PNG
#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wunused-function"
#include "../../third_party/stb/stb_image.h"
#pragma GCC diagnostic pop

#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <map>
#include <memory>

#include "sim/sim.h"

namespace zn::sim {
namespace {

// A YAML tree: scalars, sequences, mappings (key order kept).
struct Node {
  enum Kind { Scalar, Seq, Map } kind = Scalar;
  std::string text;
  std::vector<std::pair<std::string, Node>> map;
  std::vector<Node> seq;
  int line = 0;
  const Node* get(const std::string& k) const { for (const auto& [a, b] : map) if (a == k) return &b; return nullptr; }
};

bool build(yaml_parser_t& p, yaml_event_t& first, Node& out, std::string& err) {
  out.line = static_cast<int>(first.start_mark.line) + 1;
  if (first.type == YAML_SCALAR_EVENT) { out.kind = Node::Scalar; out.text.assign(reinterpret_cast<char*>(first.data.scalar.value), first.data.scalar.length); return true; }
  const bool isMap = first.type == YAML_MAPPING_START_EVENT;
  if (!isMap && first.type != YAML_SEQUENCE_START_EVENT) { err = "line " + std::to_string(out.line) + ": unsupported YAML (alias or anchor)"; return false; }
  out.kind = isMap ? Node::Map : Node::Seq;
  for (;;) {
    yaml_event_t ev;
    if (!yaml_parser_parse(&p, &ev)) { err = std::string("YAML: ") + (p.problem ? p.problem : "error") + " at line " + std::to_string(p.problem_mark.line + 1); return false; }
    struct Free { yaml_event_t& e; ~Free() { yaml_event_delete(&e); } } guard{ev};
    if (ev.type == (isMap ? YAML_MAPPING_END_EVENT : YAML_SEQUENCE_END_EVENT)) return true;
    Node child;
    if (isMap) {
      if (ev.type != YAML_SCALAR_EVENT) { err = "line " + std::to_string(ev.start_mark.line + 1) + ": a mapping key must be a scalar"; return false; }
      std::string key(reinterpret_cast<char*>(ev.data.scalar.value), ev.data.scalar.length);
      yaml_event_t vev;
      if (!yaml_parser_parse(&p, &vev)) { err = std::string("YAML: ") + (p.problem ? p.problem : "error"); return false; }
      Free g2{vev};
      if (!build(p, vev, child, err)) return false;
      out.map.emplace_back(std::move(key), std::move(child));
    } else {
      if (!build(p, ev, child, err)) return false;
      out.seq.push_back(std::move(child));
    }
  }
}

bool parseTree(const std::string& text, Node& root, std::string& err) {
  yaml_parser_t p;
  if (!yaml_parser_initialize(&p)) { err = "YAML: out of memory"; return false; }
  yaml_parser_set_input_string(&p, reinterpret_cast<const unsigned char*>(text.data()), text.size());
  bool ok = false;
  for (;;) {
    yaml_event_t ev;
    if (!yaml_parser_parse(&p, &ev)) { err = std::string("YAML: ") + (p.problem ? p.problem : "error") + " at line " + std::to_string(p.problem_mark.line + 1); break; }
    const auto t = ev.type;
    if (t == YAML_MAPPING_START_EVENT || t == YAML_SEQUENCE_START_EVENT || t == YAML_SCALAR_EVENT) { ok = build(p, ev, root, err); yaml_event_delete(&ev); break; }
    yaml_event_delete(&ev);
    if (t == YAML_STREAM_END_EVENT) { err = "YAML: empty document"; break; }
  }
  yaml_parser_delete(&p);
  return ok;
}

bool toNumber(const std::string& s, double& v) {
  if (s.empty()) return false;
  char* end = nullptr;
  v = std::strtod(s.c_str(), &end);   // 0x3c, 12, 1.5
  if (end == s.c_str() + s.size()) return true;
  const long long l = std::strtoll(s.c_str(), &end, 0);
  if (end == s.c_str() + s.size()) { v = static_cast<double>(l); return true; }
  return false;
}
bool toDuration(const Node& n, std::uint64_t& ns) {
  if (n.kind != Node::Scalar) return false;
  bool ok = false;
  ns = Scheduler::parse(n.text, ok);
  return ok;
}
bool toBytes(const Node& n, std::vector<std::uint8_t>& out) {
  if (n.kind != Node::Seq) return false;
  for (const auto& b : n.seq) { double v; if (b.kind != Node::Scalar || !toNumber(b.text, v) || v < 0 || v > 255) return false; out.push_back(static_cast<std::uint8_t>(v)); }
  return true;
}

}  // namespace

bool parseScenario(const std::string& yaml, Scenario& out, std::string& err) {
  Node root;
  if (!parseTree(yaml, root, err)) return false;
  if (root.kind != Node::Map) { err = "a scenario is a mapping with `steps`"; return false; }
  if (const Node* n = root.get("name")) out.name = n->text;
  if (const Node* n = root.get("board")) out.board = n->text;
  if (const Node* n = root.get("project")) out.project = n->text;
  if (const Node* n = root.get("seed")) { double v = 0; toNumber(n->text, v); out.seed = static_cast<int>(v); }
  const Node* steps = root.get("steps");
  if (!steps || steps->kind != Node::Seq) { err = "a scenario needs a `steps` list"; return false; }
  int idx = 0;
  for (const Node& sn : steps->seq) {
    Step s; s.index = ++idx;
    const std::string at = "step " + std::to_string(s.index) + " (line " + std::to_string(sn.line) + "): ";
    if (sn.kind != Node::Map || sn.map.size() != 1) { err = at + "a step is a mapping with one key (the step kind)"; return false; }
    const std::string& kind = sn.map[0].first; const Node& arg = sn.map[0].second;
    s.kind = kind;
    auto str = [&](const char* k, std::string& dst, bool req) { if (const Node* n = arg.kind == Node::Map ? arg.get(k) : nullptr) { dst = n->text; return true; } if (req) err = at + kind + " needs `" + k + "`"; return !req; };
    auto num = [&](const char* k, double& dst) { if (const Node* n = arg.kind == Node::Map ? arg.get(k) : nullptr) { if (!toNumber(n->text, dst)) { err = at + "`" + k + "` is not a number: " + n->text; return false; } } return true; };
    if (kind == "wait-serial") {
      s.ns = 0;
      if (arg.kind == Node::Scalar) s.text = arg.text;
      else {
        if (!str("text", s.text, true)) return false;
        if (const Node* t = arg.get("timeout")) if (!toDuration(*t, s.ns)) { err = at + "bad timeout: " + t->text; return false; }
      }
    } else if (kind == "write-serial") {
      if (arg.kind != Node::Scalar) { err = at + "write-serial takes a string"; return false; }
      s.text = arg.text;
    } else if (kind == "delay" || kind == "advance") {
      if (!toDuration(arg, s.ns)) { err = at + kind + " takes a duration such as 500ms: " + arg.text; return false; }
    } else if (kind == "set-control") {
      if (!str("part-id", s.part, true) || !str("control", s.control, true) || !num("value", s.value)) return false;
    } else if (kind == "expect-pin") {
      if (!str("part-id", s.part, true) || !str("pin", s.pin, true)) return false;
      s.value = 0; bool have = false;
      for (const char* k : {"value", "expected"}) if (arg.get(k)) { if (!num(k, s.value)) return false; have = true; }
      if (!have) { err = at + "expect-pin needs `value`"; return false; }
    } else if (kind == "expect-bus") {
      if (!str("part-id", s.part, true) || !str("protocol", s.protocol, true)) return false;
      double a = -1; if (!num("address", a)) return false; s.address = static_cast<std::int64_t>(a);
      if (const Node* c = arg.get("contains")) if (!toBytes(*c, s.bytes)) { err = at + "`contains` is a list of bytes"; return false; }
    } else if (kind == "expect-frame") {
      if (!str("part-id", s.part, true) || !str("hash", s.text, true)) return false;
    } else if (kind == "expect-pixel") {
      double x = 0, y = 0; std::string rgb;
      if (!str("part-id", s.part, true) || !num("x", x) || !num("y", y) || !str("rgb", rgb, true)) return false;
      s.x = static_cast<int>(x); s.y = static_cast<int>(y);
      s.rgb = static_cast<std::uint32_t>(std::strtoul(rgb.c_str() + (rgb[0] == '#'), nullptr, 16));
    } else if (kind == "expect-logic") {
      if (const Node* pn = arg.get("pins")) { if (pn->kind == Node::Seq) for (const Node& q : pn->seq) s.pins.push_back(q.text); else s.pins.push_back(pn->text); }
      if (s.pins.empty()) { err = at + "expect-logic needs `pins`"; return false; }
      if (const Node* w = arg.get("window")) { if (!toDuration(*w, s.windowNs)) { err = at + "bad window: " + w->text; return false; } } else { err = at + "expect-logic needs `window`"; return false; }
      double e = -1; if (!num("edges", e) || e < 0) { err = at + "expect-logic needs `edges`"; return false; } s.edges = static_cast<int>(e);
    } else if (kind == "take-screenshot") {
      if (!str("part-id", s.part, true)) return false;
      if (const Node* n = arg.get("compare-with")) s.compareWith = n->text;
      if (const Node* n = arg.get("save-to")) s.text = n->text;
      if (const Node* n = arg.get("tolerance")) { std::string t = n->text; const bool pct = !t.empty() && t.back() == '%'; if (pct) t.pop_back(); double v; if (!toNumber(t, v)) { err = at + "bad tolerance: " + n->text; return false; } s.tolerance = pct ? v / 100 : v; }
    } else { err = at + "unknown step `" + kind + "`"; return false; }
    out.steps.push_back(std::move(s));
  }
  return true;
}

namespace {
std::string fmtTime(std::uint64_t ns) {
  char b[48];
  if (ns % 1'000'000'000ull == 0) std::snprintf(b, sizeof b, "%llu.000s", static_cast<unsigned long long>(ns / 1'000'000'000ull));
  else std::snprintf(b, sizeof b, "%.6fs", static_cast<double>(ns) / 1e9);
  return b;
}
}  // namespace

double pngDiffFraction(const std::string& a, const std::string& b, std::string& err) {
  int wa = 0, ha = 0, wb = 0, hb = 0, n = 0;
  unsigned char* pa = stbi_load(a.c_str(), &wa, &ha, &n, 3);
  if (!pa) { err = "cannot read " + a; return -1; }
  unsigned char* pb = stbi_load(b.c_str(), &wb, &hb, &n, 3);
  if (!pb) { stbi_image_free(pa); err = "cannot read " + b; return -1; }
  double r = -1;
  if (wa != wb || ha != hb) err = "sizes differ: " + std::to_string(wa) + "x" + std::to_string(ha) + " and " + std::to_string(wb) + "x" + std::to_string(hb);
  else { std::size_t diff = 0; for (std::size_t i = 0; i < static_cast<std::size_t>(wa) * ha; ++i) if (pa[i * 3] != pb[i * 3] || pa[i * 3 + 1] != pb[i * 3 + 1] || pa[i * 3 + 2] != pb[i * 3 + 2]) ++diff; r = static_cast<double>(diff) / (static_cast<double>(wa) * ha); }
  stbi_image_free(pa); stbi_image_free(pb);
  return r;
}
bool pngPixel(const std::string& path, int x, int y, std::uint32_t& rgb, std::string& err) {
  int w = 0, h = 0, n = 0;
  unsigned char* p = stbi_load(path.c_str(), &w, &h, &n, 3);
  if (!p) { err = "cannot read " + path; return false; }
  bool ok = x >= 0 && y >= 0 && x < w && y < h;
  if (ok) { const unsigned char* q = p + (static_cast<std::size_t>(y) * w + x) * 3; rgb = (static_cast<std::uint32_t>(q[0]) << 16) | (static_cast<std::uint32_t>(q[1]) << 8) | q[2]; }
  else err = "pixel " + std::to_string(x) + "," + std::to_string(y) + " is outside the " + std::to_string(w) + "x" + std::to_string(h) + " frame";
  stbi_image_free(p);
  return ok;
}

RunResult runScenario(const Scenario& sc, Dut& dut, const RunOptions& opt) {
  namespace fs = std::filesystem;
  const std::uint64_t defaultTimeoutNs = opt.defaultTimeoutNs;
  auto rel = [&](const std::string& path) { return fs::path(path).is_absolute() ? path : (fs::path(opt.baseDir) / path).string(); };
  std::string tmpDir = (fs::temp_directory_path() / ("zn-sim-" + std::to_string(reinterpret_cast<std::uintptr_t>(&sc)))).string();
  fs::create_directories(tmpDir);
  struct Clean { std::string d; ~Clean() { std::error_code ec; fs::remove_all(d, ec); } } clean{tmpDir};
  RunResult r;
  std::string serial;   // everything the device wrote, searched by wait-serial from the end of the last match
  std::size_t from = 0;
  auto fail = [&](const Step& s, const std::string& msg) {
    r.ok = false; r.failedStep = s.index; r.message = msg; r.t_ns = dut.now();
    if (!opt.outDir.empty()) { std::error_code ec; fs::create_directories(opt.outDir, ec); std::string e2, file = (fs::path(opt.outDir) / ("fail-step-" + std::to_string(s.index) + ".png")).string(); if (dut.screenshot("", file, e2)) r.message += " (last frame: " + file + ")"; }
    return r;
  };
  for (const Step& s : sc.steps) {
    std::string err;
    if (s.kind == "delay" || s.kind == "advance") { dut.advance(s.ns); serial += dut.takeSerial(); }
    else if (s.kind == "write-serial") { if (!dut.writeSerial(s.text, err)) return fail(s, "write-serial: " + err); }
    else if (s.kind == "wait-serial") {
      const std::uint64_t timeout = s.ns ? s.ns : defaultTimeoutNs, end = dut.now() + timeout;
      constexpr std::uint64_t slice = 1'000'000;   // 1 ms of virtual time between looks at the output
      serial += dut.takeSerial();
      for (;;) {
        const auto at = serial.find(s.text, from);
        if (at != std::string::npos) { from = at + s.text.size(); break; }
        if (dut.now() >= end) return fail(s, "wait-serial \"" + s.text + "\" not seen within " + fmtTime(timeout) + "; the device wrote: " + (serial.size() > from ? serial.substr(from, 200) : std::string("nothing")));
        dut.advance(std::min<std::uint64_t>(slice, end - dut.now()));
        serial += dut.takeSerial();
      }
    } else if (s.kind == "set-control") { if (!dut.setControl(s.part, s.control, s.value, err)) return fail(s, "set-control " + s.part + "." + s.control + ": " + err); }
    else if (s.kind == "expect-pin") {
      int level = 0;
      if (!dut.pinLevel(s.part, s.pin, level, err)) return fail(s, "expect-pin " + s.part + ":" + s.pin + ": " + err);
      if (level != static_cast<int>(s.value)) return fail(s, "expect-pin " + s.part + ":" + s.pin + ": expected " + std::to_string(static_cast<int>(s.value)) + ", the pin is " + std::to_string(level));
    } else if (s.kind == "expect-bus") {
      std::vector<std::vector<std::uint8_t>> tx;
      if (!dut.busWrites(s.part, s.protocol, s.address, tx, err)) return fail(s, "expect-bus " + s.part + ": " + err);
      bool found = false;
      for (const auto& t : tx) {   // `contains` is a run of bytes inside one transaction
        for (std::size_t i = 0; !found && i + s.bytes.size() <= t.size(); ++i) found = std::equal(s.bytes.begin(), s.bytes.end(), t.begin() + static_cast<std::ptrdiff_t>(i));
        if (found) break;
      }
      if (!found) return fail(s, "expect-bus " + s.part + " " + s.protocol + ": no transaction contains the bytes (" + std::to_string(tx.size()) + " transactions seen)");
    } else if (s.kind == "expect-frame") {
      std::string hash;
      if (!dut.frameHash(s.part, hash, err)) return fail(s, "expect-frame " + s.part + ": " + err);
      if (hash != s.text) {
        if (!opt.updateGoldens) return fail(s, "expect-frame " + s.part + ": the frame hashes to " + hash + ", expected " + s.text);
        r.newHashes.push_back({s.text, hash});
      }
    } else if (s.kind == "expect-logic") {
      int edges = 0;
      if (!dut.logicEdges(s.pins, s.windowNs, edges, err)) return fail(s, "expect-logic: " + err);
      if (edges != s.edges) return fail(s, "expect-logic: " + std::to_string(edges) + " edges in " + fmtTime(s.windowNs) + ", expected " + std::to_string(s.edges));
    } else if (s.kind == "expect-pixel") {
      const std::string png = tmpDir + "/px.png"; std::uint32_t rgb = 0;
      if (!dut.screenshot(s.part, png, err) || !pngPixel(png, s.x, s.y, rgb, err)) return fail(s, "expect-pixel " + s.part + ": " + err);
      if (rgb != s.rgb) { char b[80]; std::snprintf(b, sizeof b, "is #%06x, expected #%06x", rgb, s.rgb); return fail(s, "expect-pixel " + s.part + " at " + std::to_string(s.x) + "," + std::to_string(s.y) + " " + b); }
    } else if (s.kind == "take-screenshot") {
      const std::string png = tmpDir + "/shot.png";
      if (!dut.screenshot(s.part, png, err)) return fail(s, "take-screenshot " + s.part + ": " + err);
      std::error_code ec;
      if (!s.text.empty()) { fs::create_directories(fs::path(rel(s.text)).parent_path(), ec); fs::copy_file(png, rel(s.text), fs::copy_options::overwrite_existing, ec); }
      if (!s.compareWith.empty()) {
        if (opt.updateGoldens) { fs::create_directories(fs::path(rel(s.compareWith)).parent_path(), ec); fs::copy_file(png, rel(s.compareWith), fs::copy_options::overwrite_existing, ec); }
        else {
          const double d = pngDiffFraction(png, rel(s.compareWith), err);
          if (d < 0) return fail(s, "take-screenshot " + s.part + " compare-with " + s.compareWith + ": " + err);
          if (d > s.tolerance) { char b[120]; std::snprintf(b, sizeof b, "%.3f%% of the pixels differ (tolerance %.3f%%)", d * 100, s.tolerance * 100); return fail(s, "take-screenshot " + s.part + " compare-with " + s.compareWith + ": " + b); }
        }
      }
    } else { r.ok = false; r.failedStep = s.index; r.t_ns = dut.now(); r.message = s.kind + " is not a known step"; return r; }
  }
  r.t_ns = dut.now();
  return r;
}

std::string describe(const Scenario& sc, const RunResult& r) {
  if (r.ok) return "ok " + std::to_string(sc.steps.size()) + " steps at t=" + fmtTime(r.t_ns);
  return "FAIL step " + std::to_string(r.failedStep) + " (" + sc.steps[static_cast<std::size_t>(r.failedStep - 1)].kind + ") at t=" + fmtTime(r.t_ns) + ": " + r.message;
}

}  // namespace zn::sim
