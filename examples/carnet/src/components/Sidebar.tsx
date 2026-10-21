// The sidebar: the workspace and who I am, the pages (click to open, the bin on hover deletes), a new page, and the state of
// the collaboration at the bottom.
import * as ui from 'zinc:ui';
import { Icon } from 'zinc:icons';
import { Page, pages, currentPage, setCurrentPage, createPage, deletePage, peers, me } from '../state';
import { linkMode, linkAddress, LINK_HOST, LINK_JOINED } from '../services/sync';
import { SIDEBAR_WIDTH, COLOR_TEXT_SECONDARY, COLOR_LIVE, COLOR_OFFLINE } from '../constants';
import { focusTitle } from './focus';
import { PageIcon } from './PageIcon';

export function Avatar(props: { name: string; color: i32; size: i32 }): i32 {
  return <View className={`w-[${props.size}] h-[${props.size}] rounded-full items-center justify-center`} bg={props.color}>
    <Text className={`text-[${Math.floor(props.size * 0.5)}px] font-semibold text-[#ffffff]`}>{props.name.charAt(0)}</Text>
  </View>;
}

function PageRow(props: { p: Page }): i32 {
  const p = props.p;
  const on = (): boolean => currentPage() === p;
  return <View className={`flex-row items-center h-[30] pl-2.5 pr-1 mx-1.5 gap-2 rounded-md group cursor-pointer ${on() ? 'bg-[#ebebea]' : 'hover:bg-[#efefed]'}`}
    onPointerDown={(e: ui.PointerEvent) => setCurrentPage(p)}>
    <PageIcon p={p} size={17} color={0x91918e} />
    <Text className={`grow text-[14px] ${on() ? 'font-medium text-[#37352f]' : 'text-[#5f5e5b]'}`} numberOfLines={1}>{p.title() === '' ? 'Untitled' : p.title()}</Text>
    <View className="w-[24] h-[24] rounded-[4] items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-[#e3e3e1]"
      onPointerDown={(e: ui.PointerEvent) => deletePage(p)}>
      <Icon name="trash-2" size={14} color={() => COLOR_TEXT_SECONDARY} strokeWidth={2} />
    </View>
  </View>;
}

function linkText(): string {
  const n = peers().length + 1, people = n === 1 ? 'only you' : `${n} people`;
  if (linkMode() === LINK_HOST) return `Live · ${people} · serving ${linkAddress()}`;
  if (linkMode() === LINK_JOINED) return `Live · ${people} · joined ${linkAddress()}`;
  return 'Offline';
}

export function Sidebar(): i32 {
  return <View className={`flex-col w-[${SIDEBAR_WIDTH}] h-full bg-[#f7f7f5] border-r border-[#ededeb]`}>
    <View className="flex-row items-center h-[46] px-3.5 gap-2.5">
      <Avatar name={me.name} color={me.color} size={22} />
      <Text className="text-[14px] font-semibold text-[#37352f] grow">{`${me.name}'s Carnet`}</Text>
    </View>
    <Text className="text-[12px] font-medium text-[#91918e] px-4 pt-3 pb-1">Pages</Text>
    <ScrollView className="grow flex-col">
      {pages().map((p: Page) => <PageRow p={p} />)}
      <View className="flex-row items-center h-[30] px-2.5 mx-1.5 gap-2 rounded-md hover:bg-[#efefed] cursor-pointer"
        onPointerDown={(e: ui.PointerEvent) => { const p = createPage(); setCurrentPage(p); focusTitle(p); }}>
        <Icon name="plus" size={16} color={() => COLOR_TEXT_SECONDARY} strokeWidth={2} />
        <Text className="text-[14px] text-[#91918e]">New page</Text>
      </View>
    </ScrollView>
    <View className="flex-row items-center gap-2 px-4 py-3 border-t border-[#ededeb]">
      <View className="w-[8] h-[8] rounded-full" bg={linkMode() === 0 ? COLOR_OFFLINE : COLOR_LIVE} />
      <Text className="text-[12px] text-[#787774] grow" numberOfLines={2}>{linkText()}</Text>
    </View>
  </View>;
}
