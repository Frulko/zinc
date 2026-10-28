# CarPlay worktree handover — 2026-10-29

Branch: Frulko/carplay-finish, dedicated worktree; not merged/pushed to develop.

Real iPhone18,1 / iOS27.0.1 USB CarPlay projects H.264 and automatically plays stereo 48 kHz audio on Mac using software MFi identity outside repo. Main binary was reused read-only until this session; newly built worktree build/zinc adds generic ZINC_TRACKPAD_TOUCHES=1 opt-in. Use this binary for raw built-in/Magic Trackpad contacts; launcher enables it.

ZN-854 implementation: native Debug sidebar GPS presets/manual fix/GPX timeline, stream111 cluster preview, decoded iAP2 HUD logs, two-contact mouse simulation and keyboard focus handling; persistent private USB pair store and bounded unlock wait; Linux BlueZ wireless stdio helper plus existing macOS wireless. Backend source overlays remain reproducible via plugins/carplay/backend/usb/prepare; never edit generated build/carplay/playport directly.

Validation: full backend protocol/server build and tests pass, including cluster-enabled GPS routing, GPX bounds/XXE/interpolation, NMEA subscriptions, HUD partial updates, UDP PCM endian correction and private pair-store policy. CarPlay media/control, debug demo, raw-touch policy and BlueZ byte pump have targeted tests. See docs/reports/zinc-next-carplay.md and task ZN-854 for latest proof.

Manual acceptance remains: persisted trust on second USB startup/locked phone, fixed PCM microphone Siri recognition, display-addressed day/night, physical two-finger trackpad, injected GPS/cluster, real macOS wireless and Raspberry Pi. No Pi/Linux build/run or hardware decode/FPS claim. USB NCM sometimes needed a cable reconnect. Do not reset phone trust or delete keys blindly.

Run backend as before with explicit USB serial and external identity, optionally ZINC_CARPLAY_CLUSTER=1 before startup. Viewer: ZINC=$PWD/build/zinc ZINC_BACKGROUND=0 ZINC_CARPLAY_DEBUG=1 ZINC_CARPLAY_URL='ws://127.0.0.1:18080/ws?token=zinc-usb-test' examples/carplay/run --live. No agent-started app/server should be left running.
