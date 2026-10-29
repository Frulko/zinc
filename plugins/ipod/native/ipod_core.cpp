// zinc:ipod core (see ipod_core.h): libgpod for the database, TagLib for the tags of the files added, libusb for
// SysInfoExtended, std::filesystem for copies, snapshots and backups. Runs on one thread at a time (the worker).
#include "ipod_core.h"
#include "ipod_fingerprint.h"

#include <itdb.h>
#include <libusb.h>
#include <plist/plist.h>
#include <taglib/taglib.h>
#include <taglib/fileref.h>
#include <taglib/tag.h>
#include <taglib/tpropertymap.h>

#include <algorithm>
#include <cerrno>
#include <cinttypes>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <ctime>
#include <filesystem>
#include <map>
#include <set>
#include <fcntl.h>
#include <spawn.h>
#include <sys/stat.h>
#include <sys/statvfs.h>
#include <sys/time.h>
#ifdef __APPLE__
#include <sys/mount.h>
#include <CoreFoundation/CoreFoundation.h>
#include <IOKit/IOKitLib.h>
#endif
#include <mutex>
#include <sys/wait.h>
#include <unistd.h>

#define STB_IMAGE_WRITE_STATIC
#define STB_IMAGE_WRITE_IMPLEMENTATION
#include "stb_image_write.h"
#include "gdk-pixbuf/gdk-pixbuf.h"
#define XXH_INLINE_ALL
#include "xxhash.h"

// libgpod reports through GLib on stderr, with blank lines, at every read and save: a smart-playlist rule on a field newer than it knows
// ("Unknown action type 1", then a failed itdb_splr_validate assertion) is one, and it is kept byte for byte anyway. One short line per
// distinct message instead.
static void glibLine(const gchar*, GLogLevelFlags, const gchar* msg, gpointer) {
  static std::set<std::string> seen;
  std::string m = msg ? msg : "";
  while (!m.empty() && (m.back() == '\n' || m.back() == ' ')) m.pop_back();
  if (seen.size() < 64 && seen.insert(m).second) std::fprintf(stderr, "zinc:ipod: libgpod: %s\n", m.c_str());
}
static void quietGlib() {
  static bool done = false;
  if (done) return;
  done = true;
  g_log_set_default_handler(glibLine, nullptr);
}

extern char** environ;
// libgpod internals (itdb_device.h is C only): the FireWire GUID and the checksum the model needs (1 hash58, 2 hash72, 3 hashAB)
extern "C" const char* itdb_device_get_firewire_id(const Itdb_Device* device);
extern "C" int itdb_device_get_checksum_type(const Itdb_Device* device);
extern "C" char* zn_ipod_artwork_plist(const char* mountpoint);   // ipod_sysinfo.c
extern "C" char* zn_ipod_art_formats(const char* mountpoint);
extern "C" void* zn_ipod_photo_pixbuf(Itdb_Device* device, Itdb_Thumb* thumb);   // the largest RGB size of a photo
extern "C" const Itdb_IpodInfo* itdb_ipod_info_from_serial(const char* serial);   // the model from the last digits of a serial
namespace fs = std::filesystem;

