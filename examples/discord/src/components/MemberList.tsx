// The members of the open server's channel, as GUILD_MEMBER_LIST_UPDATE gives them (members.ts): group headers with their counts, then the
// members with their avatar and a presence dot; offline members dimmed.
import { store } from '../state';
import { MemberRow } from '../members';
import { Avatar } from './Avatar';
import { cdnPicture, avatarKey } from '../services/cdn';
import { BG_SIDE, TEXT_MAIN, TEXT_MUTED, MEMBERS_W, MEMBER_AVATAR } from '../constants';

/** The presence dot's colour, '' when offline. */
const dotOf = (s: string): string => s === 'online' ? 'bg-[#23a55a]' : s === 'idle' ? 'bg-[#f0b232]' : s === 'dnd' ? 'bg-[#f23f43]' : '';
function groupName(id: string): string { return id === 'online' ? 'Online' : id === 'offline' ? 'Offline' : store.roleName(id); }

function Member(p: { r: MemberRow }) {
  const r = p.r, name = r.nick !== '' ? r.nick : store.userName(r.userId), hash = store.avatarOf(r.userId);
  const dot = dotOf(r.status);
  return <View className={`h-[42] px-2 flex-row items-center gap-3 rounded hover:bg-[#35373c] ${dot === '' ? 'opacity-40' : ''}`} aria-label={name}>
    <View>
      <Avatar picture={hash !== '' ? cdnPicture(avatarKey(r.userId, hash)) : -1} name={name} size={MEMBER_AVATAR} round={true} />
      {dot !== '' ? <View className={`absolute -right-0.5 -bottom-0.5 w-[12] h-[12] rounded-full border-2 border-[#2b2d31] ${dot}`} /> : null}
    </View>
    <Text className={`grow text-[15px] ${TEXT_MAIN}`} numberOfLines={1}>{name}</Text>
  </View>;
}

export function MemberList() {
  return <ScrollView className={`w-[${MEMBERS_W}] ${BG_SIDE}`}>
    <View className="px-2 pb-4">
      {store.members.map((r: MemberRow, i: i32) => r.group !== ''
        ? <Text key={`g${r.group}`} className={`px-2 pt-6 pb-1 text-xs font-bold uppercase ${TEXT_MUTED}`}>{`${groupName(r.group)} — ${r.count}`}</Text>
        : <Member key={r.userId} r={r} />)}
    </View>
  </ScrollView>;
}
