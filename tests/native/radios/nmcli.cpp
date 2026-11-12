#include "../../../plugins/wifi/native/nmcli.h"
#include "fake_bus.h"
#include <iostream>
#include <filesystem>
#include <thread>
using namespace zinc::radio;
int main(int argc, char** argv) {
  // The same bounded executable is the child fixture: never exec a shell or real nmcli.
  if (argc > 1) {
    assert(std::string(argv[1]) == "--terse" && std::string(argv[2]) == "--escape" && std::string(argv[3]) == "yes");
    for (int i = 0; i < argc; i++) assert(std::string(argv[i]).find("secret-password") == std::string::npos);
    assert(std::string(getenv("LC_ALL")) == "C" && !getenv("DBUS_SYSTEM_BUS_ADDRESS"));
    std::string last = argv[argc - 1];
    if (last == "hang") { for (;;) pause(); }
    if (last == "big") { for (int i = 0; i < 70000; i++) std::cout << 'a'; return 0; }
    if (last == "denied") { std::cerr << "secret-password"; return 4; }
    if (last == "status") { std::cout << "wlan0:wifi:connected\neth0:ethernet:connected\n"; return 0; }
    assert(last == "yes" || last == "no");
    std::cout << "00FF3A5C0A1E1F:75:WPA2:yes\n6162:20:--:no\n"; return 0;
  }
  assert(argc == 1);
  std::vector<std::vector<std::string>> rows;
  assert(nmcliRows("a\\:b:c\\\\d\n", 2, rows) && rows[0][0] == "a:b" && rows[0][1] == "c\\d");
  for (auto bad : {"a\\q:b\n", "a:b", "a:b\\", "a:b:c\n", "a:\rb\n"}) assert(!nmcliRows(bad, 2, rows));
  assert(!nmcliRows(std::string(1025, 'a') + ":b\n", 2, rows));
  std::string many; for (int i = 0; i < 129; i++) many += "a:b\n";
  assert(!nmcliRows(many, 2, rows));
  std::vector<uint8_t> binary;
  assert(nmcliHex("00FF3a5c0A1E1f", binary) && binary == std::vector<uint8_t>({0,255,':','\\','\n',0x1e,0x1f}));
  assert(!nmcliHex("0", binary) && !nmcliHex("xz", binary) && !nmcliHex(std::string(66, '0'), binary));
  auto pump = [](auto& process, auto done) {
    for (int i = 0; i < 1000 && !done(); i++) { process.poll(); std::this_thread::sleep_for(std::chrono::milliseconds(1)); }
    assert(done());
  };
  std::string exe = std::filesystem::absolute(argv[0]).string();
  NmcliCommand command;
  assert(command.start(exe, {"denied"}));
  assert(!command.start(exe, {"big"}));
  pump(command, [&] { return command.state() == NmcliCommand::State::finished; });
  assert(!command.ok() && command.error() == "nmcli exited (4)" && command.text().find("secret-password") == std::string::npos);
  assert(command.start(exe, {"big"}));
  pump(command, [&] { return command.state() == NmcliCommand::State::finished; });
  assert(!command.ok() && command.error() == "nmcli output limit exceeded" && command.text().size() <= 65536);
  assert(command.start(exe, {"hang"}));
  command.poll(std::chrono::steady_clock::now() + std::chrono::seconds(8));
  assert(command.error() == "nmcli timed out");
  assert(!command.start(exe, {"hang"}));
  pump(command, [&] { return command.state() == NmcliCommand::State::finished; });
  assert(command.start(exe, {"hang"})); command.stop(); command.stop();
  assert(!command.start(exe, {"hang"}));
  pump(command, [&] { return command.state() == NmcliCommand::State::closed; });
  assert(!command.start("/nonexistent-zinc-fixture-nmcli", {}));
  Nmcli fallback(exe); fallback.start(); fallback.stop(); fallback.start();
  pump(fallback, [&] { return fallback.has() && !fallback.busy() && fallback.results().size() == 2; });
  assert(fallback.info() == "connected\t00ff3a5c0a1e1f\t\t75");
  assert(fallback.scan() && fallback.busy());
  pump(fallback, [&] { return !fallback.busy(); });
  assert(fallback.results().size() == 2 && !fallback.connect());
  fallback.stop(); fallback.start();
  pump(fallback, [&] { return fallback.has() && fallback.results().size() == 2; });
  fallback.stop(); assert(!fallback.has());
  pump(fallback, [&] { return !fallback.reap(); });
  FakeBus f; Bus bus(&f.api);
  for (int error : {-EACCES, -EPERM, -EINVAL, -ETIMEDOUT, -ENOENT, -ECONNREFUSED}) {
    static int result; result = error; f.api.start = [](sd_bus*) { return result; };
    assert(!bus.start());
    assert(bus.unavailable() == (error == -ENOENT || error == -ECONNREFUSED)); bus.stop();
  }
  std::cout << "nmcli bounded fallback ok\n";
}
