// The screen: the login, or the columns of Discord (servers, channels, messages, a server's members or the pins or a thread beside). The state lives in state.ts; this
// file only chooses what to show and re-renders when the state changes.
import { useState, useEffect } from 'zinc:ui/react';
import { store } from './state';
import { Login } from './components/Login';
import { GuildRail } from './components/GuildRail';
import { ChannelList } from './components/ChannelList';
import { MessageView } from './components/MessageView';
import { MemberList } from './components/MemberList';
import { SidePane } from './components/SidePane';
import { Settings } from './components/Settings';
import { CallView, StatsPanel } from './components/CallView';
import { Transfer } from './components/Transfer';
import { BG_MAIN, TEXT_MUTED, CH_VOICE, RAIL_W } from './constants';

/** No conversation open: the server or the DMs are shown, one is chosen in the list. */
function Pick() {
  return <View className={`grow basis-0 items-center justify-center ${BG_MAIN}`}>
    <Text className={TEXT_MUTED}>{store.guildId === '' ? 'Choose a conversation.' : 'Choose a channel.'}</Text>
  </View>;
}

export default function App() {
  const [, setVersion] = useState<number>(0);
  useEffect((): void => {
    let v = 0;
    store.onChange((): void => { v++; setVersion(v); });
  }, []);
  if (store.stage === 'login') return <Login />;
  if (store.stage === 'connecting' && store.guilds.length === 0 && store.dms.length === 0)
    return <View className={`grow items-center justify-center ${BG_MAIN}`}><Text className={TEXT_MUTED}>Connecting…</Text></View>;
  // the call view: in place of a voice channel's messages, or above those of the DM the call is in
  const call = store.call, open = store.findChannel(store.channelId);
  const callHere = call.channelId !== '' && call.channelId === store.channelId && !store.settingsOpen;
  const voiceRoom = open !== null && open.type === CH_VOICE;
  call.watch(callHere);
  return <View className="grow flex-row">
    <GuildRail />
    <ChannelList />
    {store.settingsOpen ? <Settings /> : voiceRoom ? (callHere ? <CallView compact={false} /> : <Pick />)
      : callHere ? <View className="grow basis-0"><CallView compact={true} /><MessageView /></View>
      : store.channelId === '' ? <Pick /> : <MessageView />}
    {store.settingsOpen || store.channelId === '' ? null : store.pane !== 'members' ? <SidePane /> : store.guildId !== '' ? <MemberList /> : null}
    {store.transferPaths.length > 0 ? <Transfer /> : null}
    {call.statsOpen && call.state === 'connected' && !callHere ? <StatsPanel at={`bottom-[112] left-[${RAIL_W + 8}]`} /> : null}
  </View>;
}
