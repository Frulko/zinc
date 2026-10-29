import { Session } from 'zinc:carplay';
import { vehicle, setVehicle, applyVehicle } from '../services/vehicle';

let live: Session | null = null;
export function tickVehicle(session: Session): void {
  live = session;
  const incoming = session.ultraVehicle;
  const current = vehicle();
  if (incoming !== null && (incoming.rpm !== current.rpm || incoming.fuelPct !== current.fuelPct || incoming.climateOn !== current.climateOn || incoming.targetCelsius !== current.targetCelsius))
    setVehicle({ speedKph: current.speedKph, rpm: incoming.rpm, gear: current.gear, fuelPct: incoming.fuelPct, climateOn: incoming.climateOn, targetCelsius: incoming.targetCelsius });
}
function Cluster(x: i32, y: i32, w: i32, h: i32): void {
  const s = live; if (s !== null) s.secondary.view(x, y, w, h);
}
function clusterStatus(): string {
  const s = live;
  if (s === null || s.secondary.frames === 0) return 'Carte cluster en attente';
  return `${s.secondary.width} × ${s.secondary.height} · ${s.secondary.frames} images`;
}
function layoutStatus(): string {
  const s = live;
  if (s === null || s.ultra === null || !s.ultra.uiSyncEnabled) return 'UI Sync en attente';
  const c = s.uiChoice;
  if (c === null) return 'UI Sync actif · disposition demandée';
  return `UI Sync actif · ${c.layoutId !== undefined ? c.layoutId.slice(0, 8) : 'choix reçu'}${c.paletteId !== undefined ? ' · ' + c.paletteId : ''}`;
}
export function VehicleDashboard(props: { nightMode: boolean }): i32 {
  return <View className={props.nightMode ? 'grow flex-col bg-slate-950 p-6 gap-4' : 'grow flex-col bg-slate-100 p-6 gap-4'}>
    <View className="flex-row items-center gap-4">
      <View className="flex-col"><Text className={props.nightMode ? 'text-amber-200 text-xl' : 'text-amber-800 text-xl'}>TABLEAU DE BORD · COMPOSITION LOCALE</Text><Text className={props.nightMode ? 'text-slate-400 text-xs' : 'text-slate-600 text-xs'}>{layoutStatus()}</Text></View>
      <View className="grow"></View><Text className={props.nightMode ? 'text-slate-400 text-xs' : 'text-slate-600 text-xs'}>{clusterStatus()}</Text>
    </View>
    <View className="grow h-0 flex-row items-center gap-4">
      <View className="grow w-0 h-full flex-col items-center justify-center gap-3 bg-slate-900 rounded p-5"><Text className="text-cyan-200 text-5xl font-bold">{`${vehicle().speedKph}`}</Text><Text className="text-slate-400">km/h</Text><Text className="text-slate-400">Vitesse · zone gauche</Text></View>
      <View className="grow w-0 h-full flex-col gap-2"><Canvas className="grow h-0 bg-slate-900 rounded" onDraw={Cluster}></Canvas><Text className={props.nightMode ? 'text-slate-400 text-xs' : 'text-slate-600 text-xs'}>Navigation projetée · zone centrale</Text></View>
      <View className="grow w-0 h-full flex-col items-center justify-center gap-3 bg-slate-900 rounded p-5"><Text className="text-white text-5xl font-bold">{`${vehicle().rpm}`}</Text><Text className="text-slate-400">tr/min</Text><Text className="text-amber-200 text-2xl">{vehicle().gear}</Text><Text className="text-slate-400">{`Carburant ${vehicle().fuelPct}%`}</Text></View>
    </View>
    <View className="flex-row items-center gap-3">
      <Button className="bg-slate-700 rounded px-4 py-2" onClick={() => applyVehicle(live, { speedKph: 0, rpm: 0, gear: 'P', fuelPct: 68, climateOn: vehicle().climateOn, targetCelsius: vehicle().targetCelsius })}><Text className="text-white">Arrêt</Text></Button>
      <Button className="bg-slate-700 rounded px-4 py-2" onClick={() => applyVehicle(live, { speedKph: 50, rpm: 1800, gear: 'D', fuelPct: 67, climateOn: vehicle().climateOn, targetCelsius: vehicle().targetCelsius })}><Text className="text-white">Ville</Text></Button>
      <Button className="bg-slate-700 rounded px-4 py-2" onClick={() => applyVehicle(live, { speedKph: 110, rpm: 2600, gear: 'D', fuelPct: 61, climateOn: vehicle().climateOn, targetCelsius: vehicle().targetCelsius })}><Text className="text-white">Autoroute</Text></Button>
      <Button className="bg-slate-700 rounded px-4 py-2" onClick={() => applyVehicle(live, { ...vehicle(), climateOn: !vehicle().climateOn })}><Text className="text-white">{vehicle().climateOn ? 'Clim ON' : 'Clim OFF'}</Text></Button>
      <Button className="bg-slate-700 rounded px-4 py-2" onClick={() => applyVehicle(live, { ...vehicle(), targetCelsius: Math.max(16, vehicle().targetCelsius - 1) })}><Text className="text-white">−</Text></Button>
      <Text className={props.nightMode ? 'text-white' : 'text-slate-900'}>{`${vehicle().targetCelsius} °C`}</Text>
      <Button className="bg-slate-700 rounded px-4 py-2" onClick={() => applyVehicle(live, { ...vehicle(), targetCelsius: Math.min(30, vehicle().targetCelsius + 1) })}><Text className="text-white">+</Text></Button>
      <View className="grow"></View><Text className={props.nightMode ? 'text-slate-400 text-xs' : 'text-slate-600 text-xs'}>RPM/carburant transmis si Ultra s’abonne ; vitesse locale</Text>
    </View>
  </View>;
}
