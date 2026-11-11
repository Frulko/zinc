#include "text/module.h"
#include "platform/platform.h"
#include "tc/tc.h"
#ifndef _WIN32
#include <dlfcn.h>
#endif
#include "assets/font.h"
#include <cstdlib>
#include <cstdio>
#include <filesystem>
#include <mutex>
#include <stdexcept>
namespace zn::text {
namespace {
enum class State { NotTried, Ready, Failed };
struct Loader {
  State state = State::NotTried;
  const Module* api = nullptr;
  std::string error, path, sha256;
  std::mutex mutex;
  void transition(State next) { if (state != State::NotTried || next == State::NotTried) throw std::logic_error("invalid text module transition"); state = next; }
};
Loader& state() {
  // Faces in host caches can be destroyed during static teardown.
  static Loader& loader = *new Loader;
  return loader;
}
}
void configureModule(const std::string& path, const std::string& sha256) {
  auto& loader = state();
  std::lock_guard lock(loader.mutex);
  if (loader.state != State::NotTried) throw std::logic_error("text module already initialized");
  loader.path = path; loader.sha256 = sha256;
}
const Module* loadModule(std::string& error) {
  auto& loader = state();
  std::lock_guard lock(loader.mutex);
  if (loader.state == State::NotTried) {
#if defined(__APPLE__)
    const char* file = "libzn_text_module.dylib";
#elif defined(_WIN32)
    const char* file = "libzn_text_module.dll";
#else
    const char* file = "libzn_text_module.so";
#endif
    const char* env = std::getenv("ZINC_TEXT_LIB");
    std::string executable = plat::exePath();
#ifndef _WIN32
    Dl_info info{};
    if (dladdr(reinterpret_cast<void*>(&module), &info) && info.dli_fname) executable = info.dli_fname;
#endif
    std::error_code ec;
    const auto sibling = std::filesystem::canonical(executable, ec).parent_path() / file;
    const std::string path = !loader.path.empty() ? loader.path : env && *env ? env : ec ? "" : sibling.string();
    std::unique_ptr<tc::FileLock> cacheLock;
    if (!loader.sha256.empty()) {
      cacheLock = std::make_unique<tc::FileLock>(path + ".lock");
      if (cacheLock->fd < 0 || tc::sha256File(path) != loader.sha256) {
        loader.error = "zinc: text module unavailable at " + path + ": cached module checksum mismatch";
        loader.transition(State::Failed);
        error = loader.error; return nullptr;
      }
    }
    // Kept resident: faces and their method pointers may outlive the first caller.
    void* handle = path.empty() ? nullptr : plat::libOpen(path, false);
    auto open = handle ? reinterpret_cast<const Module* (*)()>(plat::libSymbol(handle, "zn_text_open")) : nullptr;
    if (open) loader.api = open();
    const Module* api = loader.api;
    const bool valid = api && api->version == 1 && api->bytes == sizeof(Module) && api->open && api->destroy && api->unitsPerEm &&
      api->ascent && api->descent && api->hasGlyph && api->hasEmoji && api->isColor && api->layout && api->breaks &&
      api->rasterize && api->outline && api->subset && api->characters && api->msdfAtlas;
    if (valid) loader.transition(State::Ready);
    else { loader.error = "zinc: text module unavailable at " + path + ": " + (handle ? "incompatible module descriptor" : plat::libError()); loader.transition(State::Failed); }
  }
  if (loader.state == State::Failed) { error = loader.error; return nullptr; }
  error.clear();
  return loader.api;
}
const Module& module() {
  std::string error;
  if (const Module* api = loadModule(error)) return *api;
  // Font operations can enter through raster and JS callbacks that cannot unwind exceptions.
  std::fprintf(stderr, "%s\n", error.c_str());
  std::exit(1);
}
std::unique_ptr<Face> Face::open(const uint8_t* data, size_t size) { return module().open(data, size); }
Face::~Face() { module().destroy(this); }
int Face::unitsPerEm() const { return (this->*module().unitsPerEm)(); }
float Face::ascent(float px) const { return (this->*module().ascent)(px); }
float Face::descent(float px) const { return (this->*module().descent)(px); }
bool Face::hasGlyph(uint32_t cp) const { return (this->*module().hasGlyph)(cp); }
bool Face::hasEmoji(uint32_t cp) const { return (this->*module().hasEmoji)(cp); }
bool Face::isColor() const { return (this->*module().isColor)(); }
std::vector<Line> layout(const std::vector<Face*>& faces, std::string_view utf8, const Options& o) { return module().layout(faces, utf8, o); }
std::vector<bool> breakOpportunities(std::string_view utf8, const char* lang) { return module().breaks(utf8, lang); }
bool rasterize(const Face& f, uint32_t gid, float px, Bitmap& out) { return module().rasterize(f, gid, px, out); }
bool outline(const Face& f, uint32_t gid, float px, Outline& out) { return module().outline(f, gid, px, out); }
}
namespace zn::assets {
std::size_t fontCharacters(const std::string& ttf) { return text::module().characters(ttf); }
}
