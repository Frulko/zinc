import { createSignal } from 'zinc:ui/solid';
import { stroke } from 'zinc:gfx';
import { Session } from 'zinc:carplay';
import { vehicle, setVehicle, applyVehicle } from '../services/vehicle';

let live: Session | null = null;
let lastPhoneChoice = '';
const [theme, setTheme] = createSignal<i32>(3);
const [page, setPage] = createSignal<i32>(0);
const [station, setStation] = createSignal<string>('France Inter · 87.8 FM');
const [fan, setFan] = createSignal<i32>(2);
const [tire, setTire] = createSignal<number>(2.4);
const contour: number[] = [];
for (let point = 0; point < 50; point++) contour.push(0);

function Topography(x: i32, y: i32, w: i32, h: i32): void {
  if (theme() !== 3) return;
  for (let ringIndex = 0; ringIndex < 9; ringIndex++) {
    const radius = 0.14 + ringIndex * 0.035;
    for (let point = 0; point < 25; point++) {
      const angle = point * Math.PI * 2 / 24;
      const ripple = 1 + 0.06 * Math.sin(angle * 5 + ringIndex);
      contour[point * 2] = x + w * (0.48 + Math.cos(angle) * radius * ripple);
      contour[point * 2 + 1] = y + h * (0.52 + Math.sin(angle) * radius * ripple);
    }
    stroke(contour, 1, 0x394538, 115, false);
  }
}

