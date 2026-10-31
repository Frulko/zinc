---
id: ZN-906
title: 'examples/discord: file sending with limits, large-file transfer services'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-30 23:06'
updated_date: '2026-10-31 00:39'
labels:
  - net
  - ui
  - size-M
milestone: m-28
dependencies: []
ordinal: 600460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request: send files with Discord's normal per-user limits (size by Nitro tier, count); when a file is larger, offer to send it through a transfer service (SwissTransfer, WeTransfer or similar with a public API) in an upload window with progress, then post the link; and a provider interface so a self-hostable sharing tool (e.g. PsiTransfer, Pingvin Share, transfer.sh) can be connected by URL and token. Research which services have usable APIs and their terms; never automate beyond the user's own upload.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done. Limits: the guard (ZN-890) already holds them by premium_type and boost tier (safety/access.ts uploadMax: 10 MB free, 50 MB Basic/Classic or boost level 2, 100 MB level 3, 500 MB Nitro; 10 files a message); exported as guard.uploadMax. A larger file opens the transfer window (components/Transfer.tsx): Litterbox (anonymous, 72 h), pixeldrain (API key) or a Gokapi server (URL + API key), behind services/transfer.ts; keys in the keychain (in memory against the fake Discord), choice and URL in zinc:storage; uploads under a 'transfer' verdict (policy.ts, safety-model doc), all files at once (a verdict lasts 60 s), the links posted by a second click (LINKS_MAX in the message, the rest in the composer). Research: docs/reports/discord-file-transfer.md (SwissTransfer, WeTransfer, TransferNow, file.io: no usable public API; Smash paid; Pingvin Share archived; Gokapi chosen over PsiTransfer/transfer.sh/Zipline for its documented API). Engine gap filled: zinc:net fetch had no upload progress and needed the body in the program (u8[] is 8 bytes a byte): RequestInit.bodyFile/bodyPrefix/bodySuffix (new row host.httpFetchFile, the engine reads the file) and onProgress (loop event 43 as 256 KB blocks are written); test tests/t0/net_body_bytes.sh on interpreter, QuickJS and AOT. Proof: tests/run --only discord (scripted transfer(): 11.6 MB file, Gokapi on the fake, progress in several steps, link posted), net_body_bytes, net, net_file, discord_safety, discord_ratelimit, discord_notify. Frame looked at: the transfer window (DISCORD_SHOTS transfer.png). Not done: Discord's 413/40005 refusal does not reopen the window (the pre-check covers the known limits); Gokapi's chunked API; Zipline; cancel of an upload in flight (Hide only); the free limit stays 10 MB until Discord confirms 20 MB.
<!-- SECTION:NOTES:END -->
