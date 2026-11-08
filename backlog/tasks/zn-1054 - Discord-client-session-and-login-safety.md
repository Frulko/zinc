---
id: ZN-1054
title: 'Discord client: session and login safety'
status: Backlog
assignee: []
created_date: '2026-11-07 16:40'
labels:
  - discord
  - size-S
milestone: m-28
dependencies: []
ordinal: 1046000
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
- [ ] #1 Gateway session resumes across launches (session_id, seq, resume url saved at quit, also on Cmd+Q)
- [ ] #2 A second instance is refused; the daily IDENTIFY cap spans launches
- [ ] #3 Failed logins persist in zinc:storage; the fake Discord gives 401, captcha 400, long 429 and op 9 d:false and the T1 proves safe mode
- [ ] #4 Account safety page also shown at first login
<!-- AC:END -->
