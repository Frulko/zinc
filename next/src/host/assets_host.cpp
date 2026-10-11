// zinc:assets version 2 (ZN-436): see assets_host.h. The state is one manager per process, made on the first call and never destroyed: the
// libuv workers may still decode into it while the process exits.
#include "host/assets_host.h"

#include "zn/loop.h"
#include "zpk/zpk.h"
#include "zrt_assets_dir.h"

#include <fcntl.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <unistd.h>
#include <uv.h>
#include <zstd.h>

#include <algorithm>
#include <atomic>
#include <condition_variable>
#include <cstdio>
#include <cstdlib>
#include <deque>
#include <map>
#include <memory>
#include <mutex>
#include <set>

namespace zn::host::assets {
namespace {

constexpr std::size_t kInFlight = 4;   // jobs handed to the libuv pool at once: its default size

struct Pack {
  std::string path, group;   // group: the file's name without .zpk
  void* map = nullptr;
  std::size_t size = 0;
  zpk::Reader reader;
  ~Pack() { if (map) munmap(map, size); }
};

struct Job {
  int req = 0;
  const Pack* pack = nullptr;
  std::size_t index = 0;
  std::string name, out, err;
  std::uint64_t size = 0;
  std::uint8_t kind = 0;
  bool ok = false;
  std::atomic<bool> finished{false};
  bool afterRan = false, committed = false;   // on the pool, freed by whichever of the two happens last (both on the main thread)
  uv_work_t work{};
};

struct Request {
  std::string group, err;
  int priority = Group, state = Loading, refs = 1;
  std::uint64_t done = 0, total = 0, reserved = 0;   // reserved: bytes counted against the budget until they are resident
  std::size_t left = 0;                              // jobs not yet committed
};

struct Entry {
  std::string data, group;
  std::uint8_t kind = 0;
  int refs = 0;          // handles
  bool orphan = false;   // its group was unloaded while a handle held it: freed with the last handle
};

struct Manager {
  std::vector<std::unique_ptr<Pack>> mounts;   // in search order
  bool based = false;
  std::map<std::string, Entry> resident;
  std::map<std::string, int> groupState;
  std::map<int, Request> reqs;
  std::map<int, std::string> handles;
  int nextReq = 1, nextHandle = 1;
  std::deque<Job*> queued[2], running;   // waiting, per priority; handed out, in the order they become resident
  std::uint64_t bytes = 0, peak = 0, reserved = 0, budget = 0, turnBytes = 4u << 20;
  bool threads = true, deterministic = false;
  std::mutex m;
  std::condition_variable cv;
  std::vector<ZSTD_DCtx*> ctxs;   // decoder contexts not in use (under m): one per job in flight, kept for the next
};

Manager& mgr() {
  static Manager* g = [] {
    auto* x = new Manager;
    x->deterministic = std::getenv("ZINC_DETERMINISTIC") != nullptr;
    const char* t = std::getenv("ZINC_ASSET_THREADS");
    x->threads = t ? std::atoi(t) != 0 : uv_available_parallelism() > 1;   // one core: decoded on the main thread, a turn's budget at a time
    if (const char* b = std::getenv("ZINC_ASSET_RAM")) x->budget = std::strtoull(b, nullptr, 10);
    if (const char* b = std::getenv("ZINC_ASSET_TURN")) x->turnBytes = std::max<std::uint64_t>(1, std::strtoull(b, nullptr, 10));
    return x;
  }();
  return *g;
}

ZSTD_DCtx* takeCtx(Manager& g) {
  std::lock_guard<std::mutex> l(g.m);
  if (g.ctxs.empty()) return ZSTD_createDCtx();
  ZSTD_DCtx* z = g.ctxs.back();
  g.ctxs.pop_back();
  return z;
}
void giveCtx(Manager& g, ZSTD_DCtx* z) { std::lock_guard<std::mutex> l(g.m); g.ctxs.push_back(z); }

void decode(Manager& g, Job& j) {
  ZSTD_DCtx* z = takeCtx(g);
  j.ok = j.pack->reader.read(j.index, j.out, j.err, z);
  giveCtx(g, z);
}
void onWork(uv_work_t* w) {
  Manager& g = mgr();
  Job* j = static_cast<Job*>(w->data);
  decode(g, *j);
  { std::lock_guard<std::mutex> l(g.m); j->finished.store(true); }
  g.cv.notify_all();
}
void onAfter(uv_work_t* w, int) {
  Job* j = static_cast<Job*>(w->data);
  if (j->committed) delete j; else j->afterRan = true;
}

int addPack(Manager& g, const std::string& file, std::vector<std::unique_ptr<Pack>>& out, std::string& err) {
  for (const auto& p : g.mounts) if (p->path == file) { err = "assets: " + file + " is already mounted"; return 0; }
  auto p = std::make_unique<Pack>();
  p->path = file;
  const std::size_t slash = file.find_last_of('/');
  p->group = file.substr(slash == std::string::npos ? 0 : slash + 1);
  p->group.resize(p->group.size() - 4);
  const int fd = open(file.c_str(), O_RDONLY);
  struct stat st;
  if (fd < 0 || fstat(fd, &st) != 0) { if (fd >= 0) close(fd); err = "assets: cannot open " + file; return 0; }
  p->size = static_cast<std::size_t>(st.st_size);
  void* m = p->size ? mmap(nullptr, p->size, PROT_READ, MAP_PRIVATE, fd, 0) : MAP_FAILED;
  close(fd);
  if (m == MAP_FAILED) { err = "assets: cannot map " + file; return 0; }
  p->map = m;
  std::string why;
  if (!p->reader.open(m, p->size, why)) { err = "assets: " + file + ": " + why; return 0; }
  out.push_back(std::move(p));
  return 1;
}

// A .zpk, or the .zpk files of a directory in name order; the packs go in front of the others, or behind them (the base packs).
int addPath(Manager& g, const std::string& path, bool front, std::string& err) {
  std::vector<std::unique_ptr<Pack>> added;
  auto zpk = [](const std::string& f) { return f.size() > 4 && f.compare(f.size() - 4, 4, ".zpk") == 0; };
  if (zrt_is_dir(path)) {
    std::vector<std::string> files;
    if (DIR* d = opendir(path.c_str())) {
      while (dirent* e = readdir(d)) if (e->d_name[0] != '.' && zpk(e->d_name)) files.push_back(path + "/" + e->d_name);
      closedir(d);
    }
    std::sort(files.begin(), files.end());
    for (const std::string& f : files) if (!addPack(g, f, added, err)) return 0;
  } else if (!zpk(path)) { err = "assets: " + path + " is not a .zpk pack nor a directory"; return 0; }
  else if (!addPack(g, path, added, err)) return 0;
  const int n = static_cast<int>(added.size());
  g.mounts.insert(front ? g.mounts.begin() : g.mounts.end(), std::make_move_iterator(added.begin()), std::make_move_iterator(added.end()));
  return n;
}

// The base packs, behind any overlay: ZINC_PACKS (paths separated by ':', which zinc run sets, empty for none), else the packs zinc build wrote
// beside a built program for its target (ZINC_PACK_TARGET, else this machine's).
Manager& ready() {
  Manager& g = mgr();
  if (g.based) return g;
  g.based = true;
  std::string list;
  if (const char* p = std::getenv("ZINC_PACKS")) list = p;
  else {
    const char* t = std::getenv("ZINC_PACK_TARGET");
#ifdef __APPLE__
    list = zrt_program_packs_dir(t ? t : "macos");
#else
    list = zrt_program_packs_dir(t ? t : "linux");
#endif
  }
  for (std::size_t at = 0; at < list.size();) {
    std::size_t end = list.find(':', at);
    if (end == std::string::npos) end = list.size();
    std::string err;
    if (end > at && !addPath(g, list.substr(at, end - at), false, err)) std::fprintf(stderr, "zinc: %s\n", err.c_str());
    at = end + 1;
  }
  return g;
}

std::pair<const Pack*, long> find(const Manager& g, const std::string& name) {
  for (const auto& p : g.mounts) if (long i = p->reader.find(name); i >= 0) return {p.get(), i};
  return {nullptr, -1};
}

void freeEntry(Manager& g, std::map<std::string, Entry>::iterator it) {
  g.bytes -= it->second.data.size();
  g.resident.erase(it);
}

void dispatch(Manager& g) {
  while (g.running.size() < kInFlight) {
    std::deque<Job*>& q = !g.queued[Group].empty() ? g.queued[Group] : g.queued[Background];
    if (q.empty()) return;
    Job* j = q.front();
    q.pop_front();
    g.running.push_back(j);
    if (g.threads) { j->work.data = j; uv_queue_work(static_cast<uv_loop_t*>(zn::loop::uvLoop()), &j->work, onWork, onAfter); }
  }
}

// Ends a request that is still loading: its waiting jobs are dropped, what its running jobs decode is not kept, its reservation is returned.
void cancel(Manager& g, int id, Request& r, const std::string& why) {
  for (auto& q : g.queued)
    for (auto it = q.begin(); it != q.end();) {
      if ((*it)->req == id) { delete *it; it = q.erase(it); } else ++it;
    }
  g.reserved -= r.reserved;
  r.reserved = 0;
  r.state = Failed;
  r.err = why;
}

void commit(Manager& g, Job& j) {
  auto it = g.reqs.find(j.req);
  if (it == g.reqs.end() || it->second.state != Loading) return;   // cancelled: its reservation is already returned
  Request& r = it->second;
  if (!j.ok) {
    const std::string group = r.group;
    cancel(g, j.req, r, "assets: group '" + group + "': " + j.err);
    unload(group);   // what it already made resident goes too: a group is loaded whole or not at all
    r.state = Failed;
    return;
  }
  r.reserved -= j.size;
  g.reserved -= j.size;
  r.done += j.size;
  if (!g.resident.count(j.name)) {
    Entry& e = g.resident[j.name];
    e.data = std::move(j.out);
    e.group = r.group;
    e.kind = j.kind;
    g.bytes += e.data.size();
    g.peak = std::max(g.peak, g.bytes);
  }
  if (--r.left == 0) { r.state = Done; g.groupState[r.group] = 2; }
}

}  // namespace

bool read(const std::string& name, std::string& out, std::string& err) {
  Manager& g = ready();
  if (auto it = g.resident.find(name); it != g.resident.end() && it->second.kind == 0) { out = it->second.data; return true; }
  auto [p, i] = find(g, name);
  if (!p || p->reader.entry(static_cast<std::size_t>(i)).kind != 0) return false;
  if (!p->reader.read(static_cast<std::size_t>(i), out, err)) err = "assets: " + err;
  return true;
}
bool has(const std::string& name) {
  Manager& g = ready();
  auto [p, i] = find(g, name);
  return p && p->reader.entry(static_cast<std::size_t>(i)).kind == 0;
}
void names(std::vector<std::string>& out) {
  Manager& g = ready();
  for (const auto& p : g.mounts)
    for (std::size_t i = 0; i < p->reader.count(); ++i)
      if (const zpk::Entry e = p->reader.entry(i); e.kind == 0) out.emplace_back(e.name);
}

int mount(const std::string& path, std::string& err) { return addPath(ready(), path, true, err); }
bool unmount(const std::string& path) {
  Manager& g = ready();
  if (!g.running.empty() || !g.queued[0].empty() || !g.queued[1].empty()) return false;   // ponytail: refused while loading; cancelling that pack's jobs if a game needs it
  for (auto it = g.mounts.begin(); it != g.mounts.end(); ++it)
    if ((*it)->path == path) { g.mounts.erase(it); return true; }
  return false;
}
void groups(std::vector<std::string>& out) {
  std::set<std::string> s;
  for (const auto& p : ready().mounts) s.insert(p->group);
  out.assign(s.begin(), s.end());
}

int load(const std::string& group, int priority, std::string& err) {
  Manager& g = ready();
  priority = priority == Group ? Group : Background;
  std::set<std::string> names;   // the group's entries: those of every pack of that name, each read from the first pack that has it (overlays)
  bool known = false;
  for (const auto& p : g.mounts) {
    if (p->group != group) continue;
    known = true;
    for (std::size_t i = 0; i < p->reader.count(); ++i) names.insert(std::string(p->reader.entry(i).name));
  }
  if (!known) {
    std::vector<std::string> all;
    groups(all);
    std::string list;
    for (const std::string& n : all) list += (list.empty() ? "" : ", ") + n;
    err = "assets: no group '" + group + "' in the mounted packs (" + (list.empty() ? "none is mounted" : "groups: " + list) + ")";
    return 0;
  }
  for (auto& [id, r] : g.reqs) {
    if (r.group != group || r.state != Loading) continue;
    ++r.refs;
    if (priority < r.priority) {   // a prefetch the program now waits for: its waiting jobs move to the group queue, in their order
      r.priority = priority;
      std::deque<Job*>& from = g.queued[Background];
      std::deque<Job*> keep;
      for (Job* j : from) (j->req == id ? g.queued[Group] : keep).push_back(j);
      from.swap(keep);
    }
    return id;
  }
  Request r;
  r.group = group;
  r.priority = priority;
  std::vector<Job*> jobs;
  for (const std::string& n : names) {
    auto [p, i] = find(g, n);
    const zpk::Entry e = p->reader.entry(static_cast<std::size_t>(i));
    r.total += e.size;
    if (auto it = g.resident.find(n); it != g.resident.end()) {   // resident already (a handle kept it, or another group has it)
      it->second.orphan = false;
      it->second.group = group;
      r.done += e.size;
      continue;
    }
    auto* j = new Job;
    j->pack = p;
    j->index = static_cast<std::size_t>(i);
    j->name = n;
    j->size = e.size;
    j->kind = e.kind;
    jobs.push_back(j);
  }
  const std::uint64_t need = r.total - r.done;
  if (g.budget && g.bytes + g.reserved + need > g.budget) {
    for (Job* j : jobs) delete j;
    err = "assets: group '" + group + "' needs " + std::to_string(need) + " bytes: over the ram budget of " + std::to_string(g.budget) + " bytes (" +
          std::to_string(g.bytes + g.reserved) + " in use)";
    return 0;
  }
  const int id = g.nextReq++;
  r.reserved = need;
  r.left = jobs.size();
  g.reserved += need;
  for (Job* j : jobs) { j->req = id; g.queued[priority].push_back(j); }
  if (!r.left) r.state = Done;
  g.groupState[group] = r.left ? 1 : 2;
  g.reqs[id] = std::move(r);
  dispatch(g);
  return id;
}

void unload(const std::string& group) {
  Manager& g = ready();
  for (auto& [id, r] : g.reqs)
    if (r.group == group && r.state == Loading) cancel(g, id, r, "assets: group '" + group + "' was unloaded before it finished loading");
  g.groupState.erase(group);
  for (auto it = g.resident.begin(); it != g.resident.end();) {
    auto next = std::next(it);
    if (it->second.group == group) { if (it->second.refs == 0) freeEntry(g, it); else it->second.orphan = true; }
    it = next;
  }
}

int groupState(const std::string& group) {
  const Manager& g = ready();
  auto it = g.groupState.find(group);
  return it == g.groupState.end() ? 0 : it->second;
}

void turn() {
  Manager& g = ready();
  dispatch(g);
  std::uint64_t spent = 0;
  while (!g.running.empty() && (spent == 0 || spent < g.turnBytes)) {
    Job* j = g.running.front();
    if (!g.threads) decode(g, *j);
    else if (!j->finished.load()) {
      if (!g.deterministic) break;   // a real run takes what is ready; a deterministic one waits for it, so the turn ends the same every run
      std::unique_lock<std::mutex> l(g.m);
      g.cv.wait(l, [&] { return j->finished.load(); });
    }
    g.running.pop_front();
    spent += j->size;
    commit(g, *j);
    if (g.threads && !j->afterRan) j->committed = true; else delete j;
    dispatch(g);
  }
}

double done(int req) { auto it = mgr().reqs.find(req); return it == mgr().reqs.end() ? 0 : static_cast<double>(it->second.done); }
double total(int req) { auto it = mgr().reqs.find(req); return it == mgr().reqs.end() ? 0 : static_cast<double>(it->second.total); }
int state(int req) { auto it = mgr().reqs.find(req); return it == mgr().reqs.end() ? Failed : it->second.state; }
std::string error(int req) { auto it = mgr().reqs.find(req); return it == mgr().reqs.end() ? std::string() : it->second.err; }
void forget(int req) { auto it = mgr().reqs.find(req); if (it != mgr().reqs.end() && it->second.state != Loading && --it->second.refs <= 0) mgr().reqs.erase(it); }

int acquire(const std::string& name, std::string& err) {
  Manager& g = ready();
  auto it = g.resident.find(name);
  if (it == g.resident.end() || it->second.orphan) {
    auto [p, i] = find(g, name);
    err = p ? "assets: '" + name + "' is not loaded: load its group '" + p->group + "' first" : "assets: no asset '" + name + "' in the mounted packs";
    return 0;
  }
  ++it->second.refs;
  g.handles[g.nextHandle] = name;
  return g.nextHandle++;
}
void release(int handle) {
  Manager& g = mgr();
  auto h = g.handles.find(handle);
  if (h == g.handles.end()) return;
  auto it = g.resident.find(h->second);
  g.handles.erase(h);
  if (it != g.resident.end() && --it->second.refs == 0 && it->second.orphan) freeEntry(g, it);
}
const std::string* data(int handle) {
  Manager& g = mgr();
  auto h = g.handles.find(handle);
  if (h == g.handles.end()) return nullptr;
  auto it = g.resident.find(h->second);
  return it == g.resident.end() ? nullptr : &it->second.data;
}

double stat(int k) {
  Manager& g = mgr();
  switch (k) {
    case 0: return static_cast<double>(g.bytes);
    case 1: return static_cast<double>(g.peak);
    case 2: return static_cast<double>(g.budget);
    case 3: { double n = 0; for (const auto& [name, s] : g.groupState) n += s == 2; return n; }
    case 4: return static_cast<double>(g.mounts.size());
    case 5: return static_cast<double>(g.running.size() + g.queued[0].size() + g.queued[1].size());
    default: return 0;
  }
}

}  // namespace zn::host::assets
