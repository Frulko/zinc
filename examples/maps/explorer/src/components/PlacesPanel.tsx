// Floating side panel: a list of places to fly to, zoom buttons and the current position.
import { createSignal } from 'zinc:ui/solid';
import { Button, List, ListItem, heading, captionText, mutedText } from 'zinc:ui/kit';
import { PLACES, Place } from '../places';
import { map, zoomBy, position } from '../map';

const [selected, setSelected] = createSignal<i32>(0);

function flyTo(index: i32): void {
  const p = PLACES[index];
  setSelected(index);
  map.flyTo(p.lat, p.lon, p.zoom);
}

export function PlacesPanel(): i32 {
  return <View class="absolute top-3 left-3 bottom-3 w-[216px] flex-col gap-3 p-3 rounded-xl bg-white border border-zinc-200 shadow-md">
    <View class="flex-col gap-0.5 px-1 pt-1">
      <Text class={heading(4)}>Paris</Text>
      <Text class={mutedText()}>Offline vector tiles</Text>
    </View>
    <ScrollView class="grow">
      <View class="flex-col gap-0.5">
        {PLACES.map((p: Place, i: i32) =>
          <ListItem title={p.name} trailing={p.area} selected={() => selected() === i} onClick={() => flyTo(i)} />)}
      </View>
    </ScrollView>
    <View class="flex-row gap-2">
      <Button label="+" variant="outline" class="grow" onClick={() => zoomBy(1)} />
      <Button label="−" variant="outline" class="grow" onClick={() => zoomBy(-1)} />
    </View>
    <Text class={`${captionText()} px-1`}>{position()}</Text>
  </View>;
}
