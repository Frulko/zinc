// A round picture from the CDN (a user's avatar, a server's icon), or the initials on a colour until it is loaded or when there is none.
// ponytail: no default avatar from the CDN (its index comes from the id shifted by 22, a 64-bit number); the initial stands in for it.
import { BG_ACCENT } from '../constants';

export function initials(name: string): string {
  let out = '';
  for (const w of name.split(' ')) if (w.length > 0 && out.length < 3) out += w[0];
  return out;
}

/** picture: a CDN picture (-1 while it loads, or none); size in px; round or the squircle of the selected server. */
export function Avatar(p: { picture: i32; name: string; size: i32; round: boolean }) {
  const box = `w-[${p.size}] h-[${p.size}] ${p.round ? 'rounded-full' : 'rounded-2xl'}`;
  if (p.picture >= 0) return <Image image={p.picture} className={`${box} object-cover`} />;
  return <View className={`${box} items-center justify-center ${BG_ACCENT}`}>
    <Text className={`text-white font-semibold ${p.size > 40 ? 'text-sm' : 'text-xs'}`}>{initials(p.name)}</Text>
  </View>;
}

/** The dot's colour of a presence. */
function dot(status: string): string {
  return status === 'online' ? 'bg-[#23a55a]' : status === 'idle' ? 'bg-[#f0b232]' : status === 'dnd' ? 'bg-[#f23f43]' : 'bg-[#80848e]';
}
/** The presence on an avatar's corner, as Discord: a green, yellow or red dot (online, idle, do not disturb), a green phone for one on a
 *  phone only, a grey dot offline when `offline` asks for it (the DMs; the member list dims offline members instead). `ring`: the
 *  background behind the avatar, which cuts the dot out of it. */
export function Status(p: { status: string; mobile: boolean; offline: boolean; ring: string }) {
  if (p.status === 'offline' && !p.offline) return null;
  if (p.mobile && p.status === 'online')
    return <View className={`absolute -right-0.5 -bottom-0.5 w-[10] h-[14] rounded-[3] border-2 ${p.ring} bg-[#23a55a]`} aria-label="On mobile" />;
  return <View className={`absolute -right-0.5 -bottom-0.5 w-[12] h-[12] rounded-full border-2 ${p.ring} ${dot(p.status)}`}
    aria-label={p.status === 'dnd' ? 'Do not disturb' : p.status === 'idle' ? 'Idle' : p.status === 'online' ? 'Online' : 'Offline'} />;
}
