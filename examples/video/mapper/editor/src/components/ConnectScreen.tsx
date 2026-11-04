// A client's first screen: the mappers of the network and their code, or an address typed by hand. A page is on its mapper already: it needs the code.
import * as link from 'zinc:link';
import { Button } from 'zinc:ui/kit';
import { For, createSignal, onCleanup } from 'zinc:ui/solid';
import { askCodeAt, canBrowse, findMappers, mappers, openPaired, pairPage, pairWith, stopFinding } from '../services/discovery';
import { status } from '../state';

function CodeField(props: { value: () => string; onChange: (code: string) => void }): i32 {
  return <Input className="w-[140] h-[36] px-2 rounded bg-zinc-800 text-zinc-100 text-lg" aria-label="the code on the mapper's screen" placeholder="000000" value={props.value()} onChange={props.onChange} />;
}

function MapperRow(props: { peer: link.Peer; onConnect: (address: string) => void; say: (message: string) => void }): i32 {
  const peer = props.peer;
  const [code, setCode] = createSignal('');
  const [asking, setAsking] = createSignal(false);
  const webBase = `http://${peer.host}:${peer.info}`;
  const ask = async (): Promise<void> => {
    setAsking(true);
    props.say(await askCodeAt(webBase));
  };
  const pair = async (): Promise<void> => {
    try {
      openPaired(await pairWith(peer, code()), props.onConnect, props.say);
    } catch (e) {
      props.say((e as Error).message);
    }
  };
  return <View className="w-[520] p-3 gap-2 rounded bg-zinc-900">
    <View className="flex-row items-center gap-2">
      <View className="w-0 grow">
        <Text className="text-sm text-zinc-100">{peer.name}</Text>
        <Text className="text-xs text-zinc-500">{peer.host}</Text>
      </View>
      {peer.paired ? <Button label="Open" onClick={() => openPaired(peer, props.onConnect, props.say)} /> : <Button size="sm" variant="secondary" label="Show a code on it" onClick={() => { ask(); }} />}
    </View>
    {!peer.paired && (peer.pairing || asking()) && <View className="flex-row items-center gap-2">
      <CodeField value={code} onChange={setCode} />
      <Button label="Pair" onClick={() => { pair(); }} />
    </View>}
  </View>;
}

function Found(props: { onConnect: (address: string) => void; say: (message: string) => void }): i32 {
  findMappers();
  onCleanup(stopFinding);
  return <View className="items-center gap-2">
    {mappers().length === 0 && <Text className="text-xs text-zinc-500">Looking for mappers on this network...</Text>}
    <For each={mappers()}>{(peer: link.Peer) => <MapperRow peer={peer} onConnect={props.onConnect} say={props.say} />}</For>
  </View>;
}

function PageCode(props: { base: string; onConnect: (address: string) => void; say: (message: string) => void }): i32 {
  const [code, setCode] = createSignal('');
  const send = async (): Promise<void> => {
    const address = await pairPage(props.base, code(), props.say);
    if (address !== '') props.onConnect(address);
  };
  return <View className="items-center gap-2">
    <Text className="text-xs text-zinc-400">Enter the code shown on the mapper's screen.</Text>
    <View className="flex-row items-center gap-2">
      <CodeField value={code} onChange={setCode} />
      <Button label="Pair" onClick={() => { send(); }} />
    </View>
    <Button size="sm" variant="ghost" label="Show a code on the mapper" onClick={() => { askCodeAt(props.base).then(props.say); }} />
  </View>;
}

export function ConnectScreen(props: { initial: string; onConnect: (address: string) => void }): i32 {
  const [address, setAddress] = createSignal(props.initial);
  const [problem, setProblem] = createSignal('');
  const base = (): string => {
    const at = props.initial.indexOf('/', props.initial.indexOf('://') + 3);
    return at < 0 ? props.initial : props.initial.slice(0, at);
  };
  return <View className="grow items-center justify-center gap-4 p-6 bg-zinc-950">
    <Text className="text-lg text-zinc-100">Mapper editor</Text>
    {canBrowse() ? <Found onConnect={props.onConnect} say={setProblem} /> : <PageCode base={base()} onConnect={props.onConnect} say={setProblem} />}
    {canBrowse() && <View className="items-center gap-2">
      <Text className="text-xs text-zinc-400">Or the address on the mapper's status card (Tab on its keyboard, or the remote's select key).</Text>
      <Input className="w-[420] h-[32] px-2 rounded bg-zinc-800 text-zinc-100 text-sm" aria-label="the mapper's address" placeholder="http://192.168.1.20:8080/?token=..." value={address()} onChange={setAddress} />
      <Button size="sm" variant="secondary" label="Connect" onClick={() => props.onConnect(address())} />
    </View>}
    <Text className="text-xs text-amber-400">{problem()}</Text>
    <Text className="text-xs text-zinc-500">{status()}</Text>
  </View>;
}
