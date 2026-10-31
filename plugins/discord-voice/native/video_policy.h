// The pure rules of voice.host.cpp that tests/t0/discord_voice_policy.sh compiles on their own: when a key frame is due, and which users
// hold a DAVE key after a commit or a welcome.
#pragma once
#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <set>
#include <string>
#include <vector>

constexpr size_t VIDEO_MTU = 1100;   // payload bytes per video RTP packet

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

/** The NAL units of an Annex B access unit as (offset, length): between start codes (00 00 01; the one leading zero of a 4-byte one is
 *  not part of the unit before it, as WebRTC's FindNaluIndices splits: a DAVE-encrypted unit may end in zero bytes of its own, and they
 *  must reach the receiver). */
inline std::vector<std::pair<size_t, size_t>> nalUnits(const std::vector<uint8_t>& au) {
  std::vector<std::pair<size_t, size_t>> nals;
  size_t start = std::string::npos;
  for (size_t i = 0; i < au.size(); i++) {
    if (!(i + 3 <= au.size() && au[i] == 0 && au[i + 1] == 0 && au[i + 2] == 1)) continue;
    if (start != std::string::npos) { size_t end = i; if (end > start && au[end - 1] == 0) end--; if (end > start) nals.push_back({start, end - start}); }
    start = i + 3;
    i += 2;
  }
  if (start != std::string::npos && start < au.size()) nals.push_back({start, au.size() - start});
  return nals;
}

/** The RTP payloads of an Annex B access unit (RFC 6184): one single NAL unit packet per unit that fits `mtu`, else FU-A fragments (the
 *  indicator, then the header with S on the first fragment and E on the last); the marker is set on the last packet of the frame. */
inline std::vector<std::pair<std::vector<uint8_t>, bool>> rtpPayloads(const std::vector<uint8_t>& au, size_t mtu) {
  std::vector<std::pair<std::vector<uint8_t>, bool>> out;
  const auto nals = nalUnits(au);
  for (size_t k = 0; k < nals.size(); k++) {
    const uint8_t* d = au.data() + nals[k].first;
    const size_t len = nals[k].second;
    const bool last = k + 1 == nals.size();
    if (len <= mtu) { out.push_back({std::vector<uint8_t>(d, d + len), last}); continue; }
    for (size_t o = 1; o < len;) {
      const size_t take = std::min(mtu - 2, len - o);
      std::vector<uint8_t> p = {(uint8_t)((d[0] & 0xE0) | 28), (uint8_t)((d[0] & 0x1F) | (o == 1 ? 0x80 : 0) | (o + take == len ? 0x40 : 0))};
      p.insert(p.end(), d + o, d + o + take);
      out.push_back({std::move(p), last && o + take == len});
      o += take;
    }
  }
  return out;
}

/** An integer from an environment variable (an experiment switch), `def` when unset or not a number. */
inline int envInt(const char* name, int def) { const char* v = getenv(name); return v && *v ? atoi(v) : def; }

/** The extension elements of our video packets (one-byte form of RFC 8285, padded to whole words, travelling in the encrypted body), with
 *  the ids of the NATIVE table of docs.discord.food (not the ones of Discord's WebRTC SDP, where 5 is playout-delay): 5 the transport-wide
 *  sequence number (2 bytes, counting every video packet), 6 playout-delay (3 bytes, no delay), 7 the content type (1: screen), 11 the
 *  stream id "100" that ties the packet to op 12's stream (12, the repaired stream id, on RTX packets). Yapfast, a native Go Live sender,
 *  says a server given playout-delay as id 5 drops every packet. DISCORD_VIDEO_EXT, a comma list, changes it: `legacy` the old layout (only
 *  playout-delay, id 5, delays 0 to 10 as the SDP-numbered senders send it), `none` no element, `twcc|pd|ct|rid|abs=<id>` an element
 *  with another id (abs: abs-send-time, 3 bytes, off by default), `-twcc|-pd|-ct|-rid|-abs` without that element. `twccAt` and `absAt`
 *  are the offsets of the values to fill per packet. */
