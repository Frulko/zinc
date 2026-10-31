// The policy of the safety model: every number it uses, in one table (docs/reports/discord-safety-model.md says where each comes from).
// Nothing else in the app holds a limit, a pace or a cooldown.

/** The rule of one kind of request: the shortest interval between two, the cap a minute, an hour and a day (0: none; the day's counts
 *  are kept across launches), whether it needs a person's input
 *  (a key or a click in the window, within HUMAN_S), whether it is essential (safe mode stops the rest), whether it needs the window in
 *  front, and whether a refusal is quiet (no cooldown: a background request that simply waits for the next occasion). */
export class Rule {
  gapMs: number; perMinute: i32; perHour: i32; perDay: i32; human: boolean; essential: boolean; focused: boolean; quiet: boolean;
  constructor(gapMs: number, perMinute: i32, perHour: i32, perDay: i32, human: boolean, essential: boolean, focused: boolean, quiet: boolean) {
    this.gapMs = gapMs; this.perMinute = perMinute; this.perHour = perHour; this.perDay = perDay; this.human = human; this.essential = essential;
    this.focused = focused; this.quiet = quiet;
  }
}
const H = true, E = true, F = true, Q = true, _ = false;
//                                              gap ms  /min  /hour   /day  human essential front quiet
export const RULES: Map<string, Rule> = new Map<string, Rule>([
  // writes: a person's action, at a person's pace
  ['send',      new Rule(1000,   10,  300,  1500,  H, E, F, _)],
  ['upload',    new Rule(1000,    5,   60,     0,  H, E, F, _)],   // the files of a message (then its 'send')
  ['edit',      new Rule(1000,   10,  120,   300,  H, E, F, _)],
  ['delete',    new Rule(1000,   10,   60,   200,  H, E, F, _)],
  ['react',     new Rule(500,    15,  200,  1000,  H, E, F, _)],
  ['vote',      new Rule(1000,   10,   60,     0,  H, E, F, _)],
  ['pin',       new Rule(1000,    5,   30,     0,  H, E, F, _)],   // pin or unpin a message
  ['call',      new Rule(2000,    5,   30,     0,  H, E, F, _)],
  ['ring',      new Rule(5000,    3,   20,     0,  H, E, F, _)],
  ['dm',        new Rule(5000,    3,   10,    20,  H, E, F, _)],   // opening a new DM: no code path does it yet
  ['friend',    new Rule(10000,   2,   10,     5,  H, E, F, _)],   // a friend request: no code path does it yet
  ['join',      new Rule(60000,   1,    2,     5,  H, E, F, _)],   // joining a server: no code path (invites open in the browser)
  ['leave',     new Rule(60000,   1,    2,     5,  H, E, F, _)],   // leaving a server: no code path
  ['profile-edit', new Rule(60000, 1,   5,     5,  H, E, F, _)],   // my profile or settings: no code path (the official app does it)
  ['live',      new Rule(2000,    5,   30,     0,  H, E, F, _)],   // Go Live or watching a stream (its ops are 'stream')
  ['login',     new Rule(5000,    3,   10,     0,  H, E, F, _)],   // POST /auth/login
  ['mfa',       new Rule(5000,    3,   10,     0,  H, E, F, _)],   // the second factor: /auth/mfa/totp, /sms, /sms/send
  // what follows a person's action without being one
  ['qr',        new Rule(5000,    3,   20,     0,  _, E, _, _)],   // a QR code: with the login screen, then only on "New code"
  ['ticket',    new Rule(0,       3,   10,     0,  _, E, _, _)],   // the QR code's ticket for the token, once the phone confirmed
  ['stream',    new Rule(0,      20,  300,     0,  _, E, _, _)],   // Go Live's ops 18, 20, 22 (ending one, op 19, always goes)
  ['typing',    new Rule(8000,   10,  300,     0,  H, _, F, Q)],   // Discord shows "typing" 10 s: sent again every 8 s while typing
  ['ack',       new Rule(0,      60, 1500,     0,  _, _, F, Q)],   // only what the window in front shows is marked read
  ['voice',     new Rule(0,      20,  300,     0,  _, E, _, _)],   // op 4: mute, deafen, the join itself (leaving always goes)
  ['presence',  new Rule(60000,   2,   20,     0,  _, _, _, Q)],   // op 3: idle after a long absence, online again
  ['subscribe', new Rule(0,      30,  600,     0,  _, _, _, Q)],   // op 37: the open channel's member list
  // reads: only what a person opens or scrolls to; no prefetch, no crawl, no polling
  ['history',   new Rule(0,      20,  300,     0,  H, E, F, _)],   // a channel opened the first time
  ['older',     new Rule(1000,   10,  200,  1500,  H, _, F, Q)],   // a page before, the history scrolled to its top
  ['posts',     new Rule(1000,   10,  100,     0,  H, _, F, _)],   // a forum opened
  ['pins',      new Rule(1000,   10,  100,     0,  H, _, F, _)],   // a channel's pins opened
  ['profile',   new Rule(1000,   10,  100,     0,  H, _, F, _)],   // no code path yet
  ['search',    new Rule(2000,    5,   60,     0,  H, _, F, _)],   // no code path yet
  ['refresh',   new Rule(0,      10,  200,     0,  _, _, _, Q)],   // expired picture URLs on screen
]);
/** Every kind together (the day's count kept across launches: about five busy hours). */
export const GLOBAL_PER_MINUTE = 100, GLOBAL_PER_HOUR = 1500, GLOBAL_PER_DAY = 6000;
/** The kinds that write something in Discord: a young or unverified account gets half their caps (minute, hour, day). */
export const WRITES: string[] = ['send', 'upload', 'edit', 'delete', 'react', 'vote', 'pin', 'dm', 'friend', 'join', 'leave', 'profile-edit'];
/** A young account (from its id's timestamp) or one with no verified email: half the write caps and no new DM. */
export const YOUNG_ACCOUNT_MS = 7 * 86400000;
/** A new DM goes only to a friend or someone sharing a server. A DM is cold when nobody wrote in it for COLD_DM_QUIET_MS: writing in
 *  more than COLD_DMS_MAX cold DMs within COLD_DM_WINDOW_MS pauses new DMs and cold DMs for COLD_DM_PAUSE_MS. */
