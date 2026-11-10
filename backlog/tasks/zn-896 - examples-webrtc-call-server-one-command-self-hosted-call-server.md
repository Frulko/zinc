---
id: ZN-896
title: 'examples/webrtc-call/server: one-command self-hosted call server'
status: Done
assignee: []
created_date: '2026-10-30 22:58'
updated_date: '2026-11-10 06:11'
labels:
  - net
  - media
  - size-M
milestone: m-28
dependencies:
  - ZN-895
  - ZN-1119
ordinal: 15500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A Zinc service app that sets up, supervises and administers Galène: setup --domain writes data/config.json (admin user, random secret, 0600), groups/<room>.json (vp8+opus, max-clients, autokick), ice-servers.json (optional coturn with hmac-sha1), a static/ overlay with join.html; starts galene with -http :443 -turn :1194 -udp-range <one port> through zinc:process and restarts it on exit; link <room> [--hours] creates a token through /galene-api/v0/.groups/<room>/.tokens/ and prints the URL and a QR code (zinc:qrcode); prints the systemd unit (CAP_NET_BIND_SERVICE) and firewall lines; a TURN egress rule limited to the server's own addresses.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 setup then run on the Mac serves a working group: Galène's web client in headless Chrome joins with a printed link
- [x] #2 link creates an expiring token; an expired or revoked token is refused
- [x] #3 Galène is restarted when it dies; the call server stops it on exit (no process left)
- [x] #4 README: Pi and VPS deploy, ports, systemd, coturn for TURN over TLS 443
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the Zinc call service under examples/webrtc-call/server. Setup refuses existing data and stages 0700 directories/0600 config files, a random 256-bit admin password, VP8+Opus room/max-clients/autokick, optional hmac-sha1 coturn credentials, verified matching upstream web assets and a neutral keyboard-accessible join overlay. The overlay uses zinc:assets, so compiled setup also works outside the checkout. Default HTTPS 443, built-in TURN 1194, one UDP mux 10000; --local binds HTTP only 127.0.0.1 and disables TURN. Expiring link/QR and ETag-safe revoke use Galène administration, no invented media/signalling protocol. Supervisor owns one direct process, explicit State/legal transitions, two-second retry, signal stop, three-second kill fallback and awaited stop; instance.lock supplies the native singleton file lock. Printed systemd template uses the compiled service, CAP_NET_BIND_SERVICE and KillMode=control-group.

Research/contract: https://github.com/jech/galene/blob/galene-1.2.1/webserver/api.go defines group .tokens/ POST (bare Location token), GET ETag/DELETE If-Match; token/stateful.go defines ISO8601 expiry and permissions. https://github.com/jech/galene/blob/galene-1.2.1/group/group.go requires an operator for autokick: default false, explicit --autokick + --moderator host links. galene-install.md confirms flags, cert paths and hmac-sha1 ICE. Upstream coturn examples/etc/turnserver.conf documents deny ranges plus overriding allowed-peer-ip, restricted to SFU-owned addresses. Built-in TURN has neither a relay range flag nor peer filter; no speculative nft rule is emitted. README explains restricted coturn TLS 443 on a separate IP, relay-egress policy, NAT/ports, Pi/VPS, unit paths and certificate installation/renewal. Nothing was installed system-wide or published; no firewall/interfaces changed.

Reuse: zinc:fs and zinc:assets; sys random/args/signals and zinc:web encoding; zinc:process for supervision and existing zinc toolchain verification; zinc:qrcode; zinc:system/instance for its flock-backed singleton. No zinc:services/cli provider exists here. Admin curl uses stdin config for the password, exact domain verification with its installed CA chain, --resolve to 127.0.0.1, no proxy/redirect/insecure fallback, ten-second bounded request. net.fetch lacks custom CA/connect-address options; no new transport/framework was added.

