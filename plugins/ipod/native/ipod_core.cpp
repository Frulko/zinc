// zinc:ipod core (see ipod_core.h): libgpod for the database, TagLib for the tags of the files added, libusb for
// SysInfoExtended, std::filesystem for copies, snapshots and backups. Runs on one thread at a time (the worker).
#include "ipod_core.h"

#include <itdb.h>
#include <libusb.h>
#include <taglib/taglib.h>
#include <taglib/fileref.h>
#include <taglib/tag.h>
#include <taglib/tpropertymap.h>

#include <algorithm>
#include <cerrno>
#include <cinttypes>
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
#include <sys/wait.h>
#include <unistd.h>

#define STB_IMAGE_WRITE_STATIC
#define STB_IMAGE_WRITE_IMPLEMENTATION
#include "stb_image_write.h"
#include "gdk-pixbuf/gdk-pixbuf.h"

extern char** environ;
// libgpod internals (itdb_device.h is C only): the FireWire GUID and the checksum the model needs (1 hash58, 2 hash72, 3 hashAB)
extern "C" const char* itdb_device_get_firewire_id(const Itdb_Device* device);
extern "C" int itdb_device_get_checksum_type(const Itdb_Device* device);
extern "C" char* zn_ipod_artwork_plist(const char* mountpoint);   // ipod_sysinfo.c
namespace fs = std::filesystem;

