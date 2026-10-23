// zinc tour (ZN-774.05): a guided first walk in the terminal, in a real project (docs/reports/onboarding-cli-audit.md, "zinc tour").
// Eight steps; each says what to do, waits for it, and checks by itself that it is done: the project's files, the exit status and the
// error code of zinc check, the line zinc dev prints when it swaps a save in. For the rest it sends people to the lessons (docs/learn) and
// to "choose" (docs/start/choose.md) instead of repeating them. Progress: $ZINC_HOME/tour.json {"project", "done", "version"}, written
// after each step. At a terminal it asks and waits; without one, or under CI, it never waits: it prints the steps. --auto
// (tests/t1/tour.sh) makes the edits itself, asks nothing, opens no window and no app, and exits 1 at the first check that fails.
#include "cli_core.h"
#include "i18n/i18n.h"
#include "platform/platform.h"
#include "tc/tc.h"
#include "yyjson.h"

#include <chrono>
#include <csignal>
#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <functional>
#include <set>
#include <sstream>
#include <thread>
#ifdef _WIN32
#include <io.h>
#else
#include <poll.h>
#include <unistd.h>
#endif

namespace zn::cli {
namespace {
namespace fs = std::filesystem;
using zn::i18n::tr;

constexpr int kSteps = 8;
const char* const kTitles[kSteps] = {"cli.tour.s1", "cli.tour.s2", "cli.tour.s3", "cli.tour.s4", "cli.tour.s5", "cli.tour.s6", "cli.tour.s7", "cli.tour.s8"};
// what the game template says and imports: the steps look for them (tests/t1/first_run.sh changes the same text)
constexpr const char* kText = "arrows to move";
constexpr const char* kImport = "isDown, Btn";
constexpr const char* kMistake = "isDwon, Btn";

enum class Result { Done, Skipped, Stopped, Failed };

struct Tour {
  std::string exe;
  std::string project;   // absolute; empty until step 1 made it
  std::set<int> done;
  bool autoMode = false;
  std::string why;       // why the last check did not hold
};

std::string progressFile() { return zn::tc::home() + "/tour.json"; }

void load(Tour& t) {
  yyjson_doc* doc = yyjson_read_file(progressFile().c_str(), 0, nullptr, nullptr);
  yyjson_val* root = doc ? yyjson_doc_get_root(doc) : nullptr;
  if (const char* p = yyjson_get_str(yyjson_obj_get(root, "project"))) t.project = p;
  std::size_t i, n;
  yyjson_val* v;
  yyjson_val* done = yyjson_obj_get(root, "done");
  if (yyjson_is_arr(done)) yyjson_arr_foreach(done, i, n, v) if (yyjson_is_int(v)) t.done.insert(static_cast<int>(yyjson_get_int(v)));
  yyjson_doc_free(doc);
  std::error_code ec;   // a project that moved or was deleted: its steps no longer hold
  if (t.project.empty() || !fs::exists(fs::path(t.project) / "zinc.json", ec)) { t.project.clear(); t.done.clear(); }
}

void save(const Tour& t) {
  yyjson_mut_doc* doc = yyjson_mut_doc_new(nullptr);
  yyjson_mut_val* root = yyjson_mut_obj(doc);
  yyjson_mut_doc_set_root(doc, root);
  yyjson_mut_obj_add_strcpy(doc, root, "project", t.project.c_str());
  yyjson_mut_val* done = yyjson_mut_arr(doc);
  for (int s : t.done) yyjson_mut_arr_add_int(doc, done, s);
  yyjson_mut_obj_add_val(doc, root, "done", done);
  yyjson_mut_obj_add_strcpy(doc, root, "version", zn::tc::version());
  std::error_code ec;
  fs::create_directories(zn::tc::home(), ec);
  yyjson_mut_write_file(progressFile().c_str(), doc, YYJSON_WRITE_PRETTY_TWO_SPACES | YYJSON_WRITE_NEWLINE_AT_END, nullptr, nullptr);
  yyjson_mut_doc_free(doc);
}

void say(const std::string& s) { std::printf("%s\n", s.c_str()); std::fflush(stdout); }
std::string bold(const std::string& s) { return zn::plat::isTerminal(1) && !std::getenv("NO_COLOR") ? "\033[1m" + s + "\033[0m" : s; }
std::string q(const std::string& s) {   // shell quoting
  std::string o = "'";
  for (char c : s) { if (c == '\'') o += "'\\''"; else o += c; }
  return o + "'";
}
std::string readText(const fs::path& p) { std::ifstream f(p); std::stringstream ss; ss << f.rdbuf(); return ss.str(); }
// the first occurrence of `from` in the file becomes `to`
void replaceIn(const fs::path& p, const std::string& from, const std::string& to) {
  std::string s = readText(p);
  const std::size_t at = s.find(from);
  if (at == std::string::npos) return;
  s.replace(at, from.size(), to);
  std::ofstream(p) << s;
}
std::string lineWith(const std::string& text, const std::string& needle) {
  std::istringstream is(text);
  for (std::string line; std::getline(is, line);) if (line.find(needle) != std::string::npos) return line.substr(line.find_first_not_of(" \t"));
  return "";
}
// zinc <args> in `dir`: its exit status, and what it printed (stdout and stderr) in `out`
int zinc(const Tour& t, const std::string& args, const std::string& dir, std::string& out) {
  const std::string file = zn::tc::home() + "/tour.out";
  std::error_code ec;
  fs::create_directories(zn::tc::home(), ec);
  const int rc = zn::plat::exitStatus(std::system(("cd " + q(dir) + " && " + q(t.exe) + " " + args + " > " + q(file) + " 2>&1").c_str()));
  out = readText(file);
  fs::remove(file, ec);
  return rc;
}
// what zinc check said, in short: its first line and its closing line (what to do), the project's path left out
std::string brief(const Tour& t, const std::string& out) {
  std::vector<std::string> lines;
  std::istringstream is(out);
  for (std::string line; std::getline(is, line);) {
    if (line.rfind(t.project + "/", 0) == 0) line.erase(0, t.project.size() + 1);
    if (!line.empty()) lines.push_back("  " + line);
  }
  return lines.empty() ? "" : lines.size() == 1 ? lines[0] : lines.front() + "\n" + lines.back();
}
// zinc <args> in `dir` on the person's terminal (a window, a question): its exit status
int zincHere(const Tour& t, const std::string& args, const std::string& dir) {
  std::fflush(stdout);
  return zn::plat::exitStatus(std::system(("cd " + q(dir) + " && " + q(t.exe) + " " + args).c_str()));
}

// one line typed on the terminal, without its end; false at the end of the input
bool typed(std::string& line) {
  char b[256];
#ifdef _WIN32
  const int n = _read(0, b, sizeof b);
#else
  const ssize_t n = read(0, b, sizeof b);
#endif
  if (n <= 0) return false;
  line.assign(b, static_cast<std::size_t>(n));
  while (!line.empty() && (line.back() == '\n' || line.back() == '\r' || line.back() == ' ')) line.pop_back();
  return true;
}
bool lineWaiting(int ms) {
#ifdef _WIN32
  (void)ms;
  return true;   // ponytail: no poll on a Windows console, so each check there waits for Enter; a console reader if people miss it
#else
  pollfd p{0, POLLIN, 0};
  return poll(&p, 1, ms) > 0;
#endif
}
// Enter goes on ('g'), s skips, q (or the end of the input) stops; --auto never asks
char ask(const Tour& t, const std::string& prompt) {
  if (t.autoMode) return 'g';
  std::printf("%s ", prompt.c_str());
  std::fflush(stdout);
  std::string line;
  if (!typed(line) || line == "q") return 'q';
  return line == "s" ? 's' : 'g';
}

// Waits until `check` holds. At a terminal it checks again after each change of `watch` and at Enter (then it says what is missing);
// s skips, q stops. --auto makes the change itself (`edit`), then checks for up to 15 s (zinc dev answers a save in about 0.1 s).
Result until(Tour& t, const fs::path& watch, const std::function<void()>& edit, const std::function<bool()>& check) {
  if (t.autoMode) {
    edit();
    for (int i = 0; i < 75; ++i) {
      if (check()) return Result::Done;
      std::this_thread::sleep_for(std::chrono::milliseconds(200));
    }
    return Result::Failed;
  }
  long long size = -1, mtime = -1, s = 0, m = 0;
  // A save during check() must differ from the stamp we watched before it.
  zn::plat::fileStamp(watch.string(), size, mtime);
  if (check()) return Result::Done;
  say(tr("cli.tour.waiting"));
  for (;;) {
    bool enter = false;
    if (lineWaiting(300)) {
      std::string line;
      if (!typed(line) || line == "q") return Result::Stopped;
      if (line == "s") return Result::Skipped;
      enter = true;
    }
    if (!enter && (!zn::plat::fileStamp(watch.string(), s, m) || (s == size && m == mtime))) continue;
    zn::plat::fileStamp(watch.string(), size, mtime);
    if (check()) return Result::Done;
    say(t.why);
  }
}

// The project made last in `dir` by the zinc new question: the folder whose zinc.json is newer than `since`
fs::path madeSince(const fs::path& dir, fs::file_time_type since) {
  std::error_code ec;
  for (const auto& e : fs::directory_iterator(dir, ec)) {
    const fs::path z = e.path() / "zinc.json";
    if (fs::exists(z, ec) && fs::last_write_time(z, ec) >= since) return e.path();
  }
  return {};
}

// 1. make a project: the zinc new question with the game template chosen (it asks the name of the folder); --auto and --dir: that folder
Result makeProject(Tour& t, const std::string& dirArg) {
  if (!t.project.empty()) { say(tr("cli.tour.new.have", {{"dir", t.project}})); return Result::Done; }
  say(tr("cli.tour.new.do"));
  std::error_code ec;
  fs::path dir;
  if (t.autoMode || !dirArg.empty()) {
    dir = fs::absolute(dirArg.empty() ? "zinc-tour" : dirArg, ec);
    std::string out;
    if (!fs::exists(dir / "zinc.json", ec) && zinc(t, "new game " + q(dir.string()), ".", out) != 0) { t.why = out; return Result::Failed; }
  } else {
    const auto since = fs::file_time_type::clock::now() - std::chrono::seconds(1);
    if (zincHere(t, "new --template game", ".") != 0) return Result::Stopped;
    dir = madeSince(fs::current_path(ec), since);
  }
  if (dir.empty() || !fs::exists(dir / "zinc.json", ec) || !fs::exists(dir / "src" / "main.ts", ec)) { t.why = tr("cli.tour.new.missing"); return Result::Failed; }
  t.project = fs::canonical(dir, ec).string();
  say(tr("cli.tour.new.done", {{"dir", t.project}}));
  return Result::Done;
}

// 2. run it: with its window at a terminal (closing it comes back), a few frames without one under --auto; the check is its exit status
Result runIt(Tour& t) {
  say(tr(t.autoMode ? "cli.tour.run.auto" : "cli.tour.run.do"));
  if (const char c = ask(t, tr("cli.tour.enter")); c != 'g') return c == 's' ? Result::Skipped : Result::Stopped;
  if (t.autoMode) setenv("ZINC_FRAMES", "3", 1);
  const int rc = zincHere(t, "run", t.project);
  if (t.autoMode) unsetenv("ZINC_FRAMES");
  if (rc != 0) { t.why = tr("cli.tour.run.failed", {{"code", std::to_string(rc)}}); return Result::Failed; }
  say(tr("cli.tour.run.done"));
  return Result::Done;
}

// 3. change a line: the text of the game is no longer the template's, and zinc check finds no error
Result changeLine(Tour& t) {
  const fs::path main = fs::path(t.project) / "src" / "main.ts";
  say(tr("cli.tour.edit.do"));
  const Result r = until(t, main, [&] { replaceIn(main, kText, "hello from the tour"); }, [&] {
    std::string out;
    if (readText(main).find(kText) != std::string::npos) { t.why = tr("cli.tour.edit.same"); return false; }
    if (zinc(t, "check", t.project, out) != 0) { t.why = brief(t, out); return false; }
    return true;
  });
  if (r == Result::Done) say(tr("cli.tour.edit.done", {{"line", lineWith(readText(main), "text(")}}));
  return r;
}

// 4. a mistake on purpose: zinc check reports it with a code, zinc explain says what the code means, the fix checks clean again
Result mistake(Tour& t) {
  const fs::path main = fs::path(t.project) / "src" / "main.ts";
  std::string out, code;
  say(tr("cli.tour.mistake.do"));
  Result r = until(t, main, [&] { replaceIn(main, kImport, kMistake); }, [&] {
    zinc(t, "check", t.project, out);
    const std::size_t at = out.find(" error Z");
    code = at == std::string::npos ? "" : out.substr(at + 7, 5);
    if (code.empty()) t.why = tr("cli.tour.mistake.none");
    return !code.empty();
  });
  if (r != Result::Done) return r;
  say(tr("cli.tour.mistake.seen"));
  say(brief(t, out));
  say(tr("cli.tour.mistake.explain", {{"command", "zinc explain " + code}}));
  if (const char c = ask(t, tr("cli.tour.enter")); c == 'q') return Result::Stopped;
  std::string text;
  if (zinc(t, "explain " + code, t.project, text) != 0 || text.rfind(code, 0) != 0) { t.why = text; return Result::Failed; }
  say(text);
  say(tr("cli.tour.mistake.undo"));
  r = until(t, main, [&] { replaceIn(main, kMistake, kImport); }, [&] {
    if (zinc(t, "check", t.project, out) == 0) return true;
    t.why = brief(t, out);
    return false;
  });
  if (r == Result::Done) say(tr("cli.tour.mistake.done"));
  return r;
}

// 5. Fast Refresh: the tour starts zinc dev (its output in build/tour-dev.log), a save is swapped into the running program
Result fastRefresh(Tour& t) {
  const fs::path main = fs::path(t.project) / "src" / "main.ts";
  const fs::path log = fs::path(t.project) / "build" / "tour-dev.log";
  say(tr(t.autoMode ? "cli.tour.dev.auto" : "cli.tour.dev.do"));
  if (const char c = ask(t, tr("cli.tour.enter")); c != 'g') return c == 's' ? Result::Skipped : Result::Stopped;
  std::error_code ec;
  fs::create_directories(log.parent_path(), ec);
  fs::remove(log, ec);
  if (t.autoMode) setenv("ZINC_FRAMES", "1000000000", 1);   // headless frames do not wait for a display: keep it running
  zn::plat::SpawnOptions o;
  o.newGroup = true;
  o.cwd = t.project;
  struct Child {
    zn::plat::Pid pid;
    ~Child() {   // zinc dev ends its program when it gets SIGTERM: it has 2 s for that before its group is killed
      if (pid <= 0) return;
#ifndef _WIN32
      int code;
      ::kill(static_cast<pid_t>(pid), SIGTERM);
      for (int i = 0; i < 100; ++i) {
        if (zn::plat::wait(pid, code, false)) return;
        std::this_thread::sleep_for(std::chrono::milliseconds(20));
      }
#endif
      zn::plat::stop(pid);
    }
  } dev{zn::plat::spawn({zn::plat::shellPath(), "-c", "exec " + q(t.exe) + " dev --no-devtools > " + q(log.string()) + " 2>&1"}, o)};
  if (t.autoMode) unsetenv("ZINC_FRAMES");
  for (int i = 0; i < 400 && readText(log).find("zinc dev: v1 started") == std::string::npos; ++i) std::this_thread::sleep_for(std::chrono::milliseconds(50));
  if (dev.pid <= 0 || readText(log).find("zinc dev: v1 started") == std::string::npos) { t.why = tr("cli.tour.dev.start", {{"log", readText(log)}}); return Result::Failed; }
  // --auto saves once the program runs its frames (it compiles in about 50 ms), so the save is swapped in rather than started again
  if (t.autoMode) std::this_thread::sleep_for(std::chrono::milliseconds(1000));
  std::string seen;
  const Result r = until(t, log, [&] { std::ofstream(main, std::ios::app) << "// saved by zinc tour\n"; }, [&] {
    const std::string text = readText(log);
    seen = lineWith(text, " refreshed ");
    if (seen.empty()) seen = lineWith(text, "zinc dev: v2 started");   // a save it could not swap: the program started again with it
    if (seen.empty()) t.why = tr("cli.tour.dev.wait");
    return !seen.empty();
  });
  if (r != Result::Done) return r;
  if (seen.rfind("zinc dev: ", 0) == 0) seen.erase(0, 10);
  say(tr("cli.tour.dev.done", {{"line", seen}}));
  ask(t, tr("cli.tour.dev.stop"));   // the person looks at the window; the step is done either way
  return Result::Done;
}

// 6. a kind of program: the page that helps choose, then the zinc new question beside the tour's project (--auto: a command-line tool)
Result chooseKind(Tour& t) {
  const fs::path parent = fs::path(t.project).parent_path();
  say(tr("cli.tour.kind.do", {{"url", docs("start/choose/")}}));
  std::error_code ec;
  fs::path dir;
  if (t.autoMode) {
    dir = parent / (fs::path(t.project).filename().string() + "-cli");
    std::string out;
    if (!fs::exists(dir / "zinc.json", ec) && zinc(t, "new cli " + q(dir.string()), ".", out) != 0) { t.why = out; return Result::Failed; }
  } else {
    if (const char c = ask(t, tr("cli.tour.kind.ask")); c != 'g') return c == 's' ? Result::Skipped : Result::Stopped;
    const auto since = fs::file_time_type::clock::now() - std::chrono::seconds(1);
    if (zincHere(t, "new", parent.string()) != 0) return Result::Skipped;
    dir = madeSince(parent, since);
  }
  std::string out;
  if (dir.empty()) { t.why = tr("cli.tour.kind.none"); return Result::Failed; }
  if (zinc(t, "check", dir.string(), out) != 0) { t.why = out; return Result::Failed; }
  say(tr("cli.tour.kind.done", {{"dir", dir.string()}}));
  return Result::Done;
}

// 7. the docs: the lessons, the guide, the help in the terminal; at a terminal the lessons open in the browser
Result findDocs(Tour& t) {
  say(tr("cli.tour.docs.learn", {{"url", docs("learn/")}}));
  say(tr("cli.tour.docs.guide", {{"url", docs("guide/01-getting-started/")}}));
  say(tr("cli.tour.docs.help"));
  if (t.autoMode) return Result::Done;
  if (const char c = ask(t, tr("cli.tour.docs.ask")); c != 'g') return c == 's' ? Result::Skipped : Result::Stopped;
#if defined(__APPLE__)
  const char* opener = "open";
#elif defined(_WIN32)
  const char* opener = "explorer";
#else
  const char* opener = "xdg-open";
#endif
  if (zn::plat::run({opener, docs("learn/")}, {.quiet = true}) != 0) { t.why = tr("cli.tour.docs.failed"); return Result::Failed; }
  return Result::Done;
}

// 8. Zinc Atelier: opened on the tour's project when it is installed (never under --auto); otherwise the line that installs it
Result openAtelier(Tour& t) {
  std::error_code ec;
  std::string app;
#if defined(__APPLE__)
  for (const std::string& d : {std::string("/Applications"), zn::plat::homeDir() + "/Applications"})
    if (fs::exists(d + "/Zinc Atelier.app", ec)) { app = d + "/Zinc Atelier.app"; break; }
#else
  if (const fs::path l = fs::path(t.exe).parent_path() / "zinc-atelier"; fs::exists(l, ec)) app = l.string();   // the launcher of the Linux archive
#endif
  if (app.empty()) {
    say(tr("cli.tour.atelier.missing", {{"command", "curl -fsSL https://github.com/Frulko/zinc/releases/latest/download/install.sh | sh -s -- --atelier"}}));
    return Result::Done;
  }
  say(tr("cli.tour.atelier.do", {{"app", app}}));
  if (t.autoMode) { say(tr("cli.tour.atelier.auto")); return Result::Done; }
  if (const char c = ask(t, tr("cli.tour.atelier.ask")); c != 'g') return c == 's' ? Result::Skipped : Result::Stopped;
#if defined(__APPLE__)
  if (zn::plat::run({"open", "-a", app, "--args", t.project}) != 0) { t.why = tr("cli.tour.atelier.failed"); return Result::Failed; }
#else
  zn::plat::spawnDetached({app, t.project});
#endif
  return Result::Done;
}

Result step(Tour& t, int s, const std::string& dirArg) {
  switch (s) {
    case 1: return makeProject(t, dirArg);
    case 2: return runIt(t);
    case 3: return changeLine(t);
    case 4: return mistake(t);
    case 5: return fastRefresh(t);
    case 6: return chooseKind(t);
    case 7: return findDocs(t);
    default: return openAtelier(t);
  }
}

void list(const Tour& t) {
  say(tr("cli.tour.list.title", {{"done", std::to_string(t.done.size())}, {"total", std::to_string(kSteps)}}));
  for (int s = 1; s <= kSteps; ++s) std::printf("  [%s] %d. %s\n", t.done.count(s) ? "x" : " ", s, tr(kTitles[s - 1]).c_str());
  if (!t.project.empty()) say(tr("cli.tour.list.project", {{"dir", t.project}}));
  say(tr("cli.tour.list.how"));
}
}  // namespace

int tour(const std::vector<std::string>& args) {
  Tour t;
  t.exe = zn::tc::executablePath();
  if (t.exe.empty()) t.exe = "zinc";
  bool showList = false, reset = false;
  int from = 0, last = kSteps;
  std::string dirArg;
  for (std::size_t i = 2; i < args.size(); ++i) {
    const std::string& a = args[i];
    if (a == "--list") showList = true;
    else if (a == "--reset") reset = true;
    else if (a == "--auto") t.autoMode = true;
    else if (a == "--until" && i + 1 < args.size()) last = std::atoi(args[++i].c_str());
    else if (a == "--dir" && i + 1 < args.size()) dirArg = args[++i];
    else if (!a.empty() && a.find_first_not_of("0123456789") == std::string::npos) from = std::atoi(a.c_str());
    else { std::fprintf(stderr, "%s\n", tr("cli.option.unknown", {{"command", "tour"}, {"option", a}}).c_str()); return 2; }
  }
  if (from < 0 || from > kSteps || last < 1 || last > kSteps) { std::fprintf(stderr, "%s\n", tr("cli.tour.no_step", {{"total", std::to_string(kSteps)}}).c_str()); return 2; }
  load(t);
  if (reset) {
    std::error_code ec;
    fs::remove(progressFile(), ec);
    say(t.project.empty() ? tr("cli.tour.reset_none") : tr("cli.tour.reset", {{"dir", t.project}}));
    return 0;
  }
  if (showList) { list(t); return 0; }
  const char* ci = std::getenv("CI");
  if (!t.autoMode && (!zn::plat::isTerminal(0) || !zn::plat::isTerminal(1) || (ci && *ci))) {   // nobody to answer: the steps, and how to start
    say(tr("cli.tour.noterm"));
    list(t);
    return 0;
  }
  if (t.autoMode) setenv("ZINC_HEADLESS", "1", 1);   // --auto opens no window
  int s = from;
  if (!s) for (s = 1; s <= kSteps && t.done.count(s); ++s) {}
  if (s > kSteps) { say(tr("cli.tour.all_done")); return 0; }
  say(bold(tr("cli.tour.title")));
  std::vector<int> order;
  if (t.project.empty() && s > 1) { say(tr("cli.tour.first")); order.push_back(1); }   // the other steps work in the project step 1 makes
  for (int k = s; k <= last; ++k) order.push_back(k);
  for (std::size_t i = 0; i < order.size(); ++i) {
    const int n = order[i];
    say("\n" + bold(tr("cli.tour.step", {{"n", std::to_string(n)}, {"total", std::to_string(kSteps)}, {"title", tr(kTitles[n - 1])}})));
    t.why.clear();
    const Result r = step(t, n, dirArg);
    if (r == Result::Stopped) { say(tr("cli.tour.stopped", {{"n", std::to_string(n)}})); return 0; }
    if (r == Result::Failed) { say(tr("cli.tour.failed", {{"n", std::to_string(n)}, {"why", t.why}})); return 1; }
    if (r == Result::Done) { t.done.insert(n); save(t); say(tr("cli.tour.step_done", {{"n", std::to_string(n)}})); }
    if (i + 1 < order.size() && ask(t, tr("cli.tour.next", {{"n", std::to_string(order[i + 1])}})) == 'q') {
      say(tr("cli.tour.stopped", {{"n", std::to_string(order[i + 1])}}));
      return 0;
    }
  }
  if (last == kSteps) say("\n" + tr("cli.tour.end", {{"url", docs("learn/")}}));
  return 0;
}

}  // namespace zn::cli
