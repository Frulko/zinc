---
id: ZN-782
title: Coordinate Pi development apps and reuse the installed engine
status: Done
assignee: []
created_date: '2026-10-23 13:23'
labels:
  - tooling
  - pi
  - size-L
dependencies: []
ordinal: 518460
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A Pi session yields its display before a remote app starts, resumes on exit and allows one remote app at a time.
- [x] #2 Pi deploy reuses the installed engine, preserves the project engine and avoids host cross compilation unless explicitly selected.
- [x] #3 Native fixture regressions cover replacement, display acknowledgement, failure cleanup and portable project contents; docs and changelog explain provisioning and limits.
<!-- AC:END -->

## Implementation Notes

Pi agent display handoffs are serialized by its State-owned mutex. A forked child waits on a pipe until zinc-session stops/waits its display process group and acknowledges that child's lease; previous remote apps are stopped, replaced live-dev sessions end, and the player returns. Ctrl-C of a followed deployment/run stops the matching PID; standalone logs detach and --no-logs persists. Detached framebuffer users can set graphics mode through a write-only VT descriptor when read access is unavailable.

Pi deploy stages project sources/assets and uses the installed engine, honoring QuickJS cycles without host cross compilation or retransferring Zinc. Explicit --target/--inspect retain native export; unsupported QuickJS native exports give a clear error. Preparation now times the complete native/cross build. Remote dev omits workstation-native libraries from its delta transfer.

Signed engine packages carry the session script and agent service. The Pi updater snapshots, installs, syncs/reloads and restores these files with the engine/player generation, including partial-copy failure and power-cut recovery. A tiny baseline survives pruning for old releases. Existing cards need the new root helper once, via the Pi administrator, then a signed release with the new engine; no reflashing required. Exact bootstrap commands are in image/README.md. No Pi mutation, cross build, image build, push or publication performed.

Verified: native zinc build; agent_screen (including concurrent starts and live-dev replacement), agent_deploy (simulated Pi, source QuickJS cycle, private-file/link boundaries, native QuickJS refusal), agent_dev, agent_apps, pi_image_update (signed download and exact package payload, downgrade/rollback/partial application and boot recovery), cli_core, ci_plan; actual fbdev.cpp compiled/executed against native framebuffer/evdev stubs. Shell/Python/JSON and git diff checks pass. Research conclusions and measured input sizes are in docs/reports/zinc-next-agent.md; hardware/throughput checks recorded in backlog/later.md. Typed source mode favors iteration over AOT throughput; missing plugins may still build on the Pi.
