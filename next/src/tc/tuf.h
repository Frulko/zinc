#pragma once
// A minimal client of The Update Framework 1.0 for the plugin and template index (ZN-336, decision D41): the client workflow of the specification (section 5)
// over Ed25519 (monocypher), SHA-256 and OLPC canonical JSON. Metadata is the spec's own format (root, timestamp, snapshot, targets, delegated targets), so a
// repository written by python-tuf works. What it refuses: an expired role (freeze), a version lower than the trusted one (rollback), metadata or a target whose
// length or hash differs from what the role above says (mix-and-match, arbitrary package), fewer valid signatures than the threshold, and a target found through a
// role that is not delegated for its path.
#include <functional>
#include <map>
#include <memory>
#include <string>
#include <vector>

namespace zn::tc::tuf {

// Fetches a repository path ("timestamp.json", "2.root.json", "targets/<name>"): false when it does not exist or cannot be read. `sha256` is the hash the
// signed metadata expects ("" for metadata the client checks by signature), so a source that serves other bytes can be skipped for the next one (ZN-339).
using Fetch = std::function<bool(const std::string& path, const std::string& sha256, std::string& bytes)>;
// The fetch of an index at `base` (file:// or https://), through the mirrors of ZINC_MIRRORS (<mirror>/index/<path>) first.
Fetch indexFetch(const std::string& base);

struct Target {
  std::string path, sha256, custom;   // custom: the target's "custom" object as JSON text ("" when absent)
  long long length = 0;
  std::string role;                   // the role that signed it
};

class Client {
 public:
  // `cache` holds the trusted metadata; it must contain root.json (the root the client was shipped with or told to trust). `now`: Unix seconds.
  Client(std::string cache, Fetch fetch, long long now) : cache_(std::move(cache)), fetch_(std::move(fetch)), now_(now) {}
  // The update workflow: the root chain, then timestamp, snapshot and top-level targets, each checked and kept in the cache.
  bool refresh(std::string& err);
  // The target at `path`, searched through the delegations in order (terminating roles stop the search); false when no role that may sign it has it.
  bool find(const std::string& path, Target& out, std::string& err);
  // Every target of the top-level role and of the roles it delegates to (for search), each checked like find.
  bool all(std::vector<Target>& out, std::string& err);
  // The target's bytes, fetched from targets/<path> and checked against its length and SHA-256.
  bool download(const Target& t, std::string& bytes, std::string& err);

 private:
  struct Role { std::vector<std::string> keyids; int threshold = 1; };
  struct Delegation { std::string name; std::vector<std::string> keyids, paths; int threshold = 1; bool terminating = false; };
  struct Targets { std::map<std::string, Target> targets; std::map<std::string, std::string> keys; std::vector<Delegation> delegations; };
  bool load(const std::string& role, const std::string& text, const std::map<std::string, std::string>& keys, const Role& r, const char* type, std::string& err, std::string* signedOut = nullptr);
  bool loadTargets(const std::string& name, const std::map<std::string, std::string>& keys, const Role& r, Targets& out, std::string& err);
  bool walk(const std::string& path, const std::string& role, const Targets& t, int depth, std::vector<Target>* all, Target* hit, bool& stop, std::string& err);
  bool readCache(const std::string& name, std::string& text) const;
  void writeCache(const std::string& name, const std::string& text) const;

  std::string cache_;
  Fetch fetch_;
  long long now_;
  std::map<std::string, std::string> rootKeys_;   // keyid -> hex public key
  std::map<std::string, Role> roles_;              // root, timestamp, snapshot, targets
  std::map<std::string, long long> snapshotMeta_;  // "<role>.json" -> version
  bool consistent_ = false;
  long long snapshotVersion_ = 0;
  Targets top_;
};

// The plugin index of this machine (ZN-336, ZN-340): ZINC_INDEX_URL (default the zinc-engine Pages site) checked into ~/.zinc/index from its trusted root
// ($ZINC_INDEX_ROOT, else <engine>/index/root.json, copied there once) and refreshed. False with `err` when there is no trusted root or the index does not verify.
bool openIndex(const std::string& engineRoot, std::unique_ptr<Client>& out, std::string& err);
// ZINC_INDEX_URL, else the zinc-engine Pages site.
std::string indexUrl();
// The transparency log's key (ZN-343): ZINC_TLOG_KEY, else <engine>/index/log.pub; "" when none is pinned (then nothing is required of the log).
std::string logKey(const std::string& engineRoot);
// "official" for what the top-level targets role signs, "verified" for a role delegated to a publisher (its name is the publisher).
inline std::string tierOf(const Target& t) { return t.role == "targets" ? "official" : "verified"; }

// OLPC canonical JSON of a JSON text (sorted keys, no whitespace, only \" and \\ escaped, integers only): what TUF signs. False for floats or bad JSON.
bool canonical(const std::string& json, std::string& out);
// "2030-01-01T00:00:00Z" -> Unix seconds; -1 when malformed.
long long parseTime(const std::string& iso);

}  // namespace zn::tc::tuf
