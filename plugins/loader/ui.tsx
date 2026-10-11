// zinc:loader/ui (ZN-447, docs/plugins/loader.md): the loader as a zinc:ui component in the colours of the kit theme, for an app's own loading
// screens (a level loaded with assets.loadGroup) and for a loading.screen module written with zinc:ui: `export default screen();`.
import { createSignal } from 'zinc:ui/solid';
import { setRoot, frame } from 'zinc:ui';
import { Progress, theme } from 'zinc:ui/kit';

export interface LoaderProps {
  progress: () => number;   // 0..1: a signal, or the latest render
  class?: string;
}

/** A progress bar in the middle of its box, on the theme's background. */
export function Loader(props: LoaderProps): i32 {
  return <View class={`w-full h-full items-center justify-center bg-${theme().background} ${props.class ?? ''}`}>
    <View class="w-3/5 max-w-[480px]"><Progress value={() => props.progress() * 100} /></View>
  </View>;
}

/** A screen of the loader stage: <Loader /> laid out and painted by zinc:ui each frame (setTheme(DARK) first for a dark one). */
export function screen(): (progress: number, dt: number) => void {
  const [progress, setProgress] = createSignal<number>(0);
  let root: i32 = -1;
  return (p: number, dt: number): void => {
    if (root < 0) { root = <Loader progress={progress} />; setRoot(root); }
    setProgress(p);
    frame(dt, -1);
  };
}
