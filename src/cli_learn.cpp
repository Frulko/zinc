// zinc learn (ZN-774.26): the lessons of docs/learn as exercises, offline (docs/reports/onboarding-research-2026-10-30.md, plan step 8).
// A lesson is a folder of learn/lessons/<id>/ shipped with the engine: lesson.json (title, the page of docs/learn it exercises, the file
// the person edits, and per step its text, the one message of its check and a hint, in the five languages), the project's zinc.json and
// assets, and per step N steps/N.start.ts (the starter code), N.check.ts (a Zinc program: given the edited file, exit 0 when the step
// is done) and N.solution.ts. `zinc learn <lesson>` unpacks it into a folder (the starter of its step, a .lesson file naming it),
// watches the file and checks the step at each save: zinc check first (the program must compile), then the step's check. Progress:
// $ZINC_HOME/learn.json {"<id>": steps done}, shared with Zinc Atelier, which runs the same command with --json for its lesson panel.
#include "cli_core.h"
#include "i18n/i18n.h"
#include "platform/platform.h"
#include "tc/tc.h"
#include "yyjson.h"

#include <algorithm>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <thread>
#ifndef _WIN32
#include <poll.h>
#include <unistd.h>
#endif

namespace zn::cli {
namespace {
namespace fs = std::filesystem;
using zn::i18n::tr;

struct Step { std::string text, message, hint; };
struct Lesson {
  std::string id, title, page, file;   // page: docs/learn's page ("learn/01-window-and-shape"); file: what the person edits
  fs::path dir;                        // its folder in learn/lessons
  std::vector<Step> steps;
};

std::string readText(const fs::path& p) { std::ifstream f(p, std::ios::binary); std::stringstream ss; ss << f.rdbuf(); return ss.str(); }
void say(const std::string& s) { std::printf("%s\n", s.c_str()); std::fflush(stdout); }
std::string q(const std::string& s) {   // shell quoting
  std::string o = "'";
  for (char c : s) { if (c == '\'') o += "'\\''"; else o += c; }
  return o + "'";
}

// A text of lesson.json in the person's language, English when that one is missing
std::string text(yyjson_val* o, const std::string& lang) {
  if (yyjson_is_str(o)) return yyjson_get_str(o);
  const char* s = yyjson_get_str(yyjson_obj_get(o, lang.c_str()));
  if (!s) s = yyjson_get_str(yyjson_obj_get(o, "en"));
  return s ? s : "";
}

bool load(const fs::path& dir, Lesson& l) {
  yyjson_doc* doc = yyjson_read_file((dir / "lesson.json").string().c_str(), 0, nullptr, nullptr);
  if (!doc) return false;
  const std::string lang = zn::i18n::language();
  yyjson_val* r = yyjson_doc_get_root(doc);
  l.id = dir.filename().string();
  l.dir = dir;
  l.title = text(yyjson_obj_get(r, "title"), lang);
  l.page = text(yyjson_obj_get(r, "lesson"), lang);
  l.file = text(yyjson_obj_get(r, "file"), lang);
  if (l.file.empty()) l.file = "src/main.ts";
  std::size_t i, n;
  yyjson_val* s;
  yyjson_arr_foreach(yyjson_obj_get(r, "steps"), i, n, s)
    l.steps.push_back({text(yyjson_obj_get(s, "text"), lang), text(yyjson_obj_get(s, "message"), lang), text(yyjson_obj_get(s, "hint"), lang)});
  yyjson_doc_free(doc);
  return !l.steps.empty();
}

std::vector<Lesson> lessons(const std::string& root) {
  std::vector<fs::path> dirs;
  std::error_code ec;
  for (const auto& e : fs::directory_iterator(fs::path(root) / "learn" / "lessons", ec))
    if (fs::exists(e.path() / "lesson.json", ec)) dirs.push_back(e.path());
  std::sort(dirs.begin(), dirs.end());
  std::vector<Lesson> out;
  for (const auto& d : dirs) { Lesson l; if (load(d, l)) out.push_back(std::move(l)); }
  return out;
}

// "1", "01", "01-window-and-shape" or "window": the lesson it names, or null
const Lesson* find(const std::vector<Lesson>& all, const std::string& name) {
  for (const auto& l : all) if (l.id == name) return &l;
  if (!name.empty() && std::all_of(name.begin(), name.end(), [](unsigned char c) { return std::isdigit(c); })) {
    const int n = std::atoi(name.c_str());
    for (const auto& l : all) if (std::atoi(l.id.c_str()) == n) return &l;
  }
  for (const auto& l : all) if (!name.empty() && l.id.find(name) != std::string::npos) return &l;
  return nullptr;
}

// ---- progress: $ZINC_HOME/learn.json {"<id>": steps done}
std::string progressFile() { return zn::tc::home() + "/learn.json"; }
int doneOf(const std::string& id) {
  yyjson_doc* doc = yyjson_read_file(progressFile().c_str(), 0, nullptr, nullptr);
  const int n = doc ? static_cast<int>(yyjson_get_int(yyjson_obj_get(yyjson_doc_get_root(doc), id.c_str()))) : 0;
  yyjson_doc_free(doc);
  return n;
}
void setDone(const std::string& id, int n) {
  yyjson_doc* old = yyjson_read_file(progressFile().c_str(), 0, nullptr, nullptr);
  yyjson_mut_doc* doc = yyjson_mut_doc_new(nullptr);
  yyjson_mut_val* root = yyjson_mut_obj(doc);
  yyjson_mut_doc_set_root(doc, root);
  if (yyjson_val* r = old ? yyjson_doc_get_root(old) : nullptr; yyjson_is_obj(r)) {
    std::size_t i, max;
    yyjson_val *k, *v;
    yyjson_obj_foreach(r, i, max, k, v) if (id != yyjson_get_str(k)) yyjson_mut_obj_add_int(doc, root, yyjson_get_str(k), yyjson_get_int(v));
  }
  yyjson_mut_obj_add_int(doc, root, id.c_str(), n);
  std::error_code ec;
  fs::create_directories(zn::tc::home(), ec);
  yyjson_mut_write_file(progressFile().c_str(), doc, YYJSON_WRITE_PRETTY_TWO_SPACES | YYJSON_WRITE_NEWLINE_AT_END, nullptr, nullptr);
  yyjson_mut_doc_free(doc);
  yyjson_doc_free(old);
}

// The step the person is on, 1-based; steps.size() + 1 once the lesson is done
int current(const Lesson& l) { return std::min(doneOf(l.id), static_cast<int>(l.steps.size())) + 1; }
fs::path stepFile(const Lesson& l, int step, const char* kind) { return l.dir / "steps" / (std::to_string(step) + "." + kind + ".ts"); }

// The lesson's project in `dir`: its files but lesson.json and steps/, the starter of the step it is on, and .lesson naming it.
// A folder that already holds the lesson is left as it is: the person's code stays.
bool unpack(const Lesson& l, const fs::path& dir) {
  std::error_code ec;
  if (readText(dir / ".lesson") == l.id + "\n") return true;
  if (fs::exists(dir, ec) && !fs::is_empty(dir, ec)) { std::fprintf(stderr, "%s\n", tr("cli.learn.not_empty", {{"dir", dir.string()}}).c_str()); return false; }
  fs::create_directories(dir, ec);
  for (const auto& e : fs::directory_iterator(l.dir, ec)) {
    const std::string name = e.path().filename().string();
    if (name == "lesson.json" || name == "steps") continue;
    fs::copy(e.path(), dir / name, fs::copy_options::recursive, ec);
  }
  const int step = std::min(current(l), static_cast<int>(l.steps.size()));
  fs::create_directories((dir / l.file).parent_path(), ec);
  fs::copy_file(stepFile(l, step, "start"), dir / l.file, fs::copy_options::overwrite_existing, ec);
  std::ofstream(dir / ".lesson") << l.id << "\n";
  return !ec;
}

// The lesson a folder holds (its .lesson file)
const Lesson* lessonIn(const std::vector<Lesson>& all, const fs::path& dir) {
  std::string id = readText(dir / ".lesson");
  while (!id.empty() && (id.back() == '\n' || id.back() == '\r')) id.pop_back();
  for (const auto& l : all) if (l.id == id) return &l;
  return nullptr;
}

struct Verdict { bool passed = false, compiles = true; std::string errors; };
// zinc check of the project, then the step's check program on the edited file
Verdict checkStep(const Lesson& l, int step, const fs::path& dir) {
  Verdict v;
  const std::string exe = zn::tc::executablePath(), out = (fs::path(zn::tc::home()) / "learn.out").string();
  std::error_code ec;
  fs::create_directories(zn::tc::home(), ec);
  if (zn::plat::exitStatus(std::system(("cd " + q(dir.string()) + " && " + q(exe) + " check > " + q(out) + " 2>&1").c_str())) != 0) {
    v.compiles = false;
    std::istringstream is(readText(out));   // the diagnostics, without the closing summary of zinc check
    for (std::string line; std::getline(is, line);) if (line.find(": error ") != std::string::npos) v.errors += line + "\n";
    fs::remove(out, ec);
    return v;
  }
  v.passed = zn::plat::exitStatus(std::system((q(exe) + " run --interp " + q(stepFile(l, step, "check").string()) + " -- " +
                                               q((fs::absolute(dir) / l.file).string()) + " > " + q(out) + " 2>&1").c_str())) == 0;
  fs::remove(out, ec);
  return v;
}

std::string json(std::string_view s) {
  std::string o = "\"";
  for (unsigned char c : s) {
    if (c == '"' || c == '\\') { o += '\\'; o += static_cast<char>(c); }
    else if (c == '\n') o += "\\n";
    else if (c < 0x20) { char b[8]; std::snprintf(b, sizeof b, "\\u%04x", c); o += b; }
    else o += static_cast<char>(c);
  }
  return o + "\"";
}
// What Atelier's lesson panel shows: the lesson, the step, its text, hint and solution, and the verdict of a check when there was one
void printJson(const Lesson& l, const fs::path& dir, const Verdict* v, int checked) {
  const int step = current(l), n = static_cast<int>(l.steps.size());
  const bool done = step > n;
  const Step& s = l.steps[std::min(step, n) - 1];
  std::string o = "{\"lesson\": " + json(l.id) + ", \"title\": " + json(l.title) + ", \"page\": " + json(cli::docs((l.page + "/").c_str())) +
                  ", \"dir\": " + json(fs::absolute(dir).lexically_normal().string()) + ", \"file\": " + json(l.file) +
                  ", \"step\": " + std::to_string(std::min(step, n)) + ", \"steps\": " + std::to_string(n) + ", \"done\": " + (done ? "true" : "false") +
                  ", \"text\": " + json(s.text) + ", \"hint\": " + json(s.hint) + ", \"solution\": " + json(readText(stepFile(l, std::min(step, n), "solution")));
  if (v) o += ", \"checked\": " + std::to_string(checked) + ", \"passed\": " + (v->passed ? "true" : "false") + ", \"message\": " +
              json(!v->compiles ? tr("cli.learn.compile") : v->passed ? "" : l.steps[checked - 1].message) + ", \"errors\": " + json(v->errors);
  say(o + "}");
}

void printStep(const Lesson& l) {
  const int step = current(l), n = static_cast<int>(l.steps.size());
  if (step > n) { say(tr("cli.learn.lesson_done", {{"title", l.title}})); return; }
  say("\n" + tr("cli.learn.step", {{"title", l.title}, {"step", std::to_string(step)}, {"steps", std::to_string(n)}}));
  say("  " + l.steps[step - 1].text);
}

// Checks the step the folder is on and says the verdict; a passed step moves the progress on. True when it passed.
bool checkAndSay(const std::vector<Lesson>& all, const Lesson& l, const fs::path& dir, bool asJson) {
  const int step = current(l), n = static_cast<int>(l.steps.size());
  if (step > n) { if (asJson) printJson(l, dir, nullptr, 0); else printStep(l); return true; }
  const Verdict v = checkStep(l, step, dir);
  if (v.passed) setDone(l.id, step);
  if (asJson) { printJson(l, dir, &v, step); return v.passed; }
  if (!v.compiles) { say(tr("cli.learn.compile")); std::fputs(v.errors.c_str(), stdout); return false; }
  if (!v.passed) { say(tr("cli.learn.not_yet", {{"message", l.steps[step - 1].message}})); return false; }
  say(tr("cli.learn.passed", {{"step", std::to_string(step)}}));
  if (step < n) { printStep(l); return true; }
  say(tr("cli.learn.lesson_done", {{"title", l.title}}));
  for (std::size_t i = 0; i + 1 < all.size(); i++)
    if (all[i].id == l.id) { say(tr("cli.learn.next", {{"cmd", "zinc learn " + std::to_string(std::atoi(all[i + 1].id.c_str()))}, {"title", all[i + 1].title}})); break; }
  return true;
}

bool lineWaiting(int ms) {
#ifdef _WIN32
  std::this_thread::sleep_for(std::chrono::milliseconds(ms));
  return false;   // ponytail: no key reading on a Windows console; zinc learn --hint and --solve answer there
#else
  pollfd p{0, POLLIN, 0};
  return poll(&p, 1, ms) > 0;
#endif
}
bool typed(std::string& line) {
#ifdef _WIN32
  return false;
#else
  char b[256];
  const ssize_t n = read(0, b, sizeof b);
  if (n <= 0) return false;
  line.assign(b, static_cast<std::size_t>(n));
  while (!line.empty() && (line.back() == '\n' || line.back() == '\r' || line.back() == ' ')) line.pop_back();
  return true;
#endif
}

// Watches the edited file and checks the step at each save, until the lesson is done or q. Enter checks again, h prints the hint, s
// the solution. With no input (a test, a pipe) it only watches.
int watch(const std::vector<Lesson>& all, const Lesson& l, const fs::path& dir) {
  const std::string file = (dir / l.file).string();
  say(tr("cli.learn.keys"));
  long long size = -1, mtime = -1, s = 0, m = 0;
  zn::plat::fileStamp(file, size, mtime);
  bool input = true;
  while (current(l) <= static_cast<int>(l.steps.size())) {
    bool now = false;
    if (input && lineWaiting(250)) {
      std::string line;
      if (!typed(line)) input = false;   // the end of the input: keep watching the file
      else if (line == "q") return 0;
      else if (line == "h") say(tr("cli.learn.hint", {{"hint", l.steps[current(l) - 1].hint}}));
      else if (line == "s") { say(tr("cli.learn.solution", {{"step", std::to_string(current(l))}})); std::fputs(readText(stepFile(l, current(l), "solution")).c_str(), stdout); }
      else now = true;
    } else if (!input) std::this_thread::sleep_for(std::chrono::milliseconds(250));
    if (!now && (!zn::plat::fileStamp(file, s, m) || (s == size && m == mtime))) continue;
    zn::plat::fileStamp(file, size, mtime);
    checkAndSay(all, l, dir, false);
  }
  return 0;
}

int usage() {
  std::fprintf(stderr, "usage: zinc learn [lesson] [--dir path] [--check | --hint | --solve | --unpack] [--json] [--reset]\n");
  return 2;
}

}  // namespace

int learn(const std::vector<std::string>& args, const std::string& engineRoot) {
  std::string name, dirArg, action;
  bool asJson = false, reset = false;
  for (std::size_t i = 2; i < args.size(); i++) {
    const std::string& a = args[i];
    if (a == "--dir" && i + 1 < args.size()) dirArg = args[++i];
    else if (a == "--check" || a == "--hint" || a == "--solve" || a == "--unpack" || a == "--list") action = a;
    else if (a == "--json") asJson = true;
    else if (a == "--reset") reset = true;
    else if (!a.empty() && a[0] == '-') return usage();
    else name = a;
  }
  const std::vector<Lesson> all = lessons(engineRoot);
  if (all.empty()) { std::fprintf(stderr, "%s\n", tr("cli.learn.none", {{"dir", (fs::path(engineRoot) / "learn" / "lessons").string()}}).c_str()); return 1; }
  if ((name.empty() && dirArg.empty()) || action == "--list") {   // the path: every lesson and how far the person went
    if (asJson) {   // Zinc Atelier's menu of lessons
      std::string o = "[";
      for (const auto& l : all)
        o += std::string(o.size() > 1 ? ", " : "") + "{\"id\": " + json(l.id) + ", \"title\": " + json(l.title) + ", \"steps\": " +
             std::to_string(l.steps.size()) + ", \"done\": " + std::to_string(std::min(doneOf(l.id), static_cast<int>(l.steps.size()))) + "}";
      say(o + "]");
      return 0;
    }
    say(tr("cli.learn.list"));
    for (const auto& l : all) {
      const int done = std::min(doneOf(l.id), static_cast<int>(l.steps.size()));
      const std::string state = done == static_cast<int>(l.steps.size()) ? tr("cli.learn.state_done") : done > 0 ? std::to_string(done) + "/" + std::to_string(l.steps.size()) : "";
      std::string title = l.title;
      std::size_t chars = 0;
      for (unsigned char c : title) chars += (c & 0xC0) != 0x80;
      if (chars < 36) title.append(36 - chars, ' ');
      std::printf("  %2d  %s %s\n", std::atoi(l.id.c_str()), title.c_str(), state.c_str());
    }
    std::fflush(stdout);
    return 0;
  }
  const Lesson* l = name.empty() ? nullptr : find(all, name);
  if (!name.empty() && !l) { std::fprintf(stderr, "%s\n", tr("cli.learn.unknown", {{"name", name}}).c_str()); return 2; }
  const fs::path dir = !dirArg.empty() ? fs::path(dirArg) : l ? fs::current_path() / l->id : fs::current_path();
  if (!l) l = lessonIn(all, dir);
  if (!l) { std::fprintf(stderr, "%s\n", tr("cli.learn.not_lesson", {{"dir", dir.string()}}).c_str()); return 2; }
  if (reset) setDone(l->id, 0);
  if (!unpack(*l, dir)) return 1;
  const int step = std::min(current(*l), static_cast<int>(l->steps.size()));
  if (action == "--check") return checkAndSay(all, *l, dir, asJson) ? 0 : 1;
  if (asJson) { printJson(*l, dir, nullptr, 0); return 0; }
  if (action == "--hint") { say(tr("cli.learn.hint", {{"hint", l->steps[step - 1].hint}})); return 0; }
  if (action == "--solve") { say(tr("cli.learn.solution", {{"step", std::to_string(step)}})); std::fputs(readText(stepFile(*l, step, "solution")).c_str(), stdout); return 0; }
  say(tr("cli.learn.unpacked", {{"dir", dir.string()}, {"file", l->file}}));
  say(tr("cli.learn.read", {{"url", cli::docs((l->page + "/").c_str())}}));
  printStep(*l);
  if (action == "--unpack") return 0;
  return watch(all, *l, dir);
}

}  // namespace zn::cli
