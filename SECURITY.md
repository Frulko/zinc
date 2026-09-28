# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately, not in a public issue: use GitHub's private vulnerability reporting
("Report a vulnerability" in the repository's Security tab). Include:

- what is affected: the runtime (`runtime/`), a plugin (`plugins/<name>`), the compiler or the tooling (`zinc export`,
  `deploy.sh`, `zinc dev`), and the target (macos, linux, rpi1, rmpp, esp32, wasm, ps1/ps2);
- a reproducer: the smallest program or input that shows it. For a parser, a file that crashes a harness of
  `tests/fuzz/` is ideal (`tests/fuzz/build/<harness> <file>`);
- the impact you see (crash, memory corruption, information disclosure, privilege change).

We acknowledge within a week, then agree on a fix and a disclosure date with you. Fixes land with a regression test
(a conformance program or a fuzz corpus entry) and a line in [docs/reports/security-audit.md](docs/reports/security-audit.md).

## Supported versions

Zinc is pre-1.0: only the latest commit of the main branch gets security fixes.

## What is in scope

The threat model, the guarantees and the known limits are in
[docs/guide/08-security.md](docs/guide/08-security.md). In short: memory-safety bugs reachable from program input or
from the network, services that listen where the documentation says they do not, authentication bypasses (DevTools,
remote display, mapping companion), and privilege problems in the generated deployment (systemd unit, `deploy.sh`) are
in scope. A program that uses `unchecked<T>()` wrongly, reference cycles (leaks), secrets compiled into a binary, and
`--obfuscate` being reversible are documented limits, not vulnerabilities.