export const COLD_DM_QUIET_MS = 30 * 86400000, COLD_DMS_MAX = 5, COLD_DM_WINDOW_MS = 600000, COLD_DM_PAUSE_MS = 600000;
/** Discord's 40003 "opening direct messages too fast": safe mode, and no new DM for an hour. */
export const DM_TOO_FAST_MS = 3600000;
/** In a server joined less than NEW_MEMBER_MS ago: no link and no mention (and nothing at all when the server's verification level is
 *  High, as Discord holds new members 10 minutes; Medium wants an account older than ACCOUNT_MIN_MS). */
export const NEW_MEMBER_MS = 600000, ACCOUNT_MIN_MS = 300000;
/** The same reaction on the same message put on or taken off more than REACTION_TOGGLES times a minute is refused. */
export const REACTION_TOGGLES = 4;
/** LOGIN_FAILURES refused passwords or codes within an hour stop the password login for LOGIN_PAUSE_MS. */
export const LOGIN_FAILURES = 3, LOGIN_PAUSE_MS = 3600000;
/** More than RECONNECTS_MAX reconnections (RESUME or IDENTIFY) in an hour: the next waits RECONNECT_HOLD_MS. */
export const RECONNECTS_MAX = 20, RECONNECT_HOLD_MS = 300000;
/** The third safe mode within a day lasts a whole day (only the essential kinds go). */
export const SAFE_MODES_BEFORE_LONG = 2, SAFE_MODE_LONG_MS = 86400000;
/** A person's input counts this long; a refusal starts a cooldown that doubles each time in a row, forgotten after a quiet while. */
export const HUMAN_S = 2, COOLDOWN_MS = 5000, COOLDOWN_MAX_MS = 600000, STRIKES_FORGOTTEN_MS = 600000;

