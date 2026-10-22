// ESP32 BLE, the Mac side: finds an ESP32 that runs examples/esp32-ble/esp32 over Bluetooth Low Energy, connects to it and lets you
// talk to it. This file draws the page and mounts it; what happens is in services/radio.ts and state.ts.
//   zinc run examples/esp32-ble/mac                         the real radio (macOS asks for Bluetooth access once: docs/plugins/ble.md)
//   ZINC_NATIVE=sim zinc run examples/esp32-ble/mac         no ESP32: a simulated "Zinc sim" that echoes what you send
import { render } from 'zinc:ui/solid';
import { Device } from 'zinc:ble';
import { COLOR_PAGE, FROM_ME, FROM_APP } from './constants';
import { phase, problem, devices, peer, lines, draft, setDraft, Line } from './state';
import { startScan, send, disconnect } from './services/radio';

function status(): string {
  const p = phase();
  if (p === 'scanning') return 'Looking for a Zinc device…';
  if (p === 'connecting') return 'Connecting…';
  if (p === 'connected') return `Connected to ${peer()}`;
  if (p === 'error') return 'Bluetooth cannot be used';
  return 'Not connected';
}

function Header(): i32 {
  const busy = (): boolean => phase() === 'scanning' || phase() === 'connecting';
  return <View className="flex-row items-center gap-3 px-4 py-3 border-b border-[#e2e8f0] bg-[#ffffff]">
    <View className="grow flex-col gap-1">
      <Text className="text-[17px] font-semibold text-[#0f172a]">ESP32 BLE</Text>
      <Text className="text-[13px] text-[#64748b]">{status()}</Text>
    </View>
    {phase() === 'connected'
      ? <View className="px-3 py-2 rounded-md bg-[#f1f5f9] cursor-pointer" onPress={() => disconnect()}><Text className="text-[13px] text-[#0f172a]">Disconnect</Text></View>
      : <View className={`px-3 py-2 rounded-md cursor-pointer ${busy() ? 'bg-[#cbd5e1]' : 'bg-[#2563eb]'}`} onPress={() => { if (!busy()) startScan(); }}>
          <Text className="text-[13px] text-[#ffffff]">Scan</Text>
        </View>}
  </View>;
}

function Bubble(props: { line: Line }): i32 {
  const l = props.line;
  if (l.from === FROM_APP) return <Text className="self-center text-[12px] text-[#94a3b8]">{l.text}</Text>;
  const mine = l.from === FROM_ME;
  return <View className={`max-w-[300] px-3 py-2 rounded-lg ${mine ? 'self-end bg-[#2563eb]' : 'self-start bg-[#ffffff] border border-[#e2e8f0]'}`}>
    <Text className={`text-[14px] ${mine ? 'text-[#ffffff]' : 'text-[#0f172a]'}`}>{l.text}</Text>
  </View>;
}

function Composer(): i32 {
  const submit = (): void => { send(draft().trim()); setDraft(''); };
  const ready = (): boolean => phase() === 'connected';
  return <View className="flex-row items-center gap-2 p-3 border-t border-[#e2e8f0] bg-[#ffffff]" onSubmit={submit}>
    <Input className="py-1.5 grow min-w-0 h-[36] px-3 rounded-md border border-[#cbd5e1] text-[14px] bg-[#ffffff] text-[#0f172a]"
      value={draft()} onInput={(v: string) => setDraft(v)} placeholder={ready() ? 'A message for the ESP32' : 'Connect first'} />
    <View className={`h-[36] px-4 justify-center rounded-md cursor-pointer ${ready() && draft() !== '' ? 'bg-[#2563eb]' : 'bg-[#cbd5e1]'}`} onPress={submit}>
      <Text className="text-[14px] text-[#ffffff]">Send</Text>
    </View>
  </View>;
}

function App(): i32 {
  return <View className="flex-col h-full bg-[#f8fafc]">
    <Header />
    {problem() !== '' && <View className="m-3 p-3 rounded-md bg-[#fef2f2] border border-[#fecaca]"><Text className="text-[13px] text-[#991b1b]">{problem()}</Text></View>}
    {devices().length > 0 && <View className="flex-row flex-wrap gap-2 px-4 pt-3">
      <For each={devices()}>{(d: Device) => <Text className="text-[12px] text-[#475569]">{`${d.name !== '' ? d.name : d.id} (${d.rssi} dBm)`}</Text>}</For>
    </View>}
    <ScrollView stickToBottom className="grow min-h-0 flex-col gap-2 px-4 py-3">
      <For each={lines()}>{(l: Line) => <Bubble line={l} />}</For>
    </ScrollView>
    <Composer />
  </View>;
}

startScan();
render(App, COLOR_PAGE, null);
