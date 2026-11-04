// The bar at the bottom: what the device is and how it runs, and what it is busy with.
import { Icon } from 'zinc:icons';
import { Popover, Progress } from 'zinc:ui/kit';
import { For, createSignal, onCleanup, onMount } from 'zinc:ui/solid';
import { getJson } from '../services/link';
import { store } from '../state';
import { SENDING, Transfer, WAITING, transfers } from '../transfers';
import { TransferRow } from './TransferDialog';

interface DeviceTask { kind: string; name: string; done: number; total: number }
interface Device { name: string; address: string; system: string; fps: number; freeMemory: number; totalMemory: number; load: number; uptime: number; layers: number; mediaFiles: number; mediaBytes: number; tasks: DeviceTask[] }

const REFRESH_MS = 1000;
const BUSY: i32 = 0xfb923c, IDLE: i32 = 0xa1a1aa;
const [device, setDevice] = createSignal<Device | null>(null);

function megabytes(bytes: number): string { return `${Math.round(bytes / 1048576)} MB`; }

function duration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  return hours > 0 ? `${hours} h ${Math.floor(seconds / 60) % 60} min` : `${Math.floor(seconds / 60)} min`;
}

function facts(): string {
  const known = device();
  if (known === null) return 'the mapper does not answer';
  const d = known as Device;
  return [d.name, d.address, d.system, `${store.pixels[0]} x ${store.pixels[1]}`, `${d.fps} fps`, `${d.layers} layers`,
    `${d.mediaFiles} media, ${megabytes(d.mediaBytes)}`, `memory ${megabytes(d.totalMemory - d.freeMemory)} of ${megabytes(d.totalMemory)}`,
    `load ${d.load.toFixed(1)}`, `up ${duration(d.uptime)}`].join('   ');
}

function isMine(task: DeviceTask): boolean {
  return transfers().some((t: Transfer): boolean => t.name === task.name && t.state === SENDING);
}

/** What the device does and what this editor still has to send; a file on its way counts once. */
function deviceTasks(): DeviceTask[] {
  const known = device();
  return known === null ? [] : (known as Device).tasks.filter((task: DeviceTask): boolean => !isMine(task));
}

function myTransfers(): Transfer[] {
  return transfers().filter((t: Transfer): boolean => t.state === WAITING || t.state === SENDING);
}

function busyCount(): i32 { return (deviceTasks().length + myTransfers().length) as i32; }

function TaskRow(props: { task: DeviceTask }): i32 {
  const task = props.task;
  return <View className="gap-1">
    <Text className="text-xs text-zinc-100" numberOfLines={1}>{`${task.kind}: ${task.name}`}</Text>
    {task.total > 0 && <Progress value={() => task.done / task.total * 100} />}
  </View>;
}

function Tasks(): i32 {
  return <View className="gap-3">
    {busyCount() === 0 && <Text className="text-xs text-zinc-400">Nothing is running on the device.</Text>}
    <For each={myTransfers()}>{(transfer: Transfer) => <TransferRow transfer={transfer} />}</For>
    <For each={deviceTasks()}>{(task: DeviceTask) => <TaskRow task={task} />}</For>
  </View>;
}

async function refresh(): Promise<void> {
  try {
    setDevice(await getJson('/device') as Device);
  } catch (e) {
    setDevice(null);
  }
}

export function StatusBar(): i32 {
  let timer: i32 = -1;
  onMount(() => {
    refresh();
    timer = setInterval(() => { refresh(); }, REFRESH_MS);
  });
  onCleanup(() => { clearInterval(timer); });
  return <View className="flex-row items-center gap-2 h-[30] px-2 bg-zinc-950 border-t border-zinc-800">
    <Text className="w-0 grow text-[11px] text-zinc-400" numberOfLines={1}>{facts()}</Text>
    {busyCount() > 0 && <View className="flex-row items-center gap-1">
      <View className="w-[8] h-[8] rounded-full bg-orange-500" />
      <Text className="text-[11px] text-orange-300">{`${busyCount()} running`}</Text>
    </View>}
    <Popover label="What runs on the device" placement="top-end" className="w-[360]" trigger={() => <View className="p-1"><Icon name={busyCount() > 0 ? 'activity' : 'info'} size={16} color={() => busyCount() > 0 ? BUSY : IDLE} /></View>}><Tasks /></Popover>
  </View>;
}
