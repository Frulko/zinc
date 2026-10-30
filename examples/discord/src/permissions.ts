// What the user may do in a server's channel, from the permissions Discord sends (the server's owner, its roles, the roles the user holds,
// the channel's overwrites), computed as Discord does: the roles' bits, then the overwrites of @everyone, of the user's roles, of the user.
// Only the bits the app needs: whether it offers to pin. A DM allows it to both sides.
// ponytail: the user's roles come from READY's merged_members only (a role given during the session shows after the next start).

/** A channel's overwrite: a role or a member, and the bits it allows and denies (decimal strings, as the API sends them). */
export class Overwrite { id = ''; allow = '0'; deny = '0'; }
/** A server as the permissions see it. */
export class Rights { ownerId = ''; roles: Map<string, string> = new Map<string, string>(); mine: string[] = []; }

const ADMINISTRATOR = 3, MANAGE_MESSAGES = 13, PIN_MESSAGES = 51;

/** Bit `b` of a permission number given as a decimal string (up to 2^53: the bits Discord uses fit in a double). */
export function bit(perms: string, b: i32): boolean { const n = parseInt(perms); return !isNaN(n) && Math.floor(n / Math.pow(2, b)) % 2 === 1; }

/** A channel's permission_overwrites. */
export function readOverwrites(list: any): Overwrite[] {
  const out: Overwrite[] = [];
  if (Array.isArray(list)) for (const o of list) {
    const w = new Overwrite();
    w.id = typeof o.id === 'string' ? o.id : ''; w.allow = typeof o.allow === 'string' ? o.allow : '0'; w.deny = typeof o.deny === 'string' ? o.deny : '0';
    out.push(w);
  }
  return out;
}

/** Bit b for the user in a channel of the server g (the channel's overwrites, or its parent's for a thread). */
function has(g: Rights, guildId: string, me: string, ow: Overwrite[], b: i32): boolean {
  const everyone = g.roles.get(guildId);
  let base = everyone !== undefined && bit(everyone, b), admin = everyone !== undefined && bit(everyone, ADMINISTRATOR);
  for (const r of g.mine) { const p = g.roles.get(r); if (p !== undefined) { base = base || bit(p, b); admin = admin || bit(p, ADMINISTRATOR); } }
  if (admin) return true;
  let v = base;
  for (const o of ow) if (o.id === guildId) { if (bit(o.deny, b)) v = false; if (bit(o.allow, b)) v = true; }
  let deny = false, allow = false;
  for (const o of ow) if (g.mine.indexOf(o.id) >= 0) { deny = deny || bit(o.deny, b); allow = allow || bit(o.allow, b); }
  if (deny) v = false;
  if (allow) v = true;
  for (const o of ow) if (o.id === me) { if (bit(o.deny, b)) v = false; if (bit(o.allow, b)) v = true; }
  return v;
}

/** Pin and unpin in this channel: always in a DM; in a server, its owner, or Manage Messages, or Pin Messages. */
export function canPin(g: Rights | null, guildId: string, me: string, ow: Overwrite[]): boolean {
  if (guildId === '') return true;
  if (g === null) return false;
  if (g.ownerId === me) return true;
  return has(g, guildId, me, ow, MANAGE_MESSAGES) || has(g, guildId, me, ow, PIN_MESSAGES);
}