Proof (2026-11-10): original service check PASS with ZN-1119's stable read-only candidate /Users/mowmow/Lab/zinc/.worktrees/1119/build/zinc SHA256 38e22ed7035d08782e9293b57987ab76d4f95b3227bcd8e47b1b4131e018c6ab (quoted-key JSON fix atop common 58ee758c8). Original common 9a23 rejected max-clients; minimal repro .logs/896/json-key.ts. No app workaround/core edit. Integrate ZN-1119 before this branch.

Actual interpreter CLI setup PASS: pinned Galène installed through file mirror into owned scratch ZINC_HOME, source SHA 230db9843995f6776b885cf7cb88d7de241abefc634e7845e20ce001fcdefd1a verified by toolchain fetch, full static assets/overlay, 0700/0600 modes and exact JSON values; second setup refused and preserved admin bytes. Source archive's matching static files/licenses are included because the binary artifact intentionally excludes them. Galène native binary SHA256 9c3d77bc35fead52d80db1e7a7488e6d8c1dc48db168eb9f6a260cbc2a86d0a4; darwin-arm64 archive pinned SHA b57156481610a6e0255972a18428291864946942b2da9c95b7c825ab384905b4. Fresh scratch home reused only existing immutable qrcode/system stamp metadata pointing at read-only shared cached libraries; QuickJS built unchanged Process native plugin once in its own cache, no engine rebuild/native source changes.

One bounded single-Zinc scratch harness imported the production supervise/link/revoke modules, with fake-device headless Chrome: printed fragment link -> upstream browser client joined friends as Proof guest (actual group/socket/permissions assertions and joined.png); revoked token -> refused; expired 3.6ms token -> normal username challenge then refused, Galène log token has expired. Forced child 77230 SIGKILL -> restarted 77659, SIGTERM -> awaited stop, no restart after 2.3s and neither process survived. No parallel Zinc processes. Earlier scratch automation attempts hit enumerateDevices/probe timing and toast disappearance; corrected the harness using pinned upstream state semantics, with no production workaround. All earlier owned processes were cleaned.

After final assets-provider correction, actual CLI setup passed on interpreter, QuickJS and the AOT executable (AOT setup launched from /tmp with adjacent assets/), preserving max-clients/arrays/false and identical overlay bytes. Final AOT app build warning-free; actual QuickJS and AOT run -> group HTTP status -> SIGTERM code 0/no child PASS. Own join overlay screenshot shows loaded external CSS under Galène CSP. Full browser join/refusal/restart flow is interpreter; other engines get short actual startup/stop and setup proofs. Artifact scripts/logs/screenshots are .worktrees/896/.logs/896 (0700), not committed as demo tests. Every heavy command used root tools/work-run, ephemeral loopback ports, no focus and no leftover child/browser.

Limits: local join/signalling only; no multi-party camera/audio quality, public trusted-certificate flow, ACME issuance/renewal, coturn/TURN-only connectivity, firewall rule execution, systemd/Linux/Pi deployment or quiet RSS/capacity claim. The service uses existing certificate management rather than adding an ACME manager. Binary release ZN-895 is still unpublished; default installation needs its publication or an existing verified local mirror. Built-in TURN public peer filtering is not claimed: README/printed output requires restricted coturn before public deployment. No T0/T1/T2/demo suite, benchmark, conformance, fuzz or CI run. Usage: n/a.

Proposed tests
- Owned-domain trusted HTTPS admin requests and certificate rotation, about 1 minute; proves CA/domain verification/renewal integration, memory unmeasured.
- Pi/VPS actual systemd stop/restart and external restricted coturn TLS 443 forced-relay call, about 2 minutes; proves cgroup shutdown, NAT/firewall and relay permissions, memory unmeasured.
- Longer two-browser camera/audio call with expired/revoked rejoin and sustained participant churn, about 2 minutes; proves media path beyond this local join, memory unmeasured.
<!-- SECTION:NOTES:END -->
