#pragma once
// The device agent (ZN-729): `zinc agent` is a daemon without a UI on a Linux or macOS machine, `zinc device` the client that finds it
// (mDNS, `_zinc._tcp`), pairs with it once by a code (EC J-PAKE) and then talks to it over TLS with the key the pairing gave: what the
// machine is, a shell, files both ways, apps installed and started with their logs, ports forwarded. What adb is to Android, over the
// network. The protocol and the threat model: docs/reports/zinc-next-agent.md. Includes host/tls.h, tc and zapp; only main includes it.
#include <string>
#include <vector>

namespace zn::cli { struct DevRemote; }   // cli_core.h

namespace zn::agent {

/** `zinc agent [--port n] [--bind addr] [--name s] [--no-shell] [--no-mdns] [--allow-root]`, `zinc agent pair|clients|forget <client>`.
 *  `self` is the running binary (it runs the apps), `engine` its version. */
int serve(const std::vector<std::string>& args, const std::string& self, const std::string& engine);

/** `zinc device list|pair|unpair` and `zinc device [<device>] info|shell|push|pull|install|deploy|run|stop|uninstall|apps|logs|forward|reverse`. */
int device(const std::vector<std::string>& args, const std::string& self);

/** `zinc dev --device <d>` (ZN-729.03, dev.cpp): takes the option out of `args` and opens a dev session with that device, as the hooks
 *  zn::cli::dev runs the program through. `remote` stays empty without the option; false, with the reason said, when the device refuses. */
bool devRemote(std::vector<std::string>& args, const std::string& self, const std::string& engine, zn::cli::DevRemote& remote);

}  // namespace zn::agent
