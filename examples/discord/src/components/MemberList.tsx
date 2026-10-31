// The members of the open server's channel, as GUILD_MEMBER_LIST_UPDATE gives them (members.ts): headers of the hoisted roles, Online and
// Offline with their counts, then the members with their avatar, presence and name in their role's colour; offline members dimmed. The list
// is virtual and asks Discord only for the hundreds of rows on screen (op 37's ranges); a row not synced yet is a blank bar.
import { useRef, useEffect } from 'zinc:ui/react';
import * as ui from 'zinc:ui';
import { store } from '../state';
import { MemberRow } from '../members';
import { Avatar, Status } from './Avatar';
import { cdnPicture, avatarKey } from '../services/cdn';
import { BG_SIDE, SB_TEXT, SB_MUTED, MEMBERS_W, MEMBER_AVATAR } from '../constants';

const ROW = 42;
const hex = (c: i32): string => { const h = c.toString(16); return '#' + '000000'.slice(h.length) + h; };

function Member(p: { r: MemberRow }) {
  const r = p.r, name = r.nick !== '' ? r.nick : store.userName(r.userId), hash = store.avatarOf(r.userId), color = store.roleColor(r);
  return <View className={`h-[${ROW}] px-2 flex-row items-center gap-3 rounded hover:bg-[var(--dc-sidebar-hover)] ${r.status === 'offline' ? 'opacity-40' : ''}`} aria-label={name}>
    <View>
      <Avatar picture={hash !== '' ? cdnPicture(avatarKey(r.userId, hash)) : -1} name={name} size={MEMBER_AVATAR} round={true} />
      <Status status={r.status} mobile={r.mobile} offline={false} ring="border-[var(--dc-sidebar)]" />
    </View>
    <Text className={`grow text-[15px] ${color !== 0 ? `text-[${hex(color)}]` : SB_TEXT}`} numberOfLines={1}>{name}</Text>
  </View>;
}

function Row(p: { r: MemberRow }) {
  const r = p.r;
  if (!r.known) return <View className={`h-[${ROW}] px-2 flex-row items-center gap-3`}>
    <View className={`w-[${MEMBER_AVATAR}] h-[${MEMBER_AVATAR}] rounded-full bg-[var(--dc-input)]`} /><View className="w-[120] h-[10] rounded bg-[var(--dc-input)]" />
  </View>;
  if (r.group !== '') return <View className={`h-[${ROW}] px-2 pb-1 justify-end`}>
    <Text className={`text-xs font-bold uppercase ${SB_MUTED}`} numberOfLines={1}>{`${store.groupName(r.group)} — ${r.count}`}</Text>
  </View>;
  return <Member r={r} />;
}

let shown: i32 = -1;
/** The list's node (-1 before it shows): main.tsx's session scrolls it. */
export function memberList(): i32 { return shown; }

export function MemberList() {
  const ref = useRef<i32>(-1);
  const rows = store.members;
  useEffect((): void => {
    shown = ref.current;
    ui.onScroll(ref.current, (e: ui.ResponderEvent, g: ui.GestureState): void => {
      const ne = e.nativeEvent;
      store.memberRows(Math.floor(ne.contentOffset.y / ROW), Math.floor((ne.contentOffset.y + ne.layoutMeasurement.height) / ROW));
    });
  }, []);
  return <VirtualList ref={ref} count={rows.length} itemHeight={ROW} className={`w-[${MEMBERS_W}] px-2 ${BG_SIDE}`}>
    {(i: i32) => <Row key={rows[i].known ? (rows[i].group !== '' ? `g${rows[i].group}` : rows[i].userId) : `b${i}`} r={rows[i]} />}
  </VirtualList>;
}
