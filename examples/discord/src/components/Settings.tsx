// The settings, in place of the messages: which servers show. One switch per server; a server joined after the choice was made comes off
// and marked new. The choice stays on this machine (state.ts), never sent to Discord.
import { Icon } from 'zinc:icons';
import { Switch } from 'zinc:ui/kit';
import { store, Guild } from '../state';
import { MUTED } from './ChannelList';
import { Avatar } from './Avatar';
import { cdnPicture, iconKey } from '../services/cdn';
import { BG_MAIN, BG_HOVER, BG_ACCENT, TEXT_MAIN, TEXT_MUTED, TEXT_STRONG } from '../constants';

function Row(p: { g: Guild }) {
  const g = p.g;
  return <View className="h-[48] flex-row items-center gap-3">
    <Avatar picture={g.icon !== '' ? cdnPicture(iconKey(g.id, g.icon)) : -1} name={g.name} size={32} round={true} />
    <Text className={`grow basis-0 text-[15px] ${TEXT_MAIN}`} numberOfLines={1}>{g.name}</Text>
    {store.isNew(g) ? <View className={`px-1.5 rounded ${BG_ACCENT}`}><Text className="text-white text-[11px] font-bold">NEW</Text></View> : null}
    <Switch checked={() => store.shown(g)} onChange={(on: boolean) => store.setShown(g.id, on)} accessibilityLabel={g.name} />
  </View>;
}

export function Settings() {
  return <View className={`grow basis-0 ${BG_MAIN}`}>
    <View className="h-[48] px-4 flex-row items-center border-b border-[#1f2023]">
      <Text className={`grow font-semibold ${TEXT_STRONG}`}>Servers</Text>
      <View className={`p-1 rounded ${BG_HOVER}`} onPress={() => store.showSettings(false)} aria-label="Close the settings">
        <Icon name="x" size={20} color={MUTED} />
      </View>
    </View>
    <ScrollView className="grow">
      <View className="px-6 py-4">
        <Text className={`pb-3 text-sm ${TEXT_MUTED}`}>Only the servers switched on show in the sidebar, count unread messages and notify. Direct messages always show. This choice stays on this computer.</Text>
        {store.guilds.map((g: Guild) => <Row key={g.id} g={g} />)}
      </View>
    </ScrollView>
  </View>;
}