// A message's text
export const MESSAGE_MAX = 2000, MESSAGE_MAX_NITRO = 4000;
/** @everyone, @here and roles count as mentions. One invite link a message, the same invite in INVITE_CHANNELS_MAX channels at most
 *  within INVITE_WINDOW_MS, and no link or invite in the first message of a DM with someone who is not a friend. */
export const MENTIONS_MAX = 5, LINKS_MAX = 3, INVITES_MAX = 1, INVITE_CHANNELS_MAX = 2, INVITE_WINDOW_MS = 600000;
/** The same text (near-same: case, spaces and punctuation aside) is refused for SAME_TEXT_MS, anywhere; a short one (under SHORT_TEXT
 *  characters: "ok", "lol") only from its SHORT_REPEATS-th time in a minute in one channel. */
export const SAME_TEXT_MS = 600000, SHORT_TEXT = 8, SHORT_REPEATS = 3;
// Files: 10 a message; 10 MB, 50 MB with Nitro Basic or Classic or a level 2 server, 100 MB in a level 3 server, 500 MB with Nitro
export const FILES_MAX = 10;
const MB = 1048576;
export const UPLOAD_FREE = 10 * MB, UPLOAD_BASIC = 50 * MB, UPLOAD_TIER2 = 50 * MB, UPLOAD_TIER3 = 100 * MB, UPLOAD_NITRO = 500 * MB;

// Discord's own limits (ZN-886, docs/reports/discord-client-requests.md)
/** 50 requests a second at most; 10,000 refusals (401, 403, 429) in 10 minutes ban an address: the client stops at 100. */
export const GLOBAL_PER_SECOND = 50, INVALID_MAX = 100, INVALID_WINDOW_MS = 600000;
/** A 429 is waited for and retried RETRIES_429 times when it asks LONGEST_WAIT_S or less; else safe mode. */
export const LONGEST_WAIT_S = 10, RETRIES_429 = 3, SAFE_MODE_MS = 600000;
/** A GET answer is kept this long (a second ask in the window sends nothing); a network failure backs off from 1 s to 60 s. */
export const GET_CACHE_MS = 30000, OFFLINE_FIRST_MS = 1000, OFFLINE_MAX_MS = 60000;
/** The gateway: 120 payloads a minute (less room for the heartbeats); 1000 IDENTIFY a day (the client keeps to 50), one per 5 s;
 *  reconnections back off 1 s to 60 s with jitter; op 9 waits 1 to 5 s, doubled each time in a row. */
export const GATEWAY_SENDS_MAX = 110, IDENTIFY_MAX = 50, IDENTIFY_SPACING_MS = 5000, RECONNECT_FIRST_MS = 1000, RECONNECT_MAX_MS = 60000;
export const INVALID_SESSION_MS = 1000, INVALID_SESSION_SPREAD_MS = 4000;
/** A session left at quit is resumed by a launch at most RESUME_FRESH_MS later, when its READY is at most RESUME_SESSION_MS old. */
export const RESUME_FRESH_MS = 180000, RESUME_SESSION_MS = 1800000;
/** The messages arriving in the open channel are marked read once a burst. */
export const ACK_BURST_MS = 300;
/** Idle after 10 min without input, as the official client; checked every 30 s. */
export const IDLE_AFTER_S = 600, PRESENCE_CHECK_MS = 30000;
/** Pictures: 6 downloads at a time (as a browser per host); expired URLs renewed 50 a request (Discord's most). */
export const CDN_AT_ONCE = 6, REFRESH_BATCH = 50;
