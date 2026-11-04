// A floating window that shows a display: a virtual one above all, which has no screen to look at. Its capture outlives the panel, which hides.
import { renderWindow } from 'zinc:ui/solid';
import { createSignal } from 'zinc:ui/solid';
import * as win from 'zinc:system/window';
import { ScreenCapture, permissionStatus, requestPermission } from 'zinc:screen-capture';
import { GlassSwitch } from '../components/GlassSwitch';
import { TEXT_SMALL, palette } from '../theme';
import { selectedId } from '../state';

const PIP_WIDTH = 640, PIP_HEIGHT = 360, PIP_FPS = 30;
const BACKGROUND_BLACK = 0x000000;

const [image, setImage] = createSignal<number>(-1);
const [problem, setProblem] = createSignal<string>('');
let capture: ScreenCapture | null = null;
let pipWindow = -1;

function stop(): void {
  if (pipWindow >= 0 && win.get(pipWindow).isOpen()) win.get(pipWindow).close();
  pipWindow = -1;
  if (capture !== null) capture.close();
  capture = null;
  setImage(-1);
}
async function start(): Promise<void> {
  if (permissionStatus() !== 'granted' && (await requestPermission()) !== 'granted') {
    setProblem('Allow Lumen in System Settings > Privacy & Security > Screen & System Audio Recording, then open it again.');
    return;
  }
  try {
    const opened = await ScreenCapture.open(`screen:${selectedId()}`, { width: PIP_WIDTH * 2, frameRate: PIP_FPS });
    capture = opened;
    opened.onEnded((why: string) => { setProblem(why); stop(); });
    setImage(opened.image);
    setProblem('');
    pipWindow = renderWindow('Lumen', PIP_WIDTH, PIP_HEIGHT, () => <Image image={image()} className="w-full h-full object-contain" />, BACKGROUND_BLACK);
  } catch (e) {
    setProblem((e as Error).message);
  }
}

export function PictureInPicture(): i32 {
  return <View className="gap-2">
    <GlassSwitch label="Show in a Window" value={() => image() >= 0} onChange={(on: boolean) => { if (on) start(); else stop(); }} />
    <Show when={problem() !== ''}><Text className={`${TEXT_SMALL} ${palette().secondary}`}>{problem()}</Text></Show>
  </View>;
}
