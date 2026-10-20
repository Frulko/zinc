// The fixture of tests/t1/web_video.sh (lottie part): zinc:lottie on the web target. A <Lottie/> node plays the spinner; the page loads lottie-web only when the animation is first drawn
// and puts an <svg> in the node's box; Play and Pause drive the Player.
import { render } from 'zinc:ui/solid';
import { Button } from 'zinc:ui/kit';
import { Lottie, Player } from 'zinc:lottie';

let pl: Player | null = null;

function App(): i32 {
  return <View className="flex-col gap-3 p-4 w-full h-full bg-white">
    <Text as="h1" className="text-lg font-semibold text-slate-900">Lottie fixture</Text>
    <Lottie src="spinner.json" className="w-24 h-24" loop player={(p: Player) => { pl = p; }} />
    <View className="flex-row gap-2">
      <Button label="Play" onClick={() => { const p = pl; if (p !== null) p.play(); }} />
      <Button label="Pause" onClick={() => { const p = pl; if (p !== null) p.pause(); }} />
    </View>
  </View>;
}

render(App, 0xffffff, null);
