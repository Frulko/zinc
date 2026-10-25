import { createSignal, render } from 'zinc:ui/solid';
import Warehouse from 'zinc:warehouse';
import { Slider } from 'zinc:ui/kit';
const [query, setQuery] = createSignal('');
const [count, setCount] = createSignal(0);
const [speed, setSpeed] = createSignal(3);
const itemNames: string[] = ['Copper parcel', 'Lantern crate', 'Spare gear'];
function App(): i32 {
  return <View className="flex-col h-full p-5 gap-4">
    <View className="flex-col p-5 gap-3 rounded-xl bg-slate-900/90 border border-slate-600">
      <Text className="text-xl font-bold text-amber-200">WAREHOUSE</Text>
      <Text className="text-sm text-slate-200">Zinc UI · Godot game authority</Text>
      <Input className="h-10 px-3 bg-slate-700 text-white rounded-lg" placeholder="Search inventory…" value={query()} onInput={(value: string) => setQuery(value)} />
      <Text className="text-sm text-teal-200">{`Parcels collected: ${count()}`}</Text>
      <ScrollView className="h-32">
        <View className="flex-col gap-2">
          {itemNames.filter((name: string) => name.toLowerCase().includes(query().toLowerCase())).map((name: string) => <Text className="text-sm text-slate-200">{name}</Text>)}
        </View>
      </ScrollView>
      <Button className="p-3 bg-teal-700 rounded-lg" onClick={() => Warehouse.action(1, 0)}><Text className="text-white">Use a parcel</Text></Button>
      <Text className="text-sm text-slate-200">{`Movement speed: ${speed()}`}</Text>
      <Slider value={speed} min={1} max={5} step={1} onChange={(value: number) => Warehouse.action(2, value)} />
      <Button className="p-3 bg-slate-700 rounded-lg" onClick={() => Warehouse.action(3, 0)}><Text className="text-white">Reset game</Text></Button>
    </View>
    <View className="p-3 bg-teal-900/60 rounded-lg"><Text className="text-sm text-white">Arrows move · Space picks up · Escape returns focus</Text></View>
  </View>;
}
render(App, 0x000000, (_dt: number) => {
  if (count() !== Warehouse.count()) setCount(Warehouse.count());
  if (speed() !== Warehouse.speed()) setSpeed(Warehouse.speed());
});
