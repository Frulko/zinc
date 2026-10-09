#include "tc/tuf.h"

#include <fnmatch.h>

#include <algorithm>
#include <ctime>
#include <filesystem>
#include <fstream>
#include <set>
#include <sstream>

#include "tc/tc.h"
#include "yyjson.h"

namespace fs = std::filesystem;

namespace zn::tc::tuf {
namespace {

struct Doc {
  yyjson_doc* d = nullptr;
  explicit Doc(const std::string& t) : d(yyjson_read(t.data(), t.size(), 0)) {}
  ~Doc() { yyjson_doc_free(d); }
  yyjson_val* root() const { return d ? yyjson_doc_get_root(d) : nullptr; }
};

std::string str(yyjson_val* o, const char* k) { yyjson_val* v = yyjson_obj_get(o, k); return yyjson_is_str(v) ? yyjson_get_str(v) : ""; }
long long num(yyjson_val* o, const char* k) { yyjson_val* v = yyjson_obj_get(o, k); return yyjson_is_int(v) ? yyjson_get_sint(v) : -1; }

bool canon(yyjson_val* v, std::string& o) {
  switch (yyjson_get_type(v)) {
    case YYJSON_TYPE_NULL: o += "null"; return true;
    case YYJSON_TYPE_BOOL: o += yyjson_get_bool(v) ? "true" : "false"; return true;
    case YYJSON_TYPE_NUM:
      if (!yyjson_is_int(v)) return false;   // TUF metadata has integers only
      o += yyjson_is_sint(v) ? std::to_string(yyjson_get_sint(v)) : std::to_string(yyjson_get_uint(v));
      return true;
    case YYJSON_TYPE_STR: {
      o += '"';
      const char* s = yyjson_get_str(v);
      for (size_t i = 0, n = yyjson_get_len(v); i < n; ++i) { if (s[i] == '"' || s[i] == '\\') o += '\\'; o += s[i]; }
      o += '"';
      return true;
    }
    case YYJSON_TYPE_ARR: {
      o += '[';
      size_t i, n; yyjson_val* e; bool first = true;
      yyjson_arr_foreach(v, i, n, e) { if (!first) o += ','; first = false; if (!canon(e, o)) return false; }
      o += ']';
      return true;
    }
    case YYJSON_TYPE_OBJ: {
      std::vector<std::pair<std::string, yyjson_val*>> kv;
      size_t i, n; yyjson_val *k, *e;
      yyjson_obj_foreach(v, i, n, k, e) kv.emplace_back(std::string(yyjson_get_str(k), yyjson_get_len(k)), e);
      std::sort(kv.begin(), kv.end(), [](const auto& a, const auto& b) { return a.first < b.first; });
      o += '{';
      for (size_t j = 0; j < kv.size(); ++j) {
        if (j) o += ',';
        o += '"';
        for (char c : kv[j].first) { if (c == '"' || c == '\\') o += '\\'; o += c; }
        o += "\":";
        if (!canon(kv[j].second, o)) return false;
      }
      o += '}';
      return true;
    }
    default: return false;
  }
}

std::vector<std::string> strings(yyjson_val* a) {
  std::vector<std::string> r;
  size_t i, n; yyjson_val* e;
  yyjson_arr_foreach(a, i, n, e) if (yyjson_is_str(e)) r.push_back(yyjson_get_str(e));
  return r;
}

// keyid -> hex Ed25519 public key, from a "keys" object (only ed25519 keys are usable)
std::map<std::string, std::string> keysOf(yyjson_val* keys) {
  std::map<std::string, std::string> r;
  size_t i, n; yyjson_val *k, *v;
  yyjson_obj_foreach(keys, i, n, k, v)
    if (str(v, "keytype") == "ed25519" && str(v, "scheme") == "ed25519") r[yyjson_get_str(k)] = str(yyjson_obj_get(v, "keyval"), "public");
  return r;
}

}  // namespace

Fetch indexFetch(const std::string& base) {
  std::string b = base;
  while (!b.empty() && b.back() == '/') b.pop_back();
  return [b](const std::string& path, const std::string& sha, std::string& bytes) {
    std::string err;
    return downloadBytes(b.empty() ? std::string() : b + "/" + path, "index/" + path, bytes, [&](const std::string& got, std::string& why) {
      if (sha.empty() || sha256Hex(got) == sha) return true;
      why = "its SHA-256 is not the signed one";
      return false;
    }, err);
  };
}

std::string indexUrl() { const char* u = std::getenv("ZINC_INDEX_URL"); return u && *u ? u : "https://zinc-engine.github.io/zinc/index"; }

std::string logKey(const std::string& engineRoot) {
  if (const char* k = std::getenv("ZINC_TLOG_KEY")) return k;
  std::ifstream f(fs::path(engineRoot) / "index" / "log.pub");
  std::string k;
  f >> k;
  return k;
}

bool openIndex(const std::string& engineRoot, std::unique_ptr<Client>& out, std::string& err) {
  const fs::path cache = fs::path(home()) / "index";
  std::error_code ec;
  if (!fs::exists(cache / "root.json", ec)) {
    const char* r = std::getenv("ZINC_INDEX_ROOT");
    const fs::path root = r && *r ? fs::path(r) : fs::path(engineRoot) / "index" / "root.json";
    if (!fs::exists(root, ec)) { err = "no trusted root for the plugin index (" + root.string() + "; ZINC_INDEX_ROOT names another)"; return false; }
    fs::create_directories(cache, ec);
    fs::copy_file(root, cache / "root.json", ec);
  }
  out = std::make_unique<Client>(cache.string(), indexFetch(indexUrl()), static_cast<long long>(std::time(nullptr)));
  if (!out->refresh(err)) return false;
  Target t;
  std::string bytes, e2;
  Revocations rv;
  if (out->find("revocations.json", t, e2) && t.role == "targets" && out->download(t, bytes, e2) && parseRevocations(bytes, rv)) {   // only the top-level role revokes
    std::ofstream(cache / "revocations.json", std::ios::binary) << bytes;
    out->revokeKeys(rv.keys);
  }
  return true;
}

const Revoked* Revocations::match(const std::string& plugin, const std::string& version, const std::string& sha256, const std::string& commit) const {
  for (const Revoked& r : versions)
    if ((!r.sha256.empty() && r.sha256 == sha256) || (!r.commit.empty() && r.commit == commit) || (!r.plugin.empty() && r.plugin == plugin && !r.version.empty() && r.version == version)) return &r;
  return nullptr;
}

bool parseRevocations(const std::string& json, Revocations& out) {
  Doc d(json);
  if (!yyjson_is_obj(d.root())) return false;
  out = Revocations{};
  size_t i, n; yyjson_val* v;
  yyjson_arr_foreach(yyjson_obj_get(d.root(), "versions"), i, n, v)
    out.versions.push_back(Revoked{str(v, "plugin"), str(v, "version"), str(v, "sha256"), str(v, "commit"), str(v, "reason"), str(v, "replacement")});
  yyjson_arr_foreach(yyjson_obj_get(d.root(), "keys"), i, n, v) if (!str(v, "publicKey").empty()) out.keys[str(v, "publicKey")] = str(v, "reason");
  return true;
}

bool cachedRevocations(Revocations& out) {
  std::ifstream f(fs::path(home()) / "index" / "revocations.json", std::ios::binary);
  if (!f) return false;
  std::stringstream ss; ss << f.rdbuf();
  return parseRevocations(ss.str(), out);
}

bool canonical(const std::string& json, std::string& out) {
  Doc d(json);
  out.clear();
  return d.root() && canon(d.root(), out);
}

long long parseTime(const std::string& iso) {
  std::tm t{};
  if (iso.size() != 20 || iso[19] != 'Z' || std::sscanf(iso.c_str(), "%4d-%2d-%2dT%2d:%2d:%2dZ", &t.tm_year, &t.tm_mon, &t.tm_mday, &t.tm_hour, &t.tm_min, &t.tm_sec) != 6) return -1;
  t.tm_year -= 1900;
  t.tm_mon -= 1;
  return static_cast<long long>(timegm(&t));
}

bool Client::readCache(const std::string& name, std::string& text) const {
  std::ifstream f(fs::path(cache_) / name, std::ios::binary);
  if (!f) return false;
  std::stringstream ss; ss << f.rdbuf();
  text = ss.str();
  return true;
}
void Client::writeCache(const std::string& name, const std::string& text) const {
  std::error_code ec;
  fs::create_directories(cache_, ec);
  std::ofstream(fs::path(cache_) / name, std::ios::binary) << text;
}

// Checks one piece of metadata: its type, at least `r.threshold` valid signatures from distinct keys of `r.keyids`, and that it has not expired.
bool Client::load(const std::string& role, const std::string& text, const std::map<std::string, std::string>& keys, const Role& r, const char* type, std::string& err, std::string* signedOut) {
  Doc d(text);
  yyjson_val* sv = yyjson_obj_get(d.root(), "signed");
  if (!yyjson_is_obj(sv) || str(sv, "_type") != type) { err = role + ": not " + type + " metadata"; return false; }
  std::string body;
  if (!canon(sv, body)) { err = role + ": metadata that cannot be canonicalised"; return false; }
  std::set<std::string> good;
  size_t i, n; yyjson_val* s;
  yyjson_arr_foreach(yyjson_obj_get(d.root(), "signatures"), i, n, s) {
    const std::string id = str(s, "keyid");
    auto k = keys.find(id);
    if (k == keys.end() || std::find(r.keyids.begin(), r.keyids.end(), id) == r.keyids.end() || revoked_.count(k->second)) continue;   // a revoked key signs nothing
    if (verifyBytes(body, str(s, "sig"), k->second)) good.insert(id);
  }
  if (static_cast<int>(good.size()) < r.threshold) { err = role + ": " + std::to_string(good.size()) + " valid signature(s), the threshold is " + std::to_string(r.threshold); return false; }
  const long long exp = parseTime(str(sv, "expires"));
  if (exp < 0 || exp <= now_) { err = role + ": expired (" + str(sv, "expires") + ")"; return false; }
  if (signedOut) *signedOut = body;
  return true;
}

bool Client::refresh(std::string& err) {
  std::string text;
  if (!readCache("root.json", text)) { err = "no trusted root.json in " + cache_; return false; }
  auto useRoot = [&](const std::string& t) {
    Doc d(t);
    yyjson_val* sv = yyjson_obj_get(d.root(), "signed");
    rootKeys_ = keysOf(yyjson_obj_get(sv, "keys"));
    roles_.clear();
    size_t i, n; yyjson_val *k, *v;
    yyjson_obj_foreach(yyjson_obj_get(sv, "roles"), i, n, k, v) roles_[yyjson_get_str(k)] = Role{strings(yyjson_obj_get(v, "keyids")), static_cast<int>(num(v, "threshold"))};
    consistent_ = yyjson_get_bool(yyjson_obj_get(sv, "consistent_snapshot"));
    return num(sv, "version");
  };
  long long version = useRoot(text);
  for (;;) {   // 5.3: the root chain, N+1.root.json signed by the old root and by itself
    std::string next;
    if (!fetch_(std::to_string(version + 1) + ".root.json", "", next)) break;
    Doc d(next);
    yyjson_val* sv = yyjson_obj_get(d.root(), "signed");
    if (str(sv, "_type") != "root" || num(sv, "version") != version + 1) { err = "root: version " + std::to_string(version + 1) + " is not what its file name says"; return false; }
    std::string ignored;
    const std::map<std::string, std::string> oldKeys = rootKeys_;
    const Role oldRole = roles_["root"];
    Doc nd(next);
    std::map<std::string, std::string> newKeys = keysOf(yyjson_obj_get(yyjson_obj_get(nd.root(), "signed"), "keys"));
    yyjson_val* nr = yyjson_obj_get(yyjson_obj_get(yyjson_obj_get(nd.root(), "signed"), "roles"), "root");
    const Role newRole{strings(yyjson_obj_get(nr, "keyids")), static_cast<int>(num(nr, "threshold"))};
    const long long keepNow = now_;
    now_ = 0;   // an intermediate root may have expired; only the last one must be current (5.3.10)
    const bool ok = load("root", next, oldKeys, oldRole, "root", err) && load("root", next, newKeys, newRole, "root", err);
    now_ = keepNow;
    if (!ok) return false;
    writeCache("root.json", next);
    version = useRoot(next);
  }
  if (!readCache("root.json", text) || !load("root", text, rootKeys_, roles_["root"], "root", err)) return false;   // a frozen root is refused
  // 5.4 timestamp: never lower than the trusted one
  std::string ts;
  if (!fetch_("timestamp.json", "", ts)) { err = "timestamp.json cannot be fetched"; return false; }
  if (!load("timestamp", ts, rootKeys_, roles_["timestamp"], "timestamp", err)) return false;
  Doc tsd(ts);
  yyjson_val* tsv = yyjson_obj_get(tsd.root(), "signed");
  yyjson_val* snapMeta = yyjson_obj_get(yyjson_obj_get(tsv, "meta"), "snapshot.json");
  std::string old;
  if (readCache("timestamp.json", old)) {
    Doc od(old);
    yyjson_val* ov = yyjson_obj_get(od.root(), "signed");
    if (num(tsv, "version") < num(ov, "version")) { err = "timestamp: version " + std::to_string(num(tsv, "version")) + " is older than the trusted " + std::to_string(num(ov, "version")) + " (rollback)"; return false; }
    if (num(snapMeta, "version") < num(yyjson_obj_get(yyjson_obj_get(ov, "meta"), "snapshot.json"), "version")) { err = "timestamp: it names an older snapshot than the trusted one (rollback)"; return false; }
  }
  writeCache("timestamp.json", ts);
  // 5.5 snapshot: the version (and hash, when given) the timestamp names; no role older than in the trusted snapshot
  snapshotVersion_ = num(snapMeta, "version");
  std::string snap;
  if (!fetch_(consistent_ ? std::to_string(snapshotVersion_) + ".snapshot.json" : "snapshot.json", str(yyjson_obj_get(snapMeta, "hashes"), "sha256"), snap)) { err = "snapshot.json cannot be fetched"; return false; }
  if (const std::string h = str(yyjson_obj_get(snapMeta, "hashes"), "sha256"); !h.empty() && sha256Hex(snap) != h) { err = "snapshot: its hash differs from the timestamp's"; return false; }
  if (!load("snapshot", snap, rootKeys_, roles_["snapshot"], "snapshot", err)) return false;
  Doc sd(snap);
  yyjson_val* sv = yyjson_obj_get(sd.root(), "signed");
  if (num(sv, "version") != snapshotVersion_) { err = "snapshot: version " + std::to_string(num(sv, "version")) + ", the timestamp names " + std::to_string(snapshotVersion_); return false; }
  snapshotMeta_.clear();
  { size_t i, n; yyjson_val *k, *v; yyjson_obj_foreach(yyjson_obj_get(sv, "meta"), i, n, k, v) snapshotMeta_[yyjson_get_str(k)] = num(v, "version"); }
  if (readCache("snapshot.json", old)) {
    Doc od(old);
    size_t i, n; yyjson_val *k, *v;
    yyjson_obj_foreach(yyjson_obj_get(yyjson_obj_get(od.root(), "signed"), "meta"), i, n, k, v) {
      auto it = snapshotMeta_.find(yyjson_get_str(k));
      if (it == snapshotMeta_.end() || it->second < num(v, "version")) { err = std::string("snapshot: ") + yyjson_get_str(k) + " is missing or older than in the trusted snapshot (rollback)"; return false; }
    }
  }
  writeCache("snapshot.json", snap);
  // 5.6 targets
  std::map<std::string, std::string> keys = rootKeys_;
  return loadTargets("targets", keys, roles_["targets"], top_, err);
}

bool Client::loadTargets(const std::string& name, const std::map<std::string, std::string>& keys, const Role& r, Targets& out, std::string& err) {
  auto it = snapshotMeta_.find(name + ".json");
  if (it == snapshotMeta_.end()) { err = name + ": not in the snapshot"; return false; }
  std::string text;
  if (!fetch_(consistent_ ? std::to_string(it->second) + "." + name + ".json" : name + ".json", "", text)) { err = name + ".json cannot be fetched"; return false; }
  if (!load(name, text, keys, r, "targets", err)) return false;
  Doc d(text);
  yyjson_val* sv = yyjson_obj_get(d.root(), "signed");
  if (num(sv, "version") != it->second) { err = name + ": version " + std::to_string(num(sv, "version")) + ", the snapshot names " + std::to_string(it->second); return false; }
  out = Targets{};
  size_t i, n; yyjson_val *k, *v;
  yyjson_obj_foreach(yyjson_obj_get(sv, "targets"), i, n, k, v) {
    Target t;
    t.path = yyjson_get_str(k);
    t.length = num(v, "length");
    t.sha256 = str(yyjson_obj_get(v, "hashes"), "sha256");
    if (yyjson_val* c = yyjson_obj_get(v, "custom")) { char* j = yyjson_val_write(c, 0, nullptr); if (j) { t.custom = j; std::free(j); } }
    t.role = name;
    out.targets[t.path] = t;
  }
  yyjson_val* del = yyjson_obj_get(sv, "delegations");
  out.keys = keysOf(yyjson_obj_get(del, "keys"));
  yyjson_arr_foreach(yyjson_obj_get(del, "roles"), i, n, v) {
    Delegation dl{str(v, "name"), strings(yyjson_obj_get(v, "keyids")), strings(yyjson_obj_get(v, "paths")), static_cast<int>(num(v, "threshold")), yyjson_get_bool(yyjson_obj_get(v, "terminating"))};
    out.delegations.push_back(dl);
  }
  writeCache(name + ".json", text);
  return true;
}

// 5.6.7: preorder depth-first through the delegations; a role is consulted only for the paths it was delegated
bool Client::walk(const std::string& path, const std::string& role, const Targets& t, int depth, std::vector<Target>* all, Target* hit, bool& stop, std::string& err) {
  if (all) for (const auto& [p, x] : t.targets) all->push_back(x);
  else if (auto it = t.targets.find(path); it != t.targets.end()) { *hit = it->second; stop = true; return true; }
  if (depth >= 32) return true;   // the spec's bound on delegation depth
  for (const Delegation& d : t.delegations) {
    bool match = all != nullptr;
    for (const std::string& pat : d.paths) match = match || fnmatch(pat.c_str(), path.c_str(), FNM_PATHNAME) == 0;
    if (!match) continue;
    Targets child;
    if (!loadTargets(d.name, t.keys, Role{d.keyids, d.threshold}, child, err)) {
      if (all) { err.clear(); continue; }   // a listing skips a role that does not verify (a revoked key, a broken publisher): nothing of it is used
      return false;
    }
    if (all) {   // only what the role may sign: its targets under its paths
      std::vector<Target> mine;
      if (!walk(path, d.name, child, depth + 1, &mine, nullptr, stop, err)) return false;
      for (const Target& x : mine) {
        bool allowed = false;
        for (const std::string& pat : d.paths) allowed = allowed || fnmatch(pat.c_str(), x.path.c_str(), FNM_PATHNAME) == 0;
        if (allowed) all->push_back(x);
      }
      continue;
    }
    if (!walk(path, d.name, child, depth + 1, nullptr, hit, stop, err)) return false;
    if (stop || d.terminating) { stop = true; return true; }
  }
  (void)role;
  return true;
}

bool Client::find(const std::string& path, Target& out, std::string& err) {
  bool stop = false;
  out = Target{};
  if (!walk(path, "targets", top_, 0, nullptr, &out, stop, err)) return false;
  if (out.path.empty()) { err = "no role that may sign '" + path + "' has it"; return false; }
  return true;
}

bool Client::all(std::vector<Target>& out, std::string& err) {
  bool stop = false;
  out.clear();
  return walk("", "targets", top_, 0, &out, nullptr, stop, err);
}

bool Client::download(const Target& t, std::string& bytes, std::string& err) {
  std::string name = t.path;
  if (consistent_) { const size_t slash = name.rfind('/'); name.insert(slash == std::string::npos ? 0 : slash + 1, t.sha256 + "."); }
  if (!fetch_("targets/" + name, t.sha256, bytes)) { err = "target " + t.path + " cannot be fetched with the hash its metadata signs from any source"; return false; }
  if (static_cast<long long>(bytes.size()) != t.length || sha256Hex(bytes) != t.sha256) { err = "target " + t.path + ": its length or hash differs from the signed metadata"; return false; }
  return true;
}

}  // namespace zn::tc::tuf
