// The notification rules (src/notify.ts) over recorded events (notify-events.json: READY's settings in Discord's shape, then messages):
// one line per case, compared with tests/golden/discord/notify.out by tests/demo/discord_notify.sh.
import { readText } from 'zinc:fs';
import { env } from 'zinc:sys';
import { NotifyRules, Where } from '../src/notify';

const rec: any = JSON.parse(readText(env('NOTIFY_EVENTS')));
const rules = new NotifyRules();
rules.load(rec.ready);
const now = Date.parse(rec.now);
for (const c of rec.cases) {
  const w = new Where();
  w.id = c.channel.id; w.guildId = c.channel.guildId; w.type = c.channel.type; w.parentId = c.channel.parentId;
  console.log(`${c.name}: ${rules.notifies(c.message, w, now) ? 'notifies' : 'silent'}`);
}
