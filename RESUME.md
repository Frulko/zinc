# CarPlay worktree handover — 2026-10-29

Branch: Frulko/carplay-finish, dedicated worktree; not merged/pushed to develop.

Real iPhone18,1 / iOS27.0.1 USB CarPlay projects H.264 and automatically plays stereo 48 kHz audio on Mac using software MFi identity outside repo. Main binary was reused read-only until this session; newly built worktree build/zinc adds generic ZINC_TRACKPAD_TOUCHES=1 opt-in. Use this binary for raw built-in/Magic Trackpad contacts; launcher enables it.

ZN-854 implementation: native Debug sidebar GPS presets/manual fix/GPX timeline, stream111 cluster preview, decoded iAP2 HUD logs, two-contact mouse simulation and keyboard focus handling; persistent private USB pair store and bounded unlock wait; Linux BlueZ wireless stdio helper plus existing macOS wireless. Backend source overlays remain reproducible via plugins/carplay/backend/usb/prepare; never edit generated build/carplay/playport directly.

Validation: full backend protocol/server build and tests pass, including cluster-enabled GPS routing, GPX bounds/XXE/interpolation, NMEA subscriptions, HUD partial updates, UDP PCM endian correction and private pair-store policy. CarPlay media/control, debug demo, raw-touch policy and BlueZ byte pump have targeted tests. See docs/reports/zinc-next-carplay.md and task ZN-854 for latest proof.

Manual acceptance remains: persisted trust on second USB startup/locked phone, fixed PCM microphone Siri recognition, display-addressed day/night, physical two-finger trackpad, injected GPS, real macOS wireless and Raspberry Pi. No Pi/Linux build/run or hardware decode/FPS claim. USB NCM sometimes needed a cable reconnect. Do not reset phone trust or delete keys blindly.

Run backend as before with explicit USB serial and external identity, optionally ZINC_CARPLAY_CLUSTER=1 before startup. Viewer: ZINC=$PWD/build/zinc ZINC_BACKGROUND=0 ZINC_CARPLAY_DEBUG=1 ZINC_CARPLAY_URL='ws://127.0.0.1:18080/ws?token=zinc-usb-test' examples/carplay/run --live. No agent-started app/server should be left running.

Latest viewer follow-up: numbered finger rings + mini trackpad map; keyboard captured by default, F6/header button releases for GPS/UI editing, F6/video click recaptures. Zinc focus integration regression and negative-ID scripted screenshot pass. No backend restart needed for this viewer-only follow-up.
F7 / Trackpad ON-OFF toggles native touch forwarding/markers independently; disabling releases contacts immediately and keeps mouse input.

Latest HUD follow-up: real stream111 960×360 aspect confirmed by owner. Configurable backend ZINC_CARPLAY_CLUSTER_WIDTH/HEIGHT, prominent nav/music HUD, GPX sample button, coalesced iAP2 logs, per-sentence NMEA send and successful-write counts. Public iAP2 capability review recorded in report; lane guidance and seek remain unimplemented. Current targeted checks recorded in task/report.

Validation: backend build/protocol/server tests, carplay, carplay_demo and carplay_usb pass. Final HUD fixture capture inspected; custom dimension validation and partial media updates have regression tests. Real custom resolution and populated music metadata still need phone acceptance.

Latest follow-up: artwork session12 receive/ack + bounded PNG/JPEG + native HUD cover ID matching/cleanup implemented; backend build/tests and carplay/carplay_demo/carplay_usb pass. Live screenshot proves Apple Maps/Spotify metadata. GPS unresolved: localhost read-only inspection shows subscribed+Paris, TX656→662/3s; requested selectors now visible/filter output. Unicode pipeline passes regression, source diagnostic flags literal '?' or invalid UTF8; no blind punctuation replacement. Need user restart backend+viewer, change song, run sample GPX, inspect GPS selectors/counters and instruction source journal. Pending user text request issued for those logs. No agent-started services remain.
