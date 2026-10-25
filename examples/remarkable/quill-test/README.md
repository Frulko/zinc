# Quill drawing test from AppLoad

Device result (2026-09-29): the user reports excellent drawing responsiveness.
The journal confirms initialization at 15:51:18, the three-minute timeout at
15:54:14, clean vendor-thread shutdown, and xochitl running again at 15:54:15.
Read-only uptime afterward was 62 days: this restarted xochitl, not the tablet.
This is a successful subjective drawing/lifecycle test, not a camera latency measurement.

Separate, unsaved monochrome drawing test to evaluate direct ink before porting Notes.
AppLoad (`qtfb: false`) runs `launch.sh`, which hands Quill's `scribble` to the display lease
(`integrations/remarkable-ink/lease.c`, `docs/targets/remarkable-paper-pro.md`): one transient unit `zinc-lease` holds a
wakelock, stops xochitl through systemd, runs `scribble`, and restores xochitl once on every way out. It stops
automatically after **3 minutes**. The lease refuses a launch outside its budget (2 xochitl restarts per 10 minutes,
6 per hour, 60 s between leases) and says when the next one is allowed. No firmware, waveform, boot or persistent
service files are installed. Save/close any active notebook before launching.

Exit with the **power button**, **five fingers**, or from the host:

```sh
ssh root@10.11.99.1 'systemctl stop zinc-lease'
```

Build on the host (requires the existing `zinc/sdk-rmpp` Docker image):

```sh
sh examples/remarkable/quill-test/build.sh
tests/run --only rmpp_lease        # the lease against a fake systemd, on this machine
scp -O -r examples/remarkable/quill-test/dist/quill-test root@10.11.99.1:/home/root/xovi/exthome/appload/
```

Then **AppLoad → Reload → Quill drawing test (3 min)**. The test begins with a
full white-page refresh, then sends partial monochrome ink updates. Drawing is not
saved. This tests Quill's simple pressure brush, not Zinc Notes' tools or colours.
Compare fast circles and handwriting against xochitl on the same tablet; a successful
launch does not establish equivalent physical latency.

Diagnostics and recovery from the host:

```sh
ssh root@10.11.99.1 'journalctl -u zinc-lease -n 100 --no-pager; /home/root/xovi/exthome/appload/quill-test/lease status'
```

Recovery is in `docs/targets/remarkable-paper-pro.md` ("Recovery"): stop the lease before starting xochitl, never
run two display engines at once. The lease refuses unknown firmware hashes and living/unknown display-lock owners.
If restoration fails it keeps the wakelock to avoid autosleep during recovery; inspect the journal rather than
deleting a live display lock.
Supervision improves crash/disconnect recovery; it is not protection against kernel
or vendor-engine defects. The lifecycle test uses mocks, not the physical display.

Upstream: [Quill v0.1.0](https://github.com/MaximeRivest/quill/releases/tag/v0.1.0),
source `39262ee0bef69915e3ead3ac218d5973916f422a`, MIT. The bundle uses its published
SDK-built `libquill.so`, verified against the release SHA-256, and compiles `scribble.c`
locally. No proprietary library is bundled. The tablet's installed Qt/vendor engine
must satisfy the preflight loader check. The exact vendor hash is pinned to the
firmware verified in [our investigation](../../../docs/reports/rmpp-latency-2026-09-29.md).