struct VideoExt {
  std::vector<uint8_t> bytes;
  int twccAt = -1, absAt = -1;
  /** The per-packet values: the transport-wide sequence number and the send time (24 bits, 6.18 fixed point of seconds). */
  void fill(std::vector<uint8_t>& body, uint16_t twcc, uint32_t abs24) const {
    if (twccAt >= 0) { body[twccAt] = (uint8_t)(twcc >> 8); body[twccAt + 1] = (uint8_t)twcc; }
    if (absAt >= 0) { body[absAt] = (uint8_t)(abs24 >> 16); body[absAt + 1] = (uint8_t)(abs24 >> 8); body[absAt + 2] = (uint8_t)abs24; }
  }
};
/** `repaired`: the elements of an RTX packet (the rid element with the repaired id: the primary's plus one, 12 by default). */
inline VideoExt videoExtElements(const char* spec, bool repaired) {
  int twcc = 5, pd = 6, ct = 7, rid = 11, abs = 0;
  uint8_t pdMax = 0;
  for (const char* p = spec ? spec : ""; *p;) {
    const char* end = strchr(p, ',');
    const std::string t = end ? std::string(p, end) : std::string(p);
    p = end ? end + 1 : p + t.size();
    const size_t eq = t.find('=');
    const std::string name = t.substr(0, eq);
    const int id = eq == std::string::npos ? 0 : atoi(t.c_str() + eq + 1);
    if (name == "legacy") { twcc = ct = rid = 0; pd = 5; pdMax = 10; }
    else if (name == "none") twcc = pd = ct = rid = abs = 0;
    else if (name == "twcc") twcc = id;
    else if (name == "pd") pd = id;
    else if (name == "ct") ct = id;
    else if (name == "rid") rid = id;
    else if (name == "abs") abs = id;
    else if (name == "-twcc") twcc = 0;
    else if (name == "-pd") pd = 0;
    else if (name == "-ct") ct = 0;
    else if (name == "-rid") rid = 0;
    else if (name == "-abs") abs = 0;
  }
  VideoExt x;
  std::vector<uint8_t>& e = x.bytes;
  auto ok = [](int id) { return id > 0 && id < 15; };
  if (ok(twcc)) { e.push_back((uint8_t)(twcc << 4 | 1)); x.twccAt = (int)e.size(); e.insert(e.end(), {0, 0}); }
  if (ok(abs)) { e.push_back((uint8_t)(abs << 4 | 2)); x.absAt = (int)e.size(); e.insert(e.end(), {0, 0, 0}); }
  if (ok(pd)) e.insert(e.end(), {(uint8_t)(pd << 4 | 2), 0, 0, pdMax});
  if (ok(ct)) e.insert(e.end(), {(uint8_t)(ct << 4), 1});
  const int rr = repaired ? rid + 1 : rid;
  if (ok(rid) && ok(rr)) e.insert(e.end(), {(uint8_t)(rr << 4 | 2), '1', '0', '0'});
  while (e.size() % 4) e.push_back(0);
  return x;
}

/** The 12-byte RTP header of one of our video packets (sequence, timestamp and SSRC left zero), with the 4-byte extension header after it
 *  when `ext` holds elements (authenticated; the elements themselves are the first bytes of the encrypted body). */
inline std::vector<uint8_t> videoRtpHeader(const std::vector<uint8_t>& ext, int pt, bool marker) {
  std::vector<uint8_t> h = {(uint8_t)(ext.empty() ? 0x80 : 0x90), (uint8_t)(pt | (marker ? 0x80 : 0)), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0};
  if (!ext.empty()) h.insert(h.end(), {0xBE, 0xDE, (uint8_t)(ext.size() / 4 >> 8), (uint8_t)(ext.size() / 4)});
  return h;
}
