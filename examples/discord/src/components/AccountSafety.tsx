// Settings, Account safety: what the app does to keep the account safe, what the person should do, and the account now, read live from the
// guard (src/safety): the email and the account's age, safe mode, the pauses in force and today's counts against their caps. The text is
// docs/reports/discord-account-safety-rules.md's; nothing here holds a number of its own.
import { Switch } from 'zinc:ui/kit';
import * as guard from '../safety/index';
import { tr, trn } from '../i18n';
import { TEXT_MAIN, TEXT_MUTED, TEXT_STRONG } from '../constants';

const DOES: string[] = [
  'discord.safety.does_1', 'discord.safety.does_2', 'discord.safety.does_3', 'discord.safety.does_4', 'discord.safety.does_5', 'discord.safety.does_6', 'discord.safety.does_7', 'discord.safety.does_8', 'discord.safety.does_9', 'discord.safety.does_10', 'discord.safety.does_11', 'discord.safety.does_12', 'discord.safety.does_13', 'discord.safety.does_14', 'discord.safety.does_15', 'discord.safety.does_16', 'discord.safety.does_17', 'discord.safety.does_18'
];
const SHOULD: string[] = [
  'discord.safety.should_1', 'discord.safety.should_2', 'discord.safety.should_3', 'discord.safety.should_4', 'discord.safety.should_5', 'discord.safety.should_6', 'discord.safety.should_7', 'discord.safety.should_8', 'discord.safety.should_9'
];
const NAMES: string[] = ['send', 'react', 'edit', 'delete', 'dm', 'friend', 'join', 'leave', 'profile-edit', 'older', 'all', 'identify'];

const Heading = (p: { text: string }) => <Text className={`pt-5 pb-2 text-xs font-bold uppercase ${TEXT_MUTED}`}>{p.text}</Text>;
const Line = (p: { text: string }) => <Text className={`pb-1.5 text-sm ${TEXT_MAIN}`}>{`• ${tr(p.text)}`}</Text>;
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
      <Text className={`text-sm font-semibold ${TEXT_STRONG}`}>{tr('discord.safety.safe_mode')}</Text>
      <Text className={`text-xs ${TEXT_MUTED}`}>{end > 0 ? tr('discord.safety.pushed_back', ['time', guard.clock(end)]) : tr('discord.safety.safe_mode_hint')}</Text>
    </View>
    <Switch checked={() => guard.safeModeOn()} onChange={(on: boolean) => guard.chooseSafeMode(on)} label={tr('discord.safety.safe_mode')} />
  </View>;
}

/** The lines of "Your account now", as the page shows them (the safety session prints them too). */
export function accountNow(): string[][] {
  const s = guard.safetyState();
  const rows: string[][] = [];
  rows.push([tr('discord.safety.email'), s.verified ? tr('discord.safety.verified') : tr('discord.safety.not_verified')]);
  rows.push([tr('discord.safety.age'), s.ageDays < 0 ? tr('discord.safety.age_unknown') : `${trn('discord.safety.days', s.ageDays)}${s.limited ? tr('discord.safety.lower_limits') : ''}`]);
  rows.push([tr('discord.safety.safe_mode'), s.safeUntil > 0 ? tr('discord.safety.on_until', ['time', guard.clock(s.safeUntil), 'reason', s.safeReason]) : s.safeChosen ? tr('discord.safety.on_chosen') : tr('discord.safety.off')]);
  for (const p of s.pauses) rows.push([tr('discord.safety.paused'), p]);
  for (const t of s.today) { rows.push([tr('discord.safety.today', ['what', NAMES.indexOf(t.kind) >= 0 ? tr(`discord.safety.kind_${t.kind}`) : t.kind]), tr('discord.safety.count_of', ['count', `${t.count}`, 'cap', `${t.cap}`])]); }
  return rows;
}

export function AccountSafety() {
  return <View className="px-6 pb-6">
    <Text className={`pt-4 text-sm ${TEXT_MAIN}`}>{tr('discord.safety.intro')}</Text>
    <Text className={`pt-2 text-sm ${TEXT_MAIN}`}>{tr('discord.safety.honest')}</Text>
    <SafeModeSwitch />
    <Heading text={tr('discord.safety.does')} />
    {DOES.map((t: string) => <Line key={t} text={t} />)}
    <Heading text={tr('discord.safety.should')} />
    {SHOULD.map((t: string) => <Line key={t} text={t} />)}
    <Heading text={tr('discord.safety.now')} />
    {accountNow().map((r: string[]) => <Fact key={r[0] + r[1]} label={r[0]} value={r[1]} />)}
  </View>;
}
