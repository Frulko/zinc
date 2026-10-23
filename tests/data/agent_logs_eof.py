"""Exercise the real client logs loop with final output buffered by a closing transport."""
import os
from pathlib import Path
import shlex
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
source = (root / 'src/agent/client.cpp').read_text()
body = source[source.index('int logs(Device&'):source.index('// `[--env K=V]')]
fixture = r'''
#include <memory>
#include <string>
#include <vector>
#include <utility>
#include <poll.h>
#include <signal.h>
#include <unistd.h>
#include <cstdio>
struct Device { std::string name = "fixture"; };
struct Obj {
  Obj& str(const char*, const std::string&) { return *this; }
  Obj& flag(const char*, bool) { return *this; }
  Obj& num(const char*, long long) { return *this; }
  int done() { return 0; }
};
struct Chan { int fd; std::vector<std::pair<char, std::string>> pending; };
static int pipes[2];
static constexpr char kOut = 'o', kExit = 'x';
static std::unique_ptr<Chan> request(Device&, int, std::string&) {
  return std::make_unique<Chan>(Chan{pipes[0], {}});
}
static bool next(Chan& c, char& type, std::string& text) {
  if (c.pending.empty()) return false;
  type = c.pending.front().first; text = c.pending.front().second;
  c.pending.erase(c.pending.begin()); return true;
}
static bool fill(Chan& c) {
  c.pending = {{kOut, "late one\n"}, {kOut, "late two\n"}, {kExit, ""}};
  return false; // read delivered the final frames, then observed EOF in the same call
}
static bool writeAll(int fd, const void* text, size_t size) {
  return write(fd, text, size) == static_cast<ssize_t>(size);
}
'''
with tempfile.TemporaryDirectory(prefix='zinc-logs-eof-') as temp:
    directory = Path(temp)
    cpp = directory / 'main.cpp'
    cpp.write_text(fixture + body + '\nint main() { pipe(pipes); write(pipes[1], "x", 1); Device d; return logs(d, "app", false); }\n')
    binary = directory / 'check'
    subprocess.run(shlex.split(os.environ.get('CXX', 'c++')) + ['-std=c++20', str(cpp), '-o', str(binary)], check=True)
    result = subprocess.run([str(binary)], capture_output=True, text=True, timeout=5)
    assert result.returncode == 0 and result.stdout == 'late one\nlate two\n', (result.returncode, result.stdout, result.stderr)
print('agent logs: buffered final output survives EOF')
