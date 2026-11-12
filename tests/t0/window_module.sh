#!/bin/sh
# Test the real lazy loader with a tiny module, without SDL or a window.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
python3 - "$tmp" <<'PY'
from pathlib import Path
import re,sys
p=Path(sys.argv[1])
source=Path('src/host/window_module.cpp').read_text()
names=set(re.findall(r'sym\(h, "([^"]+)"',source))
p.joinpath('module.cpp').write_text('''#include <cassert>
extern "C" int zn_window_load();
extern "C" int sharedData;
__attribute__((constructor)) static void reenter() { assert(sharedData == 42); ++sharedData; assert(zn_window_load() == 0); }
'''+'\n'.join('extern "C" void '+name+'() {}' for name in sorted(names)))
p.joinpath('test.cpp').write_text('''#include "tc/tc.h"
#include "platform/platform.h"
#include <cassert>
#include <cstdlib>
#include <thread>
extern "C" int zn_window_load();
extern "C" { int (*zn_null_close_handler)(void) = nullptr; int sharedData = 42; }
namespace zn::tc {
std::string executablePath() { return "/unused/zinc"; }
std::string sha256File(const std::string&) { return ""; }
FileLock::FileLock(const std::string&) {} FileLock::~FileLock() {}
}
namespace zn::plat { const char* libSuffix() { return ".so"; } }
std::string fusedWindowModule(std::string&) { return ""; }
int main(int argc, char** argv) {
  assert(argc == 3);
  const bool success = argv[1][0] == '1';
  setenv("ZINC_WINDOW_LIB", success ? argv[2] : "/missing/zn-window-module", 1);
  assert(zn_window_load() == success);
  assert(sharedData == (success ? 43 : 42));
  setenv("ZINC_WINDOW_LIB", argv[2], 1);
  std::thread other([&] { assert(zn_window_load() == success); });
  assert(zn_window_load() == success); other.join();
}
''')
PY
case $(uname -s) in
  Darwin) shared='-dynamiclib -Wl,-undefined,dynamic_lookup'; exported='-Wl,-export_dynamic'; dl='' ;;
  *) shared='-shared -fPIC'; exported='-rdynamic'; dl='-ldl' ;;
esac
${CXX:-c++} -std=c++20 $shared "$tmp/module.cpp" -o "$tmp/module.so"
${CXX:-c++} -std=c++20 -Wall -Wextra -Werror -pthread $exported -Isrc -Iruntime/include "$tmp/test.cpp" src/host/window_module.cpp $dl -o "$tmp/test"
timeout 5 "$tmp/test" 1 "$tmp/module.so"
timeout 5 "$tmp/test" 0 "$tmp/module.so" 2>"$tmp/error"
grep -q '/missing/zn-window-module' "$tmp/error"
# Exercise the actual fused extraction with a same-size corrupt cache entry.
python3 - "$tmp" <<'PYCODE'
from pathlib import Path
import sys
p=Path(sys.argv[1]); source=Path('src/main.cpp').read_text()
start=source.index('std::string fusedWindowModule(')
end=source.index('\n// App updates at launch',start)
p.joinpath('cache.cpp').write_text('''#include "tc/tc.h"
#include "platform/platform.h"
#include <cassert>
#include <filesystem>
#include <fstream>
#include <thread>
static std::string root;
static uint64_t gFusedModuleAt = 0, gFusedModuleSize = 16;
namespace zn::tc {
std::string executablePath() { return root + "/payload"; }
std::string home() { return root + "/home"; }
}
namespace zn::plat { const char* libSuffix() { return ".so"; } }
''' + source[start:end] + '''
int main(int argc, char** argv) {
  assert(argc == 2); root = argv[1];
  const std::string payload = "trusted-module!!";
  assert(payload.size() == gFusedModuleSize);
  std::ofstream(zn::tc::executablePath(), std::ios::binary) << payload;
  std::string hash; const auto path = fusedWindowModule(hash);
  assert(!path.empty() && hash == zn::tc::sha256Hex(payload));
  assert(zn::tc::sha256File(path) == hash);
  std::ofstream(path, std::ios::binary) << std::string(payload.size(), 'x');
  assert(std::filesystem::file_size(path) == payload.size());
  std::thread other([&] { std::string h; assert(fusedWindowModule(h) == path && h == hash); });
  std::string h; assert(fusedWindowModule(h) == path && h == hash); other.join();
  assert(zn::tc::sha256File(path) == hash);
}
''')
PYCODE
${CC:-cc} -Ithird_party/sha256 -c third_party/sha256/sha256.c -o "$tmp/sha256.o"
${CXX:-c++} -std=c++20 -Wall -Wextra -Werror -pthread -Isrc -Ithird_party/sha256 "$tmp/cache.cpp" src/tc/file.cpp "$tmp/sha256.o" -o "$tmp/cache"
timeout 5 "$tmp/cache" "$tmp"
# A cross build cannot run here, but its dynamic boundary must still be checked.
python3 - "${ZINC:-build/zinc}" <<'PY'
from pathlib import Path
import subprocess,sys
exe=Path(sys.argv[1])
if not exe.exists() or exe.read_bytes()[:4] != b'\x7fELF':
    raise SystemExit(0)
