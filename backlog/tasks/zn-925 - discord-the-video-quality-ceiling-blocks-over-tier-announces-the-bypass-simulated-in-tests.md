---
id: ZN-925
title: >-
  discord: the video quality ceiling blocks over-tier announces, the bypass
  simulated in tests
status: Done
assignee: []
created_date: '2026-10-31 11:44'
updated_date: '2026-10-31 11:45'
labels:
  - discord
dependencies: []
ordinal: 619460
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 zinc:discord-voice clamps every setCamera announce to VoiceConnection.ceiling (default the free tier) and logs a clamp
- [x] #2 examples/discord raises Go Live's ceiling to 1080p 60 only with Nitro (premium_type); cameras stay at the free ceiling
- [x] #3 tests/t0/discord_call_logic.sh simulates the over-tier announce a client mod would send and sees it clamped, without a network
- [x] #4 docs/reports/discord-video-protocol.md documents who polices quality and the lock
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Blocked at the plugin (zinc:discord-voice index.ts): setCamera clamps every announce to VoiceConnection.ceiling with clampQuality and logs 'over the ceiling'; the default ceiling is the free tier (QUALITY_CEILING 720p30), so nothing is over the tier even before the app speaks. examples/discord: QUALITY_FREE/QUALITY_NITRO in src/safety/policy.ts, streamCeiling(nitro) in call.ts sets the Go Live connection's ceiling (premium_type read in state.ts already), the main connection's stays QUALITY_FREE. Simulated bypass (no network): call-logic.ts clamps a modded 1080p60 announce and checks the tiers; build/zinc run --interp examples/discord/tests/call-logic.ts -> ok. docs/reports/discord-video-protocol.md gains 'Who polices quality (and how we lock it)': op 12 is our word not a grant, the SFU can police the rate, the over-announce is the server-visible fingerprint, police at the relay for one's own servers. Not run against the real Discord: no over-tier send was made (deliberate, the account stays clean); the real-call SFU behaviour stays under the report's 'Open' section.
<!-- SECTION:NOTES:END -->
