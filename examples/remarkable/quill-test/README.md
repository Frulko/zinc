# Quill drawing test from AppLoad

Device result (2026-09-29): the user reports excellent drawing responsiveness.
The journal confirms initialization at 15:51:18, the three-minute timeout at
15:54:14, clean vendor-thread shutdown, and xochitl running again at 15:54:15.
Read-only uptime afterward was 62 days: this restarted xochitl, not the tablet.
This is a successful subjective drawing/lifecycle test, not a camera latency measurement.

Separate, unsaved monochrome drawing test to evaluate direct ink before porting Notes.
AppLoad launches a transient systemd service with `qtfb: false`. The service holds a
wakelock, stops xochitl, runs Quill's `scribble`, and restores xochitl in `ExecStopPost`.
It stops automatically after **3 minutes**. No firmware, waveform, boot or persistent
service files are installed. Save/close any active notebook before launching.

Exit with the **power button**, **five fingers**, or from the host:

```sh
ssh root@10.11.99.1 'systemctl stop zinc-quill-test'
```

Build on the host (requires the existing `zinc/sdk-rmpp` Docker image):

```sh
sh examples/remarkable/quill-test/build.sh
python3 tests/rmpp/quill-launch.py
scp -O -r examples/remarkable/quill-test/dist/quill-test root@10.11.99.1:/home/root/xovi/exthome/appload/
```

Then **AppLoad → Reload → Quill drawing test (3 min)**. The test begins with a
full white-page refresh, then sends partial monochrome ink updates. Drawing is not
saved. This tests Quill's simple pressure brush, not Zinc Notes' tools or colours.
Compare fast circles and handwriting against xochitl on the same tablet; a successful
launch does not establish equivalent physical latency.

Diagnostics and recovery from the host:

```sh
ssh root@10.11.99.1 'journalctl -u zinc-quill-test -n 100 --no-pager'
ssh root@10.11.99.1 'systemctl stop zinc-quill-test; systemctl start xochitl'
```

Recovery stops the test before starting xochitl: never run two display engines at once.
The launcher refuses unknown firmware hashes and living/unknown display-lock owners.
If restoration fails it keeps the wakelock to avoid autosleep during recovery; inspect
the journal rather than deleting a live display lock. After restoring xochitl, release
that test-only wakelock if needed: `echo zinc-quill-test > /sys/power/wake_unlock`.
Supervision improves crash/disconnect recovery; it is not protection against kernel
or vendor-engine defects. The lifecycle test uses mocks, not the physical display.

Upstream: [Quill v0.1.0](https://github.com/MaximeRivest/quill/releases/tag/v0.1.0),
source `39262ee0bef69915e3ead3ac218d5973916f422a`, MIT. The bundle uses its published
SDK-built `libquill.so`, verified against the release SHA-256, and compiles `scribble.c`
locally. No proprietary library is bundled. The tablet's installed Qt/vendor engine
must satisfy the preflight loader check. The exact vendor hash is pinned to the
firmware verified in [our investigation](../../../docs/reports/rmpp-latency-2026-09-29.md).
