// The hero block: a badge, the title, a tagline and the menu, each entering a little after the previous one.
import { Badge, Button, leadText } from 'zinc:ui/kit';
import { MENU, choose } from '../state';
import { reveal, rise } from '../motion';

/** A menu button that enters after the title (the first one is the primary action). */
function MenuButton(props: { label: string; index: i32 }): i32 {
  const delay = 0.35 + props.index * 0.08;
  return <View style={{ opacity: reveal(delay), translateY: rise(delay) }}>
    <Button label={props.label} variant={props.index === 0 ? 'default' : 'outline'} size="lg"
      onClick={() => choose(props.label)} />
  </View>;
}

export function Hero(): i32 {
  return <View class="flex-col items-center justify-center gap-5 h-full p-8">
    <View style={{ opacity: reveal(0), translateY: rise(0) }}>
      <Badge label="Solid · 60 FPS · no JS engine" variant="accent" />
    </View>
    <Text class="text-6xl font-bold tracking-tight text-zinc-950" style={{ opacity: reveal(0.1), translateY: rise(0.1) }}>Zinc</Text>
    <Text class={`${leadText()} text-center`} style={{ opacity: reveal(0.2), translateY: rise(0.2) }}>
      JSX compiled to C++, animated by the engine.
    </Text>
    <View class="flex-row flex-wrap justify-center gap-3 pt-3">
      {MENU.map((label: string, i: i32) => <MenuButton label={label} index={i} />)}
    </View>
  </View>;
}
