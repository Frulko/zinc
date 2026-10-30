// The login screen: paste a token. QR code and password logins come with ZN-869.
import { useState } from 'zinc:ui/react';
import { store } from '../state';
import { BG_MAIN, BG_SIDE, BG_INPUT, BG_ACCENT, TEXT_MAIN, TEXT_MUTED, TEXT_STRONG, TEXT_ERROR } from '../constants';

export function Login() {
  const [token, setTokenText] = useState<string>('');
  const busy = store.stage === 'connecting';
  return <View className={`grow items-center justify-center ${BG_MAIN}`}>
    <View className={`w-[440] gap-3 p-8 rounded-lg ${BG_SIDE}`}>
      <Text className={`text-2xl font-bold text-center ${TEXT_STRONG}`}>Welcome back</Text>
      <Text className={`text-sm text-center ${TEXT_MUTED}`}>An unofficial client: Discord's terms do not allow it. Try it with a spare account.</Text>
      <Text className={`text-xs font-bold uppercase ${TEXT_MUTED}`}>Token</Text>
      <Input type="password" className={`w-full h-[40] px-3 rounded border-0 ${BG_INPUT} ${TEXT_MAIN}`} value={token}
        onInput={(v: string) => setTokenText(v)} onChange={(v: string) => { setTokenText(v); }} placeholder="Paste your token" aria-label="Token" />
      {store.error !== '' ? <Text className={`text-sm ${TEXT_ERROR}`}>{store.error}</Text> : null}
      <View className={`h-[44] items-center justify-center rounded ${BG_ACCENT} active:bg-[#4752c4]`} aria-label="Log in"
        onPress={() => { if (!busy) store.login(token); }}>
        <Text className="text-white font-semibold">{busy ? 'Connecting…' : 'Log in'}</Text>
      </View>
    </View>
  </View>;
}
