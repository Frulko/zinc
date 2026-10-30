// The column of servers: the DM button on top, then one round icon per server (its initials until ZN-868 draws the icons).
import { store, Guild } from '../state';
import { BG_RAIL, BG_ACCENT, RAIL_W } from '../constants';

function initials(name: string): string {
  let out = '';
  for (const w of name.split(' ')) if (w.length > 0 && out.length < 3) out += w[0];
  return out;
}

function Pill(p: { label: string; title: string; on: boolean; onPress: () => void }) {
  return <View className={`w-12 h-12 items-center justify-center ${p.on ? `rounded-2xl ${BG_ACCENT}` : 'rounded-full bg-[#313338] hover:rounded-2xl hover:bg-[#5865f2]'}`}
    onPress={p.onPress} aria-label={p.title}>
    <Text className="text-white text-sm font-semibold">{p.label}</Text>
  </View>;
}

export function GuildRail() {
  return <ScrollView className={`w-[${RAIL_W}] ${BG_RAIL}`} showsVerticalScrollIndicator={false}>
    <View className="items-center gap-2 py-3">
      <Pill label="DM" title="Direct messages" on={store.guildId === ''} onPress={() => store.selectGuild('')} />
      <View className="w-8 h-[2] rounded bg-[#35363c]" />
      {store.guilds.map((g: Guild) => <Pill key={g.id} label={initials(g.name)} title={g.name} on={store.guildId === g.id} onPress={() => store.selectGuild(g.id)} />)}
    </View>
  </ScrollView>;
}
