# Account safety rules for the Discord client (research, 2026-10-31)

`examples/discord` already guards every request with one safety module (`examples/discord/src/safety/`, commit `a705a2422`, explained
in `discord-safety-model.md` and inventoried in `discord-client-requests.md`). This report gathers, from Discord's own texts and from
the public experience of third-party clients and selfbot users, the behaviours that get a user account limited, flagged, locked or
disabled; maps each to a rule of that module (or says what to add); lists the advice the client cannot enforce; and gives the text of a
Settings page "Account safety".

Scope: behaving as a well-mannered person would. Imitating the official client's identity or fingerprint, and solving or getting around
a captcha, are out of scope and recommended nowhere here (owner decision, `discord-safety-model.md`).

## What the sources say

Read 2026-10-31. Discord publishes no thresholds for user accounts; the numbers it does publish are the API's and the gateway's.

| # | Source | What it says |
|---|---|---|
| S1 | Discord Terms of Service, effective 2025-09-29, <https://discord.com/terms> | Forbids "scraping our services without our written consent, including by using any robot, spider, crawler, scraper"; "spamming, auto-messaging, or auto-dialing people"; "using any unauthorized software designed to modify the services"; to "license, sell, lend, or transfer your account"; "You are responsible for the security of your account". Discord may "suspend or terminate your account ... with or without notice". Third-party clients are not named. |
| S2 | Community Guidelines, updated 2025-08-29, <https://discord.com/guidelines> | 13: "Do not send unsolicited bulk messages (or spam) to others", nor sell spambots, token generators or "CAPTCHA-solving services". 14: "Do not use self-bots or user-bots. Each account must be associated with a human, not a bot." 15: no inauthentic engagement (inflating membership, manipulating metrics). 16: no selling or buying accounts. 19: no ban evasion. |
| S3 | Safety Center, "Tips against spam and hacking", <https://discord.com/safety/360044104071-tips-against-spam-and-hacking> | "Discord uses a proactive spam filter"; "Our automated system will flag bots it suspects are being used for spam or any other suspicious activity"; using a user token in an application, or automating your account, "may result in account suspension or termination"; "You should never give your account password or token to anyone"; never click unexpected links; use 2FA. |
| S4 | "How we're fighting spammers on Discord", <https://discord.com/safety/how-discord-is-fighting-spam> | Most spam comes from generated accounts, then compromised ones, then human-operated ones; Discord bans spammers, hides their DMs behind a warning, watches servers "for inauthentic behavior from new members", warns about suspicious links. |
| S5 | Developer docs, rate limits, <https://docs.discord.com/developers/topics/rate-limits> | Per-route buckets (`X-RateLimit-*`), global 50 requests a second, 10,000 invalid requests (401, 403, 429 not `shared`) in 10 minutes restrict the IP address. |
| S6 | Developer docs, gateway, <https://docs.discord.com/developers/events/gateway> | 120 gateway sends a minute per connection (closed above), 1000 IDENTIFY a day, resume rather than re-identify, jitter on reconnect. |
| S7 | Developer docs, opcodes and status codes, <https://docs.discord.com/developers/topics/opcodes-and-status-codes> | JSON codes 40002 "You need to verify your account", 50178 "The user account must first be verified", 40003 "You are opening direct messages too fast", 50007 "Cannot send messages to this user". |
| S8 | Discord's OAuth2/bot policy as quoted since 2017 (support article "Automated user accounts (self-bots)", which refused our fetch with 403; text via Medium "Selfbots: Explanation and Perspectives") | "Automating normal user accounts (generally called "self-bots") outside of the OAuth2/bot API is forbidden, and can result in an account termination if found." |
| S9 | Server verification levels, <https://discord.com/safety/360043653152-Four-steps-to-a-super-safe-server> and community restatements | Servers can require a verified email, an account older than 5 minutes, membership longer than 10 minutes, or a verified phone ("Highest"). The 5 and 10 minute figures are community-reported. |
| S10 | Warning System and account standing (Discord blog on the DSA; PC Gamer 2023) | Since October 2023 an account has a Standing page (User Settings, Privacy & Safety / My Account, Standing) from "All good" to "At risk"; depending on the violation Discord locks the account out of certain actions instead of banning. |
| S11 | Spy.pet case (Kotaku, 2024) | Accounts that joined about 14,000 open servers and collected members and messages by self-botting were banned. Joining many servers and scraping are enforced against. |
| S12 | Abaddon README, "The Spam Filter", <https://github.com/uowuo/abaddon> | "Discord likes disabling accounts/forcing them to reset their passwords if they think the user is a spam bot"; "third party clients tend to upset the spam filter more often"; usually restored on appeal. Avoid: "Joining or leaving servers (usually main cause of getting caught)", "Frequently disconnecting and reconnecting", "Starting new DMs with people", "Managing your friends list", "Managing your user profile while connected to a third party client". |
| S13 | Dissent README, <https://github.com/diamondburned/dissent> | "Using an unofficial client at all is against Discord's Terms of Service and may cause your account to be banned!"; password login "is untested and may cause your account to be banned". |
| S14 | Legcord README FAQ, <https://github.com/Legcord/Legcord>; Vencord README, <https://github.com/Vendicated/Vencord> | Both say using them breaks the ToS; both say they know of no one banned for the client itself; Vencord advises against using mods on an account you cannot afford to lose. |
| S15 | discord.py-self README, <https://github.com/dolfies/discord.py-self>; issue #684 | "Automating user accounts is against the Discord ToS ... Do so at your own risk." Joining a server by invite asks for a captcha (#684). |
| S16 | discord-lite (in `discord-client-research.md` §2.6, §5) | Refuses to implement friend requests "due to Discord's terms of service"; friend requests are a captcha endpoint. |
| S17 | Discord support community threads: "Suspicious Activity Trigger Too Sensitive, and Lockouts Too Aggressive", "Discord's flagging and disable system for accounts", "Account disabled after joining in a server", "Account irregularly deactivated (spam)", "Phone Verification Timeout", "New login location detected" (support.discord.com/hc/.../community/posts/1500000354482, 4589916768535, 24281783399703, 23634449767575, 360052276313, 7938203605911) | People report: a phone lock after many DMs in a short time or DMs to inactive members of a server; a disable after joining servers quickly; the disable email lists mass DMs, joining many servers very quickly, automation or self-botting and fraud; a lock after a VPN or proxy; "new login location" checks by email after an IP change; a phone number already used on another account refused. Anecdotes, not policy. |
| S18 | "A fatal Discord bug that banned accounts for no reason" (Medium, netcord, 2020) | An official client bug that sent hundreds of API requests tripped the spam filter and disabled accounts at once: request floods count, whoever sends them. |

