#include "sim/program_dut.h"

#include <yyjson.h>

#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <sstream>

namespace zn::sim {
namespace fs = std::filesystem;
namespace {
std::string quote(const std::string& s) { std::string o = "'"; for (char c : s) { if (c == '\'') o += "'\\''"; else o += c; } return o + "'"; }
std::string slurp(const std::string& p) { std::ifstream f(p, std::ios::binary); std::stringstream s; s << f.rdbuf(); return s.str(); }
}  // namespace

ProgramDut::ProgramDut(Config c) : c_(std::move(c)) { std::error_code ec; fs::create_directories(c_.scratch, ec); }

bool ProgramDut::execute(std::uint64_t frames, std::uint64_t shotFrame, const std::string& shotPng, Run* out, std::string& err) {
  const std::string in = c_.scratch + "/input.txt", so = c_.scratch + "/stdout.txt", se = c_.scratch + "/stderr.txt";
  {
    std::ofstream f(in);
    std::vector<std::pair<std::uint64_t, std::string>> ev = inputs_;
    std::stable_sort(ev.begin(), ev.end(), [](const auto& a, const auto& b) { return a.first < b.first; });
    for (const auto& e : ev) f << e.first << ' ' << e.second << '\n';
  }
  std::string cmd = "env ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_STAMP_OUT=1 ZINC_FRAMEHASH=all ZINC_FRAMES=" + std::to_string(frames) + " ZINC_INPUT=" + quote(in);
  const std::string shot = c_.scratch + "/shot.png";
  if (shotFrame > 0) cmd += " ZINC_SHOT=" + quote(shot) + " ZINC_SHOT_FRAMES=" + std::to_string(shotFrame);
  cmd += " " + quote(c_.zinc) + " run " + quote(c_.project) + " > " + quote(so) + " 2> " + quote(se);
  const int rc = std::system(cmd.c_str());
  const std::string errText = slurp(se);
  if (rc != 0) { c_.log = errText; err = "the program failed (exit " + std::to_string(rc) + "): " + errText.substr(0, 300); return false; }
  if (out) {
    out->frames = frames; out->lines.clear(); out->hashes.clear();
    std::istringstream lines(slurp(so));
    std::string l; std::uint64_t at = 0;
    while (std::getline(lines, l)) {
      if (!l.empty() && l[0] == '@') { const std::size_t sp = l.find(' '); at = std::strtoull(l.c_str() + 1, nullptr, 10); l = sp == std::string::npos ? "" : l.substr(sp + 1); }
      out->lines.push_back({at, l});
    }
    std::istringstream hs(errText);
    while (std::getline(hs, l)) {   // "zinc: framehash <frame> <W>x<H> <hash>"
      char size[32], hash[40]; unsigned long long n = 0;
      if (std::sscanf(l.c_str(), "zinc: framehash %llu %31s %39s", &n, size, hash) == 3) out->hashes[n] = hash;
    }
    out->ok = true;
  }
  if (shotFrame > 0 && !shotPng.empty()) {
    std::error_code ec;
    const std::string made = c_.scratch + "/shot-" + std::to_string(shotFrame) + ".png";
    if (!fs::exists(made)) { err = "the run left no frame " + std::to_string(shotFrame); return false; }
    fs::create_directories(fs::path(shotPng).parent_path(), ec);
    fs::copy_file(made, shotPng, fs::copy_options::overwrite_existing, ec);
    fs::remove(made, ec);
  }
  return true;
}

bool ProgramDut::ensure(std::uint64_t frames, std::string& err) {
  if (run_.ok && run_.frames >= frames) return true;
  const std::uint64_t ahead = std::max<std::uint64_t>({frames, run_.frames * 2, 120});   // a run goes ahead of the clock
  Run r;
  if (!execute(ahead, 0, "", &r, err)) return false;
  run_ = std::move(r);
  return true;
}

std::string ProgramDut::takeSerial() {
  std::string err;
  if (!ensure(framesAt(t_) + 1, err)) return "";
  std::string out;
  while (delivered_ < run_.lines.size() && (run_.lines[delivered_].frame + 1) * kFrameNs <= t_) out += run_.lines[delivered_++].text + "\n";   // a line printed with N frames done is the program's frame N + 1
  return out;
}

bool ProgramDut::setControl(const std::string& part, const std::string& control, double value, std::string& err) {
  if (!c_.board) { err = "no board.json: the scenario names no board, so no part has controls"; return false; }
  for (const BoardPart& p : c_.board->parts) {
    if (p.id != part) continue;
    yyjson_doc* d = yyjson_read(p.attrs.data(), p.attrs.size(), 0);
    std::string key;
    if (d) { yyjson_val* k = yyjson_obj_get(yyjson_obj_get(yyjson_doc_get_root(d), "inputs"), control.c_str()); if (k && yyjson_is_str(k)) key = yyjson_get_str(k); yyjson_doc_free(d); }
    if (key.empty()) { err = "part " + part + " has no control '" + control + "' (attrs.inputs maps a control to the input event that stands for it: \"key Space\", \"pad A\", \"down\")"; return false; }
    if (value == 0) return true;   // a press is one frame long: its release is scripted with it
    const std::uint64_t f = (t_ + kFrameNs - 1) / kFrameNs;
    if (run_.ok && run_.frames * kFrameNs > t_) { run_ = Run(); }   // (the lines given out so far are the same in the replay: inputs only change what comes after them)   // a run that went past this moment would not know about the key: drop it, a replay starts again
    inputs_.push_back({f, key});
    if (key.rfind("pad ", 0) == 0) inputs_.push_back({f + 1, "padup " + key.substr(4)});   // a pad button is held until released: one frame
    else if (key == "down") inputs_.push_back({f + 1, "up"});
    return true;
  }
  err = "no part '" + part + "' in the board";
  return false;
}

bool ProgramDut::recordTrace(std::uint64_t frames, Trace& out, std::string& err) {
  Run r;
  if (!execute(frames, 0, "", &r, err)) return false;
  std::vector<TraceEvent> ev;
  for (const auto& in : inputs_) if (in.first <= frames) ev.push_back({in.first * kFrameNs, kInput, static_cast<std::uint32_t>(in.first), 0, in.second});
  for (const Line& l : r.lines) if (l.frame + 1 <= frames) ev.push_back({(l.frame + 1) * kFrameNs, kSerial, static_cast<std::uint32_t>(l.frame), 0, l.text});
  for (const auto& h : r.hashes) if (h.first <= frames) ev.push_back({h.first * kFrameNs, kFrame, static_cast<std::uint32_t>(h.first), 0, h.second});
  std::stable_sort(ev.begin(), ev.end(), [](const TraceEvent& a, const TraceEvent& b) { return a.t_ns != b.t_ns ? a.t_ns < b.t_ns : a.kind < b.kind; });
  out = Trace();
  for (const TraceEvent& e : ev) out.add(e.t_ns, e.kind, e.a, e.b, e.data);
  return true;
}

bool ProgramDut::frameHash(const std::string&, std::string& hash, std::string& err) {
  const std::uint64_t f = std::max<std::uint64_t>(1, framesAt(t_));
  if (!ensure(f, err)) return false;
  auto it = run_.hashes.find(f);
  if (it == run_.hashes.end()) { err = "the run printed no hash for frame " + std::to_string(f); return false; }
  hash = it->second;
  return true;
}

bool ProgramDut::screenshot(const std::string&, const std::string& pngPath, std::string& err) {
  const std::uint64_t f = std::max<std::uint64_t>(1, framesAt(t_));
  return execute(f, f, pngPath, nullptr, err);
}

}  // namespace zn::sim
