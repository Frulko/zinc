// One animation in a card. Clicking the card pauses or resumes it: a paused animation redraws the same commands,
// so the frame diff rasterizes nothing for it.
import { createSignal } from 'zinc:ui/solid';
import { Lottie, Player } from 'zinc:lottie';
import { captionText } from 'zinc:ui/kit';
import { displayName } from '../files';

export function AnimationCard(props: { file: string }): i32 {
  let player: Player | null = null;
  const [paused, setPaused] = createSignal<boolean>(false);

  function toggle(): void {
    const p = player;
    if (p === null) return;
    if (p.playing) p.pause(); else p.play();
    setPaused(!p.playing);
  }

  return <View class="flex-col items-center gap-1 p-2 w-[124px] rounded-xl bg-white border border-zinc-200 shadow-sm focus:bg-zinc-50 active:bg-zinc-100 transition-colors"
    onClick={toggle}>
    <Lottie src={props.file} loop autoplay class="w-[96px] h-[96px]" player={(p: Player) => { player = p; }} />
    <Text class={paused() ? 'text-xs text-amber-600' : captionText()}>{paused() ? 'paused' : displayName(props.file)}</Text>
  </View>;
}
