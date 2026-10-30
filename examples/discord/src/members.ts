// The member list of the open channel (docs/reports/discord-client-research.md 2.5). Op 37 subscribes the server's open channel to the rows
// on screen, by ranges of 100 (the first range always, as the web client); GUILD_MEMBER_LIST_UPDATE answers with a SYNC of each range, then
// INSERT, UPDATE, DELETE and INVALIDATE as people come, go and change status. The rows are group headers (a hoisted role, online, offline,
// with their count) and members; the list holds every row of the groups' counts, those not synced yet are blank (`known` false).
// The shape read here is the one the report gives (from Litecord's issue), not checked against a capture of the web client: op 37's body is
// in subscription() and the update's in applyMemberListUpdate() only, so a correction stays in these two functions.
// ponytail: one list per server, the one of the open channel (Discord's list id, a hash of the channel's permissions, is not read).

export class MemberRow {
  /** A header: the group's id ('online', 'offline' or a role id) and how many it holds; '' for a member. */
  group = ''; count: i32 = 0;
  /** A member: the user, the server nickname ('' when none), the presence ('online', 'idle', 'dnd', 'offline'), on a phone only, and
   *  their roles (ids: the colour of the name). */
  userId = ''; nick = ''; status = ''; mobile = false; roles: string[] = [];
  /** Synced: false for a row of a range not asked for yet. */
  known = true;
}
/** A blank row: in the counts, not synced. */
function blank(): MemberRow { const r = new MemberRow(); r.known = false; return r; }

export const RANGE = 100;
/** The ranges op 37 asks for to show rows first..last: the first range, and those of the rows on screen (3 at most, as the web client). */
export function ranges(first: i32, last: i32): i32[][] {
  const out: i32[][] = [[0, RANGE - 1]];
  for (let c = Math.max(1, Math.floor(first / RANGE)); c <= Math.floor(last / RANGE) && out.length < 3; c++) out.push([c * RANGE, c * RANGE + RANGE - 1]);
  return out;
}

/** The body of op 37 for some ranges of one channel's list. */
export function subscription(guildId: string, channelId: string, rs: i32[][]): any {
  const channels: any = {};
  channels[channelId] = rs;
  const guilds: any = {};
  guilds[guildId] = { typing: true, activities: true, threads: true, channels: channels };
  return { subscriptions: guilds };
}

const str = (v: any): string => typeof v === 'string' ? v : '';

/** On a phone only: client_status names mobile and no desktop or web session. */
export function mobileOnly(cs: any): boolean {
  return cs !== undefined && cs !== null && str(cs.mobile) !== '' && str(cs.desktop) === '' && str(cs.web) === '';
}

/** A row of the update: a group or a member. `person` keeps the user object and gives its id. */
function row(item: any, person: (u: any) => string): MemberRow {
  const r = new MemberRow();
  const g: any = item.group, m: any = item.member;
  if (g !== undefined && g !== null) { r.group = str(g.id); r.count = g.count ?? 0; return r; }
  if (m === undefined || m === null) return r;
  r.userId = person(m.user);
  r.nick = str(m.nick);
  if (Array.isArray(m.roles)) for (const id of m.roles) r.roles.push(str(id));
  const p: any = m.presence;
  r.status = p !== undefined && p !== null && str(p.status) !== '' ? str(p.status) : 'offline';
  r.mobile = p !== undefined && p !== null && mobileOnly(p.client_status);
  return r;
}

/** Applies GUILD_MEMBER_LIST_UPDATE's ops to `rows`, in place, then sizes the list to the groups' counts and puts them on their headers.
 *  `seen` gets each member row that came (their presence for the rest of the app). */
export function applyMemberListUpdate(rows: MemberRow[], d: any, person: (u: any) => string, seen: (r: MemberRow) => void): void {
  const at = (i: i32): void => { while (rows.length <= i) rows.push(blank()); };
  const took = (r: MemberRow): MemberRow => { if (r.userId !== '') seen(r); return r; };
  if (Array.isArray(d.ops)) for (const op of d.ops) {
    const kind = str(op.op);
    if (kind === 'SYNC' || kind === 'INVALIDATE') {
      const from: i32 = op.range[0], to: i32 = op.range[1];
      const items: any[] = kind === 'SYNC' && Array.isArray(op.items) ? op.items : [];
      for (let i = from; i <= to && (kind === 'INVALIDATE' ? i < rows.length : i - from < items.length); i++) {
        at(i);
        rows[i] = kind === 'SYNC' ? took(row(items[i - from], person)) : blank();
      }
    } else if (kind === 'INSERT') { const i: i32 = op.index; at(i - 1); rows.splice(i, 0, took(row(op.item, person))); }
    else if (kind === 'UPDATE') { const i: i32 = op.index; at(i); rows[i] = took(row(op.item, person)); }
    else if (kind === 'DELETE') { const i: i32 = op.index; if (i >= 0 && i < rows.length) rows.splice(i, 1); }
  }
  if (Array.isArray(d.groups)) {
    let total = 0;
    for (const g of d.groups) if ((g.count ?? 0) > 0) total += 1 + g.count;
    at(total - 1);
    rows.length = total;
    for (const g of d.groups) for (const r of rows) if (r.group !== '' && r.group === str(g.id)) r.count = g.count ?? 0;
  }
}
