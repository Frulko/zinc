---
id: ZN-1054
title: 'Discord client: session and login safety'
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-07 16:40'
updated_date: '2026-11-09 05:50'
labels:
  - discord
  - size-S
milestone: m-28
dependencies: []
ordinal: 10900
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The client starts a new gateway session at every launch and can run twice; small safety gaps listed by the ZN-886/890/910 lines.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- ZN-886: resume the gateway session across launches (save session_id, seq and resume_gateway_url at quit), so a quick restart does not start a new session.
- ZN-886: refuse a second instance of the Discord client (two processes would hold two sessions for one token).
- ZN-886: make the daily IDENTIFY cap span launches (it is per process now).
- ZN-886: give the fake Discord a 401, a captcha 400, a long 429 and op 9 d:false so the T1 session proves safe mode and the identify backoff.
- ZN-890: Cmd+Q through the menu's quit role does not go through store.suspend() in Discord, so that quit is not resumed at the next launch.
- ZN-910: keep failed logins across launches in zinc:storage (memory only now).
- ZN-910: show the Account safety page at the first login too.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Gateway session resumes across launches (session_id, seq, resume url saved at quit, also on Cmd+Q)
- [x] #2 A second instance is refused; the daily IDENTIFY cap spans launches
- [x] #3 Failed logins persist in zinc:storage; the fake Discord gives 401, captcha 400, long 429 and op 9 d:false and the T1 proves safe mode
- [x] #4 Account safety page also shown at first login
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Research (sonnet sub-agent, 2026-11-09): READY's resume_gateway_url is where to RESUME (op 6: token, session_id, seq); the resume window is not a documented number, Discord ends it with close 4009 or op 9 d:false, and a client close of 1000/1001 kills the session (the client suspends with 4000, so it stays resumable); op 9 d:false means a new IDENTIFY on the default gateway URL; 1000 IDENTIFY a day, one per 5 s per bucket (https://docs.discord.com/developers/events/gateway, https://docs.discord.com/developers/events/gateway-events, https://docs.discord.com/developers/topics/opcodes-and-status-codes). discord.js persists sessions only through its retrieveSessionInfo/updateSessionInfo hooks (https://discord.js.org/docs/packages/ws/main/WebSocketManagerOptions:Interface); discord.py keeps session_id and seq in memory only (https://github.com/Rapptz/discord.py/blob/master/discord/gateway.py). 429 retry_after in seconds, 10,000 invalid requests (401/403/429) per 10 min per IP (https://docs.discord.com/developers/topics/rate-limits); captcha 400 shape (https://discord-userdoccers.vercel.app/topics/captcha-handling). Single instance: flock, held for the process, released by the kernel at death; O_EXCL pid files go stale (https://lists.samba.org/archive/rsync/2020-January/032052.html).

Found done by ZN-890: the session kept at quit (session_id, READY's seq, resume_gateway_url, at most 3 min after quit and 30 min after READY) and resumed at the next launch; one instance through zinc:system/instance (flock on <id>.lock); the IDENTIFY cap of 50 a day kept in zinc:storage; the fake's 401, captcha 400, 60 s 429 and op 9 d:false in tests/t1/discord_safety.sh (safe mode, the breaker, the re-IDENTIFY 1 to 5 s later with the day's count).

Done here:
- Cmd+Q: an engine gap of zinc:system. Without a menu of the app's own, Cmd+Q is SDL's quit event, which already runs the close handlers; but Quit of a zinc:system app menu (role:quit) called quit() directly, so a program's close handler (Discord's suspend, the editors' unsaved check) never ran. Now role:quit runs the 'window' close-requested handlers first through the new system.requestClose() (true when none vetoed), as Electron's quit role closes the windows first. Golden tests/golden/system/quit_role_close (a veto, then a quit; t1 system_sim). DISCORD_DEMO=restart now ends through requestClose(), the path of Cmd+Q and the close button.
- Failed logins kept in zinc:storage ('login-failures' times of the last hour, 'login-stop' the pause's end): quitting no longer lifts the 1 h pause after 3 refusals. tests/t1/discord_login.sh gets its own ZINC_STORAGE so its two refusals a run do not pile up.
- Account safety opens (Settings, safety tab) at READY after a login from the login screen, the first time on this machine ('safety-shown'); a token from the keychain or DISCORD_TOKEN at start does not open it, so the other goldens keep their frames. The pending flag is reset on logout and on a refused token.
- tests/t1/discord_safety.sh: two DISCORD_DEMO=login launches after the safety session (three wrong passwords start the pause, the next launch finds it kept; Account safety at the first login only), golden tests/golden/discord-safety/login.out; server.out keeps only what came before them (not run, the owner's milestone).

Proof (develop binary, fake Discord on 127.0.0.1, headless): restart, restart -> identify once, then 'session: resumed from the last launch' and RESUME sess-1 (the quit went through the close handlers); a plain launch running and a second launch -> 'discord: already running'; login, login -> the login.out lines above; tests/run --only discord_ratelimit passes; zinc check examples/discord ok; the system goldens quit_role, quit_role_close, close_without_window, menu, menu_default, window_close, window_veto, window_tray give their expected output on the interpreter.

Note: every launch of the Discord app spends about 15 s compiling (155 files) on the develop binary in this worktree.

Proposed tests:
- tests/run --only system_sim (t1): the quit_role_close golden on the interpreter and AOT, the other system goldens unchanged; about 1 min, little memory.
- tests/run --only discord_safety (t1): the new login launches and login.out; about 1.5 min (two more launches), one app at a time, under 1 GB.
- tests/run --only discord_login (t1): the login T1 with its own storage; about 30 s.
<!-- SECTION:NOTES:END -->
