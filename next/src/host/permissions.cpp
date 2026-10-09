#include "host/permissions.h"

#include <climits>
#include <cstdio>
#include <cstdlib>
#include <set>
#include <unistd.h>

namespace zn::host::perm {
namespace {
std::vector<std::string> gEntries;
bool gDeclared = false, gEnforce = false;
std::string gRoot;
std::set<std::string> gWarned;

std::string absolute(const std::string& p) {
  char b[PATH_MAX];
  if (realpath(p.c_str(), b)) return b;
  std::string a = p.rfind('/', 0) == 0 ? p : gRoot + "/" + p;   // a file that does not exist yet: its directory decides
  const std::size_t slash = a.rfind('/');
  if (slash != std::string::npos && slash > 0 && realpath(a.substr(0, slash).c_str(), b)) return std::string(b) + a.substr(slash);
  return a;
}
bool under(const std::string& path, const std::string& root) {
  return path == root || (path.size() > root.size() && path.compare(0, root.size(), root) == 0 && (root.back() == '/' || path[root.size()] == '/'));
}
bool hostMatches(const std::string& host, const std::string& pattern) {
  if (pattern == "*") return true;
  if (pattern.rfind("*.", 0) == 0) { const std::string d = pattern.substr(1); return host.size() > d.size() && host.compare(host.size() - d.size(), d.size(), d) == 0; }
  return host == pattern;
}
bool covers(const std::string& entry, const std::string& feature, const std::string& detail) {
  if (feature == "net") {
    if (entry == "net") return true;
    return entry.rfind("net:", 0) == 0 && hostMatches(detail, entry.substr(4));
  }
  if (feature == "fs:read" || feature == "fs:write") {
    if (entry == "fs" || entry == feature) return true;
    if (entry.rfind(feature + ":", 0) != 0) return false;
    std::string root = entry.substr(feature.size() + 1);
    return under(absolute(detail), absolute(root.empty() ? "." : root));
  }
  return entry == feature;
}
}  // namespace

void configure(const std::vector<std::string>& entries, bool declared, bool enforce, const std::string& projectDir) {
  gEntries = entries; gDeclared = declared; gEnforce = enforce; gWarned.clear();
  char b[PATH_MAX];
  gRoot = realpath(projectDir.empty() ? "." : projectDir.c_str(), b) ? b : projectDir;
}

bool enforced() { return gDeclared && gEnforce; }

std::string check(const std::string& feature, const std::string& detail) {
  if (!gDeclared) return "";
  for (const std::string& e : gEntries) if (covers(e, feature, detail)) return "";
  const std::string need = feature == "net" ? "net:" + detail : feature;
  const std::string subject = feature == "net" && detail == "*" ? "listening" : detail;   // serve asks for "net:*"
  const std::string what = "needs the permission \"" + need + "\" (or \"" + feature.substr(0, feature.find(':')) + "\") in zinc.json \"permissions\"";
  if (gEnforce) return "EACCES: " + subject + " " + what;
  if (gWarned.insert(need).second) std::fprintf(stderr, "zinc: warning: %s %s; allowed while developing, an exported app refuses it\n", subject.c_str(), what.c_str());
  return "";
}

}  // namespace zn::host::perm
