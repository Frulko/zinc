# Self-hosted calls

Zinc configures and supervises the pinned MIT Galène 1.2.1 server. Galène serves its own browser client, HTTPS, signalling and media; Zinc stays outside the media path. A browser needs no Zinc installation. The native call demo's Galène client and app links are separate work.

From the repository root, with `zinc` in PATH:

```sh
zinc run examples/webrtc-call/server -- setup --domain call.example.org --room friends
zinc run examples/webrtc-call/server -- run
# In another terminal, while run is alive:
zinc run examples/webrtc-call/server -- link friends --hours 24
```

`setup` prints a systemd unit and port/peer restrictions. `deploy` prints them again. The default data directory is Zinc's private app storage, under `webrtc-call-server/server`; every command accepts `--data /absolute/path`. A relative path resolves against the directory you launched Zinc from. The parent directory must exist. Setup refuses an existing destination, so it cannot replace rooms, keys or tokens. To create a second deployment, choose a new data directory. One supervisor runs per user, enforced by `zinc:system/instance`'s file lock.

The first setup installs the checksum-pinned native tool through `zinc toolchain install galene`. It also downloads the matching [upstream source](https://github.com/jech/galene/tree/galene-1.2.1), pinned to SHA256 `230db9843995f6776b885cf7cb88d7de241abefc634e7845e20ce001fcdefd1a`, through `zinc toolchain fetch`: the small binary archive excludes web assets. Matching assets and licence notices are copied into the service's `static/`, alongside a local `join.html` overlay. The source cache is next to the data directory as `<data>.galene-source`. `ZINC=/absolute/path/to/zinc` selects the CLI used by the service. `ZINC_HOME` and Zinc's download/mirror settings retain their usual meanings. The release artifacts must be published before the default public install URL is usable; local mirrors still require the pinned checksum.

Setup creates private directories (0700), a random 256-bit administrator password in `data/config.json` (0600), `data/ice-servers.json` (0600), and one `groups/<room>.json` (0600). The group uses VP8 and Opus, allows 25 clients by default (`--max-clients N`), and permits invitations without a moderator. `--autokick` requires a moderator to be present; create the host's link with `link friends --moderator` and join it before guests. Room names contain lowercase letters, digits and hyphens; omitting `--room` generates a random name. Never put the data directory in a web root or repository.

## HTTPS and invitations

Before public use, install the domain's certificate chain at `<data>/data/cert.pem` and private key at `<data>/data/key.pem` (0600), owned by the service user. Use your existing ACME client to obtain and renew them; copy renewed files atomically. Galène reloads its certificate through its certificate provider. Without these files Galène uses a self-signed fallback, suitable only for explicit local testing. This service does not accept that fallback for administrator requests: `curl` verifies the certificate and domain name, connecting to `127.0.0.1` with `--resolve`. It never disables certificate verification. `curl` must be installed on the host; administrator credentials travel through stdin, not process arguments. No browser admin origin is allowed.

`link ROOM [--hours 24]` creates an expiring stateful token using Galène's real `/galene-api/v0/.groups/ROOM/.tokens/` API. It prints a URL and a terminal QR code with a four-module quiet zone. Hours may be fractional (up to 8760). The URL's fragment holds the invitation until the person chooses **Join in the browser**; Galène then receives its usual `/group/ROOM/?token=TOKEN` URL. The guest chooses a display name and connects in the upstream browser client. Keep invitation output private. The QR uses ANSI black-on-white cells; terminals must support ANSI colour and block glyphs.

```sh
zinc run examples/webrtc-call/server -- revoke friends TOKEN
```

Use the token after the slash in the printed fragment. Revocation reads the current ETag and deletes with `If-Match`, so concurrent changes cannot be overwritten. Expired and revoked tokens cannot establish a new session. Neither expiry nor revocation disconnects participants already in the room; a moderator can kick them in Galène's client. Link creation/revocation needs the running server. Admin requests time out after ten seconds and never follow redirects.

For a loopback-only HTTP check, choose free, unprivileged ports:

```sh
zinc run examples/webrtc-call/server -- setup --domain 127.0.0.1 --room friends --local --port 18443 --udp-port 18444 --data /tmp/my-private-call
zinc run examples/webrtc-call/server -- run --data /tmp/my-private-call
```

Local mode binds HTTP only to `127.0.0.1` and disables built-in TURN. It cannot be enabled for a public domain. Browsers treat loopback as a secure context. Public defaults are HTTPS TCP 443, TURN TCP+UDP 1194, and one SFU UDP mux port 10000. `setup --port`, `--udp-port`, and `--turn :PORT` override these; `--turn ''` disables built-in TURN. The UDP mux port must differ from the TURN port.

## Pi or VPS deployment

Use the matching Zinc binary and pinned Galène artifact on Linux armv7 (Pi 3), arm64, or x86_64. The development Mac uses arm64 macOS. Build the service with `zinc build examples/webrtc-call/server -o build/call-server` (or `--target armv7-linux` for the Pi). Deploy that executable and this project's `assets/` together in `/opt/zinc-call/`; setup reads the join overlay through `zinc:assets`, independently of the current directory. Create a dedicated `zinc-call` user, a private data directory parent and `/var/lib/zinc-call` owned by it. Install `curl`, Zinc, a working CA store, and a trusted domain certificate. Run setup as that user; pass the same absolute `--data` to every command. Run `deploy --data ...` on the destination to print paths for that machine. Review the printed unit, save it as `/etc/systemd/system/zinc-call.service`, then enable it with your normal service-management procedure. Setup never installs units, changes ownership, alters firewall rules or starts a public service.

The unit uses `CAP_NET_BIND_SERVICE` for HTTPS 443, `KillMode=control-group`, a ten-second shutdown timeout and a 65536-descriptor limit. It expects `/opt/zinc-call/call-server`, its adjacent `assets/`, and `/usr/local/bin/zinc` for tool installation; adjust `ExecStart`, `WorkingDirectory`, and `Environment=ZINC=...` to your installation. It gives writes only to the selected data directory and `/var/lib/zinc-call` (toolchain cache), so finish setup before enabling `ProtectSystem=strict`. If your Zinc install requires `ZINC_ROOT`, add its installed library root to the unit. Do not grant root merely to bind 443.

The supervisor logs each child PID/exit, waits two seconds before restarting an exited Galène, and stops scheduling restarts after SIGINT or SIGTERM. Shutdown sends TERM, then KILL after three seconds if needed. Zinc's process provider owns the child as well, covering unexpected service exit; systemd adds the cgroup boundary on Linux. There is no PID file or signalling of a saved PID. Repeated configuration errors remain visible in the logs and retry every two seconds; stop the service to correct them.

Allow inbound HTTPS TCP 443 and the chosen SFU UDP mux port. For built-in TURN, also allow TCP+UDP 1194. NAT must forward these ports, and a TURN server reachable by all participants may be required. TCP 443 alone carries the web page and signalling, not all media. Open TCP 80 only when your ACME HTTP-01 client needs it. A Pi 3 is suitable for small calls; this task makes no capacity or idle-memory claim.

## Restricted TURN over TLS 443

Galène's built-in TURN does not support TLS or a peer allowlist. Its relay allocations do not use `-udp-range`; filtering that single SFU port as though it were the relay range would be incorrect. For a public restricted relay, use coturn on a second public IP (or another host), then disable built-in TURN. Sharing Galène's existing IP:443 requires a separately designed TLS multiplexer; a normal HTTP reverse proxy cannot carry TURN.

Create a random shared secret in a private file, then configure setup with:

```sh
zinc run examples/webrtc-call/server -- setup --domain call.example.org --room friends --coturn-url 'turns:turn.example.org:443?transport=tcp' --coturn-secret-file /private/turn.secret
```

This writes Galène's documented `credentialType: "hmac-sha1"` configuration and disables built-in TURN by default. A coturn configuration template follows; replace every uppercase placeholder with the real value. Keep its secret and private key readable only by coturn.

```ini
tls-listening-port=443
listening-ip=TURN_SERVER_IP
relay-ip=TURN_SERVER_IP
realm=turn.example.org
use-auth-secret
static-auth-secret=SHARED_SECRET
cert=/private/turn-fullchain.pem
pkey=/private/turn-key.pem
min-port=49160
max-port=49260
no-tlsv1
no-tlsv1_1
no-multicast-peers
denied-peer-ip=0.0.0.0-255.255.255.255
denied-peer-ip=::-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff
allowed-peer-ip=SFU_SERVER_IPV4
# Repeat allowed-peer-ip for each address belonging to the SFU server.
```

Coturn's explicit allow entries override its denied ranges, as documented in its [upstream configuration](https://github.com/coturn/coturn/blob/master/examples/etc/turnserver.conf). Restrict relayed peers to the SFU's own addresses, including only its actual IPv6 addresses when used. Restrict the TURN host's relay UDP egress (49160–49260 here) to those same destinations and permit return traffic; use your firewall's existing policy, interfaces and address sets. Keep TLS/control traffic separate from relay egress. Allow inbound coturn TCP 443 and its relay UDP range. No firewall rule is applied or assumed by this app. Test the final TURN-only path from an external network before inviting people; local join does not prove firewall or NAT policy.

The pinned [installation guide](https://github.com/jech/galene/blob/galene-1.2.1/galene-install.md), [administration source](https://github.com/jech/galene/blob/galene-1.2.1/webserver/api.go), and [token implementation](https://github.com/jech/galene/blob/galene-1.2.1/token/stateful.go) define the contract used here. No Galène signalling or media protocol is reimplemented.

## Proposed tests

- Local setup → live browser join → expired/revoked invitation refusal → forced child exit/restart → supervisor TERM and no child left: about 45 seconds, one browser plus the small service; memory not measured.
- Pi/VPS systemd stop/restart and browser media through the restricted coturn/TLS path from an external network: about two minutes; one call, memory not measured.
- Trusted-certificate loopback administrator requests and certificate renewal on an owned test domain: about one minute, no capacity measurement.
