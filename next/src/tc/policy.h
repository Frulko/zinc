#pragma once
// The trust policy (ZN-346): which tiers are accepted, whether published binaries may be used, how many matching rebuilds a verified publisher's binary
// needs, whether the transparency log is required, which mirrors may serve downloads. Read from the system (/etc/zinc/policy.json, or $ZINC_SYSTEM_POLICY),
// the user (~/.zinc/policy.json, and the ZINC_PREBUILT / ZINC_REBUILDS_MIN variables) and the project (zinc.json "policy"), in that order; each layer can
// only tighten what the one before allows, so a project never loosens a company's or a CI's policy.
#include <map>
#include <string>
#include <vector>

namespace zn::tc {

struct Policy {
  std::vector<std::string> tiers{"official", "verified", "community"};
  bool prebuilt = true;
  long rebuilds = 2;
  std::string transparency = "auto";      // "auto": required when a log key is pinned; "required": binaries need the log, and a pinned key
  std::vector<std::string> mirrors;        // empty: any mirror of ZINC_MIRRORS; else only these
  std::map<std::string, std::string> from;  // key -> where its value comes from: "default", "system <file>", "user <file>", "environment", "project <file>"
  bool accepts(const std::string& tier) const;
};

// Loads the effective policy for `projectDir` ("" for none) and keeps it as the current one (what the downloads and installs consult).
const Policy& loadPolicy(const std::string& projectDir);
const Policy& currentPolicy();
// "tiers official, verified (system /etc/zinc/policy.json)" ..., one line per key.
std::string describePolicy(const Policy& p);

}  // namespace zn::tc
