// The pure rules of voice.host.cpp that tests/t0/discord_voice_policy.sh compiles on their own: when a key frame is due, and which users
// hold a DAVE key after a commit or a welcome.
#pragma once
#include <cstddef>
#include <cstdint>
#include <set>
#include <string>
#include <vector>

/** A key frame at least every `everyMs` (Session Description's keyframe_interval), else every second (what clients that work against
 *  the official one do: a viewer joins later and the SFU's PLI may not reach a UDP sender), every 2 s on a capped link. */
inline bool keyDue(double now, double lastKey, int everyMs, bool capped) {
  const int every = everyMs > 0 ? everyMs : capped ? 2000 : 1000;
  return now - lastKey >= every;
}

/** libdave's commit and welcome results are the change since the last epoch, not the roster: members added (their signature is not
 *  empty) and members removed (empty). `members` is the whole group; `signed_[i]` says whether ids[i] has a signature. */
inline void applyRosterChange(std::set<std::string>& members, const std::vector<std::string>& ids, const std::vector<bool>& signed_, bool replace) {
  if (replace) members.clear();
  for (size_t i = 0; i < ids.size(); i++) { if (signed_[i]) members.insert(ids[i]); else members.erase(ids[i]); }
}
