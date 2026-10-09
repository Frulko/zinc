# Experimental xochitl display bridge — disabled on device

This prototype is **not validated for use**. Notes and Dashboard keep the AppLoad/qtfb backend by default. Their shared `zinc:remarkable` toolbar and finger UI support do not depend on this prototype.

The intended path shares xochitl's existing vendor engine, blocks its scene rendering for a bounded lease, stages client pixels, and restores the previous framebuffer on exit. No firmware files are modified. The driver is selected with `display.direct: true`; export then sets `qtfb: false`. Do not enable it until the bridge is validated.

Local checks cover packet framing, RGB32, acknowledgements, rectangle bounds, finger/pen separation and disconnect. The extension compiled with the official ferrari 5.7.119 SDK and its compatibility hash matches the tablet. It did not load into xochitl; no drawing lease was enabled or tested. Native latency and input ownership remain unvalidated.

## Device test incident, 2026-09-29

Repeated xochitl restarts during diagnosis hit the stock service's `StartLimitBurst=4` / `StartLimitIntervalSec=600`. The journal records `start-limit-hit` followed by `rm-emergency.sh`, which rebooted the tablet. The experimental extension and loader diagnostic were removed from `extensions.d`; stock xochitl is active. Never repeat the restart loop or change the device's safety limits to bypass it.

The old rollback timer also restarted xochitl and cannot be treated as safe independently of this rate limit. It is no longer armed. Further loading diagnosis should happen off-device before another controlled hardware test.

Build: `sh integrations/remarkable-ink/build.sh` requires the `zinc-ink-builder` Docker container, the official SDK at `/sdk`, XOVI sources at `/xovi`, and this repository mounted at `/work`.