namespace ipod {
namespace {

constexpr int kKeepAuto = 10;   // automatic backups kept per iPod (the ones made by hand are never removed)
constexpr double kReserve = 64.0 * 1024 * 1024;   // left free on the iPod: the database, artwork and the iPod's own files

#define DB static_cast<Itdb_iTunesDB*>(db_)

std::string s(const gchar* p) { return p ? p : ""; }
std::string takeErr(GError*& e, const char* what) {
  std::string r = std::string(what) + ": " + (e && e->message ? e->message : "failed");
  if (e) g_error_free(e);
  e = nullptr;
  return r;
}
std::string hexId(guint64 v) { char b[17]; snprintf(b, sizeof b, "%016" PRIx64, (uint64_t)v); return b; }
guint64 parseId(const std::string& h) { return (guint64)strtoull(h.c_str(), nullptr, 16); }

bool present(const fs::path& p) { std::error_code ec; return fs::exists(p, ec); }

struct Space { double total = 0, free = 0; bool readOnly = false; bool ok = false; };
Space space(const std::string& mp) {
  struct statvfs v;
  Space r;
  if (statvfs(mp.c_str(), &v) != 0) return r;
  r.total = (double)v.f_blocks * v.f_frsize;
  r.free = (double)v.f_bavail * v.f_frsize;
  r.readOnly = (v.f_flag & ST_RDONLY) != 0;
  r.ok = true;
  if (const char* f = getenv("ZINC_IPOD_FREE_BYTES")) r.free = atof(f);   // tests: a nearly full iPod
  return r;
}

std::string mb(double b) { char t[32]; snprintf(t, sizeof t, "%.1f MB", b / 1048576.0); return t; }

/** Copies with progress every MiB and an fsync, so a pulled cable never leaves a file the database points to half
 *  written without the copy failing. */
bool copyFile(const std::string& from, const std::string& to, const Progress& progress, const std::string& label, std::string& err) {
  int in = ::open(from.c_str(), O_RDONLY);
  if (in < 0) { err = from + ": " + strerror(errno); return false; }
  int out = ::open(to.c_str(), O_WRONLY | O_CREAT | O_TRUNC, 0644);
  if (out < 0) { err = to + ": " + strerror(errno); ::close(in); return false; }
  struct stat st;
  fstat(in, &st);
  const int32_t total = (int32_t)std::min<off_t>(st.st_size / 1024, INT32_MAX);   // KiB, so a 4 GB video fits an i32
  std::vector<char> buf(1 << 20);
  off_t done = 0;
  bool ok = true;
  for (;;) {
    ssize_t n = ::read(in, buf.data(), buf.size());
    if (n == 0) break;
    if (n < 0) { if (errno == EINTR) continue; err = from + ": " + strerror(errno); ok = false; break; }
    for (ssize_t w = 0; w < n;) {
      ssize_t k = ::write(out, buf.data() + w, (size_t)(n - w));
      if (k < 0) { if (errno == EINTR) continue; err = to + ": " + strerror(errno); ok = false; break; }
      w += k;
    }
    if (!ok) break;
    done += n;
    if (progress) progress("copy", (int32_t)(done / 1024), total, label);
  }
  if (ok && fsync(out) != 0) { err = to + ": " + strerror(errno); ok = false; }
  ::close(in);
  if (::close(out) != 0 && ok) { err = to + ": " + strerror(errno); ok = false; }
  if (!ok) unlink(to.c_str());
  return ok;
}

/** Copies a tree (files that exist are replaced); skips `skip` (a directory name). */
bool copyTree(const fs::path& from, const fs::path& to, const std::string& skip, const Progress& progress, const std::string& phase, std::string& err) {
  std::error_code ec;
  if (!fs::exists(from, ec)) return true;
  std::vector<fs::path> files;
  for (auto it = fs::recursive_directory_iterator(from, ec); !ec && it != fs::recursive_directory_iterator(); it.increment(ec)) {
    if (it->is_directory() && it->path().filename() == skip) { it.disable_recursion_pending(); continue; }
    if (it->is_regular_file()) files.push_back(it->path());
  }
  if (ec) { err = from.string() + ": " + ec.message(); return false; }
  int32_t i = 0;
  for (const fs::path& f : files) {
    fs::path dst = to / fs::relative(f, from);
    fs::create_directories(dst.parent_path(), ec);
    if (!copyFile(f.string(), dst.string(), nullptr, "", err)) return false;
    if (progress) progress(phase, ++i, (int32_t)files.size(), fs::relative(f, from).string());
  }
  return true;
}

double treeBytes(const fs::path& p) {
  std::error_code ec;
  double n = 0;
  for (auto it = fs::recursive_directory_iterator(p, ec); !ec && it != fs::recursive_directory_iterator(); it.increment(ec))
    if (it->is_regular_file(ec)) n += (double)it->file_size(ec);
  return n;
}

/** Copies a tree into a new backup folder. A file whose size and time are those of the same file in `prev` (the previous backup)
 *  becomes a hard link to it: an unchanged 600 MB of covers costs nothing. The copies keep the source's time for the next one. */
bool mirrorTree(const fs::path& from, const fs::path& to, const fs::path& prev, const Progress& progress, std::string& err) {
  std::error_code ec;
  if (!fs::exists(from, ec)) return true;
  std::vector<fs::path> files;
  for (auto it = fs::recursive_directory_iterator(from, ec); !ec && it != fs::recursive_directory_iterator(); it.increment(ec))
    if (it->is_regular_file(ec) && it->path().filename().string().rfind("._", 0) != 0) files.push_back(it->path());   // not macOS's ._ files
  if (ec) { err = from.string() + ": " + ec.message(); return false; }
  int32_t i = 0;
  for (const fs::path& f : files) {
    fs::path rel = fs::relative(f, from), dst = to / rel, old = prev.empty() ? fs::path() : prev / rel;
    fs::create_directories(dst.parent_path(), ec);
    struct stat a, b;
    if (stat(f.c_str(), &a) != 0) { err = f.string() + ": " + strerror(errno); return false; }
    bool same = !old.empty() && stat(old.c_str(), &b) == 0 && a.st_size == b.st_size && a.st_mtime == b.st_mtime;
    if (!same || link(old.c_str(), dst.c_str()) != 0) {
      if (!copyFile(f.string(), dst.string(), nullptr, "", err)) return false;
      struct timeval tv[2] = {{a.st_mtime, 0}, {a.st_mtime, 0}};
      utimes(dst.c_str(), tv);
    }
    if (progress) progress("backup", ++i, (int32_t)files.size(), rel.string());
  }
  return true;
}

/** Copies into `to` the files of `from` it lacks or has at another size (a music folder, both ways). */
bool syncTree(const fs::path& from, const fs::path& to, const Progress& progress, const std::string& phase, std::string& err) {
  std::error_code ec;
  if (!fs::exists(from, ec)) return true;
  std::vector<fs::path> todo;
  for (auto it = fs::recursive_directory_iterator(from, ec); !ec && it != fs::recursive_directory_iterator(); it.increment(ec)) {
    if (!it->is_regular_file(ec) || it->path().filename().string()[0] == '.') continue;
    fs::path dst = to / fs::relative(it->path(), from);
    std::error_code e2;
    if (!fs::exists(dst, e2) || fs::file_size(dst, e2) != it->file_size(ec)) todo.push_back(it->path());
  }
  int32_t i = 0;
  for (const fs::path& f : todo) {
    fs::path dst = to / fs::relative(f, from);
    fs::create_directories(dst.parent_path(), ec);
    if (!copyFile(f.string(), dst.string(), nullptr, "", err)) return false;
    if (progress) progress(phase, ++i, (int32_t)todo.size(), fs::relative(f, from).string());
  }
  return true;
}

// ---------------------------------------------------------------- plists (SysInfoExtended, backup manifests)
plist_t plistFromXml(const std::string& xml) {
  plist_t p = nullptr;
  if (!xml.empty()) plist_from_xml(xml.data(), (uint32_t)xml.size(), &p);
  return p;
}
plist_t plistFile(const fs::path& file) {
  gchar* data = nullptr;
  gsize n = 0;
  if (!g_file_get_contents(file.c_str(), &data, &n, nullptr)) return nullptr;
  plist_t p = plistFromXml(std::string(data, n));
  g_free(data);
  return p;
}
/** A value of a dict as text: strings, integers, reals and booleans; arrays and dicts as their size. */
std::string plistText(plist_t v) {
  if (!v) return "";
  switch (plist_get_node_type(v)) {
    case PLIST_STRING: { char* c = nullptr; plist_get_string_val(v, &c); std::string r = c ? c : ""; free(c); return r; }
    case PLIST_BOOLEAN: { uint8_t b = 0; plist_get_bool_val(v, &b); return b ? "yes" : "no"; }
    case PLIST_INT: { uint64_t u = 0; plist_get_uint_val(v, &u); return std::to_string(u); }
    case PLIST_REAL: { double d = 0; plist_get_real_val(v, &d); char t[32]; snprintf(t, sizeof t, "%g", d); return t; }
    case PLIST_ARRAY: { uint32_t n = plist_array_get_size(v); return std::to_string(n) + (n == 1 ? " item" : " items"); }
    case PLIST_DICT: { uint32_t n = plist_dict_get_size(v); return std::to_string(n) + (n == 1 ? " key" : " keys"); }
    case PLIST_DATA: { char* d = nullptr; uint64_t n = 0; plist_get_data_val(v, &d, &n); free(d); return std::to_string(n) + " bytes"; }
    default: return "";
  }
}
std::string plistKey(plist_t dict, const char* key) { return dict ? plistText(plist_dict_get_item(dict, key)) : ""; }

/** 160 GB, 3.4 GB, 512 MB, 12 KB: what Finder would say (powers of 1000, as an iPod's box). */
std::string human(double b) {
  char t[32];
  if (b >= 1e9) snprintf(t, sizeof t, b >= 1e11 ? "%.0f GB" : "%.1f GB", b / 1e9);
  else if (b >= 1e6) snprintf(t, sizeof t, "%.0f MB", b / 1e6);
  else snprintf(t, sizeof t, "%.0f KB", b / 1e3);
  return t;
}

std::string fsType(const std::string& mp) {
#ifdef __APPLE__
  struct statfs f;
  return statfs(mp.c_str(), &f) == 0 ? f.f_fstypename : "";
#else
  std::string type;
  if (FILE* f = fopen("/proc/mounts", "r")) {
    char a[512], b[512], c[64];
    while (fscanf(f, "%511s %511s %63s %*[^\n]", a, b, c) == 3) if (mp == b) type = c;
    fclose(f);
  }
  return type;
#endif
}

/** The firmware version shown in Settings > About: SysInfoExtended's VisibleBuildID, else SysInfo's "visibleBuildID: 0x... (2.0.2)". */
std::string firmwareOf(const std::string& mp, plist_t ext) {
  std::string v = plistKey(ext, "VisibleBuildID");
  if (!v.empty()) return v;
  gchar* data = nullptr;
  if (g_file_get_contents((fs::path(mp) / "iPod_Control" / "Device" / "SysInfo").c_str(), &data, nullptr, nullptr)) {
    std::string t = data;
    g_free(data);
    size_t at = t.find("visibleBuildID:");
    if (at != std::string::npos) {
      size_t o = t.find('(', at), c = t.find(')', at), nl = t.find('\n', at);
      if (o != std::string::npos && c != std::string::npos && c < nl) return t.substr(o + 1, c - o - 1);
    }
  }
  return "";
}

/** A name for an iPod's folder of backups: its serial, else its FireWire GUID, else its volume's name. */
std::string folderKey(const Device& d) {
  std::string k = !d.serial.empty() ? d.serial : !d.firewireGuid.empty() ? d.firewireGuid : fs::path(d.mountpoint).filename().string();
  for (char& c : k) if (c == '/' || c == '\\' || c == ':') c = '_';
  return k.empty() ? "iPod" : k;
}

bool readManifest(const fs::path& folder, Backup& b) {
  plist_t m = plistFile(folder / "Info.plist");
  if (!m) return false;
  b.folder = folder.string();
  b.name = plistKey(m, "Name");
  b.serial = plistKey(m, "Serial");
  b.created = atof(plistKey(m, "Created").c_str());
  b.bytes = atof(plistKey(m, "Bytes").c_str());
  b.music = plistKey(m, "Music") == "yes";
  b.tracks = atoi(plistKey(m, "Tracks").c_str());
  b.auto_ = plistKey(m, "Auto") == "yes";
  plist_free(m);
  return true;
}

const char* mediaName(guint32 t) {
  if (t & ITDB_MEDIATYPE_PODCAST) return "podcast";
  if (t & ITDB_MEDIATYPE_AUDIOBOOK) return "audiobook";
  if (t & ITDB_MEDIATYPE_MUSICVIDEO) return "musicvideo";
  if (t & ITDB_MEDIATYPE_TVSHOW) return "tvshow";
  if (t & ITDB_MEDIATYPE_MOVIE) return "video";
  return "audio";
}
bool mediaType(const std::string& n, guint32& t) {
  static const std::map<std::string, guint32> k = {{"audio", ITDB_MEDIATYPE_AUDIO}, {"podcast", ITDB_MEDIATYPE_PODCAST}, {"audiobook", ITDB_MEDIATYPE_AUDIOBOOK},
    {"video", ITDB_MEDIATYPE_MOVIE}, {"musicvideo", ITDB_MEDIATYPE_MUSICVIDEO}, {"tvshow", ITDB_MEDIATYPE_TVSHOW}};
  auto it = k.find(n);
  if (it == k.end()) return false;
  t = it->second;
  return true;
}

/** The iPod's file type and media type for an extension; false for what an iPod cannot play. */
bool kind(const std::string& ext, std::string& filetype, guint32& media) {
  static const std::map<std::string, std::pair<const char*, guint32>> k = {
    {".mp3", {"MPEG audio file", ITDB_MEDIATYPE_AUDIO}}, {".m4a", {"AAC audio file", ITDB_MEDIATYPE_AUDIO}},
    {".aac", {"AAC audio file", ITDB_MEDIATYPE_AUDIO}}, {".m4p", {"Protected AAC audio file", ITDB_MEDIATYPE_AUDIO}},
    {".m4b", {"AAC audio book file", ITDB_MEDIATYPE_AUDIOBOOK}}, {".wav", {"WAV audio file", ITDB_MEDIATYPE_AUDIO}},
    {".aif", {"AIFF audio file", ITDB_MEDIATYPE_AUDIO}}, {".aiff", {"AIFF audio file", ITDB_MEDIATYPE_AUDIO}},
    {".mp4", {"MPEG-4 video file", ITDB_MEDIATYPE_MOVIE}}, {".m4v", {"MPEG-4 video file", ITDB_MEDIATYPE_MOVIE}},
    {".mov", {"QuickTime movie file", ITDB_MEDIATYPE_MOVIE}}};
  std::string e = ext;
  std::transform(e.begin(), e.end(), e.begin(), ::tolower);
  auto it = k.find(e);
  if (it == k.end()) return false;
  filetype = it->second.first;
  media = it->second.second;
  return true;
}

void setStr(gchar*& field, const std::string& v) { g_free(field); field = g_strdup(v.c_str()); }
/** "3/12" -> 3 and 12 */
void pair(const TagLib::PropertyMap& pm, const char* key, gint32& a, gint32& b) {
  auto it = pm.find(key);
  if (it == pm.end() || it->second.isEmpty()) return;
  std::string v = it->second.front().to8Bit(true);
  a = atoi(v.c_str());
  size_t sl = v.find('/');
  if (sl != std::string::npos) b = atoi(v.c_str() + sl + 1);
}
std::string prop(const TagLib::PropertyMap& pm, const char* key) {
  auto it = pm.find(key);
  return it == pm.end() || it->second.isEmpty() ? "" : it->second.front().to8Bit(true);
}

/** An image libgpod will be able to scale at save time (it decodes covers only then: a bad one would fail the save). */
bool decodable(const unsigned char* data, size_t n) {
  GdkPixbufLoader* l = gdk_pixbuf_loader_new();
  gdk_pixbuf_loader_write(l, data, n, nullptr);
  bool ok = gdk_pixbuf_loader_close(l, nullptr) && gdk_pixbuf_loader_get_pixbuf(l);
  g_object_unref(l);
  return ok;
}
bool decodableFile(const std::string& path) {
  gchar* buf = nullptr;
  gsize n = 0;
  if (!g_file_get_contents(path.c_str(), &buf, &n, nullptr)) return false;
  bool ok = decodable((const unsigned char*)buf, n);
  g_free(buf);
  return ok;
}

/** Tags, duration and the embedded cover of a file (TagLib); false when TagLib finds no audio in it. */
bool readTags(const std::string& file, Itdb_Track* t, std::vector<unsigned char>& cover) {
  TagLib::FileRef f(file.c_str());
  if (f.isNull()) return false;
  if (TagLib::Tag* tag = f.tag()) {
    if (!tag->title().isEmpty()) setStr(t->title, tag->title().to8Bit(true));
    if (!tag->artist().isEmpty()) setStr(t->artist, tag->artist().to8Bit(true));
    if (!tag->album().isEmpty()) setStr(t->album, tag->album().to8Bit(true));
    if (!tag->genre().isEmpty()) setStr(t->genre, tag->genre().to8Bit(true));
    if (!tag->comment().isEmpty()) setStr(t->comment, tag->comment().to8Bit(true));
    t->year = (gint32)tag->year();
    t->track_nr = (gint32)tag->track();
  }
  TagLib::PropertyMap pm = f.properties();
  std::string aa = prop(pm, "ALBUMARTIST"), co = prop(pm, "COMPOSER");
  if (!aa.empty()) setStr(t->albumartist, aa);
  if (!co.empty()) setStr(t->composer, co);
  pair(pm, "TRACKNUMBER", t->track_nr, t->tracks);
  pair(pm, "DISCNUMBER", t->cd_nr, t->cds);
  TagLib::AudioProperties* a = f.audioProperties();
  if (a) {
    t->tracklen = a->lengthInMilliseconds();
    t->bitrate = a->bitrate();
    t->samplerate = (guint16)a->sampleRate();
  }
#if TAGLIB_MAJOR_VERSION >= 2
  TagLib::List<TagLib::VariantMap> pics = f.complexProperties("PICTURE");
  if (!pics.isEmpty()) {
    TagLib::ByteVector d = pics.front().value("data").toByteVector();
    cover.assign(d.data(), d.data() + d.size());
  }
#else
  (void)cover;   // ponytail: TagLib 1 (Debian bookworm, Pi OS) has no format-independent picture API; covers come from artworkFile there
#endif
  if (!cover.empty() && !decodable(cover.data(), cover.size())) cover.clear();   // a cover stb cannot read: the track goes without
  return a && a->lengthInMilliseconds() > 0;
}

void apply(Itdb_Track* t, const TrackInput& in) {
  if (in.title) setStr(t->title, *in.title);
  if (in.artist) setStr(t->artist, *in.artist);
  if (in.album) setStr(t->album, *in.album);
  if (in.albumArtist) setStr(t->albumartist, *in.albumArtist);
  if (in.genre) setStr(t->genre, *in.genre);
  if (in.composer) setStr(t->composer, *in.composer);
  if (in.comment) setStr(t->comment, *in.comment);
  if (in.trackNr) t->track_nr = *in.trackNr;
  if (in.tracks) t->tracks = *in.tracks;
  if (in.cdNr) t->cd_nr = *in.cdNr;
  if (in.cds) t->cds = *in.cds;
  if (in.year) t->year = *in.year;
  if (in.rating) t->rating = (guint32)std::clamp(*in.rating, 0, 5) * ITDB_RATING_STEP;
}

Track toTrack(Itdb_Track* t) {
  Track r;
  r.id = hexId(t->dbid);
  r.title = s(t->title); r.artist = s(t->artist); r.album = s(t->album); r.albumArtist = s(t->albumartist);
  r.genre = s(t->genre); r.composer = s(t->composer); r.comment = s(t->comment);
  r.trackNr = t->track_nr; r.tracks = t->tracks; r.cdNr = t->cd_nr; r.cds = t->cds; r.year = t->year;
  r.rating = (int32_t)(t->rating / ITDB_RATING_STEP); r.playCount = (int32_t)t->playcount;
  r.bitrate = t->bitrate; r.sampleRate = (int32_t)t->samplerate;
  r.durationMs = t->tracklen; r.size = t->size;
  r.mediaType = mediaName(t->mediatype);
  if (t->ipod_path) { r.path = t->ipod_path; std::replace(r.path.begin(), r.path.end(), ':', '/'); if (!r.path.empty() && r.path[0] == '/') r.path.erase(0, 1); }
  r.artwork = itdb_track_has_thumbnails(t);
  r.added = (double)t->time_added; r.lastPlayed = (double)t->time_played;
  return r;
}

Itdb_Track* findTrack(Itdb_iTunesDB* db, const std::string& id) {
  guint64 v = parseId(id);
  for (GList* l = db->tracks; l; l = l->next) if (((Itdb_Track*)l->data)->dbid == v) return (Itdb_Track*)l->data;
  return nullptr;
}
Itdb_Playlist* findPlaylist(Itdb_iTunesDB* db, const std::string& id) {
  guint64 v = parseId(id);
  for (GList* l = db->playlists; l; l = l->next) if (((Itdb_Playlist*)l->data)->id == v) return (Itdb_Playlist*)l->data;
  return nullptr;
}
Itdb_Playlist* playlistNamed(Itdb_iTunesDB* db, const std::string& name) {
  for (GList* l = db->playlists; l; l = l->next) {
    Itdb_Playlist* p = (Itdb_Playlist*)l->data;
    if (!itdb_playlist_is_mpl(p) && p->name && name == p->name) return p;
  }
  return nullptr;
}

bool hasDatabase(const std::string& mp) {
  fs::path it = fs::path(mp) / "iPod_Control" / "iTunes";
  return present(it / "iTunesDB") || present(it / "iTunesCDB") || present(it / "iTunes Library.itlp");
}

// ---------------------------------------------------------------- USB: the iPod's serial (its FireWire GUID) and SysInfoExtended
struct UsbIpod { std::string serial; std::string xml; uint16_t product = 0; };

/** The iPods that have a disk mode: 0x1201-0x128f (1G to Classic and Nano 7G) and the Shuffles (0x1300-0x130f). An iPhone, an iPad
 *  or an iPod touch (0x1290 and up) is not one: it has no iPod_Control to manage. */
bool diskModeIpod(uint16_t product) { return (product >= 0x1201 && product < 0x1290) || (product >= 0x1300 && product <= 0x130f); }

/** Every iPod on the USB bus, its serial and, when `withXml`, the SysInfoExtended it serves (vendor request 0x40, as libgpod's
 *  ipod-read-sysinfo-extended; a device request, so the mounted disk is untouched). */
std::vector<UsbIpod> usbIpods(bool withXml) {
  std::vector<UsbIpod> out;
  libusb_context* ctx = nullptr;
  if (libusb_init(&ctx) != 0) return out;
  libusb_device** list = nullptr;
  ssize_t n = libusb_get_device_list(ctx, &list);
  for (ssize_t i = 0; i < n; i++) {
    libusb_device_descriptor d;
    if (libusb_get_device_descriptor(list[i], &d) != 0 || d.idVendor != 0x05ac || !diskModeIpod(d.idProduct)) continue;
    libusb_device_handle* h = nullptr;
    if (libusb_open(list[i], &h) != 0) continue;
    UsbIpod u;
    u.product = d.idProduct;
    unsigned char buf[0x1000];
    if (d.iSerialNumber && libusb_get_string_descriptor_ascii(h, d.iSerialNumber, buf, sizeof buf) > 0) u.serial = (const char*)buf;
    if (withXml) {
      for (int k = 0; k < 0xffff; k++) {
        int r = libusb_control_transfer(h, (uint8_t)LIBUSB_ENDPOINT_IN | (uint8_t)LIBUSB_REQUEST_TYPE_VENDOR | (uint8_t)LIBUSB_RECIPIENT_DEVICE, 0x40, 0x02, (uint16_t)k, buf, sizeof buf, 2000);
        if (r <= 0) break;
        u.xml.append((const char*)buf, (size_t)r);
        if (r != (int)sizeof buf) break;   // a short read ends the file
      }
      if (u.xml.find("<plist") == std::string::npos) u.xml.clear();
    }
    libusb_close(h);
    out.push_back(u);
  }
  if (list) libusb_free_device_list(list, 1);
  libusb_exit(ctx);
  return out;
}

/** The iPods on the USB bus as the system lists them (IORegistry on macOS, sysfs on Linux): product and serial, read without opening
 *  the device, so a scan sends nothing to an iPod, mounted, being ejected or ejected. */
std::vector<UsbIpod> listedIpods() {
  std::vector<UsbIpod> out;
#ifdef __APPLE__
  io_iterator_t it = 0;
  if (IOServiceGetMatchingServices(0, IOServiceMatching("IOUSBHostDevice"), &it) != KERN_SUCCESS) return out;
  while (io_object_t dev = IOIteratorNext(it)) {
    auto number = [&](const char* key) {
      int v = 0;
      CFStringRef k = CFStringCreateWithCString(nullptr, key, kCFStringEncodingUTF8);
      if (CFTypeRef r = IORegistryEntryCreateCFProperty(dev, k, nullptr, 0)) {
        if (CFGetTypeID(r) == CFNumberGetTypeID()) CFNumberGetValue((CFNumberRef)r, kCFNumberIntType, &v);
        CFRelease(r);
      }
      CFRelease(k);
      return v;
    };
    auto text = [&](const char* key) {
      std::string v;
      CFStringRef k = CFStringCreateWithCString(nullptr, key, kCFStringEncodingUTF8);
      if (CFTypeRef r = IORegistryEntryCreateCFProperty(dev, k, nullptr, 0)) {
        char b[256];
        if (CFGetTypeID(r) == CFStringGetTypeID() && CFStringGetCString((CFStringRef)r, b, sizeof b, kCFStringEncodingUTF8)) v = b;
        CFRelease(r);
      }
      CFRelease(k);
      return v;
    };
    const int product = number("idProduct");
    if (number("idVendor") == 0x05ac && diskModeIpod((uint16_t)product)) {
      UsbIpod u;
      u.product = (uint16_t)product;
      u.serial = text("USB Serial Number");
      if (u.serial.empty()) u.serial = text("kUSBSerialNumberString");
      out.push_back(u);
    }
    IOObjectRelease(dev);
  }
  IOObjectRelease(it);
#else
  std::error_code ec;
  for (auto& e : fs::directory_iterator("/sys/bus/usb/devices", ec)) {
    auto field = [&](const char* name) {
      std::string v;
      if (FILE* f = fopen((e.path() / name).c_str(), "r")) { char b[256]; if (fgets(b, sizeof b, f)) v = b; fclose(f); }
      while (!v.empty() && (v.back() == '\n' || v.back() == ' ')) v.pop_back();
      return v;
    };
    const std::string vendor = field("idVendor");
    if (vendor != "05ac") continue;
    const uint16_t product = (uint16_t)strtoul(field("idProduct").c_str(), nullptr, 16);
    if (!diskModeIpod(product)) continue;
    UsbIpod u;
    u.product = product;
    u.serial = field("serial");
    out.push_back(u);
  }
#endif
  return out;
}

/** Resets every iPod on the USB bus, as unplugging and plugging it back does: an iPod ejected ("OK to disconnect") offers its disk
 *  again. Only for iPods whose disk is not mounted (mount() calls it when it finds no iPod disk). How many were reset. */
int resetUsbIpods() {
  int done = 0;
  libusb_context* ctx = nullptr;
  if (libusb_init(&ctx) != 0) return 0;
  libusb_device** list = nullptr;
  ssize_t n = libusb_get_device_list(ctx, &list);
  for (ssize_t i = 0; i < n; i++) {
    libusb_device_descriptor d;
    if (libusb_get_device_descriptor(list[i], &d) != 0 || d.idVendor != 0x05ac || !diskModeIpod(d.idProduct)) continue;
    libusb_device_handle* h = nullptr;
    if (libusb_open(list[i], &h) != 0) continue;
    int r = libusb_reset_device(h);   // NOT_FOUND: it re-enumerated, which is what is asked
    if (r == 0 || r == LIBUSB_ERROR_NOT_FOUND) done++;
    libusb_close(h);
  }
  if (list) libusb_free_device_list(list, 1);
  libusb_exit(ctx);
  return done;
}

/** The USB iPod that is this volume: the one whose serial is its FireWire GUID, or the only one plugged in. */
const UsbIpod* matchUsb(const std::vector<UsbIpod>& all, const std::string& guid) {
  for (const UsbIpod& u : all) if (!guid.empty() && g_ascii_strcasecmp(u.serial.c_str(), guid.c_str()) == 0) return &u;
  return all.size() == 1 ? &all[0] : nullptr;
}

bool run(std::vector<std::string> argv, std::string& err) {
  std::vector<char*> a;
  for (std::string& x : argv) a.push_back(x.data());
  a.push_back(nullptr);
  pid_t pid;
  if (posix_spawnp(&pid, a[0], nullptr, nullptr, a.data(), environ) != 0) { err = argv[0] + ": " + strerror(errno); return false; }
  int st = 0;
  while (waitpid(pid, &st, 0) < 0 && errno == EINTR) {}
  if (WIFEXITED(st) && WEXITSTATUS(st) == 0) return true;
  err = argv[0] + " " + argv[1] + " failed (status " + std::to_string(WIFEXITED(st) ? WEXITSTATUS(st) : -1) + ")";
  return false;
}

std::string stamp() {
  time_t now = time(nullptr);
  struct tm tm;
  localtime_r(&now, &tm);
  char b[32];
  strftime(b, sizeof b, "%Y%m%d-%H%M%S", &tm);
  return b;
}

}  // namespace

// ---------------------------------------------------------------- devices
bool describe(const std::string& mp, Device& d, std::string& err) {
  if (!present(fs::path(mp) / "iPod_Control")) { err = mp + " is not an iPod (no iPod_Control folder)"; return false; }
  Itdb_Device* dev = itdb_device_new();
  itdb_device_set_mountpoint(dev, mp.c_str());
  d = Device{};
  d.mountpoint = mp;
  d.name = fs::path(mp).filename().string();
  if (const Itdb_IpodInfo* info = itdb_device_get_ipod_info(dev)) {
    d.model = s(itdb_info_get_ipod_model_name_string(info->ipod_model));
    d.generation = s(itdb_info_get_ipod_generation_string(info->ipod_generation));
    d.modelNumber = s(info->model_number);
    d.capacityGb = info->capacity;
  }
  gchar* serial = itdb_device_get_sysinfo(dev, "pszSerialNumber");
  d.serial = s(serial);
  g_free(serial);
  d.firewireGuid = s(itdb_device_get_firewire_id(dev));
  d.artwork = itdb_device_supports_artwork(dev);
  switch (itdb_device_get_checksum_type(dev)) {
    case 1: d.checksum = "hash58"; break;
    case 2: d.checksum = "hash72"; break;
    case 3: d.checksum = "hashAB"; break;
    default: d.checksum = "none";
  }
  itdb_device_free(dev);
  d.sysInfoExtended = present(fs::path(mp) / "iPod_Control" / "Device" / "SysInfoExtended");
  plist_t ext = d.sysInfoExtended ? plistFile(fs::path(mp) / "iPod_Control" / "Device" / "SysInfoExtended") : nullptr;
  d.firmware = firmwareOf(mp, ext);
  if (ext) plist_free(ext);
  d.connection = "disk";
  d.hasDatabase = hasDatabase(mp);
  Space sp = space(mp);
  d.totalBytes = sp.total; d.freeBytes = sp.free; d.readOnly = sp.readOnly;
  return true;
}

std::vector<Device> detect() {
  std::vector<std::string> roots = {"/Volumes"};
  if (const char* u = getenv("USER")) { roots.push_back(std::string("/media/") + u); roots.push_back(std::string("/run/media/") + u); }
  roots.push_back("/media");
  roots.push_back("/mnt");
  if (const char* only = getenv("ZINC_IPOD_ROOTS")) roots = {only};   // tests: a folder of fake iPods, and nothing else (a real iPod plugged in is never read)
  std::vector<Device> out;
  std::set<std::string> seen;
  for (const std::string& r : roots) {
    std::error_code ec;
    for (auto& e : fs::directory_iterator(r, ec)) {
      std::string mp = e.path().string();
      if (seen.count(mp) || !present(e.path() / "iPod_Control")) continue;
      seen.insert(mp);
      Device d;
      std::string err;
      if (describe(mp, d, err)) out.push_back(d);
    }
  }
  if (getenv("ZINC_IPOD_NO_USB")) return out;
  // USB, from the system's list (nothing is sent to the iPods): the product of the mounted ones, and the iPods plugged in but not
  // mounted (ejected, or a disk the system could not read), described from what their disk said while mounted in this session
  static std::mutex knownLock;
  static std::map<std::string, Device> known;   // FireWire GUID (upper case) -> the iPod as its mounted disk described it
  auto guidKey = [](const std::string& g) { std::string k = g; for (char& c : k) c = (char)toupper((unsigned char)c); return k; };
  {
    std::lock_guard<std::mutex> hold(knownLock);
    for (const Device& d : out) if (!d.firewireGuid.empty()) known[guidKey(d.firewireGuid)] = d;
  }
  std::vector<UsbIpod> usb = listedIpods();
  std::vector<bool> matched(usb.size(), false);
  for (Device& d : out)
    for (size_t k = 0; k < usb.size(); k++)
      if (!matched[k] && ((!d.firewireGuid.empty() && g_ascii_strcasecmp(usb[k].serial.c_str(), d.firewireGuid.c_str()) == 0) ||
                          (d.firewireGuid.empty() && usb.size() == 1 && out.size() == 1))) { d.usbProduct = usb[k].product; matched[k] = true; }
  if (std::find(matched.begin(), matched.end(), false) == matched.end()) return out;
  for (size_t k = 0; k < usb.size(); k++) {
    if (matched[k]) continue;
    const UsbIpod& u = usb[k];
    Device d;
    {
      std::lock_guard<std::mutex> hold(knownLock);
      auto hit = known.find(guidKey(u.serial));
      if (hit != known.end()) {
        const Device& m = hit->second;
        d.serial = m.serial; d.firmware = m.firmware; d.model = m.model; d.generation = m.generation; d.modelNumber = m.modelNumber;
        d.capacityGb = m.capacityGb; d.name = m.name;
      }
    }
    d.connection = "usb";
    d.usbProduct = u.product;
    d.firewireGuid = u.serial;   // an iPod's USB serial is its FireWire GUID
    if (d.model.empty()) d.model = "iPod";
    out.push_back(d);
  }
  return out;
}

std::string sysInfoExtendedPlist(const std::string& serial, const std::string& guid, const std::string& modelNumber, int familyId, const std::string& artwork) {
  auto esc = [](const std::string& v) { gchar* e = g_markup_escape_text(v.c_str(), -1); std::string r = e; g_free(e); return r; };
  std::string x = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n<plist version=\"1.0\">\n<dict>\n";
  if (!serial.empty()) x += "\t<key>SerialNumber</key>\n\t<string>" + esc(serial) + "</string>\n";
  if (!guid.empty()) x += "\t<key>FireWireGUID</key>\n\t<string>" + esc(guid) + "</string>\n";
  if (!modelNumber.empty()) x += "\t<key>ModelNumStr</key>\n\t<string>" + esc(modelNumber) + "</string>\n";
  x += "\t<key>FamilyID</key>\n\t<integer>" + std::to_string(familyId) + "</integer>\n";
  x += "\t<key>PodcastsSupported</key>\n\t<true/>\n";
  x += artwork;   // libgpod's formats for the model: without them it would think the iPod shows no artwork
  x += "\t<key>ZincGenerated</key>\n\t<true/>\n</dict>\n</plist>\n";
  return x;
}

bool ensureSysInfoExtended(const std::string& mp, std::string& err) {
  fs::path dir = fs::path(mp) / "iPod_Control" / "Device", file = dir / "SysInfoExtended";
  if (present(file)) return true;
  if (space(mp).readOnly) { err = mp + " is mounted read-only: SysInfoExtended cannot be written"; return false; }
  Device d;
  if (!describe(mp, d, err)) return false;
  std::string xml;
  if (!getenv("ZINC_IPOD_NO_USB")) {
    std::vector<UsbIpod> usb = usbIpods(true);
    if (const UsbIpod* u = matchUsb(usb, d.firewireGuid)) {
      xml = u->xml;
      if (d.firewireGuid.empty()) d.firewireGuid = u->serial;   // an iPod's USB serial is its FireWire GUID
    }
  }
  if (xml.empty()) {
    char* art = zn_ipod_artwork_plist(mp.c_str());
    xml = sysInfoExtendedPlist(d.serial, d.firewireGuid, d.modelNumber, 0, art ? art : "");
    g_free(art);
  }
  std::error_code ec;
  fs::create_directories(dir, ec);
  GError* e = nullptr;
  if (!g_file_set_contents(file.c_str(), xml.data(), (gssize)xml.size(), &e)) { err = takeErr(e, "SysInfoExtended"); return false; }
  return true;
}

// ---------------------------------------------------------------- the open database
Library::~Library() { close(); }

void Library::close() {
  if (photos_) itdb_photodb_free(static_cast<Itdb_PhotoDB*>(photos_));
  photos_ = nullptr;
  photosRead_ = false;
  if (db_) itdb_free(DB);
  db_ = nullptr;
  mp_.clear();
  backedUp_ = false;
}

bool Library::writable(std::string& err, const Progress& progress) {
  if (!db_) { err = "no iPod is open"; return false; }
  if (space(mp_).readOnly) { err = mp_ + " is mounted read-only (an HFS+ iPod on Linux mounts read-only: format it as FAT32 with iTunes or Finder to write to it)"; return false; }
  if (backedUp_ || !hasDatabase(mp_)) return true;
  // the session's restore point: the database as it is before the first change, on the computer (snapshots() lists it)
  std::string folder, why;
  if (!backup("", false, folder, progress, why)) { err = "the database could not be backed up before changing it, so nothing was changed: " + why; return false; }
  Device d;
  std::string e2;
  describe(mp_, d, e2);
  fs::path dir = fs::path(backupRoot()) / folderKey(d);
  if (plist_t m = plistFile(fs::path(folder) / "Info.plist")) {   // mark it automatic, and keep the last kKeepAuto of them
    plist_dict_set_item(m, "Auto", plist_new_bool(1));
    char* xml = nullptr;
    uint32_t n = 0;
    plist_to_xml(m, &xml, &n);
    g_file_set_contents((fs::path(folder) / "Info.plist").c_str(), xml, n, nullptr);
    free(xml);
    plist_free(m);
  }
  std::vector<Backup> autos;
  for (const Backup& b : backups(dir.string())) if (b.auto_) autos.push_back(b);
  std::error_code ec;
  for (size_t k = kKeepAuto; k < autos.size(); k++) fs::remove_all(autos[k].folder, ec);
  backedUp_ = true;
  return true;
}

bool Library::open(const std::string& mp, bool init, const std::string& model, const std::string& name, std::string& err) {
  close();
  if (!present(mp)) { err = mp + " does not exist"; return false; }
  bool ro = space(mp).readOnly;
  if (!ro && present(fs::path(mp) / "iPod_Control")) {
    std::string why;
    ensureSysInfoExtended(mp, why);   // best effort: libgpod falls back to SysInfo
  }
  GError* e = nullptr;
  if (!hasDatabase(mp)) {
    if (!init) { err = mp + " has no iPod database (open it with init to create one)"; return false; }
    if (ro) { err = mp + " is mounted read-only"; return false; }
    if (!itdb_init_ipod(mp.c_str(), model.empty() ? nullptr : model.c_str(), name.empty() ? "iPod" : name.c_str(), &e)) { err = takeErr(e, "init"); return false; }
    std::string why;
    ensureSysInfoExtended(mp, why);
  }
  quietGlib();
  Itdb_iTunesDB* db = itdb_parse(mp.c_str(), &e);
  if (!db) { err = takeErr(e, "reading the database"); return false; }
  db_ = db;
  mp_ = mp;
  return true;
}

bool Library::device(Device& out, std::string& err) {
  if (!db_) { err = "no iPod is open"; return false; }
  if (!describe(mp_, out, err)) return false;
  if (Itdb_Playlist* m = itdb_playlist_mpl(DB)) out.name = s(m->name);
  return true;
}

std::vector<Track> Library::tracks() {
  std::vector<Track> v;
  if (db_) for (GList* l = DB->tracks; l; l = l->next) v.push_back(toTrack((Itdb_Track*)l->data));
  return v;
}

std::vector<Playlist> Library::playlists() {
  std::vector<Playlist> v;
  if (!db_) return v;
  for (GList* l = DB->playlists; l; l = l->next) {
    Itdb_Playlist* p = (Itdb_Playlist*)l->data;
    Playlist r;
    r.id = hexId(p->id); r.name = s(p->name);
    r.master = itdb_playlist_is_mpl(p); r.podcasts = itdb_playlist_is_podcasts(p); r.smart = p->is_spl;
    for (GList* m = p->members; m; m = m->next) r.trackIds.push_back(hexId(((Itdb_Track*)m->data)->dbid));
    v.push_back(std::move(r));
  }
  return v;
}

std::vector<AddResult> Library::add(const std::vector<TrackInput>& items, const std::string& playlist, const Progress& progress, std::string& err) {
  std::vector<AddResult> out;
  if (!writable(err, progress)) return out;
  // the whole batch must fit before anything is copied
  double need = kReserve;
  for (const TrackInput& in : items) { std::error_code ec; auto n = fs::file_size(in.file, ec); if (!ec) need += (double)n; }
  Space sp = space(mp_);
  if (sp.ok && need > sp.free) { err = "not enough space on the iPod: " + mb(need) + " needed (with " + mb(kReserve) + " kept free), " + mb(sp.free) + " free"; return out; }
  Itdb_Playlist* pl = nullptr;
  if (!playlist.empty()) {
    pl = findPlaylist(DB, playlist);
    if (!pl) pl = playlistNamed(DB, playlist);
    if (!pl) { pl = itdb_playlist_new(playlist.c_str(), FALSE); itdb_playlist_add(DB, pl, -1); }
  }
  int32_t i = 0;
  for (const TrackInput& in : items) {
    AddResult r;
    r.file = in.file;
    ++i;
    std::string filetype;
    guint32 media = 0;
    if (!present(in.file)) r.error = "no such file";
    else if (!kind(fs::path(in.file).extension().string(), filetype, media)) r.error = "an iPod cannot play " + fs::path(in.file).extension().string() + " files (convert to MP3, AAC or ALAC)";
    if (!r.error.empty()) { out.push_back(r); continue; }
    if (in.mediaType && !mediaType(*in.mediaType, media)) { r.error = "unknown mediaType " + *in.mediaType; out.push_back(r); continue; }
    if (in.artworkFile && !decodableFile(*in.artworkFile)) { r.error = *in.artworkFile + ": not an image the iPod cover can be made from"; out.push_back(r); continue; }
    Itdb_Track* t = itdb_track_new();
    std::vector<unsigned char> cover;
    if (!readTags(in.file, t, cover) && !(media & (ITDB_MEDIATYPE_MOVIE | ITDB_MEDIATYPE_MUSICVIDEO | ITDB_MEDIATYPE_TVSHOW))) {
      itdb_track_free(t);
      r.error = "not a playable audio file (no audio found in it)";
      out.push_back(r);
      continue;
    }
    if (!t->title || !*t->title) setStr(t->title, fs::path(in.file).stem().string());
    apply(t, in);
    setStr(t->filetype, filetype);
    t->mediatype = media;
    std::error_code ec;
    t->size = (guint32)fs::file_size(in.file, ec);
    t->time_added = time(nullptr);
    itdb_track_add(DB, t, -1);
    GError* e = nullptr;
    gchar* dest = itdb_cp_get_dest_filename(t, nullptr, in.file.c_str(), &e);
    std::string why;
    if (!dest) why = takeErr(e, "no place for the file");
    else if (!copyFile(in.file, dest, progress, fs::path(in.file).filename().string(), why)) {}
    else if (!itdb_cp_finalize(t, nullptr, dest, &e)) why = takeErr(e, "finalising the copy");
    g_free(dest);
    if (!why.empty()) {
      r.error = why;
      itdb_track_remove(t);
      out.push_back(r);
      continue;
    }
    itdb_playlist_add_track(itdb_playlist_mpl(DB), t, -1);
    if (media & ITDB_MEDIATYPE_PODCAST) {
      Itdb_Playlist* pc = itdb_playlist_podcasts(DB);
      if (!pc) { pc = itdb_playlist_new("Podcasts", FALSE); itdb_playlist_set_podcasts(pc); itdb_playlist_add(DB, pc, -1); }
      itdb_playlist_add_track(pc, t, -1);
    }
    if (pl) itdb_playlist_add_track(pl, t, -1);
    if (in.artworkFile) itdb_track_set_thumbnails(t, in.artworkFile->c_str());
    else if (!cover.empty()) itdb_track_set_thumbnails_from_data(t, cover.data(), cover.size());
    r.id = hexId(t->dbid);
    out.push_back(r);
    if (progress) progress("add", i, (int32_t)items.size(), r.file);
  }
  if (!save(progress, err)) return out;
  return out;
}

bool Library::update(const std::string& id, const TrackInput& in, Track& out, std::string& err) {
  if (!writable(err)) return false;
  Itdb_Track* t = findTrack(DB, id);
  if (!t) { err = "no track " + id; return false; }
  guint32 media = t->mediatype;
  if (in.mediaType && !mediaType(*in.mediaType, media)) { err = "unknown mediaType " + *in.mediaType; return false; }
  apply(t, in);
  t->mediatype = media;
  if (in.artworkFile && (!decodableFile(*in.artworkFile) || !itdb_track_set_thumbnails(t, in.artworkFile->c_str()))) { err = *in.artworkFile + ": not an image"; return false; }
  out = toTrack(t);
  return true;
}

namespace {
/** Takes a track out of every playlist and the database, and deletes its file unless `keepFile` (another track points to it). */
void dropTrack(Itdb_iTunesDB* db, Itdb_Track* t, bool keepFile = false) {
  gchar* f = keepFile ? nullptr : itdb_filename_on_ipod(t);
  if (f) { unlink(f); g_free(f); }
  for (GList* l = db->playlists; l; l = l->next) {
    Itdb_Playlist* p = (Itdb_Playlist*)l->data;
    while (itdb_playlist_contains_track(p, t)) itdb_playlist_remove_track(p, t);
  }
  itdb_track_remove(t);
}
}  // namespace

bool Library::remove(const std::vector<std::string>& ids, std::string& err) {
  if (!writable(err)) return false;
  for (const std::string& id : ids)
    if (Itdb_Track* t = findTrack(DB, id)) dropTrack(DB, t);
  return save(nullptr, err);
}

bool Library::setArtwork(const std::string& id, const std::string& image, std::string& err) {
  if (!writable(err)) return false;
  Itdb_Track* t = findTrack(DB, id);
  if (!t) { err = "no track " + id; return false; }
  if (!decodableFile(image) || !itdb_track_set_thumbnails(t, image.c_str())) { err = image + ": not an image"; return false; }
  return true;
}

bool Library::saveArtwork(const std::string& id, const std::string& png, bool& had, std::string& err) {
  had = false;
  if (!db_) { err = "no iPod is open"; return false; }
  Itdb_Track* t = findTrack(DB, id);
  if (!t) { err = "no track " + id; return false; }
  if (!itdb_track_has_thumbnails(t)) return true;
  GdkPixbuf* p = (GdkPixbuf*)itdb_track_get_thumbnail(t, -1, -1);
  if (!p) return true;
  int ok = stbi_write_png(png.c_str(), gdk_pixbuf_get_width(p), gdk_pixbuf_get_height(p), gdk_pixbuf_get_n_channels(p), gdk_pixbuf_get_pixels(p), gdk_pixbuf_get_rowstride(p));
  g_object_unref(p);
  if (!ok) { err = png + ": cannot write"; return false; }
  had = true;
  return true;
}

bool Library::createPlaylist(const std::string& name, std::string& id, std::string& err) {
  if (!writable(err)) return false;
  Itdb_Playlist* p = itdb_playlist_new(name.c_str(), FALSE);
  itdb_playlist_add(DB, p, -1);
  id = hexId(p->id);
  return true;
}

bool Library::renamePlaylist(const std::string& id, const std::string& name, std::string& err) {
  if (!writable(err)) return false;
  Itdb_Playlist* p = findPlaylist(DB, id);
  if (!p) { err = "no playlist " + id; return false; }
  setStr(p->name, name);
  return true;
}

bool Library::deletePlaylist(const std::string& id, std::string& err) {
  if (!writable(err)) return false;
  Itdb_Playlist* p = findPlaylist(DB, id);
  if (!p) { err = "no playlist " + id; return false; }
  if (itdb_playlist_is_mpl(p)) { err = "the master playlist cannot be deleted"; return false; }
  itdb_playlist_remove(p);
  return true;
}

bool Library::setPlaylistTracks(const std::string& id, const std::vector<std::string>& ids, std::string& err) {
  if (!writable(err)) return false;
  Itdb_Playlist* p = findPlaylist(DB, id);
  if (!p) { err = "no playlist " + id; return false; }
  if (itdb_playlist_is_mpl(p)) { err = "the master playlist holds every track: add or remove tracks instead"; return false; }
  if (p->is_spl) { err = "a smart playlist is filled by its rules"; return false; }
  std::vector<Itdb_Track*> ts;
  for (const std::string& t : ids) { Itdb_Track* x = findTrack(DB, t); if (!x) { err = "no track " + t; return false; } ts.push_back(x); }
  while (p->members) itdb_playlist_remove_track(p, (Itdb_Track*)p->members->data);
  for (Itdb_Track* t : ts) itdb_playlist_add_track(p, t, -1);
  return true;
}

bool Library::save(const Progress& progress, std::string& err) {
  if (!writable(err, progress)) return false;   // the first change of a session backs the database up first
  if (progress) progress("save", 0, 1, "database");
  GError* e = nullptr;
  if (!itdb_write(DB, &e)) { err = takeErr(e, "writing the database"); return false; }
  sync();
  if (progress) progress("save", 1, 1, "");
  return true;
}

std::vector<Snapshot> Library::snapshots() {
  std::vector<Snapshot> v;
  Device d;
  std::string err;
  if (!db_ || !describe(mp_, d, err)) return v;
  for (const Backup& b : backups((fs::path(backupRoot()) / folderKey(d)).string())) {
    Snapshot sn;
    sn.id = fs::path(b.folder).filename().string();
    sn.created = b.created;
    sn.bytes = b.bytes;
    v.push_back(sn);
  }
  return v;
}

bool Library::restoreSnapshot(const std::string& id, const Progress& progress, std::string& err) {
  backedUp_ = false;   // what is replaced is backed up first, even after this session's first backup
  if (!writable(err, progress)) return false;
  Device d;
  if (!describe(mp_, d, err)) return false;
  fs::path folder = fs::path(backupRoot()) / folderKey(d) / id;
  if (id.empty() || id.find('/') != std::string::npos || !present(folder / "iPod_Control" / "iTunes")) { err = "no snapshot " + id; return false; }
  std::string mp = mp_;
  close();
  if (!restoreBackup(folder.string(), mp, progress, err)) return false;
  return open(mp, false, "", "", err);
}

bool Library::backup(const std::string& dir, bool music, std::string& folder, const Progress& progress, std::string& err) {
  if (!db_) { err = "no iPod is open"; return false; }
  Device d;
  if (!describe(mp_, d, err)) return false;
  if (Itdb_Playlist* m = itdb_playlist_mpl(DB)) d.name = s(m->name);
  fs::path ipc = fs::path(mp_) / "iPod_Control", home = fs::path(dir.empty() ? backupRoot() : dir) / folderKey(d);
  std::error_code ec;
  fs::create_directories(home, ec);
  if (ec) { err = home.string() + ": " + ec.message(); return false; }
  std::vector<Backup> before = backups(home.string());
  double need = treeBytes(ipc / "iTunes") + treeBytes(ipc / "Artwork");
  if (music) need += treeBytes(ipc / "Music") - treeBytes(home / "Music");
  fs::space_info si = fs::space(home, ec);
  if (!ec && (double)si.available < need * 1.01) { err = "not enough space in " + home.string() + ": " + mb(need) + " needed, " + mb((double)si.available) + " free"; return false; }
  std::string name = stamp();
  for (int k = 2; present(home / name); k++) name = stamp() + "-" + std::to_string(k);
  fs::path to = home / name, prev = before.empty() ? fs::path() : fs::path(before[0].folder);
  for (const char* sub : {"iTunes", "Artwork", "Device"})
    if (!mirrorTree(ipc / sub, to / "iPod_Control" / sub, prev.empty() ? prev : prev / "iPod_Control" / sub, progress, err)) { fs::remove_all(to, ec); return false; }
  if (music && !syncTree(ipc / "Music", home / "Music", progress, "backup", err)) return false;   // shared by the backups: only new files are copied
  plist_t m = plist_new_dict();
  plist_dict_set_item(m, "Name", plist_new_string(d.name.c_str()));
  plist_dict_set_item(m, "Serial", plist_new_string(d.serial.c_str()));
  plist_dict_set_item(m, "FireWireGUID", plist_new_string(d.firewireGuid.c_str()));
  plist_dict_set_item(m, "Model", plist_new_string(d.model.c_str()));
  plist_dict_set_item(m, "Created", plist_new_uint((uint64_t)time(nullptr)));
  plist_dict_set_item(m, "Bytes", plist_new_uint((uint64_t)treeBytes(to)));
  plist_dict_set_item(m, "Tracks", plist_new_uint(g_list_length(DB->tracks)));
  plist_dict_set_item(m, "Music", plist_new_bool(music || present(home / "Music")));
  plist_dict_set_item(m, "Auto", plist_new_bool(0));
  char* xml = nullptr;
  uint32_t n = 0;
  plist_to_xml(m, &xml, &n);
  GError* e = nullptr;
  bool ok = g_file_set_contents((to / "Info.plist").c_str(), xml, n, &e);
  free(xml);
  plist_free(m);
  if (!ok) { err = takeErr(e, "the backup's Info.plist"); return false; }
  folder = to.string();
  return true;
}

std::vector<SpecItem> Library::specs() {
  std::vector<SpecItem> v;
  if (!db_) return v;
  auto add = [&](const char* g, const std::string& n, const std::string& val) { if (!val.empty()) v.push_back(SpecItem{g, n, val}); };
  Device d;
  std::string err;
  describe(mp_, d, err);
  if (Itdb_Playlist* m = itdb_playlist_mpl(DB)) d.name = s(m->name);
  fs::path ipc = fs::path(mp_) / "iPod_Control";
  plist_t ext = plistFile(ipc / "Device" / "SysInfoExtended");
  add("iPod", "Name", d.name);
  add("iPod", "Model", d.model);
  add("iPod", "Generation", d.generation);
  add("iPod", "Model number", d.modelNumber);
  if (d.capacityGb > 0) { char t[32]; snprintf(t, sizeof t, "%g GB", d.capacityGb); add("iPod", "Capacity", t); }
  add("iPod", "Serial number", d.serial);
  add("iPod", "FireWire GUID", d.firewireGuid);
  add("iPod", "Firmware", d.firmware);
  add("iPod", "Build", plistKey(ext, "BuildID"));
  add("iPod", "Family", plistKey(ext, "FamilyID"));
  add("iPod", "Updater family", plistKey(ext, "UpdaterFamilyID"));
  add("iPod", "Database checksum", d.checksum);
  if (d.usbProduct) { char t[16]; snprintf(t, sizeof t, "0x%04x", d.usbProduct); add("iPod", "USB product", t); }

  // storage, and what each kind of media takes on it
  std::map<std::string, double> bytesOf;
  std::map<std::string, int> countOf;
  std::set<std::string> albums, artists, genres;
  double seconds = 0, music = 0;
  int withArt = 0, unplayed = 0;
  for (GList* l = DB->tracks; l; l = l->next) {
    Itdb_Track* t = (Itdb_Track*)l->data;
    std::string kind = mediaName(t->mediatype);
    bytesOf[kind] += t->size;
    countOf[kind]++;
    music += t->size;
    seconds += t->tracklen / 1000.0;
    std::string artist = s(t->albumartist && *t->albumartist ? t->albumartist : t->artist);
    if (t->album && *t->album) albums.insert(artist + "\x1f" + s(t->album));
    if (t->artist && *t->artist) artists.insert(s(t->artist));
    if (t->genre && *t->genre) genres.insert(s(t->genre));
    withArt += itdb_track_has_thumbnails(t) ? 1 : 0;
    unplayed += t->playcount == 0 ? 1 : 0;
  }
  add("Storage", "Capacity", human(d.totalBytes));
  add("Storage", "Used", human(d.totalBytes - d.freeBytes));
  add("Storage", "Free", human(d.freeBytes));
  for (const auto& [kind, b] : bytesOf) {
    std::string n = kind;
    n[0] = (char)toupper(n[0]);
    add("Storage", n, human(b) + " (" + std::to_string(countOf[kind]) + ")");
  }
  double other = d.totalBytes - d.freeBytes - music;
  if (other > 0) add("Storage", "Other", human(other));
  add("Storage", "File system", fsType(mp_));
  add("Storage", "Mounted at", mp_);
  add("Storage", "Read-only", d.readOnly ? "yes" : "no");

  int user = 0, smart = 0;
  for (GList* l = DB->playlists; l; l = l->next) {
    Itdb_Playlist* p = (Itdb_Playlist*)l->data;
    if (itdb_playlist_is_mpl(p)) continue;
    (p->is_spl ? smart : user)++;
  }
  char t[64];
  add("Library", "Tracks", std::to_string(g_list_length(DB->tracks)));
  add("Library", "Albums", std::to_string(albums.size()));
  add("Library", "Artists", std::to_string(artists.size()));
  add("Library", "Genres", std::to_string(genres.size()));
  add("Library", "Playlists", std::to_string(user));
  if (smart) add("Library", "Smart playlists", std::to_string(smart));
  snprintf(t, sizeof t, "%d days %d h %02d min", (int)(seconds / 86400), (int)fmod(seconds / 3600, 24), (int)fmod(seconds / 60, 60));
  add("Library", "Playing time", seconds >= 86400 ? t : (snprintf(t, sizeof t, "%d h %02d min", (int)(seconds / 3600), (int)fmod(seconds / 60, 60)), t));
  add("Library", "Music size", human(music));
  add("Library", "With artwork", std::to_string(withArt));
  add("Library", "Never played", std::to_string(unplayed));
  add("Library", "Database version", std::to_string(DB->version));
  struct stat st;
  if (stat((ipc / "iTunes" / "iTunesDB").c_str(), &st) == 0) {
    add("Library", "Database size", human((double)st.st_size));
    struct tm tm;
    localtime_r(&st.st_mtime, &tm);
    strftime(t, sizeof t, "%Y-%m-%d %H:%M", &tm);
    add("Library", "Last written", t);
  }
  add("Library", "Restore points", std::to_string(snapshots().size()));

  // artwork: the sizes the iPod stores
  if (char* f = zn_ipod_art_formats(mp_.c_str())) {
    std::string text = f;
    g_free(f);
    size_t at = 0;
    while (at < text.size()) {
      size_t nl = text.find('\n', at);
      std::string line = text.substr(at, nl - at);
      at = nl == std::string::npos ? text.size() : nl + 1;
      char kind[16], fmt[64];
      int id, w, h;
      if (sscanf(line.c_str(), "%15[^\t]\t%d\t%d\t%d\t%63[^\n]", kind, &id, &w, &h, fmt) != 5) continue;
      std::string k = kind;
      k[0] = (char)toupper(k[0]);
      snprintf(t, sizeof t, "%d x %d, %s", w, h, fmt);
      add("Artwork", k + " " + std::to_string(id), t);
    }
  }
  if (stat((ipc / "Artwork" / "ArtworkDB").c_str(), &st) == 0) add("Artwork", "Stored covers", human(treeBytes(ipc / "Artwork")));

  // every key of SysInfoExtended, as the iPod gives it
  if (ext) {
    add("SysInfoExtended", "Source", plistKey(ext, "ZincGenerated") == "yes" ? "written by Zinc (no USB answer)" : "read from the iPod");
    std::vector<std::pair<std::string, std::string>> keys;
    plist_dict_iter it = nullptr;
    plist_dict_new_iter(ext, &it);
    for (;;) {
      char* k = nullptr;
      plist_t val = nullptr;
      plist_dict_next_item(ext, it, &k, &val);
      if (!k) break;
      keys.push_back({k, plistText(val)});
      free(k);
    }
    free(it);
    std::sort(keys.begin(), keys.end());
    for (auto& [k, val] : keys) if (k != "ZincGenerated") add("SysInfoExtended", k, val);
    plist_free(ext);
  }
  return v;
}

namespace {
/** A pixbuf as RGBA pixels; frees it. */
void toPicture(GdkPixbuf* p, Picture& out) {
  int w = gdk_pixbuf_get_width(p), h = gdk_pixbuf_get_height(p), ch = gdk_pixbuf_get_n_channels(p), stride = gdk_pixbuf_get_rowstride(p);
  const guchar* px = gdk_pixbuf_get_pixels(p);
  out.width = w;
  out.height = h;
  out.rgba.resize((size_t)w * h * 4);
  for (int y = 0; y < h; y++)
    for (int x = 0; x < w; x++) {
      const guchar* sp = px + (size_t)y * stride + (size_t)x * ch;
      uint8_t* dp = &out.rgba[((size_t)y * w + x) * 4];
      dp[0] = sp[0]; dp[1] = sp[1]; dp[2] = sp[2]; dp[3] = ch == 4 ? sp[3] : 255;
    }
  g_object_unref(p);
}
}  // namespace

bool Library::artwork(const std::string& id, int32_t size, Picture& out, std::string& err) {
  out = Picture{};
  if (!db_) { err = "no iPod is open"; return false; }
  Itdb_Track* t = findTrack(DB, id);
  if (!t) { err = "no track " + id; return false; }
  if (!itdb_track_has_thumbnails(t)) return true;
  int32_t want = size > 0 ? std::min<int32_t>(size, 1024) : -1;
  GdkPixbuf* p = (GdkPixbuf*)itdb_track_get_thumbnail(t, want, want);
  if (p) toPicture(p, out);
  return true;
}

#define PHOTOS static_cast<Itdb_PhotoDB*>(photos_)

std::vector<PhotoAlbum> Library::photoAlbums(std::string& err) {
  std::vector<PhotoAlbum> v;
  if (!photosRead_) {
    photosRead_ = true;
    GError* e = nullptr;
    photos_ = itdb_photodb_parse(mp_.c_str(), &e);   // NULL with no error: the iPod holds no photos
    if (e) { err = e->message; g_error_free(e); return v; }
  }
  if (!photos_) return v;
  int n = 0;
  for (GList* l = PHOTOS->photoalbums; l; l = l->next, n++) {
    Itdb_PhotoAlbum* a = (Itdb_PhotoAlbum*)l->data;
    PhotoAlbum o;
    o.id = std::to_string(n);
    o.name = a->name ? a->name : "";
    o.master = a->album_type == 1;
    for (GList* m = a->members; m; m = m->next) o.photoIds.push_back(hexId(((Itdb_Artwork*)m->data)->id));
    v.push_back(std::move(o));
  }
  return v;
}

bool Library::photo(const std::string& id, int32_t size, Picture& out, std::string& err) {
  out = Picture{};
  if (!db_) { err = "no iPod is open"; return false; }
  if (!photosRead_ && (photoAlbums(err), !err.empty())) return false;
  Itdb_Artwork* a = nullptr;
  for (GList* l = photos_ ? PHOTOS->photos : nullptr; l && !a; l = l->next)
    if (hexId(((Itdb_Artwork*)l->data)->id) == id) a = (Itdb_Artwork*)l->data;
  if (!a) { err = "no photo " + id; return false; }
  GdkPixbuf* p = (GdkPixbuf*)zn_ipod_photo_pixbuf(PHOTOS->device, a->thumbnail);   // scaled below keeping its shape
  if (!p) return true;
  int w = gdk_pixbuf_get_width(p), h = gdk_pixbuf_get_height(p), big = std::max(w, h);
  if (size > 0 && big > size) {
    GdkPixbuf* s = gdk_pixbuf_scale_simple(p, std::max(1, w * size / big), std::max(1, h * size / big), GDK_INTERP_BILINEAR);
    g_object_unref(p);
    p = s;
  }
  toPicture(p, out);
  return true;
}

std::vector<Extra> Library::extras() {
  std::vector<Extra> v;
  static const std::pair<const char*, const char*> kinds[] = {{"Notes", "note"}, {"Contacts", "contact"}, {"Calendars", "calendar"}, {"Recordings", "recording"}};
  for (auto& [dir, kind] : kinds) {
    std::error_code ec;
    size_t first = v.size();
    for (fs::recursive_directory_iterator it(fs::path(mp_) / dir, ec), end; !ec && it != end; it.increment(ec)) {
      const std::string name = it->path().filename().string();
      if (!it->is_regular_file(ec) || name.empty() || name[0] == '.') continue;
      struct stat st{};
      if (stat(it->path().c_str(), &st) != 0) continue;
      Extra x;
      x.kind = kind;
      x.name = fs::relative(it->path(), fs::path(mp_) / dir, ec).string();
      x.path = it->path().string();
      x.bytes = (double)st.st_size;
      x.modified = (double)st.st_mtime;
      v.push_back(std::move(x));
    }
    std::sort(v.begin() + first, v.end(), [](const Extra& a, const Extra& b) { return a.name < b.name; });
  }
  return v;
}

std::vector<DownloadResult> Library::download(const std::vector<std::string>& ids, const std::string& dir, const Progress& progress, std::string& err) {
  std::vector<DownloadResult> out;
  if (!db_) { err = "no iPod is open"; return out; }
  if (dir.empty()) { err = "no folder to download to"; return out; }
  int32_t i = 0;
  for (const std::string& id : ids) {
    DownloadResult r;
    r.id = id;
    r.skipped = false;
    ++i;
    Itdb_Track* t = findTrack(DB, id);
    if (!t || !t->ipod_path) r.error = "no track " + id + " on the iPod";
    else {
      Track tr = toTrack(t);
      fs::path from = fs::path(mp_) / tr.path;
      std::string ext = from.extension().string();
      for (char& c : ext) c = (char)tolower((unsigned char)c);
      // Artist/Album/NN Title.ext, as iTunes lays out its music folder ("D-NN" on an album of several discs)
      std::string artist = safeName(!tr.albumArtist.empty() ? tr.albumArtist : tr.artist, "Unknown Artist");
      std::string album = safeName(tr.album, "Unknown Album");
      char nr[16] = "";
      if (tr.trackNr > 0 && tr.cds > 1 && tr.cdNr > 0) snprintf(nr, sizeof nr, "%d-%02d ", tr.cdNr, tr.trackNr);
      else if (tr.trackNr > 0) snprintf(nr, sizeof nr, "%02d ", tr.trackNr);
      fs::path to = fs::path(dir) / artist / album / (nr + safeName(tr.title, "Untitled") + ext);
      r.file = to.string();
      std::error_code ec, e2;
      auto size = fs::file_size(from, ec);
      if (ec) r.error = tr.path + ": the file is not on the iPod";
      else if (fs::exists(to, e2) && fs::file_size(to, e2) == size) r.skipped = true;
      else if (!fs::create_directories(to.parent_path(), e2) && e2) r.error = to.parent_path().string() + ": " + e2.message();
      else copyFile(from.string(), r.file, progress, to.filename().string(), r.error);
    }
    out.push_back(r);
    if (progress) progress("download", i, (int32_t)ids.size(), r.file);
  }
  return out;
}

Check Library::check() {
  Check c;
  if (!db_) return c;
  std::set<std::string> used;
  for (GList* l = DB->tracks; l; l = l->next) {
    Itdb_Track* t = (Itdb_Track*)l->data;
    gchar* f = itdb_filename_on_ipod(t);
    if (!f) c.missing.push_back(hexId(t->dbid));
    else { used.insert(fs::path(f).lexically_normal().string()); g_free(f); }
  }
  std::error_code ec;
  fs::path music = fs::path(mp_) / "iPod_Control" / "Music";
  for (auto it = fs::recursive_directory_iterator(music, ec); !ec && it != fs::recursive_directory_iterator(); it.increment(ec)) {
    if (!it->is_regular_file(ec) || it->path().filename().string()[0] == '.') continue;
    if (used.count(it->path().lexically_normal().string())) continue;
    c.orphans.push_back(fs::relative(it->path(), mp_).string());
    c.orphanBytes += (double)it->file_size(ec);
  }
  return c;
}

bool Library::repair(Check& after, const Progress& progress, std::string& err) {
  if (!writable(err, progress)) return false;
  Check c = check();
  for (const std::string& id : c.missing)
    if (Itdb_Track* t = findTrack(DB, id)) dropTrack(DB, t, true);
  for (const std::string& o : c.orphans) unlink((fs::path(mp_) / o).c_str());
  if (!save(progress, err)) return false;
  after = check();
  return true;
}

// ---------------------------------------------------------------- the duplicate finder (ipod_optimise.cpp) and the merge
namespace {

/** The format shown in a group and whether it loses nothing: from the file's extension, and for an .m4a the database's file type or
 *  a bitrate no AAC reaches (ALAC). */
void formatOf(Itdb_Track* t, const std::string& path, std::string& format, bool& lossless) {
  std::string ext = fs::path(path).extension().string();
  for (char& c : ext) c = (char)toupper((unsigned char)c);
  if (!ext.empty()) ext.erase(0, 1);
  bool alac = (t->filetype && strstr(t->filetype, "ossless")) || (ext == "M4A" && t->bitrate >= 400);
  lossless = alac || ext == "WAV" || ext == "AIF" || ext == "AIFF";
  format = alac ? "ALAC" : ext == "M4A" || ext == "M4B" || ext == "M4P" ? "AAC" : ext == "AIF" ? "AIFF" : ext;
}

/** XXH3-128 of a file, as hex; '' when it cannot be read. */
std::string fileHash(const std::string& file) {
  int fd = ::open(file.c_str(), O_RDONLY);
  if (fd < 0) return "";
  XXH3_state_t* st = XXH3_createState();
  XXH3_128bits_reset(st);
  std::vector<char> buf(1 << 20);
  ssize_t n;
  while ((n = ::read(fd, buf.data(), buf.size())) > 0) XXH3_128bits_update(st, buf.data(), (size_t)n);
  ::close(fd);
  XXH128_hash_t h = XXH3_128bits_digest(st);
  XXH3_freeState(st);
  if (n < 0) return "";
  char hex[33];
  snprintf(hex, sizeof hex, "%016" PRIx64 "%016" PRIx64, (uint64_t)h.high64, (uint64_t)h.low64);
  return hex;
}

bool audible(const std::string& media) { return media == "audio" || media == "podcast" || media == "audiobook"; }

/** "Title — Artist · MP3 · 4.1 MB": a track as the analysis's progress names it. */
std::string named(const Copy& c) {
  std::string out = c.t.title.empty() ? c.t.path : c.t.title;
  if (!c.t.artist.empty()) out += " — " + c.t.artist;
  return out + " · " + (c.format.empty() ? std::string("?") : c.format) + " · " + mb(c.t.size);
}

}  // namespace

/** A cache of the analysis on the computer ("key\tvalue" lines): file hashes and fingerprints, keyed by "id size mtime" of the file. */
static std::map<std::string, std::string> readCache(const fs::path& file) {
  std::map<std::string, std::string> cache;
  if (FILE* f = fopen(file.c_str(), "r")) {
    char line[8192];
    while (fgets(line, sizeof line, f)) {
      std::string s = line;
      while (!s.empty() && (s.back() == '\n' || s.back() == '\r')) s.pop_back();
      size_t tab = s.find('\t');
      if (tab != std::string::npos) cache[s.substr(0, tab)] = s.substr(tab + 1);
    }
    fclose(f);
  }
  return cache;
}
/** Writes `kept` over the cache file when it differs from what was read: the cache is on the computer, the iPod is only read. */
static void writeCache(const fs::path& file, const std::map<std::string, std::string>& kept, const std::map<std::string, std::string>& read) {
  if (kept == read) return;
  std::error_code ec;
  fs::create_directories(file.parent_path(), ec);
  std::string text;
  for (const auto& [key, v] : kept) text += key + "\t" + v + "\n";
  g_file_set_contents(file.c_str(), text.data(), (gssize)text.size(), nullptr);   // best effort: a full disk costs the next read
}
/** "id size mtime" of a track's file; '' when the file is missing. */
static std::string fileKey(const Copy& c, const std::string& file) {
  struct stat st;
  if (stat(file.c_str(), &st) != 0) return "";
  return c.t.id + " " + std::to_string((long long)st.st_size) + " " + std::to_string((long long)st.st_mtime);
}

Analysis Library::analyze(bool fingerprints, const Progress& progress, std::string& err) {
  Analysis a;
  if (!db_) { err = "no iPod is open"; return a; }
  std::vector<Copy> copies;
  std::vector<std::string> files;   // absolute, per copy
  for (GList* l = DB->tracks; l; l = l->next) {
    Itdb_Track* t = (Itdb_Track*)l->data;
    Copy c;
    c.t = toTrack(t);
    formatOf(t, c.t.path, c.format, c.lossless);
    files.push_back((fs::path(mp_) / c.t.path).string());
    copies.push_back(std::move(c));
  }
  const size_t n = copies.size();
  if (progress) progress("read", (int32_t)n, (int32_t)n, std::to_string(n) + " tracks in the database");
  Device d;
  std::string why;
  describe(mp_, d, why);
  const fs::path cacheDir = fs::path(backupRoot()) / folderKey(d);

  // identical files: a content hash for the files whose size another file of the same kind shares
  std::map<std::string, int> sizes;
  for (const Copy& c : copies) sizes[c.t.mediaType + '\x1f' + std::to_string((long long)c.t.size)]++;
  std::vector<size_t> toHash;
  for (size_t i = 0; i < n; i++) if (!copies[i].t.path.empty() && sizes[copies[i].t.mediaType + '\x1f' + std::to_string((long long)copies[i].t.size)] > 1) toHash.push_back(i);
  if (progress) progress("hash", 0, (int32_t)toHash.size(), std::to_string(toHash.size()) + " files share their size with another: their content is compared (XXH3)");
  {
    const std::map<std::string, std::string> cache = readCache(cacheDir / "hashes.txt");
    std::map<std::string, std::string> kept;
    for (size_t k = 0; k < toHash.size(); k++) {
      Copy& c = copies[toHash[k]];
      const std::string key = fileKey(c, files[toHash[k]]);
      auto hit = key.empty() ? cache.end() : cache.find(key);
      const bool cached = hit != cache.end();
      c.hash = cached ? hit->second : key.empty() ? std::string() : fileHash(files[toHash[k]]);
      if (!key.empty() && !c.hash.empty()) kept[key] = c.hash;
      if (progress) progress("hash", (int32_t)k + 1, (int32_t)toHash.size(), named(c) + " · " + c.t.path + (c.hash.empty() ? " · unreadable" : " · " + c.hash.substr(0, 12) + (cached ? " (cache)" : "")));
    }
    writeCache(cacheDir / "hashes.txt", kept, cache);
  }

  // audio fingerprints: for the songs, podcasts and audiobooks that have another of their kind of a close duration; from the cache when
  // the track's file is the one fingerprinted (same size and time), else decoded now
  if (fingerprints) {
    std::vector<size_t> want;
    std::vector<size_t> order;
    for (size_t i = 0; i < n; i++) if (audible(copies[i].t.mediaType) && !copies[i].t.path.empty()) order.push_back(i);
    std::sort(order.begin(), order.end(), [&](size_t x, size_t y) { return copies[x].t.durationMs < copies[y].t.durationMs; });
    std::vector<bool> near(n, false);
    for (size_t x = 0; x < order.size(); x++)
      for (size_t y = x + 1; y < order.size() && copies[order[y]].t.durationMs - copies[order[x]].t.durationMs <= kAudioDurationMs; y++)
        if (copies[order[x]].t.mediaType == copies[order[y]].t.mediaType) near[order[x]] = near[order[y]] = true;
    for (size_t i = 0; i < n; i++) if (near[i]) want.push_back(i);
    if (progress) progress("fingerprint", 0, (int32_t)want.size(), std::to_string(want.size()) + " songs, podcasts and audiobooks have another of a length within 2 s: their sound is compared (Chromaprint, first 30 s)");

    const fs::path cacheFile = cacheDir / "fingerprints.txt";
    const std::map<std::string, std::string> cache = readCache(cacheFile);   // "id size mtime" -> the encoded fingerprint, "-" for a file that gave none
    std::map<std::string, std::string> kept;   // what the cache holds after: the tracks of this analysis only
    for (size_t k = 0; k < want.size(); k++) {
      Copy& c = copies[want[k]];
      const std::string key = fileKey(c, files[want[k]]);
      if (key.empty()) {
        a.noFingerprint++;
        if (progress) progress("fingerprint", (int32_t)k + 1, (int32_t)want.size(), named(c) + " · its file is missing (" + c.t.path + ")");
        continue;
      }
      auto hit = cache.find(key);
      const bool cached = hit != cache.end();
      std::string reason;
      if (cached) c.fp = hit->second == "-" ? std::vector<uint32_t>() : decodeFingerprint(hit->second);
      else c.fp = fingerprint(files[want[k]], reason);
      if (c.fp.empty()) a.noFingerprint++;
      else if (cached) a.fromCache++;
      else a.fingerprinted++;
      kept[key] = c.fp.empty() ? "-" : encodeFingerprint(c.fp);
      if (progress) progress("fingerprint", (int32_t)k + 1, (int32_t)want.size(), named(c) + " · " +
        (c.fp.empty() ? "no fingerprint" + (reason.empty() ? std::string(cached ? " (cache)" : "") : ": " + reason) : cached ? "fingerprint from the cache" : "decoded and fingerprinted"));
    }
    writeCache(cacheFile, kept, cache);
  }

  a.groups = groupDuplicates(copies);
  if (progress) {
    std::map<std::string, const Copy*> byId;
    for (const Copy& c : copies) byId[c.t.id] = &c;
    for (size_t g = 0; g < a.groups.size(); g++) {
      const DuplicateGroup& dg = a.groups[g];
      std::string why, list;
      for (const std::string& r : dg.reasons) why += (why.empty() ? "" : "+") + r;
      for (size_t k = 0; k < dg.trackIds.size(); k++) {
        auto it = byId.find(dg.trackIds[k]);
        list += std::string(k == 0 ? " · keep " : " · drop ") + (it != byId.end() ? named(*it->second) : dg.trackIds[k]);
      }
      progress("group", (int32_t)g + 1, (int32_t)a.groups.size(), "same " + why + list + (dg.keepWhy.empty() ? "" : " (" + dg.keepWhy + ")"));
    }
  }
  for (const Copy& c : copies) {
    if (c.t.mediaType != "audio") continue;
    if (!c.t.artwork) a.noArtwork.push_back(c.t.id);
    if (c.t.title.empty() || c.t.artist.empty() || c.t.album.empty()) a.missingTags.push_back(c.t.id);
  }
  if (progress) progress("check", 0, 1, "looking for tracks without a file and files no track uses");
  Check ck = check();
  if (progress) progress("check", 1, 1, std::to_string(ck.missing.size()) + " tracks without a file, " + std::to_string(ck.orphans.size()) + " files no track uses (" + mb(ck.orphanBytes) + ")");
  a.missing = ck.missing;
  a.orphans = ck.orphans;
  a.orphanBytes = ck.orphanBytes;
  for (GList* l = DB->playlists; l; l = l->next) {
    Itdb_Playlist* p = (Itdb_Playlist*)l->data;
    if (!itdb_playlist_is_mpl(p) && !p->is_spl && !p->members) a.emptyPlaylists.push_back(hexId(p->id));
  }
  return a;
}

namespace {
/** Gives `keep` what it lacks of `other`: text tags, numbers and the cover. The names of the fields taken go to `filled`. */
void fillFrom(Itdb_Track* keep, Itdb_Track* other, std::vector<std::string>& filled) {
  auto text = [&](gchar*& k, gchar* o, const char* name) {
    if ((!k || !*k) && o && *o) { setStr(k, o); filled.push_back(name); }
  };
  text(keep->title, other->title, "title");
  text(keep->artist, other->artist, "artist");
  text(keep->album, other->album, "album");
  text(keep->albumartist, other->albumartist, "album artist");
  text(keep->genre, other->genre, "genre");
  text(keep->composer, other->composer, "composer");
  text(keep->comment, other->comment, "comment");
  auto num = [&](gint32& k, gint32 o, const char* name) { if (k <= 0 && o > 0) { k = o; filled.push_back(name); } };
  num(keep->track_nr, other->track_nr, "track number");
  num(keep->tracks, other->tracks, "track count");
  num(keep->cd_nr, other->cd_nr, "disc number");
  num(keep->cds, other->cds, "disc count");
  num(keep->year, other->year, "year");
  if (!itdb_track_has_thumbnails(keep) && itdb_track_has_thumbnails(other)) {
    GdkPixbuf* p = (GdkPixbuf*)itdb_track_get_thumbnail(other, -1, -1);   // its largest stored size
    if (p) {
      int len = 0;
      unsigned char* png = stbi_write_png_to_mem(gdk_pixbuf_get_pixels(p), gdk_pixbuf_get_rowstride(p), gdk_pixbuf_get_width(p), gdk_pixbuf_get_height(p), gdk_pixbuf_get_n_channels(p), &len);
      if (png && itdb_track_set_thumbnails_from_data(keep, png, (gsize)len)) filled.push_back("cover");
      free(png);
      g_object_unref(p);
    }
  }
}
}  // namespace

std::vector<MergeResult> Library::merge(const std::vector<MergeGroup>& groups, const Progress& progress, std::string& err) {
  std::vector<MergeResult> out;
  if (!writable(err, progress)) return out;   // the session's restore point comes first
  // the files of the tracks that stay: a removed copy that points to one of them (a database with two entries for a file) loses its
  // entry, never the file
  std::set<std::string> removing;
  for (const MergeGroup& g : groups) for (const std::string& r : g.remove) if (r != g.keep) removing.insert(r);
  std::set<std::string> keptFiles;
  for (GList* l = DB->tracks; l; l = l->next) {
    Itdb_Track* t = (Itdb_Track*)l->data;
    if (removing.count(hexId(t->dbid)) || !t->ipod_path) continue;
    keptFiles.insert(t->ipod_path);
  }
  int32_t i = 0;
  std::set<std::string> done;
  for (const MergeGroup& g : groups) {
    MergeResult r;
    r.keep = g.keep;
    r.freedBytes = 0;
    r.playlistPlaces = 0;
    Itdb_Track* keep = findTrack(DB, g.keep);
    std::vector<Itdb_Track*> others;
    if (!keep) r.error = "no track " + g.keep;
    else if (done.count(g.keep)) r.error = "the track " + g.keep + " is in two groups";
    for (const std::string& id : g.remove) {
      if (!r.error.empty() || id == g.keep) continue;
      Itdb_Track* t = findTrack(DB, id);
      if (!t) r.error = "no track " + id;
      else if (done.count(id)) r.error = "the track " + id + " is in two groups";
      else others.push_back(t);
    }
    if (!r.error.empty() || others.empty()) {
      if (r.error.empty()) r.error = "nothing to merge into " + g.keep;
      r.playCount = keep ? (int32_t)keep->playcount : 0;
      out.push_back(r);
      continue;
    }
    for (Itdb_Track* o : others) {
      fillFrom(keep, o, r.filled);
      keep->playcount += o->playcount;
      keep->skipcount += o->skipcount;
      keep->rating = std::max(keep->rating, o->rating);
      keep->time_played = std::max(keep->time_played, o->time_played);
      if (o->time_added > 0 && (keep->time_added == 0 || o->time_added < keep->time_added)) keep->time_added = o->time_added;
      // its places in the playlists go to the kept track (unless it is there already)
      for (GList* l = DB->playlists; l; l = l->next) {
        Itdb_Playlist* p = (Itdb_Playlist*)l->data;
        if (itdb_playlist_is_mpl(p) || p->is_spl) continue;
        gint at = g_list_index(p->members, o);
        if (at < 0) continue;
        while (itdb_playlist_contains_track(p, o)) itdb_playlist_remove_track(p, o);
        if (!itdb_playlist_contains_track(p, keep)) { itdb_playlist_add_track(p, keep, at); r.playlistPlaces++; }
      }
      const bool shared = o->ipod_path && keptFiles.count(o->ipod_path);
      r.removed.push_back(hexId(o->dbid));
      if (!shared) r.freedBytes += o->size;
      done.insert(hexId(o->dbid));
      dropTrack(DB, o, shared);
    }
    std::sort(r.filled.begin(), r.filled.end());
    r.filled.erase(std::unique(r.filled.begin(), r.filled.end()), r.filled.end());
    r.playCount = (int32_t)keep->playcount;
    done.insert(g.keep);
    out.push_back(r);
    if (progress) progress("merge", ++i, (int32_t)groups.size(), s(keep->title));
  }
  if (!save(progress, err)) return out;
  return out;
}

std::string backupRoot() {
  if (const char* r = getenv("ZINC_IPOD_BACKUPS")) if (*r) return r;
  if (const char* z = getenv("ZINC_HOME")) if (*z) return (fs::path(z) / "ipod").string();
  const char* h = getenv("HOME");
  return (fs::path(h ? h : ".") / ".zinc" / "ipod").string();
}

std::vector<Backup> backups(const std::string& dir) {
  std::vector<Backup> v;
  fs::path root = dir.empty() ? fs::path(backupRoot()) : fs::path(dir);
  std::error_code ec;
  auto look = [&](const fs::path& d) {
    std::error_code e2;
    for (auto& e : fs::directory_iterator(d, e2)) {
      Backup b;
      if (e.is_directory(e2) && readManifest(e.path(), b)) v.push_back(b);
    }
  };
  look(root);   // a folder of one iPod's backups
  for (auto& e : fs::directory_iterator(root, ec)) if (e.is_directory(ec) && e.path().filename() != "Music") look(e.path());   // the iPods' folders
  std::sort(v.begin(), v.end(), [](const Backup& a, const Backup& b) { return a.created != b.created ? a.created > b.created : a.folder > b.folder; });
  return v;
}

bool deleteBackup(const std::string& folder, std::string& err) {
  std::error_code ec, e2;
  fs::path root = fs::weakly_canonical(backupRoot(), ec), f = fs::weakly_canonical(folder, e2);
  if (ec || e2 || !present(f)) { err = folder + ": no such backup"; return false; }
  auto rel = f.lexically_relative(root);
  // inside the backup place, at most <iPod>/<date> deep, and a backup (its manifest): never the root, an iPod's folder or its Music
  if (rel.empty() || rel.native()[0] == '.' || std::distance(rel.begin(), rel.end()) > 2 || f.filename() == "Music") {
    err = folder + " is not a backup of " + root.string() + ": refused";
    return false;
  }
  Backup b;
  if (!readManifest(f, b)) { err = folder + " is not a backup (no Info.plist): refused"; return false; }
  fs::remove_all(f, ec);
  if (ec) { err = folder + ": " + ec.message(); return false; }
  return true;
}

std::string safeName(const std::string& name, const std::string& fallback) {
  std::string s;
  for (unsigned char c : name) s += (c < 0x20 || c == 0x7f || strchr("/\\:*?\"<>|", c)) ? '_' : (char)c;
  size_t a = s.find_first_not_of(" ."), b = s.find_last_not_of(" .");
  s = a == std::string::npos ? "" : s.substr(a, b - a + 1);
  if (s.size() > 120) {   // cut before a UTF-8 continuation byte, never inside a character
    size_t n = 120;
    while (n > 0 && ((unsigned char)s[n] & 0xc0) == 0x80) n--;
    s.resize(n);
    while (!s.empty() && (s.back() == ' ' || s.back() == '.')) s.pop_back();
  }
  return s.empty() ? fallback : s;
}

bool restoreBackup(const std::string& folder, const std::string& mp, const Progress& progress, std::string& err) {
  fs::path from = fs::path(folder) / "iPod_Control", to = fs::path(mp) / "iPod_Control";
  if (!present(from / "iTunes")) { err = folder + " is not an iPod backup (no iPod_Control/iTunes)"; return false; }
  if (space(mp).readOnly) { err = mp + " is mounted read-only"; return false; }
  if (!present(to)) { err = mp + " is not an iPod"; return false; }
  // the music: in the backup (an older layout) or in the Music folder its iPod's backups share; only what the iPod lacks is copied
  fs::path music = present(from / "Music") ? from / "Music" : fs::path(folder).parent_path() / "Music";
  if (present(music)) {
    double need = 0;
    std::error_code ec;
    for (auto it = fs::recursive_directory_iterator(music, ec); !ec && it != fs::recursive_directory_iterator(); it.increment(ec)) {
      if (!it->is_regular_file(ec)) continue;
      std::error_code e2;
      fs::path dst = to / "Music" / fs::relative(it->path(), music);
      if (!fs::exists(dst, e2) || fs::file_size(dst, e2) != it->file_size(ec)) need += (double)it->file_size(ec);
    }
    Space sp = space(mp);
    if (sp.ok && need + kReserve > sp.free) { err = "not enough space on the iPod to restore the music: " + mb(need + kReserve) + " needed, " + mb(sp.free) + " free"; return false; }
  }
  for (const char* sub : {"iTunes", "Artwork"})   // never Device: it describes this iPod, which may not be the one backed up
    if (!copyTree(from / sub, to / sub, "", progress, "restore", err)) return false;
  if (present(music) && !syncTree(music, to / "Music", progress, "restore", err)) return false;
  sync();
  return true;
}

bool mount(const std::string& device, std::string& err) {
  if (device.find_first_not_of("abcdefghijklmnopqrstuvwxyz0123456789") != std::string::npos) { err = device + " is not a disk name (e.g. disk4)"; return false; }
#ifdef __APPLE__
  if (!device.empty()) return run({"diskutil", "mountDisk", device}, err);
  auto capture = [](const std::string& cmd) {   // fixed commands: the only variable part is a disk name diskutil printed
    std::string out;
    if (FILE* p = popen(cmd.c_str(), "r")) { char b[4096]; size_t n; while ((n = fread(b, 1, sizeof b, p)) > 0) out.append(b, n); pclose(p); }
    return out;
  };
  bool found = false, ok = true;
  auto scan = [&]() {   // mounts every whole external disk whose media is an iPod
    plist_t list = plistFromXml(capture("diskutil list -plist external physical"));
    plist_t disks = list ? plist_dict_get_item(list, "WholeDisks") : nullptr;
    for (uint32_t i = 0; disks && i < plist_array_get_size(disks); i++) {
      std::string d = plistText(plist_array_get_item(disks, i));
      if (d.empty() || d.find_first_not_of("abcdefghijklmnopqrstuvwxyz0123456789") != std::string::npos) continue;
      plist_t info = plistFromXml(capture("diskutil info -plist " + d));
      bool pod = (plistKey(info, "MediaName") + " " + plistKey(info, "IORegistryEntryName")).find("iPod") != std::string::npos;
      if (info) plist_free(info);
      if (!pod) continue;
      found = true;
      ok = run({"diskutil", "mountDisk", d}, err) && ok;
    }
    if (list) plist_free(list);
  };
  scan();
  // an iPod ejected here stays on USB without a disk ("OK to disconnect"): a USB reset brings the disk back, as plugging it in again does
  if (!found && resetUsbIpods() > 0)
    for (int k = 0; k < 30 && !found; k++) { usleep(500000); scan(); }
  if (!found) { err = "no iPod disk to mount: unplug the iPod and plug it in again (an ejected iPod offers its disk again then), or put it in disk mode"; return false; }
  return ok;
#else
  if (device.empty()) { err = "name the iPod's partition (e.g. sdb2), or mount it with the file manager"; return false; }
  return run({"udisksctl", "mount", "--block-device", "/dev/" + device}, err);
#endif
}

bool eject(const std::string& mp, std::string& err) {
  sync();
#ifdef __APPLE__
  return run({"diskutil", "eject", mp}, err);
#else
  std::string dev;   // the block device mounted there, from /proc/mounts
  if (FILE* f = fopen("/proc/mounts", "r")) {
    char a[512], b[512];
    while (fscanf(f, "%511s %511s %*[^\n]", a, b) == 2) if (mp == b) dev = a;
    fclose(f);
  }
  std::string why;
  if (!dev.empty() && run({"udisksctl", "unmount", "--block-device", dev}, why)) {
    run({"udisksctl", "power-off", "--block-device", dev}, why);   // best effort: the iPod shows "OK to disconnect"
    return true;
  }
  return run({"umount", mp}, err);
#endif
}

}  // namespace ipod
