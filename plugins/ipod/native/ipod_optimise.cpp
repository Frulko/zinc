// zinc:ipod duplicate finder (ipod_core.h): the keep score, the normalised tags and the grouping of copies by tags, identical files
// and audio fingerprints. Plain functions over Copy records, so the native test checks them without a database.
#include "ipod_core.h"
#include "ipod_fingerprint.h"

#include <glib.h>

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <map>
#include <numeric>

namespace ipod {
namespace {

constexpr double kTagsDurationMs = 2000;    // tags match only for durations this close
constexpr double kBitrateTie = 0.05;        // bitrates within 5% tie (a VBR file's average moves a little)

int tagsFilled(const Track& t) {
  int n = 0;
  for (const std::string* s : {&t.title, &t.artist, &t.album, &t.albumArtist, &t.genre, &t.composer}) n += !s->empty();
  return n;
}
int numbersFilled(const Track& t) { return (t.trackNr > 0) + (t.tracks > 0) + (t.cdNr > 0) + (t.cds > 0); }
std::string khz(int32_t rate) { char b[16]; snprintf(b, sizeof b, "%g kHz", rate / 1000.0); return b; }

/** One step of the score: the copy with more of `va` than `vb` wins, and `why` says it. */
int by(double va, double vb, const std::string& win, std::string* why) {
  if (va == vb) return 0;
  if (why) *why = win;
  return va > vb ? -1 : 1;
}

/** Union-find over the copies, with the reasons of the links of each set. */
struct Sets {
  std::vector<size_t> up;
  std::vector<unsigned> why;   // bit 1 tags, 2 file, 4 audio, on the root
  explicit Sets(size_t n) : up(n), why(n, 0) { std::iota(up.begin(), up.end(), 0); }
  size_t root(size_t i) { while (up[i] != i) i = up[i] = up[up[i]]; return i; }
  void link(size_t a, size_t b, unsigned reason) {
    a = root(a), b = root(b);
    if (a != b) { up[b] = a; why[a] |= why[b]; }
    why[a] |= reason;
  }
};

}  // namespace

std::string normaliseTag(const std::string& s) {
  gchar* nfd = g_utf8_normalize(s.c_str(), -1, G_NORMALIZE_NFKD);
  if (!nfd) return "";
  std::string out;
  bool space = false;
  for (const gchar* p = nfd; *p; p = g_utf8_next_char(p)) {
    gunichar c = g_utf8_get_char(p);
    if (g_unichar_type(c) == G_UNICODE_NON_SPACING_MARK) continue;   // the accent of a decomposed letter
    if (!g_unichar_isalnum(c)) { space = !out.empty(); continue; }
    if (space) out += ' ';
    space = false;
    char b[6];
    out.append(b, (size_t)g_unichar_to_utf8(g_unichar_tolower(c), b));
  }
  g_free(nfd);
  return out;
}

int compareCopies(const Copy& a, const Copy& b, std::string* why) {
  const Track &x = a.t, &y = b.t;
  if (int r = by(a.lossless, b.lossless, "lossless", why)) return r;
  if (std::abs(x.bitrate - y.bitrate) > kBitrateTie * std::max(x.bitrate, y.bitrate)) {
    int hi = std::max(x.bitrate, y.bitrate), lo = std::min(x.bitrate, y.bitrate);
    return by(x.bitrate, y.bitrate, std::to_string(hi) + " kbps against " + std::to_string(lo), why);
  }
  if (int r = by(x.sampleRate, y.sampleRate, khz(std::max(x.sampleRate, y.sampleRate)) + " against " + khz(std::min(x.sampleRate, y.sampleRate)), why)) return r;
  if (int r = by(tagsFilled(x), tagsFilled(y), "more tags", why)) return r;
  if (int r = by(x.artwork, y.artwork, "a cover", why)) return r;
  if (int r = by(numbersFilled(x), numbersFilled(y), "track and disc numbers", why)) return r;
  if (int r = by(x.year > 0, y.year > 0, "a year", why)) return r;
  // added first: the older copy is the one the library has known longest (a never-dated one, 0, comes last)
  auto added = [](const Track& t) { return t.added > 0 ? t.added : HUGE_VAL; };
  if (int r = by(-added(x), -added(y), "added first", why)) return r;
  if (why) *why = "the same on every criterion";
  return 0;
}

std::string quality(const Copy& c) {
  std::string q = c.format.empty() ? "?" : c.format;
  if (c.lossless) q += " lossless";
  if (c.t.bitrate > 0) q += " · " + std::to_string(c.t.bitrate) + " kbps";
  if (c.t.sampleRate > 0) q += " · " + khz(c.t.sampleRate);
  q += " · " + std::to_string(tagsFilled(c.t)) + " tags";
  if (c.t.artwork) q += " · cover";
  return q;
}

std::vector<DuplicateGroup> groupDuplicates(const std::vector<Copy>& copies) {
  const size_t n = copies.size();
  Sets sets(n);
  // tags: the same normalised title and artist (the album artist when there is no artist), the same album or one without
  std::map<std::string, std::vector<size_t>> byTags;
  std::vector<std::string> album(n);
  for (size_t i = 0; i < n; i++) {
    const Track& t = copies[i].t;
    std::string title = normaliseTag(t.title), artist = normaliseTag(!t.artist.empty() ? t.artist : t.albumArtist);
    album[i] = normaliseTag(t.album);
    if (!title.empty() && !artist.empty()) byTags[t.mediaType + '\x1f' + title + '\x1f' + artist].push_back(i);
  }
  for (auto& [key, v] : byTags)
    for (size_t a = 0; a < v.size(); a++)
      for (size_t b = a + 1; b < v.size(); b++) {
        size_t i = v[a], j = v[b];
        bool sameAlbum = album[i] == album[j] || album[i].empty() || album[j].empty();
        if (sameAlbum && std::fabs(copies[i].t.durationMs - copies[j].t.durationMs) <= kTagsDurationMs) sets.link(i, j, 1);
      }
  // file: the same size and content hash (hashes are only taken for sizes that two files share)
  std::map<std::string, std::vector<size_t>> byHash;
  for (size_t i = 0; i < n; i++)
    if (!copies[i].hash.empty()) byHash[copies[i].t.mediaType + '\x1f' + std::to_string((long long)copies[i].t.size) + '\x1f' + copies[i].hash].push_back(i);
  for (auto& [key, v] : byHash) for (size_t k = 1; k < v.size(); k++) sets.link(v[0], v[k], 2);
  // audio: fingerprints of copies whose durations are close (sorted by duration, each against the ones just after it)
  std::vector<size_t> order;
  for (size_t i = 0; i < n; i++) if (!copies[i].fp.empty()) order.push_back(i);
  std::sort(order.begin(), order.end(), [&](size_t a, size_t b) { return copies[a].t.durationMs < copies[b].t.durationMs; });
  for (size_t a = 0; a < order.size(); a++)
    for (size_t b = a + 1; b < order.size() && copies[order[b]].t.durationMs - copies[order[a]].t.durationMs <= kAudioDurationMs; b++) {
      size_t i = order[a], j = order[b];
      if (copies[i].t.mediaType == copies[j].t.mediaType && similarity(copies[i].fp, copies[j].fp) >= kSameAudio) sets.link(i, j, 4);
    }

  std::map<size_t, std::vector<size_t>> members;
  for (size_t i = 0; i < n; i++) members[sets.root(i)].push_back(i);
  std::vector<DuplicateGroup> out;
  for (auto& [root, v] : members) {
    if (v.size() < 2) continue;
    std::stable_sort(v.begin(), v.end(), [&](size_t a, size_t b) {
      int c = compareCopies(copies[a], copies[b], nullptr);
      return c != 0 ? c < 0 : copies[a].t.id < copies[b].t.id;   // a tie keeps an order that does not change between runs
    });
    DuplicateGroup g;
    const unsigned why = sets.why[root];
    if (why & 1) g.reasons.push_back("tags");
    if (why & 2) g.reasons.push_back("file");
    if (why & 4) g.reasons.push_back("audio");
    compareCopies(copies[v[0]], copies[v[1]], &g.keepWhy);
    for (size_t k = 0; k < v.size(); k++) {
      g.trackIds.push_back(copies[v[k]].t.id);
      g.quality.push_back(quality(copies[v[k]]));
      if (k > 0) g.savedBytes += copies[v[k]].t.size;
    }
    out.push_back(std::move(g));
  }
  // the order shown: by the kept copy's artist then title
  std::map<std::string, const Track*> byId;
  for (const Copy& c : copies) byId[c.t.id] = &c.t;
  auto key = [&](const DuplicateGroup& g) { const Track* t = byId[g.trackIds[0]]; return normaliseTag(t->artist) + '\x1f' + normaliseTag(t->title) + '\x1f' + t->id; };
  std::sort(out.begin(), out.end(), [&](const DuplicateGroup& a, const DuplicateGroup& b) { return key(a) < key(b); });
  return out;
}

}  // namespace ipod
