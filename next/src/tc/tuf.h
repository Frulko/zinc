#pragma once
// A minimal client of The Update Framework 1.0 for the plugin and template index (ZN-336, decision D41): the client workflow of the specification (section 5)
// over Ed25519 (monocypher), SHA-256 and OLPC canonical JSON. Metadata is the spec's own format (root, timestamp, snapshot, targets, delegated targets), so a
// repository written by python-tuf works. What it refuses: an expired role (freeze), a version lower than the trusted one (rollback), metadata or a target whose
// length or hash differs from what the role above says (mix-and-match, arbitrary package), fewer valid signatures than the threshold, and a target found through a
// role that is not delegated for its path.
#include <functional>
#include <map>
#include <string>
#include <vector>

namespace zn::tc::tuf {

// Fetches a repository path ("timestamp.json", "2.root.json", "targets/<name>"): false when it does not exist or cannot be read.
using Fetch = std::function<bool(const std::string& path, std::string& bytes)>;

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

// OLPC canonical JSON of a JSON text (sorted keys, no whitespace, only \" and \\ escaped, integers only): what TUF signs. False for floats or bad JSON.
bool canonical(const std::string& json, std::string& out);
// "2030-01-01T00:00:00Z" -> Unix seconds; -1 when malformed.
long long parseTime(const std::string& iso);

}  // namespace zn::tc::tuf
