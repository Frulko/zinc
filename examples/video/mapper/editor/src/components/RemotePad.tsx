import * as ui from 'zinc:ui';
import { language } from '../i18n';

enum GesturePhase { Idle, Dragging }

/** Relative movement lets the operator keep watching the projector. */
export function RemotePad(props: { locked: () => boolean; target: () => string; move: (dx: number, dy: number) => void }): i32 {
  let phase = GesturePhase.Idle;
  let lastX = 0, lastY = 0, target = '';
  const transition = (next: GesturePhase): void => {
    if (next === GesturePhase.Dragging && phase !== GesturePhase.Idle) return;
    phase = next;
  };
  const end = (): void => { transition(GesturePhase.Idle); };
  return <View className="h-[144] rounded-[10px] border border-zinc-600 bg-zinc-900 items-center justify-center gap-2" grab="keep"
    onPointerDown={(e: ui.PointerEvent) => {
      if (props.locked() || phase !== GesturePhase.Idle) return;
      lastX = e.x;
      lastY = e.y;
      target = props.target();
      transition(GesturePhase.Dragging);
    }}
    onPointerMove={(e: ui.PointerEvent) => {
      if (phase !== GesturePhase.Dragging) return;
      if (props.locked() || target !== props.target()) { end(); return; }
      props.move(e.x - lastX, e.y - lastY);
      lastX = e.x;
      lastY = e.y;
    }} onPointerUp={end} onPointerCancel={end}>
    <Text className="text-sm text-zinc-100">{props.locked() ? (language() === 'fr' ? 'Réglage verrouillé' : 'Alignment locked') : (language() === 'fr' ? 'Glisser pour ajuster le point' : 'Drag to adjust the point')}</Text>
    <Text className="text-xs text-zinc-400">{language() === 'fr' ? 'Déplacement relatif · 1 pixel par pixel tactile' : 'Relative movement · 1 pixel per touch pixel'}</Text>
  </View>;
}
