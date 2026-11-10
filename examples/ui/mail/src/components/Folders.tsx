import { Sidebar, theme } from 'zinc:ui/kit';
import { Folder } from '../data';
import { Mailbox } from '../state';
export function Folders(p: { model: Mailbox; onNavigate: () => void }): i32 {
  return <View className="flex-col gap-6 grow min-h-0">
    <View className="px-3 pt-2 flex-col gap-1"><Text className={`text-[22px] font-medium text-${theme().foreground}`}>Mail</Text><Text className={`text-[12px] text-${theme().mutedForeground}`}>Alex Morgan · local demo</Text></View>
    <Sidebar label="Mail folders" groups={[{ id: 'folders', label: 'Folders', items: [
      { id: '0', label: 'Inbox', icon: 'inbox', badge: String(p.model.count(Folder.Inbox)) },
      { id: '1', label: 'Starred', icon: 'star', badge: String(p.model.count(Folder.Starred)) },
      { id: '2', label: 'Sent', icon: 'send', badge: String(p.model.count(Folder.Sent)) },
      { id: '3', label: 'Archive', icon: 'archive', badge: String(p.model.count(Folder.Archive)) },
    ] }]} selected={() => String(p.model.folder())} onSelect={(id: string) => { p.model.navigate(parseInt(id) as Folder); p.onNavigate(); }} className="w-full" />
    <View className="grow" /><Text className={`px-3 text-[12px] text-${theme().mutedForeground}`}>Fictional messages. No account or network connection.</Text>
  </View>;
}
