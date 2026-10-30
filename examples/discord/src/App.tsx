// The screen: the login, or the columns of Discord (servers, channels, messages, a server's members). The state lives in state.ts; this
// file only chooses what to show and re-renders when the state changes.
import { useState, useEffect } from 'zinc:ui/react';
import { store } from './state';
import { Login } from './components/Login';
import { GuildRail } from './components/GuildRail';
import { ChannelList } from './components/ChannelList';
import { MessageView } from './components/MessageView';
import { MemberList } from './components/MemberList';
import { BG_MAIN, TEXT_MUTED } from './constants';

export default function App() {
  const [, setVersion] = useState<number>(0);
  useEffect((): void => {
    let v = 0;
    store.onChange((): void => { v++; setVersion(v); });
  }, []);
  if (store.stage === 'login') return <Login />;
  if (store.stage === 'connecting' && store.guilds.length === 0 && store.dms.length === 0)
    return <View className={`grow items-center justify-center ${BG_MAIN}`}><Text className={TEXT_MUTED}>Connecting…</Text></View>;
  return <View className="grow flex-row">
    <GuildRail />
    <ChannelList />
    <MessageView />
    {store.guildId !== '' ? <MemberList /> : null}
  </View>;
}
