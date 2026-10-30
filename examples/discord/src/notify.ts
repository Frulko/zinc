// Who notifies (docs/reports/discord-client-research.md 6): the user's notification settings (READY user_guild_settings, then
// USER_GUILD_SETTINGS_UPDATE), their roles per server (READY merged_members) and a message as Discord sends it. Pure: no state of the screen,
// so tests/notify-rules.ts runs it over recorded events. The window's focus and the servers switched off in the app are checked by state.ts.
// ponytail: threads are not followed yet (rule 7): a thread's message notifies as its channel's.

export const ALL = 0, MENTIONS = 1, NOTHING = 2, INHERIT = 3;
const SUPPRESS_NOTIFICATIONS = 1 << 12;
const T_RECIPIENT_REMOVE = 2;
const CH_DM = 1, CH_GROUP_DM = 3, CH_VOICE = 2, CH_STAGE = 13;

const str = (v: any): string => typeof v === 'string' ? v : '';
/** muted, and its mute_config.end_time (ISO) not passed: no end time is muted until unmuted. */
function mutedNow(o: any, now: number): boolean {
  if (o.muted !== true) return false;
  const c: any = o.mute_config;
  const end = c !== undefined && c !== null ? str(c.end_time) : '';
  return end === '' || Date.parse(end) > now;
}

class Level { level: i32 = INHERIT; muted: any = null; }
class Settings {
  level: i32 = INHERIT; raw: any = null; suppressEveryone = false; suppressRoles = false;
  channels: Map<string, Level> = new Map<string, Level>();
}

/** The channel a message is in, as the rules need it. */
export class Where { id = ''; guildId = ''; type: i32 = 0; parentId = ''; }

export class NotifyRules {
  private settings: Map<string, Settings> = new Map<string, Settings>();   // by server id, '' for the DMs (guild_id null)
  private defaults: Map<string, i32> = new Map<string, i32>();             // default_message_notifications of each server
  private roles: Map<string, string[]> = new Map<string, string[]>();      // my roles in each server
  me = '';

  /** READY: the settings, each server's default level and my roles in it. */
  load(d: any): void {
    this.settings.clear(); this.defaults.clear(); this.roles.clear();
    this.me = d.user !== undefined && d.user !== null ? str(d.user.id) : '';
    const ugs: any = d.user_guild_settings;
    const entries: any = ugs !== undefined && ugs !== null && Array.isArray(ugs.entries) ? ugs.entries : ugs;
    if (Array.isArray(entries)) for (const e of entries) this.update(e);
    if (Array.isArray(d.guilds)) for (let i = 0; i < d.guilds.length; i++) {
      const g: any = d.guilds[i];
      const p: any = g.properties !== undefined && g.properties !== null ? g.properties : g;
      this.defaults.set(str(g.id), typeof p.default_message_notifications === 'number' ? p.default_message_notifications : ALL);
      const members: any = Array.isArray(d.merged_members) && i < d.merged_members.length ? d.merged_members[i] : null;
      if (Array.isArray(members)) for (const m of members) if (str(m.user_id) === this.me && Array.isArray(m.roles)) {
        const list: string[] = [];
        for (const r of m.roles) list.push(str(r));
        this.roles.set(str(g.id), list);
      }
    }
  }
  /** One server's settings (an entry of READY, or USER_GUILD_SETTINGS_UPDATE). */
  update(e: any): void {
    const s = new Settings();
    s.raw = e;
    s.level = typeof e.message_notifications === 'number' ? e.message_notifications : INHERIT;
    s.suppressEveryone = e.suppress_everyone === true; s.suppressRoles = e.suppress_roles === true;
    if (Array.isArray(e.channel_overrides)) for (const o of e.channel_overrides) {
      const l = new Level();
      l.level = typeof o.message_notifications === 'number' ? o.message_notifications : INHERIT;
      l.muted = o;
      s.channels.set(str(o.channel_id), l);
    }
    this.settings.set(str(e.guild_id), s);
  }
  /** A server's default level (GUILD_CREATE of a server joined after READY). */
  setDefault(guildId: string, level: i32): void { this.defaults.set(guildId, level); }

  /** The message names me: directly, by one of my roles or @everyone/@here (unless the server suppresses those). */
  mentions(m: any, guildId: string): boolean {
    if (Array.isArray(m.mentions)) for (const u of m.mentions) if (str(u.id) === this.me) return true;
    const s = this.settings.get(guildId);
    if (m.mention_everyone === true && !(s !== undefined && s.suppressEveryone)) return true;
    const mine = this.roles.get(guildId);
    if (Array.isArray(m.mention_roles) && mine !== undefined && !(s !== undefined && s.suppressRoles))
      for (const r of m.mention_roles) if (mine.indexOf(str(r)) >= 0) return true;
    return false;
  }

  /** Muted: the server, the channel or its category, until their end time. */
  muted(c: Where, now: number): boolean {
    const s = this.settings.get(c.guildId);
    if (s === undefined) return false;
    if (c.guildId !== '' && mutedNow(s.raw, now)) return true;
    for (const id of [c.id, c.parentId]) {
      const l = s.channels.get(id);
      if (l !== undefined && mutedNow(l.muted, now)) return true;
    }
    return false;
  }

  /** The level of a server's channel: its override, its category's, the server's, the server's default. */
  level(c: Where): i32 {
    const s = this.settings.get(c.guildId);
    if (s !== undefined) {
      for (const id of [c.id, c.parentId]) { const l = s.channels.get(id); if (l !== undefined && l.level !== INHERIT) return l.level; }
      if (s.level !== INHERIT) return s.level;
    }
    const d = this.defaults.get(c.guildId);
    return d !== undefined ? d : ALL;
  }

  /** Whether the message pops a notification (the focus and the app's own settings aside). */
  notifies(m: any, c: Where, now: number): boolean {
    if (m.author === undefined || m.author === null || str(m.author.id) === this.me) return false;
    if (((typeof m.flags === 'number' ? m.flags : 0) & SUPPRESS_NOTIFICATIONS) !== 0) return false;
    if (m.type === T_RECIPIENT_REMOVE) return false;
    const named = this.mentions(m, c.guildId);
    if (c.type === CH_DM || c.type === CH_GROUP_DM) return named || !this.muted(c, now);
    if (this.muted(c, now)) return false;
    const l = this.level(c);
    if (l === NOTHING) return false;
    if (l === MENTIONS) return named;
    return named || (c.type !== CH_VOICE && c.type !== CH_STAGE);
  }
}
