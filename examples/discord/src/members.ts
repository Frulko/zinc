// The member list of the open channel (docs/reports/discord-client-research.md 2.5). Op 37 subscribes the server's open channel to its first
// 100 rows; GUILD_MEMBER_LIST_UPDATE answers with a SYNC of that range, then INSERT, UPDATE, DELETE and INVALIDATE as people come, go and
// change status. The rows are group headers (online, offline, or a hoisted role, with their count) and members.
// The shape read here is the one the report gives (from Litecord's issue), not checked against a capture of the web client: op 37's body is
// in subscription() and the update's in applyMemberListUpdate() only, so a correction stays in these two functions.
// ponytail: one list per server, the one of the open channel (Discord's list id, a hash of the channel's permissions, is not read).

export class MemberRow {
  /** A header: the group's id ('online', 'offline' or a role id) and how many it holds; '' for a member. */
  group = ''; count: i32 = 0;
  /** A member: the user, the server nickname ('' when none) and the presence ('online', 'idle', 'dnd', 'offline'). */
  userId = ''; nick = ''; status = '';
}

/** The body of op 37 for the first 100 rows of one channel. */
export function subscription(guildId: string, channelId: string): any {
  const channels: any = {};
  channels[channelId] = [[0, 99]];
  const guilds: any = {};
  guilds[guildId] = { typing: true, activities: true, threads: true, channels: channels };
  return { subscriptions: guilds };
}

const str = (v: any): string => typeof v === 'string' ? v : '';

/** A row of the update: a group or a member. `person` keeps the user object and gives its id. */
function row(item: any, person: (u: any) => string): MemberRow {
  const r = new MemberRow();
  const g: any = item.group, m: any = item.member;
  if (g !== undefined && g !== null) { r.group = str(g.id); r.count = g.count ?? 0; return r; }
  if (m === undefined || m === null) return r;
  r.userId = person(m.user);
  r.nick = str(m.nick);
  const p: any = m.presence;
  r.status = p !== undefined && p !== null ? str(p.status) : 'offline';
  return r;
}

/** Applies GUILD_MEMBER_LIST_UPDATE's ops to `rows`, in place, and the groups' counts to their headers. */
export function applyMemberListUpdate(rows: MemberRow[], d: any, person: (u: any) => string): void {
  if (Array.isArray(d.ops)) for (const op of d.ops) {
    const kind = str(op.op);
    if (kind === 'SYNC' || kind === 'INVALIDATE') {
      const from: i32 = op.range[0], to: i32 = op.range[1];
      const items: MemberRow[] = [];
      if (kind === 'SYNC' && Array.isArray(op.items)) for (const it of op.items) items.push(row(it, person));
      const kept = rows.slice(0, Math.min(from, rows.length)), after = rows.slice(Math.min(to + 1, rows.length));
      rows.length = 0;
      for (const r of kept) rows.push(r);
      for (const r of items) rows.push(r);
      for (const r of after) rows.push(r);
    } else if (kind === 'INSERT') rows.splice(op.index, 0, row(op.item, person));
    else if (kind === 'UPDATE') { const i: i32 = op.index; if (i >= 0 && i < rows.length) rows[i] = row(op.item, person); }
    else if (kind === 'DELETE') { const i: i32 = op.index; if (i >= 0 && i < rows.length) rows.splice(i, 1); }
  }
  if (Array.isArray(d.groups)) for (const g of d.groups) for (const r of rows) if (r.group !== '' && r.group === str(g.id)) r.count = g.count ?? 0;
}
