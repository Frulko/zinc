// Settings, Account safety: what the app does to keep the account safe, what the person should do, and the account now, read live from the
// guard (src/safety): the email and the account's age, safe mode, the pauses in force and today's counts against their caps. The text is
// docs/reports/discord-account-safety-rules.md's; nothing here holds a number of its own.
import { Switch } from 'zinc:ui/kit';
import * as guard from '../safety/index';
import { TEXT_MAIN, TEXT_MUTED, TEXT_STRONG } from '../constants';

const DOES: string[] = [
  'It sends nothing on its own. Every message, reaction and click needs your key or click, with the window in front.',
  'It never retries a failed message by itself. Press it again to resend.',
  'It slows you down when you go faster than a person: you see "Slow down: wait N s." and a countdown.',
  'It keeps a day\'s total of messages, reactions, edits and deletes, and stops at a busy person\'s day.',
  'It refuses the same message twice in ten minutes, in any channel or DM.',
  'It refuses more than 5 mentions (@everyone, @here and roles count), 3 links or 1 invite in one message, and @everyone where you may not use it.',
  'It opens new DMs only with friends and people who share a server with you, and pauses when you write to many people you had not talked to in a while.',
  'In a server you joined a moment ago, links and mentions wait 10 minutes.',
  'It follows each channel\'s slowmode and your permissions, and tells you before Discord refuses.',
  'It never downloads member lists or whole histories. It loads only what you open and scroll to.',
  'It opens invite links in your browser. Joining servers is done in Discord itself.',
  'It sends no friend requests and changes nothing in your profile.',
  'It reconnects slowly and resumes your session instead of logging in again; a connection that keeps dropping waits a few minutes.',
  'It runs once per computer.',
  'When Discord pushes back (a captcha, a verification, "too fast"), it goes quiet for a while and tells you what to do; the third time in a day, for the rest of the day.',
  'A new account, or one with no verified email, gets lower limits and no new DMs for its first 7 days.',
  'It never shows or solves a captcha. Do that step in the official app.',
  'It keeps your token in this computer\'s keychain and forgets it when you log out.',
];
const SHOULD: string[] = [
  'Try this app on a secondary account first, or on one you could afford to lose.',
  'Verify your email and add a phone number in the official Discord app.',
  'Turn on two-factor authentication.',
  'Never give your token or password to anyone. If it may have leaked, change your password.',
  'Turn off your VPN or proxy when you log in.',
  'Use the official app or discord.com for joining servers, friends, your profile and security settings.',
  'Do not stay logged in with the same account on many computers at once.',
  'Do not use macros or scripts with this app.',
  'If Discord warns you, stop, and check User Settings, Account Standing in the official app.',
];
const NAMES: Map<string, string> = new Map<string, string>([['send', 'Messages'], ['react', 'Reactions'], ['edit', 'Edits'], ['delete', 'Deletes'],
  ['dm', 'New DMs'], ['friend', 'Friend requests'], ['join', 'Servers joined'], ['leave', 'Servers left'], ['profile-edit', 'Profile changes'],
  ['older', 'Older pages'], ['all', 'All requests'], ['identify', 'Logins to the gateway']]);

const Heading = (p: { text: string }) => <Text className={`pt-5 pb-2 text-xs font-bold uppercase ${TEXT_MUTED}`}>{p.text}</Text>;
const Line = (p: { text: string }) => <Text className={`pb-1.5 text-sm ${TEXT_MAIN}`}>{`• ${p.text}`}</Text>;
function Fact(p: { label: string; value: string }) {
  return <View className="h-[26] flex-row items-center gap-3">
    <Text className={`w-[200] text-sm ${TEXT_MUTED}`}>{p.label}</Text>
    <Text className={`grow basis-0 text-sm ${TEXT_STRONG}`} numberOfLines={1}>{p.value}</Text>
  </View>;
}

/** Safe mode, switched by the person: only what the person does goes out while it is on (the shield of the user bar too). */
export function SafeModeSwitch() {
  const end = guard.safeModeEnd();
  return <View className="pt-4 flex-row items-center gap-3">
    <View className="grow basis-0">
      <Text className={`text-sm font-semibold ${TEXT_STRONG}`}>Safe mode</Text>
      <Text className={`text-xs ${TEXT_MUTED}`}>{end > 0 ? `Discord pushed back: on until ${guard.clock(end)}.` : 'Only what you do yourself goes out: no typing indicator, read marks, presence, GIFs, pins or older pages.'}</Text>
    </View>
    <Switch checked={() => guard.safeModeOn()} onChange={(on: boolean) => guard.chooseSafeMode(on)} label="Safe mode" />
  </View>;
}

/** The lines of "Your account now", as the page shows them (the safety session prints them too). */
export function accountNow(): string[][] {
  const s = guard.safetyState();
  const rows: string[][] = [];
  rows.push(['Email', s.verified ? 'verified' : 'not verified (verify it in the official app)']);
  rows.push(['Account age', s.ageDays < 0 ? 'not known yet' : `${s.ageDays} days${s.limited ? ' (lower limits for now)' : ''}`]);
  rows.push(['Safe mode', s.safeUntil > 0 ? `on until ${guard.clock(s.safeUntil)} (${s.safeReason})` : s.safeChosen ? 'on (your choice)' : 'off']);
  for (const p of s.pauses) rows.push(['Paused', p]);
  for (const t of s.today) { const n = NAMES.get(t.kind); rows.push([`${n !== undefined ? n : t.kind} today`, `${t.count} of ${t.cap}`]); }
  return rows;
}

export function AccountSafety() {
  return <View className="px-6 pb-6">
    <Text className={`pt-4 text-sm ${TEXT_MAIN}`}>This app talks to Discord as you, with your account. Discord does not approve third-party apps, and its rules forbid bots that run a person's account. It acts on accounts that behave like bots or spammers. This app keeps you to a person's pace; the rest is up to you.</Text>
    <Text className={`pt-2 text-sm ${TEXT_MAIN}`}>Honestly: Discord's terms forbid unauthorised software and automated access, and the authors of other third-party clients say plainly that using one is against them. They also report that Discord rarely acts on the client itself, but on behaviour that looks like a bot, and that third-party clients trip its spam filter more easily. This app does not pretend to be the official one. Use it at your own risk.</Text>
    <SafeModeSwitch />
    <Heading text="What this app does for you" />
    {DOES.map((t: string) => <Line key={t} text={t} />)}
    <Heading text="What you should do" />
    {SHOULD.map((t: string) => <Line key={t} text={t} />)}
    <Heading text="Your account now" />
    {accountNow().map((r: string[]) => <Fact key={r[0] + r[1]} label={r[0]} value={r[1]} />)}
  </View>;
}
