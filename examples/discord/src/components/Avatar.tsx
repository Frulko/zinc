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