namespace ipod {
namespace {

constexpr const char* kSnapDir = "iPod_Control/iTunes/Zinc Snapshots";
constexpr int kKeepSnapshots = 5;
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
struct UsbIpod { std::string serial; std::string xml; };

/** Every Apple iPod on the USB bus (product 0x12xx), its serial and, when `withXml`, the SysInfoExtended it serves
 *  (vendor request 0x40, as libgpod's ipod-read-sysinfo-extended; a device request, so the mounted disk is untouched). */
std::vector<UsbIpod> usbIpods(bool withXml) {
  std::vector<UsbIpod> out;
  libusb_context* ctx = nullptr;
  if (libusb_init(&ctx) != 0) return out;
  libusb_device** list = nullptr;
  ssize_t n = libusb_get_device_list(ctx, &list);
  for (ssize_t i = 0; i < n; i++) {
    libusb_device_descriptor d;
    if (libusb_get_device_descriptor(list[i], &d) != 0 || d.idVendor != 0x05ac || (d.idProduct & 0xff00) != 0x1200) continue;
    libusb_device_handle* h = nullptr;
    if (libusb_open(list[i], &h) != 0) continue;
    UsbIpod u;
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
  if (const char* extra = getenv("ZINC_IPOD_ROOTS")) roots.insert(roots.begin(), extra);   // tests: a folder of fake iPods
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
  if (db_) itdb_free(DB);
  db_ = nullptr;
  mp_.clear();
}

bool Library::writable(std::string& err) {
  if (!db_) { err = "no iPod is open"; return false; }
  if (space(mp_).readOnly) { err = mp_ + " is mounted read-only (an HFS+ iPod on Linux mounts read-only: format it as FAT32 with iTunes or Finder to write to it)"; return false; }
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
  if (!writable(err)) return out;
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

bool Library::remove(const std::vector<std::string>& ids, std::string& err) {
  if (!writable(err)) return false;
  for (const std::string& id : ids) {
    Itdb_Track* t = findTrack(DB, id);
    if (!t) continue;
    gchar* f = itdb_filename_on_ipod(t);
    if (f) { unlink(f); g_free(f); }
    for (GList* l = DB->playlists; l; l = l->next) {
      Itdb_Playlist* p = (Itdb_Playlist*)l->data;
      while (itdb_playlist_contains_track(p, t)) itdb_playlist_remove_track(p, t);
    }
    itdb_track_remove(t);
  }
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
  if (!writable(err)) return false;
  // snapshot of what is on the iPod now, the last kKeepSnapshots kept
  fs::path ipc = fs::path(mp_) / "iPod_Control", snaps = fs::path(mp_) / kSnapDir, snap = snaps / stamp();
  if (hasDatabase(mp_)) {
    if (progress) progress("save", 0, 2, "snapshot");
    std::error_code ec;
    fs::create_directories(snap, ec);
    if (!copyTree(ipc / "iTunes", snap / "iTunes", "Zinc Snapshots", nullptr, "", err)) return false;
    if (!copyTree(ipc / "Artwork", snap / "Artwork", "", nullptr, "", err)) return false;
    std::vector<fs::path> all;
    for (auto& e : fs::directory_iterator(snaps, ec)) all.push_back(e.path());
    std::sort(all.begin(), all.end());
    for (size_t k = 0; k + kKeepSnapshots < all.size(); k++) fs::remove_all(all[k], ec);
  }
  if (progress) progress("save", 1, 2, "database");
  GError* e = nullptr;
  if (!itdb_write(DB, &e)) { err = takeErr(e, "writing the database"); return false; }
  sync();
  if (progress) progress("save", 2, 2, "");
  return true;
}

std::vector<Snapshot> Library::snapshots() {
  std::vector<Snapshot> v;
  std::error_code ec;
  for (auto& e : fs::directory_iterator(fs::path(mp_) / kSnapDir, ec)) {
    if (!e.is_directory()) continue;
    Snapshot sn;
    sn.id = e.path().filename().string();
    struct tm tm{};
    if (strptime(sn.id.c_str(), "%Y%m%d-%H%M%S", &tm)) { tm.tm_isdst = -1; sn.created = (double)mktime(&tm); }
    sn.bytes = treeBytes(e.path());
    v.push_back(sn);
  }
  std::sort(v.begin(), v.end(), [](const Snapshot& a, const Snapshot& b) { return a.id > b.id; });
  return v;
}

bool Library::restoreSnapshot(const std::string& id, std::string& err) {
  if (!writable(err)) return false;
  fs::path snap = fs::path(mp_) / kSnapDir / id;
  if (id.empty() || id.find('/') != std::string::npos || !present(snap / "iTunes")) { err = "no snapshot " + id; return false; }
  std::string mp = mp_;
  close();
  fs::path ipc = fs::path(mp) / "iPod_Control";
  if (!copyTree(snap / "iTunes", ipc / "iTunes", "", nullptr, "", err) || !copyTree(snap / "Artwork", ipc / "Artwork", "", nullptr, "", err)) return false;
  sync();
  return open(mp, false, "", "", err);
}

bool Library::backup(const std::string& dir, bool music, std::string& folder, const Progress& progress, std::string& err) {
  if (!db_) { err = "no iPod is open"; return false; }
  fs::path ipc = fs::path(mp_) / "iPod_Control";
  fs::path to = fs::path(dir) / (fs::path(mp_).filename().string() + " " + stamp());
  if (music) {
    double need = treeBytes(ipc) * 1.01;
    std::error_code ec;
    fs::create_directories(dir, ec);
    fs::space_info si = fs::space(dir, ec);
    if (!ec && (double)si.available < need) { err = "not enough space in " + dir + ": " + mb(need) + " needed, " + mb((double)si.available) + " free"; return false; }
  }
  for (const char* sub : {"iTunes", "Artwork", "Device"})
    if (!copyTree(ipc / sub, to / "iPod_Control" / sub, "Zinc Snapshots", progress, "backup", err)) return false;
  if (music && !copyTree(ipc / "Music", to / "iPod_Control" / "Music", "", progress, "backup", err)) return false;
  folder = to.string();
  return true;
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
  if (!writable(err)) return false;
  Check c = check();
  for (const std::string& id : c.missing) {
    Itdb_Track* t = findTrack(DB, id);
    if (!t) continue;
    for (GList* l = DB->playlists; l; l = l->next) while (itdb_playlist_contains_track((Itdb_Playlist*)l->data, t)) itdb_playlist_remove_track((Itdb_Playlist*)l->data, t);
    itdb_track_remove(t);
  }
  for (const std::string& o : c.orphans) unlink((fs::path(mp_) / o).c_str());
  if (!save(progress, err)) return false;
  after = check();
  return true;
}

bool restoreBackup(const std::string& folder, const std::string& mp, const Progress& progress, std::string& err) {
  fs::path from = fs::path(folder) / "iPod_Control";
  if (!present(from / "iTunes")) { err = folder + " is not an iPod backup (no iPod_Control/iTunes)"; return false; }
  if (space(mp).readOnly) { err = mp + " is mounted read-only"; return false; }
  if (!present(fs::path(mp) / "iPod_Control")) { err = mp + " is not an iPod"; return false; }
  if (present(from / "Music")) {
    double need = treeBytes(from / "Music") - treeBytes(fs::path(mp) / "iPod_Control" / "Music");
    Space sp = space(mp);
    if (sp.ok && need + kReserve > sp.free) { err = "not enough space on the iPod to restore the music: " + mb(need + kReserve) + " needed, " + mb(sp.free) + " free"; return false; }
  }
  for (const char* sub : {"iTunes", "Artwork", "Device", "Music"})
    if (!copyTree(from / sub, fs::path(mp) / "iPod_Control" / sub, "", progress, "restore", err)) return false;
  sync();
  return true;
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
