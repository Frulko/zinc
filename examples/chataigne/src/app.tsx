// The companion's single screen: connection and cue on the left, the control surface in the middle, the chat and
// the incoming log on the right.
import { heading, mutedText, smallText, theme } from 'zinc:ui/kit';
import { linkStatus, statusColor } from './link';
import { ConnectionCard } from './panels/connection';
import { FadersCard, CueCard, TogglesCard } from './panels/controls';
import { PadCard, ColorCard } from './panels/surface';
import { ChatCard, LogCard } from './panels/feed';

function Header(): i32 {
  return <View class="flex-row items-center justify-between">
    <View class="flex-col gap-1">
      <Text class={heading(3)}>Chataigne companion</Text>
      <Text class={mutedText()}>Control the show from Zinc, and let Chataigne answer back, over OSC.</Text>
    </View>
    <View class={`flex-row items-center gap-2 px-3 py-1.5 rounded-full border border-${theme().border} bg-${theme().card}`}>
      <View class={`w-2 h-2 rounded-full bg-${statusColor(linkStatus())}`} />
      <Text class={smallText()}>{linkStatus()}</Text>
    </View>
  </View>;
}

export function App(): i32 {
  return <View class="flex-col gap-5 p-6 h-full bg-zinc-50">
    <Header />
    <View class="flex-row gap-5 grow">
      <View class="flex-col gap-5 w-[300px]">
        <ConnectionCard />
        <CueCard />
        <TogglesCard />
      </View>
      {/* zinc:ui sizes a row child by its content and never shrinks it: a width basis keeps the sliders' fraction
          fills honest, `grow` takes whatever the window adds (512 = 1240 - 2 × 24 - 300 - 340 - 2 × 20). */}
      <View class="flex-col gap-5 grow w-[512px]">
        <FadersCard />
        <View class="flex-row gap-5 grow">
          <PadCard />
          <ColorCard />
        </View>
      </View>
      <View class="flex-col gap-5 w-[340px]">
        <ChatCard />
        <LogCard />
      </View>
    </View>
  </View>;
}
