#pragma once
// The host side of the upload protocol (include/zn/devproto.h): connects to a device (serial port, a command whose stdin and stdout are the
// line, such as QEMU or the simulator), sends a module and collects the answer.
#include <cstdint>
#include <string>
#include <vector>

namespace zn::dev {

struct Link {
  int in = -1, out = -1;  // file descriptors to read from and write to (the same one for a serial port)
  int pid = 0;            // a spawned process, ended by close()
};

bool openSerial(const std::string& path, int baud, Link& link, std::string& err);
bool spawnCommand(const std::string& shellCommand, Link& link, std::string& err);  // `sh -c` with the line on its stdin and stdout
void closeLink(Link& link);

// The first serial port that looks like an ESP32 board (/dev/cu.usbserial-*, /dev/cu.SLAB_*, /dev/ttyUSB*, /dev/ttyACM*), or empty.
std::string findSerialPort();

struct Answer {
  std::string output;      // what the program printed
  int status = 0;          // 0 ok, 1 runtime error, 101 uncaught exception
  std::size_t leaked = 0;
  std::size_t freeHeap = 0;
  std::string coreVersion;
};

// Waits for the core to answer a ping (up to `bootMs`), uploads `module` and waits for the end of the run (up to `runMs`).
// Lines of the device that are not protocol (a boot log) go to `log` when it is not null.
bool upload(Link& link, const std::vector<std::uint8_t>& module, Answer& answer, std::string& err, int bootMs, int runMs, std::string* log);

}  // namespace zn::dev