module=exe.with_name('libzn_window.so')
def dump(path,flag): return subprocess.check_output(['objdump',flag,str(path)],text=True)
main=dump(exe,'-T'); symbols=dump(module,'-T'); dynamic=dump(module,'-p')
assert not any(line.split()[-1].startswith('SDL_') for line in main.splitlines() if line.split()), 'zinc still contains SDL'
assert any('SDL_CreateWindow' == line.split()[-1] and '*UND*' not in line for line in symbols.splitlines() if line.split())
for name in ('sdl_hal_init','hal_set_resize','zn_window_load'):
    assert any(line.split()[-1] == name and '*UND*' not in line for line in symbols.splitlines() if line.split()), name
for name in ('hal_display','zrt_frame_stats'):
    assert any(line.split()[-1] == name and '*UND*' in line and '.protected' not in line for line in symbols.splitlines() if line.split()), name
assert '$ORIGIN/../lib' in dynamic
print('ELF: SDL resides in window module; runtime data remains shared')
PY
# Exercise package staging with external build/deploy work replaced by inert fixtures.
python3 - "$tmp" <<'PY'
import ast,os,re,shutil,sys,tarfile,types
from pathlib import Path
p=Path(sys.argv[1]); build=p/'build'; build.mkdir(); out=p/'dist'; calls=[]
for name in ('zinc','libzn_window.so'): (build/name).write_text(name)
dep=p/'libfixture.so'; dep.write_text('dependency')
def run(*args,**kwargs):
    calls.append(args)
    return types.SimpleNamespace(stdout=f'libfixture.so => {dep} (0x0)\n' if args[0]=='ldd' else '')
node=next(n for n in ast.parse(Path('tools/package').read_text()).body if isinstance(n,ast.FunctionDef) and n.name=='package_linux')
fixtureShutil=types.SimpleNamespace(**{n:getattr(shutil,n) for n in ('rmtree','copy2')},which=lambda _:True)
g={'os':os,'re':re,'shutil':fixtureShutil,'platform':types.SimpleNamespace(machine=lambda:'x86_64'),'VERSION':'fixture','run':run,'NEXT':str(p),'sys':sys,'tarfile':tarfile,
   'payload':lambda path:Path(path).mkdir(parents=True),'desktop_linux':lambda _:None,'LAUNCHER_LINUX':'fixture','prebuild_plugins':lambda *args:[],'pack_player':lambda *args:None}
exec(compile(ast.Module(body=[node],type_ignores=[]),'package_linux','exec'),g)
archives,_=g['package_linux'](str(build),str(out))
archive=Path(archives[0][1]); assert archive.name=='zinc-fixture-linux-x86_64.tar.gz'
with tarfile.open(archive) as bundle:
    names=bundle.getnames(); prefix='zinc-fixture-linux-x86_64/'
    assert prefix+'bin/libzn_window.so' in names and prefix+'lib/libfixture.so' in names
assert any(c[0]=='ldd' and c[-1].endswith('libzn_window.so') for c in calls)
assert any(c[:3]==('patchelf','--set-rpath','$ORIGIN/../lib') and c[-1].endswith('libzn_window.so') for c in calls)
PY
