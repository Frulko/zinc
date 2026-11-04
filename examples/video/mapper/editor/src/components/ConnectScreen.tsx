// A native client's first screen: the address the mapper shows on its status card.
import { Button } from 'zinc:ui/kit';
import { createSignal } from 'zinc:ui/solid';
import { status } from '../state';

export function ConnectScreen(props: { initial: string; onConnect: (address: string) => void }): i32 {
  const [address, setAddress] = createSignal(props.initial);
  return <View className="grow items-center justify-center gap-3 p-6 bg-zinc-950">
    <Text className="text-lg text-zinc-100">Mapper editor</Text>
    <Text className="text-xs text-zinc-400">The address shown on the mapper (Tab on its keyboard, or the remote's select key).</Text>
    <Input className="w-[420] h-[32] px-2 rounded bg-zinc-800 text-zinc-100 text-sm" aria-label="the mapper's address" placeholder="http://192.168.1.20:8080/?token=..." value={address()} onChange={setAddress} />
    <Button label="Connect" onClick={() => props.onConnect(address())} />
    <Text className="text-xs text-zinc-500">{status()}</Text>
  </View>;
}