export function tickVehicle(session: Session): void {
  live = session;
  const choice = session.uiChoice;
  if (choice !== null) {
    const key = (choice.layoutId !== undefined ? choice.layoutId : '') + '/' + (choice.paletteId !== undefined ? choice.paletteId : '');
    if (key !== lastPhoneChoice) {
      lastPhoneChoice = key;
      if (choice.paletteId === 'orange') setTheme(3);
      else if (choice.paletteId === 'blue' || choice.paletteId === 'cyan') setTheme(0);
    }
  } else lastPhoneChoice = '';
  const incoming = session.ultraVehicle;
  const current = vehicle();
  if (incoming !== null && (incoming.rpm !== current.rpm || incoming.fuelPct !== current.fuelPct || incoming.climateOn !== current.climateOn || incoming.targetCelsius !== current.targetCelsius))
    setVehicle({ speedKph: current.speedKph, rpm: incoming.rpm, gear: current.gear, fuelPct: incoming.fuelPct, climateOn: incoming.climateOn, targetCelsius: incoming.targetCelsius });
}
function Cluster(x: i32, y: i32, w: i32, h: i32): void {
  const s = live;
  if (s === null || !hasProjectedMap()) return;
  if (s.ultra !== null && s.ultra.uiSyncEnabled && s.secondary.width === 1920 && s.secondary.height === 720)
    s.secondary.viewRegion(x, y, w, h, 660, 120, 600, 480);
  else s.secondary.view(x, y, w, h);
}
function hasProjectedMap(): boolean {
  if (live === null || live.secondary.frames === 0 || live.hud === null || !live.hud.active || live.hud.stale) return false;
  if (live.ultra !== null && live.ultra.uiSyncEnabled && live.uiChoice === null) return false;
  const secondary = live.secondary;
  return secondary.width === 1920 && secondary.height === 720 && live.ultra !== null && live.ultra.uiSyncEnabled
    ? secondary.nonBlackPixels(660, 120, 600, 480) === 1
    : secondary.nonBlackPixels(0, 0, secondary.width, secondary.height) === 1;
}
function layoutStatus(): string {
  const s = live;
  if (s === null || s.ultra === null || !s.ultra.uiSyncEnabled) return 'UI Sync en attente';
  const c = s.uiChoice;
  if (c === null) return 'UI Sync actif · choix iPhone en attente';
  return `Choix iPhone ${c.layoutId !== undefined ? c.layoutId.slice(0, 8) : 'reçu'}${c.paletteId !== undefined ? ' · ' + c.paletteId : ''}`;
}
function name(): string { return theme() === 0 ? 'Halo cyan' : theme() === 1 ? 'Strates' : theme() === 2 ? 'Bronze' : 'Topographie'; }
function background(night: boolean): string {
  if (!night) return theme() === 0 ? 'grow flex-col bg-[#194453] p-4 gap-3' : theme() === 1 ? 'grow flex-col bg-[#343546] p-4 gap-3' : theme() === 2 ? 'grow flex-col bg-[#55412e] p-4 gap-3' : 'grow flex-col bg-[#303e35] p-4 gap-3';
  return theme() === 0 ? 'grow flex-col bg-[#061d25] p-4 gap-3' : theme() === 1 ? 'grow flex-col bg-[#0d1018] p-4 gap-3' : theme() === 2 ? 'grow flex-col bg-[#251911] p-4 gap-3' : 'grow flex-col bg-[#10130f] p-4 gap-3';
}
function accent(): string { return theme() === 0 ? 'text-cyan-300' : theme() === 1 ? 'text-rose-400' : theme() === 2 ? 'text-amber-300' : 'text-orange-400'; }
function ring(): string {
  return theme() === 0 ? 'w-48 h-48 rounded-full border-8 border-cyan-500 flex-col items-center justify-center bg-[#0a2530]' : theme() === 1 ? 'w-48 h-48 rounded-full border-8 border-rose-500 flex-col items-center justify-center bg-[#15131c]' : theme() === 2 ? 'w-48 h-48 rounded-full border-8 border-amber-500 flex-col items-center justify-center bg-[#302217]' : 'w-48 h-48 rounded-full border-8 border-orange-500 flex-col items-center justify-center bg-[#171b15]';
}
function themeButton(index: i32, title: string): i32 {
  return <Button className={theme() === index ? 'bg-amber-200 rounded px-3 py-2' : 'bg-slate-700 rounded px-3 py-2'} onClick={() => setTheme(index)}><Text className={theme() === index ? 'text-slate-950 text-xs' : 'text-white text-xs'}>{title}</Text></Button>;
}
function pageButton(index: i32, title: string): i32 {
  return <Button className={page() === index ? 'bg-cyan-900 rounded px-3 py-2' : 'bg-slate-700 rounded px-3 py-2'} onClick={() => setPage(index)}><Text className="text-white text-xs">{title}</Text></Button>;
}
function VehicleControls(): i32 {
  return <View className="flex-row items-center gap-3">
    <Text className="text-slate-300 text-xs">Scénario simulé</Text>
    <Button className="bg-slate-700 rounded px-3 py-2" onClick={() => applyVehicle(live, { ...vehicle(), speedKph: 0, rpm: 0, gear: 'P', fuelPct: 68 })}><Text className="text-white text-xs">Arrêt</Text></Button>
    <Button className="bg-slate-700 rounded px-3 py-2" onClick={() => applyVehicle(live, { ...vehicle(), speedKph: 50, rpm: 1800, gear: 'D', fuelPct: 67 })}><Text className="text-white text-xs">Ville</Text></Button>
    <Button className="bg-slate-700 rounded px-3 py-2" onClick={() => applyVehicle(live, { ...vehicle(), speedKph: 110, rpm: 2600, gear: 'D', fuelPct: 61 })}><Text className="text-white text-xs">Autoroute</Text></Button>
    <Text className="text-slate-300 text-xs">{`Pneus ${Math.round(tire() * 10) / 10} bar · local`}</Text>
    <Button className="bg-slate-700 rounded px-3 py-2" onClick={() => setTire(Math.max(1.8, tire() - 0.1))}><Text className="text-white text-xs">−</Text></Button>
    <Button className="bg-slate-700 rounded px-3 py-2" onClick={() => setTire(Math.min(3.0, tire() + 0.1))}><Text className="text-white text-xs">+</Text></Button>
  </View>;
}
function RadioControls(): i32 {
  return <View className="flex-row items-center gap-3">
    <Text className="text-slate-300 text-xs">Radio simulée</Text><Text className="text-white">{station()}</Text>
    <Button className="bg-slate-700 rounded px-3 py-2" onClick={() => setStation('France Inter · 87.8 FM')}><Text className="text-white text-xs">Inter</Text></Button>
    <Button className="bg-slate-700 rounded px-3 py-2" onClick={() => setStation('FIP · 105.1 FM')}><Text className="text-white text-xs">FIP</Text></Button>
    <Button className="bg-slate-700 rounded px-3 py-2" onClick={() => setStation('France Info · 105.5 FM')}><Text className="text-white text-xs">Info</Text></Button>
  </View>;
}
function ClimateControls(): i32 {
  return <View className="flex-row items-center gap-3">
    <Text className="text-slate-300 text-xs">Climat simulé</Text>
    <Button className="bg-slate-700 rounded px-3 py-2" onClick={() => applyVehicle(live, { ...vehicle(), climateOn: !vehicle().climateOn })}><Text className="text-white text-xs">{vehicle().climateOn ? 'ON' : 'OFF'}</Text></Button>
    <Button className="bg-slate-700 rounded px-3 py-2" onClick={() => applyVehicle(live, { ...vehicle(), targetCelsius: Math.max(16, vehicle().targetCelsius - 1) })}><Text className="text-white text-xs">−</Text></Button>
    <Text className="text-white">{`${vehicle().targetCelsius} °C`}</Text>
    <Button className="bg-slate-700 rounded px-3 py-2" onClick={() => applyVehicle(live, { ...vehicle(), targetCelsius: Math.min(30, vehicle().targetCelsius + 1) })}><Text className="text-white text-xs">+</Text></Button>
    <Text className="text-slate-300 text-xs">{`Ventilation ${fan()}`}</Text>
    <Button className="bg-slate-700 rounded px-3 py-2" onClick={() => setFan(Math.max(0, fan() - 1))}><Text className="text-white text-xs">−</Text></Button>
    <Button className="bg-slate-700 rounded px-3 py-2" onClick={() => setFan(Math.min(5, fan() + 1))}><Text className="text-white text-xs">+</Text></Button>
  </View>;
}
export function VehicleDashboard(props: { nightMode: boolean }): i32 {
  return <View className={background(props.nightMode)}>
    <View className="flex-row items-center gap-2">
      <View className="flex-col"><Text className="text-amber-200 text-sm">TABLEAU DE BORD · COMPOSITION LOCALE</Text><Text className="text-slate-400 text-xs">{layoutStatus()}</Text></View>
      <View className="grow"></View>
      {themeButton(0, 'Halo cyan')}{themeButton(1, 'Strates')}{themeButton(2, 'Bronze')}{themeButton(3, 'Topographie')}
    </View>
    <View className="grow h-0 flex-row items-center justify-center gap-5 rounded bg-[#080b0d]">
      <Canvas className="absolute inset-0" onDraw={Topography}></Canvas>
      <View className="grow w-0 flex-col items-center justify-center gap-2">
        <View className={ring()}><Text className="text-white text-5xl font-bold">{`${vehicle().speedKph}`}</Text><Text className={accent()}>km/h</Text></View>
        <Text className="text-slate-400 text-xs">VITESSE · SIMULÉE</Text>
      </View>
      <View className="w-[320] h-full flex-col justify-center gap-2 py-5">
        {hasProjectedMap() ? <Canvas className="grow h-0" onDraw={Cluster}></Canvas> : <View className="grow h-0 flex-col items-center justify-center"><Text className={accent()}>CARTE EN ATTENTE</Text><Text className="text-slate-400 text-xs">Démarrer un itinéraire dans Plans</Text></View>}
        <Text className="text-slate-300 text-xs">{`TABLEAU DE BORD · ${name()}`}</Text>
      </View>
      <View className="grow w-0 flex-col items-center justify-center gap-2">
        <View className={ring()}><Text className="text-white text-4xl font-bold">{`${vehicle().rpm}`}</Text><Text className={accent()}>tr/min</Text></View>
        <Text className="text-white text-sm">{`${vehicle().gear}  ·  ${vehicle().fuelPct}% carburant`}</Text>
      </View>
    </View>
    <View className="h-28 flex-col justify-center gap-3 border-t border-slate-700">
      <View className="flex-row items-center gap-2">{pageButton(0, 'Voiture')}{pageButton(1, 'Radio')}{pageButton(2, 'Climat')}<View className="grow"></View><Text className="text-slate-400 text-xs">RPM, carburant et climatisation transmis si Ultra s’abonne · autres données locales</Text></View>
      {page() === 0 ? <VehicleControls /> : page() === 1 ? <RadioControls /> : <ClimateControls />}
    </View>
  </View>;
}