What Discord says it detects, in its own words: automation of user accounts (S2, S3, S8), bulk unsolicited messages (S2), generated and compromised accounts (S4), inauthentic behaviour of new members in servers (S4), scraping (S1), invalid-request floods (S5), gateway floods and IDENTIFY loops (S6), DMs opened too fast (S7). What users and client authors add (S12, S15, S16, S17): joining and leaving servers, new DMs, friend-list changes, profile edits, frequent reconnects, VPN or datacenter addresses at login, new or unverified accounts.

## 1. The rules

Each rule: the risk, the sources, the rule for the client (Discord's number where there is one, else a conservative value and why),
and whether the module covers it. Paths are under `examples/discord/src/`. "Covered" means the code at `a705a2422` does it.

### Automation and origin

1. **Every action comes from a person.** Risk: self-bot, the one behaviour all of Discord's texts name (S2 §14, S3, S8). Rule: a
   write or a read needs a real key or click within 2 s, window in front; no CLI, IPC, plugin hook, timer or scheduled send.
   Covered: `safety/policy.ts` `HUMAN_S`, `Rule.human`, `Rule.focused`; `safety/index.ts` layer 1; scripted modes only against
   `127.0.0.1` (`guard.allowScripts()`).
2. **No auto-reply, no auto-resend.** Risk: "auto-messaging" (S1). Rule: a message that failed stays failed until the person presses
   it again; only a 429 asking 10 s or less is retried, at most 3 times. Covered: `LONGEST_WAIT_S`, `RETRIES_429`, the `failed` mark
   in `state.ts`. Keep it so when notifications grow quick replies: a reply needs the window and a key.
3. **No scraping.** Risk: ToS scraping clause (S1), Spy.pet (S11). Rule: no member list requests (no op 8, no op 14), op 37 only for
   the channel on screen, history only for a channel opened, older pages one a second while the person scrolls, no prefetch, no
   export. Covered: kinds `history`, `older`, `subscribe`, `posts`; `discord-client-requests.md`. To add: a daily cap on `older`
   (rule 26).

### Messages

4. **No repeated text.** Risk: spam (S2 §13). Rule: the same text refused for 10 minutes in any channel or DM; a short text only from
   its third time in a minute. Covered: `SAME_TEXT_MS`, `SHORT_TEXT`, `SHORT_REPEATS`, `Spam` in `safety/core.ts`.
5. **A person's pace.** Risk: flood (S2 §13, S18). Rule: `send` 1 s gap, 10 a minute, 300 an hour; global 100 a minute, 1500 an hour;
   escalating cooldown 5 s to 10 min. Covered: `RULES`, `GLOBAL_PER_*`, `COOLDOWN_*`. To add: a day cap (rule 26).
6. **Mention spam.** Risk: mass mentions are a classic spam signal and servers' AutoMod blocks them (S2 §13). Rule: more than 5
   mentions refused. Covered: `MENTIONS_MAX`. To add: count `@everyone`, `@here` and role mentions in the 5, and refuse
   `@everyone`/`@here` without MENTION_EVERYONE in the channel (`safety/access.ts`) instead of sending a ping Discord silently drops.
7. **Link spam and invite links.** Risk: invite spam and suspicious links are what DM spam carries (S3, S4, S17). Rule: at most 3 links
   a message (covered: `LINKS_MAX`). To add: at most 1 invite link (`discord.gg/`, `discord.com/invite/`) a message, none in the first
   message of a DM with someone who is not a friend, and the same invite not posted in more than 2 channels in 10 minutes. Conservative:
   one invite answers a question; several are advertising.
8. **Slowmode and permissions.** Risk: repeated 403 and 429 are invalid requests (S5) and look like a bot probing. Rule: check
   SEND_MESSAGES, ATTACH_FILES, ADD_REACTIONS, CONNECT, SPEAK, timeouts and `rate_limit_per_user` before sending. Covered:
   `safety/access.ts`, `guard.countdown`.
9. **Message and upload limits.** Risk: 400s and wasted uploads. Rule: 2000/4000 characters, 10 files, 10/50/100/500 MB. Covered:
   `MESSAGE_MAX*`, `FILES_MAX`, `UPLOAD_*`.
10. **Rapid edits and deletes.** Risk: edit or delete bursts look like automation (wiping a history is a selfbot classic). Rule:
    `edit` 10 a minute, 120 an hour; `delete` 10 a minute, 60 an hour, each delete a separate confirmed click; no bulk delete.
    Covered: `RULES` `edit`, `delete`.
11. **Reaction bursts.** Risk: reaction spam, "manipulating engagement" (S2 §15). Rule: 15 a minute, 200 an hour. Covered: `react`.
    To add: the same emoji on the same message toggled more than 4 times in a minute is refused (add/remove loops are a known
    nuisance and cost two requests each).

### Direct messages and people

12. **New DMs are the riskiest action.** Risk: the top trigger of phone locks and disables (S12, S17), code 40003 (S7). Rule: opening
    a DM with someone new: 5 s gap, 3 a minute, 10 an hour (covered, `dm` kind; no code path yet). To add: 20 a day, only from a click
    on that person's name or profile, only to a friend or someone who shares a server with you; the first message of a new DM to a
    non-friend has no link or invite (rule 7).
13. **40003 "opening direct messages too fast".** Risk: Discord's own warning before a lock (S7). To add: `safety/core.ts` treats
    40003 like a captcha: safe mode, the `dm` kind refused for 1 hour, and the message "Discord says you are opening DMs too fast:
    wait an hour." Not covered today (`startsSafeMode` knows 401, 40002, 50178, captcha and 429).
14. **The same message to many people.** Risk: mass DM, the textbook spam (S2 §13, S17). Rule: rule 4 counts DMs as channels, so the
    same text cannot go to a second DM for 10 minutes. Covered. To add: more than 5 different DMs written to in 10 minutes that had no
    message from you in the last 30 days pauses `dm` and `send` to those DMs for 10 minutes (Conservative: a person answers a few
    people, a spammer writes to many cold ones.)
15. **Friend requests.** Risk: captcha endpoint (S16), friend-list management flagged (S12). Rule: none sent by this client; the
    `friend` rule (2 a minute, 10 an hour) stays as a fence. To add when a path comes: 5 a day, only from a profile click, never to
    someone with no shared server. Recommendation: keep friend management in the official app.
16. **Blocked people and closed DMs.** Risk: 50007 errors count against you and pester people. Covered: `access.ts` blocked people,
    `refusedIn` on 50007.

### Servers

17. **Joining and leaving servers.** Risk: "usually main cause of getting caught" (S12); disable emails cite "joining many servers very
    quickly" (S17); Spy.pet (S11); invite joins ask a captcha (S15). Rule: today no code path; invites open in the browser from a
    click (`Content.tsx` `openUrl`). To add (if a join path is ever written): a `join` kind and a `leave` kind, 60 s gap, 2 an hour,
    5 a day; recommendation: keep joining in the official app or the browser.
18. **New member in a server.** Risk: S4 watches "inauthentic behavior from new members"; verification levels hold new members 10
    minutes (S9). To add: in a server joined less than 10 minutes ago (`joined_at` of the member in READY or GUILD_CREATE), no
    message with a link or a mention, and the first message no sooner than the server's verification level allows; the composer says
    why.

### Account and session

19. **Unverified or new account.** Risk: 40002/50178 (S7), Highest verification level (S9), new accounts are most spam (S4). Rule:
    40002 and 50178 start safe mode with "verify your account in the official app" (covered: `verification()` and `plainError` in
    `safety/core.ts`). To add: read READY's `user.verified` and the account age from the user id's snowflake; an account with no
    verified email, or younger than 7 days, runs with half the caps of every write kind and no new DMs, and Settings shows why.
20. **Captcha.** Risk: solving or bypassing one is spam tooling (S2 §13). Rule: never shown or solved; safe mode 10 minutes and "do
    this once in the official app". Covered: `captcha()`, `SAFE_MODE_MS`.
21. **401 and invalid tokens.** Risk: retrying a dead token is an invalid-request flood (S5). Covered: `tokenRefused`, back to login,
    keychain entry forgotten (`state.ts`).
22. **Invalid-request breaker.** Risk: 10,000 in 10 minutes restricts the IP (S5). Rule: stop at 100. Covered: `INVALID_MAX`,
    `INVALID_WINDOW_MS`.
23. **Logins.** Risk: login floods and repeated failures look like credential stuffing (S3, S17). Rule: `login` 5 s gap, 3 a minute, 10
    an hour (covered). To add for the password and QR logins (ZN-869): after 3 failed attempts in an hour stop for an hour; a captcha,
    an MFA or a "new login location" email answer goes to the official app or the browser, never solved here.
24. **IDENTIFY and reconnects.** Risk: "frequently disconnecting and reconnecting" (S12), IDENTIFY loops (S6). Rule: RESUME first, 1 to
    60 s backoff with jitter, IDENTIFY one per 5 s and 50 a day across launches, a quick restart resumes. Covered: `IDENTIFY_*`,
    `RECONNECT_*`, `RESUME_*`. To add: more than 20 reconnects (RESUME or IDENTIFY) in an hour holds the next one 5 minutes and tells
    the person the network is unstable (a flapping Wi-Fi otherwise reconnects every minute, all day).
25. **One session per machine.** Risk: many parallel sessions of one token. Covered: `zinc:system/instance` lock. Not covered: the same
    token on several machines at once (advice, part 2).
26. **Day caps.** Risk: an hourly cap still allows 24 times it a day; a person does not use a client 24 hours at full pace. To add: a
    `perDay` column in `Rule` and `GLOBAL_PER_DAY`, counted across launches in `zinc:storage` as IDENTIFY already is: `send` 1500,
    `react` 1000, `edit` 300, `delete` 200, `dm` 20, `friend` 5, `older` 1500, global 6000. Conservative: about five busy hours.
27. **Gateway pace.** Covered: 110 sends a minute (`GATEWAY_SENDS_MAX`, Discord closes above 120, S6); presence 2 a minute.
28. **Profile and settings changes.** Risk: "Managing your user profile while connected to a third party client" (S12). Rule: none
    in this client; Settings opens the official web settings in the browser. To add when a path comes: a `profile-edit` kind, 1 a
    minute, 5 a day.
29. **Typing and read marks.** Covered: typing only while typing (8 s), acks only for what is on screen (`typing`, `ack` kinds).
30. **Safe mode on any account warning.** Risk: going on at full pace after Discord pushed back. Covered: safe mode 10 minutes on
    a long 429, captcha, 40002, 50178. To add: 40003 (rule 13); and two safe modes in one day extend the third to 24 hours of
    essential kinds only.
31. **Voice.** Covered only in part: op 4 is paced (`voice` kind); the voice gateway and UDP are paced by `plugins/discord-voice`
    (listed in "What is left" of `discord-client-requests.md`). Joining and leaving calls more than 5 times a minute is refused by
    `call` today; no addition.
32. **Honest identity.** The client says what it is (`discord-client-research.md`, owner decision). No addition, and nothing here
    asks for imitation.

## 2. Advice the client cannot enforce

Shown in the Settings page and at the first login:

- **Discord's rules on third-party clients, honestly.** Discord's guidelines forbid self-bots and say every account belongs to a human
  (S2); its terms forbid unauthorised software that modifies the services and automated access (S1); Discord does not support or
  approve third-party clients, and the authors of Dissent, Legcord and Vencord say plainly that using one is against the Terms of
  Service (S13, S14). Those projects also report that Discord rarely acts on the client itself; it acts on behaviour that looks like a
  bot or a spammer, and third-party clients trip its spam filter more easily (S12). Use this app at your own risk.
- **Try it on a secondary account first**, or use an account you could afford to lose (S14).
- **Verify your email, and add a phone number** in the official app: unverified accounts are refused many actions (S7, S9), and a
  phone on the account is what Discord asks for when it locks one.
- **Turn on two-factor authentication** (S3).
- **Never share your token or password**, never paste it into a website, a bot or another app, and never paste code into a console
  because someone asked (S3). Anyone with the token is you. If it may have leaked, change your password: that ends every session.
- **Log in from your usual connection.** VPNs, proxies and datacenter addresses, and logins from many places at once, set off "new
  login location" checks and locks (S17). Turn the VPN off to log in.
- **Keep the official app or the website for account changes**: joining and leaving servers, friend requests, profile, password,
  phone, 2FA, and any captcha or verification Discord asks for (S12, S15, S16).
- **Do not use the same token on several machines at once**, and log out of this app on a machine you stop using.
- **If Discord warns you, stop and check your Standing** (User Settings, Account Standing) in the official app (S10); appeals go
  through Discord's support form.
- **Do not run scripts or macros on top of this app.** It sends nothing on its own; a macro tool typing for you is still a self-bot.

## 3. The Settings page "Account safety"

Ready to put in the app (`components/Settings.tsx`, a third tab next to Servers and Voice & audio). Plain English, one line per rule.

---

**Account safety**

This app talks to Discord as you, with your account. Discord does not approve third-party apps, and its rules forbid bots that run a
person's account. It acts on accounts that behave like bots or spammers. This app keeps you to a person's pace; the rest is up to you.

**What this app does for you**

- It sends nothing on its own. Every message, reaction and click needs your key or click, with the window in front.
- It never retries a failed message by itself. Press it again to resend.
- It slows you down when you go faster than a person: you see "Slow down: wait N s." and a countdown.
- It refuses the same message twice in ten minutes, in any channel or DM.
- It refuses more than 5 mentions or 3 links in one message.
- It follows each channel's slowmode and your permissions, and tells you before Discord refuses.
- It never downloads member lists or whole histories. It loads only what you open and scroll to.
- It opens invite links in your browser. Joining servers is done in Discord itself.
- It sends no friend requests and changes nothing in your profile.
- It reconnects slowly and resumes your session instead of logging in again.
- It runs once per computer.
- When Discord pushes back (a captcha, a verification, "too fast"), it goes quiet for a while and tells you what to do.
- It never shows or solves a captcha. Do that step in the official app.
- It keeps your token in this computer's keychain and forgets it when you log out.

**What you should do**

- Try this app on a secondary account first, or on one you could afford to lose.
- Verify your email and add a phone number in the official Discord app.
- Turn on two-factor authentication.
- Never give your token or password to anyone. If it may have leaked, change your password.
- Turn off your VPN or proxy when you log in.
- Use the official app or discord.com for joining servers, friends, your profile and security settings.
- Do not stay logged in with the same account on many computers at once.
- Do not use macros or scripts with this app.
- If Discord warns you, stop, and check User Settings, Account Standing in the official app.

**Your account now**

- Email: verified / not verified (verify it in the official app)
- Account age: N days (new accounts get lower limits for 7 days)
- Safe mode: off / on until HH:MM (reason)
- Logins today: N of 50

---

The "Your account now" lines read READY's user (`verified`, the id's timestamp) and the guard (`safeUntil`, `identifiesToday()`);
they need rule 19's addition for the first two.

## Rules to add to the module

In `safety/policy.ts`, `safety/core.ts`, `safety/access.ts` and `safety/index.ts`, in the order of their value:

1. Rule 13: code 40003 starts safe mode and refuses `dm` for 1 hour.
2. Rule 26: a `perDay` cap per kind and `GLOBAL_PER_DAY`, kept across launches.
3. Rule 19: unverified email or account younger than 7 days: half caps on writes, no new DMs, shown in Settings.
4. Rule 12 and 14: `dm` 20 a day, only to friends or people sharing a server; the cold-DM fan-out pause.
5. Rule 7: one invite link a message, none in a first DM to a non-friend, the same invite in at most 2 channels in 10 minutes.
6. Rule 6: `@everyone`, `@here` and roles count as mentions; `@everyone`/`@here` needs MENTION_EVERYONE.
7. Rule 24: more than 20 reconnects an hour hold the next 5 minutes.
8. Rule 30: a third safe mode in a day lasts 24 hours.
9. Rule 18: no links or mentions in a server joined less than 10 minutes ago.
10. Rule 11: the same reaction toggled more than 4 times a minute is refused.
11. Rule 23 (with ZN-869): 3 failed logins an hour stop logins for an hour.
12. Rules 17 and 28 (only if a path is ever written): `join`/`leave` 60 s, 2 an hour, 5 a day; `profile-edit` 1 a minute, 5 a day.
